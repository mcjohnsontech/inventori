-- Exact-unit BAD reporting and Manager disposition. Isolated development/test only.
BEGIN;
CREATE TABLE "DamageReport" (
 id uuid PRIMARY KEY,"originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),"actorRole" "Role" NOT NULL,
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "transactionId" uuid NOT NULL UNIQUE REFERENCES "StockTransaction"(id),"recordedAt" timestamptz(6) NOT NULL,
 cause text NOT NULL CHECK(length(btrim(cause)) BETWEEN 3 AND 2000 AND cause ~ '[[:alpha:]]'),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 10 AND 2000 AND description ~ '[[:alpha:]]'),
 "unitCount" integer NOT NULL CHECK("unitCount" BETWEEN 1 AND 500),manifest jsonb NOT NULL,"canonicalManifest" text NOT NULL,"manifestHash" text NOT NULL,
 CHECK(jsonb_typeof(manifest)='array' AND jsonb_array_length(manifest)="unitCount" AND manifest="canonicalManifest"::jsonb),
 CHECK("manifestHash"=encode(sha256(convert_to("canonicalManifest",'UTF8')),'hex'))
);
CREATE INDEX "DamageReport_originId_recordedAt_id_idx" ON "DamageReport"("originId","recordedAt",id);
CREATE TABLE "DamageLine" (
 id uuid PRIMARY KEY,"reportId" uuid NOT NULL REFERENCES "DamageReport"(id),"originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "unitId" uuid NOT NULL REFERENCES "StockUnit"(id),"lotId" uuid NOT NULL REFERENCES "StockLot"(id),"batchId" uuid NOT NULL REFERENCES "DeliveryBatch"(id),
 "fromState" text NOT NULL CHECK("fromState" IN ('U','P')),"previousEventId" uuid NOT NULL REFERENCES "UnitEvent"(id),
 "checkoutLineId" uuid REFERENCES "CheckoutLine"(id),"movementId" uuid NOT NULL UNIQUE REFERENCES "StockMovement"(id) DEFERRABLE INITIALLY DEFERRED,
 "eventId" uuid NOT NULL UNIQUE REFERENCES "UnitEvent"(id) DEFERRABLE INITIALLY DEFERRED,snapshot jsonb NOT NULL,
 UNIQUE("reportId","unitId"),CHECK(("fromState"='P')=("checkoutLineId" IS NOT NULL))
);
CREATE INDEX "DamageLine_unitId_idx" ON "DamageLine"("unitId");
CREATE TABLE "DamageReview" (
 id uuid PRIMARY KEY,"originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),"actorRole" "Role" NOT NULL CHECK("actorRole"='MANAGER'),
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "transactionId" uuid UNIQUE REFERENCES "StockTransaction"(id),"recordedAt" timestamptz(6) NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('HELD','REWORKED','DISCARDED','RETURNED_TO_VENDOR')),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 10 AND 2000 AND note ~ '[[:alpha:]]'),
 "unitCount" integer NOT NULL CHECK("unitCount" BETWEEN 1 AND 500),manifest jsonb NOT NULL,"canonicalManifest" text NOT NULL,"manifestHash" text NOT NULL,
 CHECK((outcome IN ('DISCARDED','RETURNED_TO_VENDOR'))=("transactionId" IS NOT NULL)),
 CHECK(jsonb_typeof(manifest)='array' AND jsonb_array_length(manifest)="unitCount" AND manifest="canonicalManifest"::jsonb),
 CHECK("manifestHash"=encode(sha256(convert_to("canonicalManifest",'UTF8')),'hex'))
);
CREATE INDEX "DamageReview_originId_recordedAt_id_idx" ON "DamageReview"("originId","recordedAt",id);
CREATE TABLE "DamageReviewLine" (
 id uuid PRIMARY KEY,"reviewId" uuid NOT NULL REFERENCES "DamageReview"(id),"originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "unitId" uuid NOT NULL REFERENCES "StockUnit"(id),"lotId" uuid NOT NULL REFERENCES "StockLot"(id),"batchId" uuid NOT NULL REFERENCES "DeliveryBatch"(id),
 "previousEventId" uuid NOT NULL REFERENCES "UnitEvent"(id),"damageLineId" uuid REFERENCES "DamageLine"(id),
 "movementId" uuid UNIQUE REFERENCES "StockMovement"(id) DEFERRABLE INITIALLY DEFERRED,
 "eventId" uuid UNIQUE REFERENCES "UnitEvent"(id) DEFERRABLE INITIALLY DEFERRED,snapshot jsonb NOT NULL,
 UNIQUE("reviewId","unitId"),CHECK(("movementId" IS NULL)=("eventId" IS NULL))
);
CREATE INDEX "DamageReviewLine_unitId_idx" ON "DamageReviewLine"("unitId");
ALTER TABLE "StockMovement" ADD COLUMN "damageLineId" uuid UNIQUE REFERENCES "DamageLine"(id),
 ADD COLUMN "damageReviewLineId" uuid UNIQUE REFERENCES "DamageReviewLine"(id),DROP CONSTRAINT movement_enabled_provenance;
ALTER TABLE "StockMovement" ADD CONSTRAINT movement_enabled_provenance CHECK (
 (num_nonnulls("receiptLineId","checkoutLineId","damageLineId","damageReviewLineId")=1) AND (
 ("receiptLineId" IS NOT NULL AND "fromState"='E' AND "toState" IN ('U','D')) OR
 ("checkoutLineId" IS NOT NULL AND "fromState"='U' AND "toState"='P' AND quantity=1) OR
 ("damageLineId" IS NOT NULL AND "fromState" IN ('U','P') AND "toState"='D' AND quantity=1) OR
 ("damageReviewLineId" IS NOT NULL AND "fromState"='D' AND "toState"='X' AND quantity=1)));
ALTER TABLE "UnitEvent" ADD COLUMN "damageLineId" uuid UNIQUE REFERENCES "DamageLine"(id),
 ADD COLUMN "damageReviewLineId" uuid UNIQUE REFERENCES "DamageReviewLine"(id),DROP CONSTRAINT unit_event_enabled_transition;
ALTER TABLE "UnitEvent" ADD CONSTRAINT unit_event_enabled_transition CHECK (
 (kind='RECEIVED' AND ordinal=1 AND "fromState"='E' AND "toState" IN ('U','D') AND "previousEventId" IS NULL AND num_nonnulls("checkoutLineId","damageLineId","damageReviewLineId")=0) OR
 (kind='ISSUED' AND ordinal>1 AND "fromState"='U' AND "toState"='P' AND "previousEventId" IS NOT NULL AND "checkoutLineId" IS NOT NULL AND "damageLineId" IS NULL AND "damageReviewLineId" IS NULL) OR
 (kind='BAD_REPORTED' AND ordinal>1 AND "fromState" IN ('U','P') AND "toState"='D' AND "previousEventId" IS NOT NULL AND "damageLineId" IS NOT NULL AND "checkoutLineId" IS NULL AND "damageReviewLineId" IS NULL) OR
 (kind='DAMAGE_REMOVED' AND ordinal>1 AND "fromState"='D' AND "toState"='X' AND "previousEventId" IS NOT NULL AND "damageReviewLineId" IS NOT NULL AND "checkoutLineId" IS NULL AND "damageLineId" IS NULL));
ALTER TABLE "StockTransaction" DROP CONSTRAINT transaction_enabled_provenance;
ALTER TABLE "StockTransaction" ADD CONSTRAINT transaction_enabled_provenance CHECK (
 (type='RECEIPT' AND "batchId" IS NOT NULL AND "actorRole" IN ('ADMIN','MANAGER')) OR
 (type IN ('ISSUE','DAMAGE') AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER','PRODUCTION')) OR
 (type='DISPOSITION' AND "batchId" IS NULL AND "actorRole"='MANAGER'));
ALTER TABLE "UnitState" DROP CONSTRAINT unit_state_enabled_shape;
ALTER TABLE "UnitState" ADD CONSTRAINT unit_state_enabled_shape CHECK(version>0 AND (
 (state IN ('U','D') AND custody='SHOP_STORAGE' AND "holderId" IS NULL AND condition=CASE state WHEN 'U' THEN 'USABLE' ELSE 'DAMAGED' END) OR
 (state='P' AND condition='USABLE' AND custody='ISSUED_TO_STAFF' AND "holderId" IS NOT NULL) OR
 (state='X' AND condition='DAMAGED' AND custody='REMOVED' AND "holderId" IS NULL)));
CREATE FUNCTION dayari_damage_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_xid text;
BEGIN
 IF TG_TABLE_NAME='DamageLine' THEN SELECT xmin::text INTO parent_xid FROM "DamageReport" WHERE id=NEW."reportId" AND "originId"=NEW."originId";
 ELSE SELECT xmin::text INTO parent_xid FROM "DamageReview" WHERE id=NEW."reviewId" AND "originId"=NEW."originId"; END IF;
 IF parent_xid IS DISTINCT FROM (pg_current_xact_id()::text::numeric%4294967296)::text THEN RAISE EXCEPTION 'Accepted damage evidence cannot be supplemented' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['DamageReport','DamageLine','DamageReview','DamageReviewLine'] LOOP
 EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change()',t); END LOOP;
 FOREACH t IN ARRAY ARRAY['DamageLine','DamageReviewLine'] LOOP
 EXECUTE format('CREATE TRIGGER damage_child_guard BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION dayari_damage_child_guard()',t); END LOOP;
END $$;
CREATE OR REPLACE FUNCTION dayari_receipt_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE created_xid text;
BEGIN
 IF TG_TABLE_NAME='StockTransaction' THEN
  IF NEW.type IN ('ISSUE','DAMAGE','DISPOSITION') THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='StockMovement' THEN
  IF NEW."damageLineId" IS NOT NULL OR NEW."damageReviewLineId" IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "DamageLine" x JOIN "DamageReport" r ON r.id=x."reportId" WHERE x.id=NEW."damageLineId"
    AND r."transactionId"=NEW."transactionId" AND x."movementId"=NEW.id AND x."lotId"=NEW."lotId" AND x."batchId"=NEW."batchId"
    AND r.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)
   AND NOT EXISTS(SELECT 1 FROM "DamageReviewLine" x JOIN "DamageReview" r ON r.id=x."reviewId" WHERE x.id=NEW."damageReviewLineId"
    AND r."transactionId"=NEW."transactionId" AND x."movementId"=NEW.id AND x."lotId"=NEW."lotId" AND x."batchId"=NEW."batchId"
    AND r.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
    RAISE EXCEPTION 'Damage movement requires its new exact domain line' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  IF NEW."checkoutLineId" IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "CheckoutLine" x JOIN "Checkout" c ON c.id=x."checkoutId"
    JOIN "StockTransaction" t ON t.id=c."transactionId" WHERE x.id=NEW."checkoutLineId" AND t.type='ISSUE'
    AND t.id=NEW."transactionId" AND x."movementId"=NEW.id AND x."lotId"=NEW."lotId" AND x."batchId"=NEW."batchId"
    AND c.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
     RAISE EXCEPTION 'Issue movement requires its new exact checkout line' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
 END IF;
 SELECT xmin::text INTO created_xid FROM "DeliveryBatch" WHERE id=NEW."batchId";
 IF created_xid IS DISTINCT FROM (pg_current_xact_id()::text::numeric%4294967296)::text THEN
  RAISE EXCEPTION 'An accepted delivery cannot be supplemented' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION dayari_unit_event_guard_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM inserted n WHERE n.kind='RECEIVED' AND NOT EXISTS(
  SELECT 1 FROM "StockUnit" u WHERE u.id=n."unitId" AND u."lotId"=n."lotId" AND u."originId"=n."originId"
  AND u."registrationCommandId"=n."commandId" AND u."initialMovementId"=n."movementId" AND u."initialState"=n."toState"
  AND u."actorId"=n."actorId" AND u."actorRole"=n."actorRole" AND u."recordedAt"=n."recordedAt"
  AND u.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
  RAISE EXCEPTION 'Invalid unit receiving event' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM inserted n WHERE n.kind='ISSUED' AND NOT EXISTS(
  SELECT 1 FROM "UnitState" s JOIN "CheckoutLine" x ON x."unitId"=s."unitId"
  JOIN "Checkout" c ON c.id=x."checkoutId" JOIN "StockMovement" m ON m.id=x."movementId"
  JOIN "StockTransaction" t ON t.id=c."transactionId"
  WHERE x.id=n."checkoutLineId" AND x."eventId"=n.id AND s."unitId"=n."unitId" AND s."lotId"=n."lotId"
  AND s."originId"=n."originId" AND s.state='U' AND s."lastEventId"=n."previousEventId" AND n.ordinal=s.version+1
  AND c."originId"=n."originId" AND c."commandId"=n."commandId" AND c."actorId"=n."actorId"
  AND c."actorRole"=n."actorRole" AND c."acceptedAt"=n."recordedAt" AND t.type='ISSUE'
  AND m.id=n."movementId" AND m."checkoutLineId"=x.id AND m."transactionId"=t.id AND m."lotId"=n."lotId"
  AND m.quantity=1 AND m."fromState"='U' AND m."toState"='P'
  AND c.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
  RAISE EXCEPTION 'Invalid exact-unit issue event' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM inserted n JOIN "UnitState" s ON s."unitId"=n."unitId"
  WHERE n.kind IN ('BAD_REPORTED','DAMAGE_REMOVED') AND (
   s."lotId"<>n."lotId" OR s."originId"<>n."originId" OR s.state<>n."fromState" OR s."lastEventId"<>n."previousEventId" OR n.ordinal<>s.version+1
   OR NOT EXISTS(SELECT 1 FROM "StockMovement" m JOIN "StockTransaction" t ON t.id=m."transactionId"
    WHERE m.id=n."movementId" AND m."lotId"=n."lotId" AND m.quantity=1 AND m."fromState"=n."fromState" AND m."toState"=n."toState"
    AND t."originId"=n."originId" AND t."commandId"=n."commandId" AND t."actorId"=n."actorId" AND t."actorRole"=n."actorRole" AND t."recordedAt"=n."recordedAt"
    AND ((n.kind='BAD_REPORTED' AND t.type='DAMAGE' AND m."damageLineId"=n."damageLineId") OR
         (n.kind='DAMAGE_REMOVED' AND t.type='DISPOSITION' AND m."damageReviewLineId"=n."damageReviewLineId"))))) THEN
   RAISE EXCEPTION 'Invalid exact-unit damage transition' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION dayari_unit_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Unit projection cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW."unitId"<>OLD."unitId" OR NEW."lotId"<>OLD."lotId" OR NEW."originId"<>OLD."originId" THEN
 RAISE EXCEPTION 'Unit projection identity is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM "UnitEvent" e WHERE e.id=NEW."lastEventId" AND e."unitId"=NEW."unitId"
 AND e."lotId"=NEW."lotId" AND e."originId"=NEW."originId" AND e.ordinal=NEW.version AND e."toState"=NEW.state AND e."fromState"=OLD.state
 AND e."previousEventId"=OLD."lastEventId" AND e.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text AND (
 (e.kind='ISSUED' AND OLD.state='U' AND NEW.state='P' AND e."actorId"=NEW."holderId") OR
 (e.kind='BAD_REPORTED' AND OLD.state IN ('U','P') AND NEW.state='D' AND NEW."holderId" IS NULL) OR
 (e.kind='DAMAGE_REMOVED' AND OLD.state='D' AND NEW.state='X' AND NEW."holderId" IS NULL))) THEN
 RAISE EXCEPTION 'Unit transition requires its new exact authorized domain event' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION dayari_damage_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE is_bad boolean:=TG_TABLE_NAME='DamageReport'; removed boolean; action_name text; command_name text; expected_type text; root_tx uuid; n bigint;
BEGIN
 removed:=NOT is_bad AND to_jsonb(NEW)->>'outcome' IN ('DISCARDED','RETURNED_TO_VENDOR');
 action_name:=CASE WHEN is_bad THEN 'inventory.damage.reported' ELSE 'inventory.damage.reviewed' END;
 command_name:=CASE WHEN is_bad THEN 'inventory.damage.report' ELSE 'inventory.damage.review' END;
 expected_type:=CASE WHEN is_bad THEN 'DAMAGE' ELSE 'DISPOSITION' END;
 root_tx:=NEW."transactionId";
 IF NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId"
  AND u.active AND NOT u."mustChangePassword" AND u.role=NEW."actorRole" AND m."originId"=NEW."originId"
  AND (is_bad OR u.role='MANAGER'))
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"=command_name)
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole"=NEW."actorRole"
  AND "subjectId"=NEW.id AND action=action_name AND snapshot->>'manifestHash'=NEW."manifestHash")
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId"
  AND "aggregateId"=NEW.id AND "eventType"=action_name AND payload->>'manifestHash'=NEW."manifestHash") THEN
 RAISE EXCEPTION 'Incomplete or unauthorized damage command evidence' USING ERRCODE='23514'; END IF;
 IF is_bad OR removed THEN
  IF NOT EXISTS(SELECT 1 FROM "StockTransaction" t JOIN "OutboxEvent" o ON o."commandId"=t."commandId" WHERE t.id=root_tx
   AND t.type=expected_type AND t."batchId" IS NULL AND t."originId"=NEW."originId" AND t."commandId"=NEW."commandId"
   AND t."actorId"=NEW."actorId" AND t."actorRole"=NEW."actorRole" AND t."recordedAt"=NEW."recordedAt"
   AND t."originSequence"=o."originSequence" AND t.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)
  OR (SELECT count(*) FROM "StockMovement" WHERE "transactionId"=root_tx)<>NEW."unitCount"
  OR (SELECT count(*) FROM "UnitEvent" WHERE "commandId"=NEW."commandId")<>NEW."unitCount" THEN
  RAISE EXCEPTION 'Incomplete damage transaction group' USING ERRCODE='23514'; END IF;
 ELSE
  IF root_tx IS NOT NULL OR EXISTS(SELECT 1 FROM "StockTransaction" WHERE "commandId"=NEW."commandId") OR EXISTS(SELECT 1 FROM "UnitEvent" WHERE "commandId"=NEW."commandId") THEN
  RAISE EXCEPTION 'Held and reworked reviews cannot move stock' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT count(*) INTO n FROM (
  SELECT id FROM "DamageLine" WHERE is_bad AND "reportId"=NEW.id UNION ALL
  SELECT id FROM "DamageReviewLine" WHERE NOT is_bad AND "reviewId"=NEW.id) lines;
 IF n<>NEW."unitCount" OR (SELECT count(DISTINCT member->>'id') FROM jsonb_array_elements(NEW.manifest) member)<>n THEN
 RAISE EXCEPTION 'Incomplete exact damage membership' USING ERRCODE='23514'; END IF;
 IF EXISTS(WITH lines AS (
  SELECT id,"originId","unitId","lotId","batchId","fromState","previousEventId","checkoutLineId",NULL::uuid AS "damageLineId","movementId","eventId",snapshot,xmin::text AS created_xid
   FROM "DamageLine" WHERE is_bad AND "reportId"=NEW.id UNION ALL
  SELECT id,"originId","unitId","lotId","batchId",'D',"previousEventId",NULL::uuid,"damageLineId","movementId","eventId",snapshot,xmin::text
   FROM "DamageReviewLine" WHERE NOT is_bad AND "reviewId"=NEW.id)
 SELECT 1 FROM lines x LEFT JOIN "StockUnit" u ON u.id=x."unitId" LEFT JOIN "StockLot" l ON l.id=u."lotId"
 LEFT JOIN "UnitState" s ON s."unitId"=u.id LEFT JOIN "UnitEvent" prior ON prior.id=x."previousEventId"
 LEFT JOIN "StockMovement" m ON m.id=x."movementId" LEFT JOIN "UnitEvent" e ON e.id=x."eventId"
 LEFT JOIN "CheckoutLine" checkout_line ON checkout_line.id=x."checkoutLineId"
 LEFT JOIN "Checkout" checkout ON checkout.id=checkout_line."checkoutId"
 LEFT JOIN "DamageLine" bad ON bad.id=x."damageLineId"
 LEFT JOIN LATERAL (SELECT member FROM jsonb_array_elements(NEW.manifest) member WHERE member->>'id'=x.id::text) manifest ON true
 WHERE u.id IS NULL OR l.id IS NULL OR s."unitId" IS NULL OR prior.id IS NULL OR manifest.member IS NULL
 OR x."originId"<>NEW."originId" OR u."originId"<>NEW."originId" OR l."originId"<>NEW."originId"
 OR x."lotId"<>u."lotId" OR x."batchId"<>l."batchId" OR prior."unitId"<>u.id OR prior."lotId"<>l.id OR prior."toState"<>x."fromState"
 OR x.created_xid<>(pg_current_xact_id()::text::numeric%4294967296)::text
 OR manifest.member->>'unitId' IS DISTINCT FROM u.id::text
 OR x.snapshot->'unit'->>'unitId' IS DISTINCT FROM u.id::text OR x.snapshot->'unit'->>'unitCode' IS DISTINCT FROM u."unitCode"
 OR x.snapshot->'unit'->>'lotId' IS DISTINCT FROM l.id::text OR x.snapshot->'unit'->>'skuId' IS DISTINCT FROM l."skuId"::text
 OR x.snapshot->'unit'->>'batchId' IS DISTINCT FROM l."batchId"::text
 OR (is_bad AND x."fromState"='P' AND (checkout_line.id IS NULL OR checkout_line."unitId"<>u.id OR checkout_line."eventId"<>prior.id
   OR checkout."originId"<>NEW."originId" OR (NEW."actorRole"='PRODUCTION' AND checkout."actorId"<>NEW."actorId")))
 OR (is_bad AND x."fromState"='U' AND NEW."actorRole"='PRODUCTION')
 OR (NOT is_bad AND ((x."damageLineId" IS NULL AND NOT(prior.kind='RECEIVED' AND u."initialState"='D'))
  OR (x."damageLineId" IS NOT NULL AND (bad.id IS NULL OR bad."unitId"<>u.id OR bad."eventId"<>prior.id))))
 OR ((is_bad OR removed) AND (m.id IS NULL OR e.id IS NULL OR m."transactionId"<>root_tx OR m."lotId"<>l.id OR m."batchId"<>l."batchId"
  OR m.quantity<>1 OR m."fromState"<>x."fromState" OR m."toState"<>CASE WHEN is_bad THEN 'D' ELSE 'X' END
  OR (is_bad AND m."damageLineId" IS DISTINCT FROM x.id) OR (NOT is_bad AND m."damageReviewLineId" IS DISTINCT FROM x.id)
  OR e."movementId"<>m.id OR e."unitId"<>u.id OR e."originId"<>NEW."originId" OR e."lotId"<>l.id
  OR e."commandId"<>NEW."commandId" OR e."actorId"<>NEW."actorId" OR e."actorRole"<>NEW."actorRole" OR e."recordedAt"<>NEW."recordedAt"
  OR e."previousEventId"<>prior.id OR e.ordinal<>prior.ordinal+1 OR e."fromState"<>x."fromState" OR e."toState"<>m."toState"
  OR (is_bad AND (e.kind<>'BAD_REPORTED' OR e."damageLineId" IS DISTINCT FROM x.id))
  OR (NOT is_bad AND (e.kind<>'DAMAGE_REMOVED' OR e."damageReviewLineId" IS DISTINCT FROM x.id))
  OR s.state<>e."toState" OR s."lastEventId"<>e.id OR s.version<>e.ordinal
  OR m.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text OR e.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text))
 OR (NOT is_bad AND NOT removed AND (x."movementId" IS NOT NULL OR x."eventId" IS NOT NULL OR s.state<>'D' OR s."lastEventId"<>prior.id OR s.version<>prior.ordinal))) THEN
 RAISE EXCEPTION 'Damage provenance, permission, unit state, manifest or movement mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(WITH lots AS (
 SELECT "lotId" FROM "DamageLine" WHERE is_bad AND "reportId"=NEW.id UNION SELECT "lotId" FROM "DamageReviewLine" WHERE NOT is_bad AND "reviewId"=NEW.id),
 counts AS (SELECT s."lotId",s.state,count(*) AS n FROM "UnitState" s JOIN lots l ON l."lotId"=s."lotId" GROUP BY s."lotId",s.state)
 SELECT 1 FROM lots l CROSS JOIN (VALUES('U'),('P'),('D'),('X')) states(state)
 LEFT JOIN counts c ON c."lotId"=l."lotId" AND c.state=states.state LEFT JOIN "StockBalance" b ON b."lotId"=l."lotId" AND b.state=states.state
 WHERE COALESCE(c.n,0)<>COALESCE(b.quantity,0)) THEN
 RAISE EXCEPTION 'Damage unit census must match ledger projections' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER damage_complete AFTER INSERT ON "DamageReport" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_damage_complete();
CREATE CONSTRAINT TRIGGER damage_review_complete AFTER INSERT ON "DamageReview" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_damage_complete();
CREATE FUNCTION dayari_damage_transaction_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.type='DAMAGE' AND NOT EXISTS(SELECT 1 FROM "DamageReport" WHERE "transactionId"=NEW.id AND xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text))
 OR (NEW.type='DISPOSITION' AND NOT EXISTS(SELECT 1 FROM "DamageReview" WHERE "transactionId"=NEW.id AND xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
 RAISE EXCEPTION 'Damage transactions require their complete new domain root' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER damage_transaction_complete AFTER INSERT ON "StockTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_damage_transaction_complete();
COMMIT;
