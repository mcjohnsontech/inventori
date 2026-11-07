-- Isolated implementation first. Operational installation is a separately approved cutover.
BEGIN;
CREATE TABLE "SerializationCutover" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "originId" uuid NOT NULL UNIQUE REFERENCES "OriginNode"(id) ON DELETE RESTRICT,
 watermark bigint NOT NULL CHECK(watermark>=0), "policyVersion" integer NOT NULL DEFAULT 1 CHECK("policyVersion"=1),
 "migrationName" text NOT NULL, "activatedAt" timestamptz(6) NOT NULL DEFAULT now()
);
INSERT INTO "SerializationCutover"("originId",watermark,"migrationName")
 SELECT id,"nextSequence",'202611070014_serialized_receiving' FROM "OriginNode" WHERE mode='SHOP';
CREATE TABLE "LotSerialization" (
 "lotId" uuid PRIMARY KEY REFERENCES "StockLot"(id) ON DELETE RESTRICT, "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "cutoverId" uuid NOT NULL REFERENCES "SerializationCutover"(id), mode text NOT NULL CHECK(mode IN ('NATIVE','LEGACY')),
 "recordedAt" timestamptz(6) NOT NULL DEFAULT now()
);
-- Metadata classification only: no units, historical events, balances or ledger rows are invented.
INSERT INTO "LotSerialization"("lotId","originId","cutoverId",mode)
 SELECT l.id,l."originId",c.id,'LEGACY' FROM "StockLot" l JOIN "SerializationCutover" c ON c."originId"=l."originId";
CREATE FUNCTION dayari_new_serialization_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.mode='SHOP' THEN INSERT INTO "SerializationCutover"("originId",watermark,"migrationName") VALUES(NEW.id,NEW."nextSequence",'202611070014_serialized_receiving'); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER serialization_origin AFTER INSERT ON "OriginNode" FOR EACH ROW EXECUTE FUNCTION dayari_new_serialization_origin();
CREATE FUNCTION dayari_new_serialization_lot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "LotSerialization"("lotId","originId","cutoverId",mode) SELECT NEW.id,NEW."originId",id,'NATIVE' FROM "SerializationCutover" WHERE "originId"=NEW."originId";
 RETURN NEW;
END $$;
CREATE TRIGGER serialization_lot AFTER INSERT ON "StockLot" FOR EACH ROW EXECUTE FUNCTION dayari_new_serialization_lot();
CREATE FUNCTION dayari_serialization_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.mode<>'NATIVE' OR NOT EXISTS(SELECT 1 FROM "StockLot" l JOIN "SerializationCutover" c ON c.id=NEW."cutoverId" AND c."originId"=l."originId"
  WHERE l.id=NEW."lotId" AND l."originId"=NEW."originId" AND l.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
  RAISE EXCEPTION 'Invalid native lot serialization policy' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER serialization_policy_insert BEFORE INSERT ON "LotSerialization" FOR EACH ROW EXECUTE FUNCTION dayari_serialization_policy_guard();
CREATE TABLE "StockUnit" (
 id uuid PRIMARY KEY, "originId" uuid NOT NULL REFERENCES "OriginNode"(id), "lotId" uuid NOT NULL REFERENCES "StockLot"(id),
 "receiptLineId" uuid NOT NULL REFERENCES "ReceiptLine"(id), "unitCode" text NOT NULL CHECK("unitCode"~'^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
 "initialState" text NOT NULL CHECK("initialState" IN ('U','D')), "initialMovementId" uuid NOT NULL REFERENCES "StockMovement"(id),
 "registrationCommandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "actorId" uuid NOT NULL REFERENCES "User"(id), "actorRole" "Role" NOT NULL CHECK("actorRole" IN ('ADMIN','MANAGER')),
 "recordedAt" timestamptz(6) NOT NULL,
 CONSTRAINT "StockUnit_originId_unitCode_key" UNIQUE("originId","unitCode"), UNIQUE(id,"lotId")
);
CREATE INDEX "StockUnit_receiptLineId_initialState_idx" ON "StockUnit"("receiptLineId","initialState");
CREATE INDEX "StockUnit_lotId_id_idx" ON "StockUnit"("lotId",id);
CREATE INDEX "StockUnit_registrationCommandId_idx" ON "StockUnit"("registrationCommandId");
CREATE TABLE "UnitEvent" (
 id uuid PRIMARY KEY, "unitId" uuid NOT NULL, "lotId" uuid NOT NULL, "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 ordinal integer NOT NULL CHECK(ordinal=1), kind text NOT NULL CHECK(kind='RECEIVED'), "fromState" text NOT NULL CHECK("fromState"='E'),
 "toState" text NOT NULL CHECK("toState" IN ('U','D')), "actorId" uuid NOT NULL REFERENCES "User"(id), "actorRole" "Role" NOT NULL,
 "commandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED, "movementId" uuid NOT NULL REFERENCES "StockMovement"(id),
 "recordedAt" timestamptz(6) NOT NULL, details jsonb NOT NULL,
 FOREIGN KEY("unitId","lotId") REFERENCES "StockUnit"(id,"lotId") ON DELETE RESTRICT, UNIQUE("unitId",ordinal)
);
CREATE INDEX "UnitEvent_commandId_idx" ON "UnitEvent"("commandId");
CREATE TABLE "UnitState" (
 "unitId" uuid PRIMARY KEY, "lotId" uuid NOT NULL, "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 state text NOT NULL CHECK(state IN ('U','D')), condition text NOT NULL CHECK(condition IN ('USABLE','DAMAGED')),
 custody text NOT NULL CHECK(custody='SHOP_STORAGE'), version bigint NOT NULL DEFAULT 1 CHECK(version=1),
 "lastEventId" uuid NOT NULL UNIQUE REFERENCES "UnitEvent"(id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY("unitId","lotId") REFERENCES "StockUnit"(id,"lotId") ON DELETE RESTRICT,
 CHECK((state='U' AND condition='USABLE') OR (state='D' AND condition='DAMAGED'))
);
CREATE INDEX "UnitState_lotId_state_idx" ON "UnitState"("lotId",state);
CREATE TABLE "UnitCommandManifestPage" (
 id uuid PRIMARY KEY, "commandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id), ordinal integer NOT NULL CHECK(ordinal>=0), members jsonb NOT NULL,
 "canonicalPayload" text NOT NULL, "payloadHash" text NOT NULL, "createdAt" timestamptz(6) NOT NULL DEFAULT now(),
 UNIQUE("commandId",ordinal), CHECK(jsonb_typeof(members)='array' AND jsonb_array_length(members) BETWEEN 1 AND 500),
 CHECK(members="canonicalPayload"::jsonb), CHECK("payloadHash"=encode(sha256(convert_to("canonicalPayload",'UTF8')),'hex'))
);
CREATE FUNCTION dayari_unit_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "StockLot" l JOIN "LotSerialization" p ON p."lotId"=l.id AND p.mode='NATIVE'
  JOIN "ReceiptLine" r ON r."lotId"=l.id JOIN "StockMovement" m ON m."receiptLineId"=r.id AND m.id=NEW."initialMovementId"
  JOIN "StockTransaction" t ON t.id=m."transactionId"
  WHERE l.id=NEW."lotId" AND l."originId"=NEW."originId" AND r.id=NEW."receiptLineId" AND m."toState"=NEW."initialState"
  AND t."commandId"=NEW."registrationCommandId" AND t."actorId"=NEW."actorId" AND t."actorRole"=NEW."actorRole" AND t."recordedAt"=NEW."recordedAt"
  AND l.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
  RAISE EXCEPTION 'Unit must belong to its exact newly accepted receipt movement' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_insert_guard BEFORE INSERT ON "StockUnit" FOR EACH ROW EXECUTE FUNCTION dayari_unit_insert_guard();
CREATE FUNCTION dayari_unit_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "StockUnit" u WHERE u.id=NEW."unitId" AND u."lotId"=NEW."lotId" AND u."originId"=NEW."originId"
  AND u."registrationCommandId"=NEW."commandId" AND u."initialMovementId"=NEW."movementId" AND u."initialState"=NEW."toState"
  AND u."actorId"=NEW."actorId" AND u."actorRole"=NEW."actorRole" AND u."recordedAt"=NEW."recordedAt"
  AND u.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
  RAISE EXCEPTION 'Invalid unit receiving event' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_event_insert_guard BEFORE INSERT ON "UnitEvent" FOR EACH ROW EXECUTE FUNCTION dayari_unit_event_guard();
CREATE FUNCTION dayari_unit_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Unit projection cannot be removed without matching history' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "UnitEvent" e WHERE e.id=NEW."lastEventId" AND e."unitId"=NEW."unitId" AND e."lotId"=NEW."lotId"
  AND e."originId"=NEW."originId" AND e.ordinal=NEW.version AND e."toState"=NEW.state) THEN
  RAISE EXCEPTION 'Unit projection must match immutable events' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_state_guard BEFORE INSERT OR UPDATE OR DELETE ON "UnitState" FOR EACH ROW EXECUTE FUNCTION dayari_unit_state_guard();
CREATE FUNCTION dayari_unit_manifest_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "CommandResult" c WHERE c.id=NEW."commandId" AND c.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
  RAISE EXCEPTION 'An accepted unit command cannot be supplemented' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "StockTransaction" t WHERE t."commandId"=NEW."commandId" AND t."originId"=NEW."originId") THEN
  RAISE EXCEPTION 'Unit manifest requires its receipt command' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_manifest_guard BEFORE INSERT ON "UnitCommandManifestPage" FOR EACH ROW EXECUTE FUNCTION dayari_unit_manifest_guard();
CREATE FUNCTION dayari_validate_receipt_units() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid; total bigint; member_count bigint; distinct_count bigint;
BEGIN
 SELECT "commandId" INTO cid FROM "StockTransaction" WHERE id=NEW."transactionId";
 SELECT sum("totalQuantity") INTO total FROM "ReceiptLine" WHERE "receiptId"=NEW.id;
 IF total>10000 OR total IS NULL OR NOT EXISTS(SELECT 1 FROM "SerializationCutover" c WHERE c."originId"=(SELECT "originId" FROM "DeliveryBatch" WHERE id=NEW."batchId")) THEN
  RAISE EXCEPTION 'Serialized receipt exceeds capacity or lacks cutover provenance' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM "ReceiptLine" r JOIN "StockLot" l ON l.id=r."lotId" LEFT JOIN "LotSerialization" p ON p."lotId"=l.id
  WHERE r."receiptId"=NEW.id AND (p.mode IS DISTINCT FROM 'NATIVE' OR p."originId"<>l."originId"
   OR (SELECT count(*) FROM "StockUnit" u WHERE u."receiptLineId"=r.id AND u."initialState"='U')<>r."usableQuantity"
   OR (SELECT count(*) FROM "StockUnit" u WHERE u."receiptLineId"=r.id AND u."initialState"='D')<>r."damagedQuantity")) THEN
  RAISE EXCEPTION 'Receipt units do not exactly match usable/damaged intake' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM "StockUnit" u LEFT JOIN "UnitState" s ON s."unitId"=u.id LEFT JOIN "UnitEvent" e ON e.id=s."lastEventId"
  WHERE u."registrationCommandId"=cid AND (s."unitId" IS NULL OR e.id IS NULL OR s.state<>u."initialState" OR e."commandId"<>cid)) THEN
  RAISE EXCEPTION 'Incomplete initial unit event/projection group' USING ERRCODE='23514'; END IF;
 SELECT count(*),count(DISTINCT m->>'id') INTO member_count,distinct_count FROM "UnitCommandManifestPage" p CROSS JOIN LATERAL jsonb_array_elements(p.members) m WHERE p."commandId"=cid;
 IF member_count<>total OR distinct_count<>total OR NOT EXISTS(SELECT 1 FROM "UnitCommandManifestPage" WHERE "commandId"=cid)
  OR EXISTS(SELECT 1 FROM "UnitCommandManifestPage" p CROSS JOIN LATERAL jsonb_array_elements(p.members) m
    LEFT JOIN "StockUnit" u ON u.id::text=m->>'id' LEFT JOIN "UnitEvent" e ON e.id::text=m->>'eventId'
    WHERE p."commandId"=cid AND (u.id IS NULL OR e.id IS NULL OR u."registrationCommandId"<>cid OR e."unitId"<>u.id
     OR u."originId"<>p."originId" OR u."unitCode" IS DISTINCT FROM m->>'unitCode' OR u."lotId"::text IS DISTINCT FROM m->>'lotId'
     OR u."initialState" IS DISTINCT FROM m->>'state')) THEN
  RAISE EXCEPTION 'Incomplete, duplicated or unrelated unit manifest' USING ERRCODE='23514'; END IF;
 IF (SELECT min(ordinal)<>0 OR max(ordinal)<>count(*)-1 FROM "UnitCommandManifestPage" WHERE "commandId"=cid) THEN
  RAISE EXCEPTION 'Unit manifest pages must be contiguous' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER receipt_units_complete AFTER INSERT ON "Receipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_validate_receipt_units();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['SerializationCutover','LotSerialization','StockUnit','UnitEvent','UnitCommandManifestPage'] LOOP
  EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change()',t);
 END LOOP;
END $$;
COMMIT;
