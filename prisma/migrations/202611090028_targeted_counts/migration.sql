-- Targeted count evidence only. No stock transition or operational installation.
BEGIN;
CREATE FUNCTION dayari_count_snapshot(lot uuid, target text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('mode',p.mode,'ledgerQuantity',COALESCE((SELECT sum(CASE WHEN m."toState"=target THEN m.quantity ELSE -m.quantity END) FROM "StockMovement" m WHERE m."lotId"=lot AND (m."fromState"=target OR m."toState"=target)),0)::text,
 'projectionQuantity',COALESCE((SELECT quantity FROM "StockBalance" WHERE "lotId"=lot AND state=target),0)::text,
 'fingerprint',encode(sha256(convert_to(COALESCE((SELECT string_agg(id::text,',' ORDER BY id) FROM "StockMovement" WHERE "lotId"=lot AND ("fromState"=target OR "toState"=target)),''),'UTF8')),'hex'),
 'expected',COALESCE((SELECT jsonb_agg(u.id::text ORDER BY u.id) FROM "StockUnit" u JOIN "UnitState" st ON st."unitId"=u.id WHERE u."lotId"=lot AND st.state=target),'[]'::jsonb)) FROM "LotSerialization" p WHERE p."lotId"=lot
$$;
CREATE TABLE "CountSession" (id uuid PRIMARY KEY,"originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),"commandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,"recordedAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),"lotId" uuid NOT NULL REFERENCES "StockLot"(id),state text NOT NULL CHECK(state IN ('U','P','D','C','X')),purpose text NOT NULL CHECK(length(trim(purpose)) BETWEEN 10 AND 1000));
CREATE INDEX "CountSession_originId_recordedAt_id_idx" ON "CountSession"("originId","recordedAt",id);
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON "CountSession" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TABLE "CountAttempt" (id uuid PRIMARY KEY,"originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),"commandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,"recordedAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),"sessionId" uuid NOT NULL REFERENCES "CountSession"(id),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'));
CREATE INDEX "CountAttempt_originId_recordedAt_id_idx" ON "CountAttempt"("originId","recordedAt",id);
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON "CountAttempt" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TABLE "CountObservation" (id uuid PRIMARY KEY,"originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),"commandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,"recordedAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),"attemptId" uuid NOT NULL REFERENCES "CountAttempt"(id),"unitId" uuid NOT NULL REFERENCES "StockUnit"(id),UNIQUE("attemptId","unitId"));
CREATE INDEX "CountObservation_originId_recordedAt_id_idx" ON "CountObservation"("originId","recordedAt",id);
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON "CountObservation" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TABLE "CountResult" (id uuid PRIMARY KEY,"originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),"commandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,"recordedAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),"attemptId" uuid NOT NULL UNIQUE REFERENCES "CountAttempt"(id),"observedQuantity" bigint NOT NULL CHECK("observedQuantity">=0),"unidentifiedExtras" bigint NOT NULL CHECK("unidentifiedExtras">=0),status text NOT NULL CHECK(status IN ('MATCHED','MISMATCH','STALE')),explanation text NOT NULL CHECK(length(trim(explanation)) BETWEEN 10 AND 2000),evidence text NOT NULL CHECK(length(trim(evidence)) BETWEEN 10 AND 2000));
CREATE INDEX "CountResult_originId_recordedAt_id_idx" ON "CountResult"("originId","recordedAt",id);
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON "CountResult" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TABLE "CountResolution" (id uuid PRIMARY KEY,"originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),"commandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,"recordedAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),"resultId" uuid NOT NULL UNIQUE REFERENCES "CountResult"(id),"matchingResultId" uuid NOT NULL REFERENCES "CountResult"(id),explanation text NOT NULL CHECK(length(trim(explanation)) BETWEEN 10 AND 2000));
CREATE INDEX "CountResolution_originId_recordedAt_id_idx" ON "CountResolution"("originId","recordedAt",id);
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON "CountResolution" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE FUNCTION dayari_count_status(attempt uuid, quantity bigint, extras bigint) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE a "CountAttempt";c "CountSession";snap jsonb;observed jsonb;
BEGIN
 SELECT * INTO STRICT a FROM "CountAttempt" WHERE id=attempt;SELECT * INTO STRICT c FROM "CountSession" WHERE id=a."sessionId";snap=dayari_count_snapshot(c."lotId",c.state);
 IF snap->>'fingerprint' IS DISTINCT FROM a.snapshot->>'fingerprint' THEN RETURN 'STALE';END IF;
 SELECT COALESCE(jsonb_agg("unitId"::text ORDER BY "unitId"),'[]'::jsonb) INTO observed FROM "CountObservation" WHERE "attemptId"=attempt;
 IF quantity::text IS DISTINCT FROM a.snapshot->>'ledgerQuantity' OR a.snapshot->>'projectionQuantity' IS DISTINCT FROM a.snapshot->>'ledgerQuantity' THEN RETURN 'MISMATCH';END IF;
 IF a.snapshot->>'mode'='NATIVE' AND (extras<>0 OR observed IS DISTINCT FROM a.snapshot->'expected' OR jsonb_array_length(observed)::bigint+extras<>quantity) THEN RETURN 'MISMATCH';END IF;
 RETURN 'MATCHED';
END $$;
CREATE FUNCTION dayari_count_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "CountSession";a "CountAttempt";r "CountResult";matched "CountResult";other "CountAttempt";
BEGIN
 PERFORM id FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND m."originId"=NEW."originId" AND u.active AND NOT u."mustChangePassword" AND u.role='MANAGER') THEN RAISE EXCEPTION 'Counts require active shop Manager' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='CountSession' THEN
  IF NOT EXISTS(SELECT 1 FROM "StockLot" l JOIN "LotSerialization" s ON s."lotId"=l.id WHERE l.id=NEW."lotId" AND l."originId"=NEW."originId") THEN RAISE EXCEPTION 'Invalid count lot' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='CountAttempt' THEN
  SELECT * INTO STRICT c FROM "CountSession" WHERE id=NEW."sessionId";
  IF c."originId"<>NEW."originId" OR NEW.snapshot IS DISTINCT FROM dayari_count_snapshot(c."lotId",c.state) OR EXISTS(SELECT 1 FROM "CountAttempt" prior WHERE prior."sessionId"=c.id AND NOT EXISTS(SELECT 1 FROM "CountResult" WHERE "attemptId"=prior.id)) THEN RAISE EXCEPTION 'Invalid or concurrent count attempt' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME IN ('CountObservation','CountResult') THEN
  SELECT * INTO STRICT a FROM "CountAttempt" WHERE id=NEW."attemptId";SELECT * INTO STRICT c FROM "CountSession" WHERE id=a."sessionId";
  IF a."originId"<>NEW."originId" OR EXISTS(SELECT 1 FROM "CountResult" WHERE "attemptId"=a.id) THEN RAISE EXCEPTION 'Count attempt unavailable or finalized' USING ERRCODE='23514';END IF;
  IF TG_TABLE_NAME='CountObservation' THEN
   IF a.snapshot->>'mode'<>'NATIVE' OR NOT EXISTS(SELECT 1 FROM "StockUnit" WHERE id=NEW."unitId" AND "lotId"=c."lotId" AND "originId"=NEW."originId") THEN RAISE EXCEPTION 'Count observation requires exact native lot unit' USING ERRCODE='23514';END IF;
  ELSE
   IF NEW.status IS DISTINCT FROM dayari_count_status(a.id,NEW."observedQuantity",NEW."unidentifiedExtras") OR
    (a.snapshot->>'mode'='NATIVE' AND NEW."observedQuantity"<>(SELECT count(*) FROM "CountObservation" WHERE "attemptId"=a.id)+NEW."unidentifiedExtras") OR
    (a.snapshot->>'mode'='LEGACY' AND NEW."unidentifiedExtras"<>0) THEN RAISE EXCEPTION 'Count result must reconcile actual evidence' USING ERRCODE='23514';END IF;
  END IF;
 ELSE
  SELECT * INTO STRICT r FROM "CountResult" WHERE id=NEW."resultId";SELECT * INTO STRICT matched FROM "CountResult" WHERE id=NEW."matchingResultId";
  SELECT * INTO STRICT a FROM "CountAttempt" WHERE id=r."attemptId";SELECT * INTO STRICT other FROM "CountAttempt" WHERE id=matched."attemptId";SELECT * INTO STRICT c FROM "CountSession" WHERE id=a."sessionId";
  IF r."originId"<>NEW."originId" OR matched."originId"<>NEW."originId" OR a."sessionId"<>other."sessionId" OR r.status<>'MISMATCH' OR matched.status<>'MATCHED' OR matched."recordedAt"<=r."recordedAt" OR other.snapshot->>'fingerprint' IS DISTINCT FROM dayari_count_snapshot(c."lotId",c.state)->>'fingerprint' THEN RAISE EXCEPTION 'Mistaken finding requires later matching same-scope recount' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION dayari_count_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='inventory.count.'||lower(TG_TABLE_NAME) AND (response->>'id'=NEW.id::text OR (TG_TABLE_NAME='CountObservation' AND response->'observationIds' @> jsonb_build_array(NEW.id::text))))
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole"='MANAGER' AND ("subjectId"=NEW.id OR TG_TABLE_NAME='CountObservation') AND action='inventory.count.'||lower(TG_TABLE_NAME))
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND ("aggregateId"=NEW.id OR TG_TABLE_NAME='CountObservation') AND "eventType"='inventory.count.'||lower(TG_TABLE_NAME))
 OR EXISTS(SELECT 1 FROM "StockTransaction" WHERE "commandId"=NEW."commandId") OR EXISTS(SELECT 1 FROM "UnitEvent" WHERE "commandId"=NEW."commandId") THEN RAISE EXCEPTION 'Incomplete or stock-changing count command' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER count_insert BEFORE INSERT ON "CountSession" FOR EACH ROW EXECUTE FUNCTION dayari_count_insert();
CREATE CONSTRAINT TRIGGER count_complete AFTER INSERT ON "CountSession" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_count_complete();
CREATE TRIGGER count_insert BEFORE INSERT ON "CountAttempt" FOR EACH ROW EXECUTE FUNCTION dayari_count_insert();
CREATE CONSTRAINT TRIGGER count_complete AFTER INSERT ON "CountAttempt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_count_complete();
CREATE TRIGGER count_insert BEFORE INSERT ON "CountObservation" FOR EACH ROW EXECUTE FUNCTION dayari_count_insert();
CREATE CONSTRAINT TRIGGER count_complete AFTER INSERT ON "CountObservation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_count_complete();
CREATE TRIGGER count_insert BEFORE INSERT ON "CountResult" FOR EACH ROW EXECUTE FUNCTION dayari_count_insert();
CREATE CONSTRAINT TRIGGER count_complete AFTER INSERT ON "CountResult" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_count_complete();
CREATE TRIGGER count_insert BEFORE INSERT ON "CountResolution" FOR EACH ROW EXECUTE FUNCTION dayari_count_insert();
CREATE CONSTRAINT TRIGGER count_complete AFTER INSERT ON "CountResolution" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_count_complete();
COMMIT;
