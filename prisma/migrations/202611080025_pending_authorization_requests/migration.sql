-- Pending evidence only. No approval, stock transition or operational installation is enabled.
BEGIN;
CREATE TABLE "AuthorizationRequest" (
 id uuid PRIMARY KEY,"originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),"actorRole" "Role" NOT NULL CHECK("actorRole"='MANAGER'),
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,"recordedAt" timestamptz(6) NOT NULL,
 kind text NOT NULL CHECK(kind IN ('RECOVERY','CORRECTION')),status text NOT NULL CHECK(status='PENDING_CLOUD_AUTHORIZATION'),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000 AND reason ~ '[[:alpha:]]'),
 evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 10 AND 4000 AND evidence ~ '[[:alpha:]]'),
 "lotId" uuid REFERENCES "StockLot"(id),state text,"ledgerQuantity" bigint,"projectionQuantity" bigint,"observedQuantity" bigint,
 "requestedDelta" bigint GENERATED ALWAYS AS ("observedQuantity"-"ledgerQuantity") STORED,
 "unitCount" integer NOT NULL,payload jsonb NOT NULL,"canonicalEvidence" text NOT NULL,"evidenceHash" text NOT NULL,
 CHECK((kind='RECOVERY' AND "lotId" IS NULL AND state IS NULL AND "ledgerQuantity" IS NULL AND "projectionQuantity" IS NULL AND "observedQuantity" IS NULL AND "unitCount" BETWEEN 1 AND 500) OR
 (kind='CORRECTION' AND "lotId" IS NOT NULL AND state IS NOT NULL AND state IN ('U','P','D') AND "ledgerQuantity">=0 AND "projectionQuantity">=0 AND "observedQuantity">=0
  AND "ledgerQuantity" IS NOT NULL AND "projectionQuantity" IS NOT NULL AND "observedQuantity" IS NOT NULL AND "unitCount"=0
  AND ("observedQuantity"<>"ledgerQuantity" OR "projectionQuantity"<>"ledgerQuantity"))),
 CHECK(payload="canonicalEvidence"::jsonb AND jsonb_typeof(payload)='object'),
 CHECK("evidenceHash"=encode(sha256(convert_to("canonicalEvidence",'UTF8')),'hex'))
);
CREATE INDEX "AuthorizationRequest_originId_recordedAt_id_idx" ON "AuthorizationRequest"("originId","recordedAt",id);
CREATE TABLE "AuthorizationRequestUnit" (
 id uuid PRIMARY KEY,"requestId" uuid NOT NULL REFERENCES "AuthorizationRequest"(id),"originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "unitId" uuid NOT NULL REFERENCES "StockUnit"(id),"lotId" uuid NOT NULL REFERENCES "StockLot"(id),"previousEventId" uuid NOT NULL REFERENCES "UnitEvent"(id),
 "recordedVersion" bigint NOT NULL CHECK("recordedVersion">0),"damageLineId" uuid REFERENCES "DamageLine"(id),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),UNIQUE("requestId","unitId")
);
CREATE INDEX "AuthorizationRequestUnit_unitId_idx" ON "AuthorizationRequestUnit"("unitId");
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON "AuthorizationRequest" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON "AuthorizationRequestUnit" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE FUNCTION dayari_authorization_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "AuthorizationRequest" WHERE id=NEW."requestId" AND "originId"=NEW."originId" AND kind='RECOVERY'
 AND xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
 RAISE EXCEPTION 'Accepted authorization requests cannot be supplemented' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER authorization_child_guard BEFORE INSERT ON "AuthorizationRequestUnit" FOR EACH ROW EXECUTE FUNCTION dayari_authorization_child_guard();
CREATE FUNCTION dayari_authorization_request_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual numeric; projected bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND u.active
  AND NOT u."mustChangePassword" AND u.role='MANAGER' AND m."originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='inventory.authorization.request')
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole"='MANAGER'
  AND "subjectId"=NEW.id AND action='inventory.authorization.requested' AND snapshot->>'evidenceHash'=NEW."evidenceHash")
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId"
  AND "aggregateId"=NEW.id AND "eventType"='inventory.authorization.requested' AND payload->>'evidenceHash'=NEW."evidenceHash")
 OR EXISTS(SELECT 1 FROM "StockTransaction" WHERE "commandId"=NEW."commandId") OR EXISTS(SELECT 1 FROM "UnitEvent" WHERE "commandId"=NEW."commandId")
 OR NEW.payload->'input'->>'kind' IS DISTINCT FROM NEW.kind OR NEW.payload->'input'->>'reason' IS DISTINCT FROM NEW.reason OR NEW.payload->'input'->>'evidence' IS DISTINCT FROM NEW.evidence
 OR NEW.payload->'preview'->>'kind' IS DISTINCT FROM NEW.kind
 OR jsonb_typeof(NEW.payload->'members') IS DISTINCT FROM 'array'
 OR jsonb_array_length(NEW.payload->'members')<>NEW."unitCount"
 OR (SELECT count(DISTINCT member->>'id') FROM jsonb_array_elements(NEW.payload->'members') member)<>NEW."unitCount"
 OR (SELECT count(*) FROM "AuthorizationRequestUnit" WHERE "requestId"=NEW.id)<>NEW."unitCount" THEN
 RAISE EXCEPTION 'Incomplete or stock-changing pending request' USING ERRCODE='23514'; END IF;
 IF NEW.kind='CORRECTION' THEN
  IF NOT EXISTS(SELECT 1 FROM "StockLot" WHERE id=NEW."lotId" AND "originId"=NEW."originId")
  OR NEW.payload->'input'->>'lotId' IS DISTINCT FROM NEW."lotId"::text OR NEW.payload->'input'->>'state' IS DISTINCT FROM NEW.state
  OR NEW.payload->'input'->>'observedQuantity' IS DISTINCT FROM NEW."observedQuantity"::text
  OR NEW.payload->'preview'->'target'->>'lotId' IS DISTINCT FROM NEW."lotId"::text OR NEW.payload->'preview'->'target'->>'state' IS DISTINCT FROM NEW.state
  OR NEW.payload->'preview'->'target'->>'ledgerQuantity' IS DISTINCT FROM NEW."ledgerQuantity"::text
  OR NEW.payload->'preview'->'target'->>'projectionQuantity' IS DISTINCT FROM NEW."projectionQuantity"::text THEN
  RAISE EXCEPTION 'Correction request must retain its exact lot and factual observation' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(CASE WHEN "toState"=NEW.state THEN quantity ELSE -quantity END),0) INTO actual FROM "StockMovement"
   WHERE "lotId"=NEW."lotId" AND ("toState"=NEW.state OR "fromState"=NEW.state);
  SELECT COALESCE((SELECT quantity FROM "StockBalance" WHERE "lotId"=NEW."lotId" AND state=NEW.state),0) INTO projected;
  IF actual<>NEW."ledgerQuantity" OR projected<>NEW."projectionQuantity" THEN RAISE EXCEPTION 'Correction evidence must preserve accepted ledger and projection quantities' USING ERRCODE='23514'; END IF;
 ELSE
  IF jsonb_typeof(NEW.payload->'preview'->'units') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.payload->'preview'->'units')<>NEW."unitCount"
  OR jsonb_typeof(NEW.payload->'input'->'unitIds') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.payload->'input'->'unitIds')<>NEW."unitCount"
  OR EXISTS(SELECT 1 FROM "AuthorizationRequestUnit" x LEFT JOIN "StockUnit" u ON u.id=x."unitId" LEFT JOIN "UnitState" s ON s."unitId"=u.id
   LEFT JOIN "UnitEvent" e ON e.id=x."previousEventId" LEFT JOIN "DamageLine" bad ON bad.id=x."damageLineId"
   WHERE x."requestId"=NEW.id AND (x."originId"<>NEW."originId" OR u."originId"<>NEW."originId" OR x."lotId"<>u."lotId" OR s."unitId" IS NULL OR s.state<>'D'
   OR s."lastEventId"<>x."previousEventId" OR s.version<>x."recordedVersion" OR e.ordinal<>x."recordedVersion" OR e.id IS NULL OR e."unitId"<>u.id OR e."toState"<>'D'
   OR (x."damageLineId" IS NULL AND NOT(e.kind='RECEIVED' AND u."initialState"='D'))
   OR (x."damageLineId" IS NOT NULL AND (bad.id IS NULL OR bad."unitId"<>u.id OR bad."eventId"<>e.id))
   OR x.snapshot->>'recordedVersion' IS DISTINCT FROM x."recordedVersion"::text OR x.snapshot->>'previousEventId' IS DISTINCT FROM e.id::text
   OR x.snapshot->'unit'->>'unitId' IS DISTINCT FROM u.id::text OR x.snapshot->'unit'->>'unitCode' IS DISTINCT FROM u."unitCode"
   OR NOT(NEW.payload->'input'->'unitIds' @> jsonb_build_array(u.id::text))
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.payload->'members') member WHERE member->>'id'=x.id::text AND member->>'unitId'=u.id::text)
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.payload->'preview'->'units') candidate WHERE candidate=x.snapshot)
   OR x.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
  RAISE EXCEPTION 'Recovery request requires exact currently damaged units and original damage/intake provenance' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER authorization_request_complete AFTER INSERT ON "AuthorizationRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_authorization_request_complete();
COMMIT;
