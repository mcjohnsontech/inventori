-- Exact-unit checkout. Development/test only; operational installation requires approval.
BEGIN;
ALTER TABLE "StockTransaction" ALTER COLUMN "batchId" DROP NOT NULL,
 DROP CONSTRAINT "StockTransaction_type_check", DROP CONSTRAINT "StockTransaction_actorRole_check";
ALTER TABLE "StockTransaction" ADD CONSTRAINT transaction_enabled_provenance CHECK (
 (type='RECEIPT' AND "batchId" IS NOT NULL AND "actorRole" IN ('ADMIN','MANAGER')) OR
 (type='ISSUE' AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER','PRODUCTION')));
CREATE TABLE "Checkout" (
 id uuid PRIMARY KEY, "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "transactionId" uuid NOT NULL UNIQUE REFERENCES "StockTransaction"(id),
 "actorId" uuid NOT NULL REFERENCES "User"(id), "actorRole" "Role" NOT NULL,
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "acceptedAt" timestamptz(6) NOT NULL, "reasonCode" text, "reasonNote" text NOT NULL,
 "orderReference" text, "unitCount" integer NOT NULL CHECK("unitCount" BETWEEN 1 AND 500),
 CHECK("reasonCode" IS NULL OR "reasonCode" IN ('PRODUCTION_USE','SAMPLE','INTERNAL_USE','OTHER')),
 CHECK(length("reasonNote")<=2000 AND ("reasonCode" IS NOT NULL OR "reasonNote"='')),
 CHECK("reasonCode" IS DISTINCT FROM 'OTHER' OR (length(btrim("reasonNote"))>=10 AND "reasonNote" ~ '[[:alpha:]]')),
 CHECK("orderReference" IS NULL OR (length("orderReference") BETWEEN 1 AND 120 AND "orderReference"=btrim("orderReference")))
);
CREATE INDEX "Checkout_originId_acceptedAt_id_idx" ON "Checkout"("originId","acceptedAt",id);
CREATE INDEX "Checkout_originId_actorId_acceptedAt_idx" ON "Checkout"("originId","actorId","acceptedAt");
CREATE TABLE "CheckoutLine" (
 id uuid PRIMARY KEY, "checkoutId" uuid NOT NULL REFERENCES "Checkout"(id),
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id), ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 500),
 "unitId" uuid NOT NULL, "lotId" uuid NOT NULL REFERENCES "StockLot"(id),
 "skuId" uuid NOT NULL REFERENCES "SupplierVariantSku"(id), "batchId" uuid NOT NULL REFERENCES "DeliveryBatch"(id),
 "movementId" uuid NOT NULL UNIQUE REFERENCES "StockMovement"(id) DEFERRABLE INITIALLY DEFERRED,
 "eventId" uuid NOT NULL UNIQUE REFERENCES "UnitEvent"(id) DEFERRABLE INITIALLY DEFERRED,
 "reasonCode" text, "reasonNote" text NOT NULL, "orderReference" text,
 "reasonInherited" boolean NOT NULL, "orderInherited" boolean NOT NULL,
 "initiallyMissingReason" boolean GENERATED ALWAYS AS ("reasonCode" IS NULL) STORED,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 FOREIGN KEY("unitId","lotId") REFERENCES "StockUnit"(id,"lotId"),
 UNIQUE("checkoutId","unitId"), UNIQUE("checkoutId",ordinal),
 CHECK("reasonCode" IS NULL OR "reasonCode" IN ('PRODUCTION_USE','SAMPLE','INTERNAL_USE','OTHER')),
 CHECK(length("reasonNote")<=2000 AND ("reasonCode" IS NOT NULL OR "reasonNote"='')),
 CHECK("reasonCode" IS DISTINCT FROM 'OTHER' OR (length(btrim("reasonNote"))>=10 AND "reasonNote" ~ '[[:alpha:]]')),
 CHECK("orderReference" IS NULL OR (length("orderReference") BETWEEN 1 AND 120 AND "orderReference"=btrim("orderReference")))
);
CREATE INDEX "CheckoutLine_unitId_idx" ON "CheckoutLine"("unitId");
CREATE INDEX "CheckoutLine_originId_orderReference_checkoutId_idx" ON "CheckoutLine"("originId","orderReference","checkoutId");
CREATE TABLE "CheckoutException" (
 id uuid PRIMARY KEY, "checkoutId" uuid NOT NULL REFERENCES "Checkout"(id),
 "lineId" uuid NOT NULL UNIQUE REFERENCES "CheckoutLine"(id), "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "commandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "createdAt" timestamptz(6) NOT NULL
);
ALTER TABLE "StockMovement" ALTER COLUMN "receiptLineId" DROP NOT NULL,
 ADD COLUMN "checkoutLineId" uuid UNIQUE REFERENCES "CheckoutLine"(id),
 DROP CONSTRAINT "StockMovement_fromState_check", DROP CONSTRAINT "StockMovement_toState_check";
ALTER TABLE "StockMovement" ADD CONSTRAINT movement_enabled_provenance CHECK (
 ("receiptLineId" IS NOT NULL AND "checkoutLineId" IS NULL AND "fromState"='E' AND "toState" IN ('U','D')) OR
 ("receiptLineId" IS NULL AND "checkoutLineId" IS NOT NULL AND "fromState"='U' AND "toState"='P' AND quantity=1));
ALTER TABLE "UnitEvent" ADD COLUMN "previousEventId" uuid REFERENCES "UnitEvent"(id),
 ADD COLUMN "checkoutLineId" uuid UNIQUE REFERENCES "CheckoutLine"(id),
 DROP CONSTRAINT "UnitEvent_ordinal_check", DROP CONSTRAINT "UnitEvent_kind_check",
 DROP CONSTRAINT "UnitEvent_fromState_check", DROP CONSTRAINT "UnitEvent_toState_check";
ALTER TABLE "UnitEvent" ADD CONSTRAINT unit_event_enabled_transition CHECK (
 (kind='RECEIVED' AND ordinal=1 AND "fromState"='E' AND "toState" IN ('U','D') AND "previousEventId" IS NULL AND "checkoutLineId" IS NULL) OR
 (kind='ISSUED' AND ordinal>1 AND "fromState"='U' AND "toState"='P' AND "previousEventId" IS NOT NULL AND "checkoutLineId" IS NOT NULL));
ALTER TABLE "UnitState" ADD COLUMN "holderId" uuid REFERENCES "User"(id),
 DROP CONSTRAINT "UnitState_state_check", DROP CONSTRAINT "UnitState_custody_check",
 DROP CONSTRAINT "UnitState_version_check", DROP CONSTRAINT "UnitState_check";
ALTER TABLE "UnitState" ADD CONSTRAINT unit_state_enabled_shape CHECK (version>0 AND (
 (state IN ('U','D') AND custody='SHOP_STORAGE' AND "holderId" IS NULL AND condition=CASE state WHEN 'U' THEN 'USABLE' ELSE 'DAMAGED' END) OR
 (state='P' AND condition='USABLE' AND custody='ISSUED_TO_STAFF' AND "holderId" IS NOT NULL)));

CREATE OR REPLACE FUNCTION dayari_receipt_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE created_xid text;
BEGIN
 IF TG_TABLE_NAME='StockTransaction' THEN
  IF NEW.type='ISSUE' THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='StockMovement' THEN
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
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION dayari_unit_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Unit projection cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW."unitId"<>OLD."unitId" OR NEW."lotId"<>OLD."lotId" OR NEW."originId"<>OLD."originId" THEN
  RAISE EXCEPTION 'Unit projection identity is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.state<>'U' OR NEW.state<>'P' OR NEW.version<>OLD.version+1 OR NOT EXISTS(
  SELECT 1 FROM "UnitEvent" e WHERE e.id=NEW."lastEventId" AND e."unitId"=NEW."unitId" AND e."lotId"=NEW."lotId"
  AND e."originId"=NEW."originId" AND e.ordinal=NEW.version AND e."toState"=NEW.state AND e."fromState"=OLD.state
  AND e."previousEventId"=OLD."lastEventId" AND e.kind='ISSUED' AND e."actorId"=NEW."holderId"
  AND e.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
   RAISE EXCEPTION 'Unit transition requires its new matching exact issue event' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION dayari_unit_state_insert_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM inserted n WHERE n.version<>1 OR n."holderId" IS NOT NULL OR NOT EXISTS(
  SELECT 1 FROM "UnitEvent" e JOIN "StockUnit" u ON u.id=e."unitId"
  WHERE e.id=n."lastEventId" AND e."unitId"=n."unitId" AND e."lotId"=n."lotId" AND e."originId"=n."originId"
  AND e.ordinal=n.version AND e."toState"=n.state AND e.kind='RECEIVED'
  AND u.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
   RAISE EXCEPTION 'Initial unit projection requires its new receiving event' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION dayari_validate_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lid uuid; s text; expected numeric; actual bigint;
BEGIN
 IF TG_OP='DELETE' THEN lid:=OLD."lotId"; s:=OLD.state; ELSE lid:=NEW."lotId"; s:=NEW.state; END IF;
 IF TG_OP='UPDATE' AND (NEW."lotId"<>OLD."lotId" OR NEW.state<>OLD.state) THEN
  RAISE EXCEPTION 'Projection identity is fixed' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(sum(CASE WHEN "toState"=s THEN quantity ELSE -quantity END),0) INTO expected
  FROM "StockMovement" WHERE "lotId"=lid AND ("toState"=s OR "fromState"=s);
 SELECT quantity INTO actual FROM "StockBalance" WHERE "lotId"=lid AND state=s;
 IF COALESCE(actual,0)<>expected OR EXISTS(
  SELECT 1 FROM "StockBalance" v JOIN "StockTransaction" t ON t.id=v."lastTransactionId"
  JOIN "StockLot" l ON l.id=v."lotId" WHERE v."lotId"=lid AND v.state=s AND (
   t."originId"<>l."originId" OR NOT EXISTS(SELECT 1 FROM "StockMovement" m WHERE m."transactionId"=t.id AND m."lotId"=l.id))) THEN
   RAISE EXCEPTION 'Stock projection must match accepted ledger' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
-- Root completeness, late-insert guards and issue-only transaction guard follow below.

CREATE FUNCTION dayari_checkout_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Checkout" c WHERE c.id=NEW."checkoutId" AND c."originId"=NEW."originId"
  AND c.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
   RAISE EXCEPTION 'An accepted checkout cannot be supplemented' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Checkout','CheckoutLine','CheckoutException'] LOOP
  EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['CheckoutLine','CheckoutException'] LOOP
  EXECUTE format('CREATE TRIGGER checkout_child_guard BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION dayari_checkout_child_guard()',t);
 END LOOP;
END $$;
CREATE FUNCTION dayari_checkout_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "StockTransaction"; n bigint; d bigint;
BEGIN
 SELECT * INTO t FROM "StockTransaction" WHERE id=NEW."transactionId";
 IF t.type IS DISTINCT FROM 'ISSUE' OR t."batchId" IS NOT NULL OR t."originId"<>NEW."originId"
 OR t."commandId"<>NEW."commandId" OR t."actorId"<>NEW."actorId" OR t."actorRole"<>NEW."actorRole"
 OR t."recordedAt"<>NEW."acceptedAt"
 OR t.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text
 OR NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" sm ON sm."userId"=u.id
  WHERE u.id=NEW."actorId" AND u.active AND NOT u."mustChangePassword" AND u.role=NEW."actorRole" AND sm."originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" c WHERE c.id=NEW."commandId" AND c."originId"=NEW."originId"
  AND c."actorId"=NEW."actorId" AND c."commandType"='production.checkouts.create')
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" a WHERE a."commandId"=NEW."commandId" AND a."originId"=NEW."originId"
  AND a."actorId"=NEW."actorId" AND a."actorRole"=NEW."actorRole" AND a."subjectId"=NEW.id AND a.action='inventory.checkout.accepted')
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" o WHERE o."commandId"=NEW."commandId" AND o."originId"=NEW."originId"
  AND o."actorId"=NEW."actorId" AND o."originSequence"=t."originSequence" AND o."aggregateId"=NEW.id AND o."eventType"='inventory.checkout.accepted')
 OR (SELECT count(*) FROM "CheckoutLine" WHERE "checkoutId"=NEW.id)<>NEW."unitCount"
 OR (SELECT min(ordinal)<>1 OR max(ordinal)<>NEW."unitCount" FROM "CheckoutLine" WHERE "checkoutId"=NEW.id)
 OR (SELECT count(*) FROM "StockMovement" WHERE "transactionId"=t.id)<>NEW."unitCount"
 OR (SELECT count(*) FROM "UnitEvent" WHERE "commandId"=NEW."commandId")<>NEW."unitCount" THEN
  RAISE EXCEPTION 'Incomplete exact-unit checkout evidence' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM "CheckoutLine" x
  JOIN "StockUnit" u ON u.id=x."unitId" JOIN "StockLot" l ON l.id=u."lotId"
  JOIN "SupplierVariantSku" sku ON sku.id=l."skuId"
  JOIN "DeliveryBatch" b ON b.id=l."batchId"
  LEFT JOIN "StockMovement" m ON m.id=x."movementId"
  LEFT JOIN "UnitEvent" e ON e.id=x."eventId"
  LEFT JOIN "UnitState" s ON s."unitId"=u.id
  LEFT JOIN "CheckoutException" ex ON ex."lineId"=x.id
  WHERE x."checkoutId"=NEW.id AND (
   x."originId"<>NEW."originId" OR u."originId"<>NEW."originId" OR l."originId"<>NEW."originId"
   OR x."lotId"<>u."lotId" OR x."skuId"<>l."skuId" OR x."batchId"<>l."batchId"
   OR m.id IS NULL OR m."transactionId"<>t.id OR m."checkoutLineId" IS DISTINCT FROM x.id
   OR m."receiptLineId" IS NOT NULL OR m."lotId"<>l.id OR m."batchId"<>l."batchId"
   OR m.quantity<>1 OR m."fromState"<>'U' OR m."toState"<>'P'
   OR e.id IS NULL OR e."checkoutLineId" IS DISTINCT FROM x.id OR e."movementId"<>m.id
   OR e.kind<>'ISSUED' OR e."unitId"<>u.id OR e."lotId"<>l.id OR e."originId"<>NEW."originId"
   OR e."commandId"<>NEW."commandId" OR e."actorId"<>NEW."actorId" OR e."actorRole"<>NEW."actorRole" OR e."recordedAt"<>NEW."acceptedAt"
   OR s."unitId" IS NULL OR s.state<>'P' OR s."lastEventId"<>e.id OR s.version<>e.ordinal OR s."holderId" IS DISTINCT FROM NEW."actorId"
   OR (x."reasonInherited" AND (x."reasonCode" IS DISTINCT FROM NEW."reasonCode" OR x."reasonNote"<>NEW."reasonNote"))
   OR (x."orderInherited" AND x."orderReference" IS DISTINCT FROM NEW."orderReference")
   OR (x."reasonCode" IS NULL AND (ex.id IS NULL OR ex."checkoutId"<>NEW.id OR ex."originId"<>NEW."originId"
    OR ex."commandId"<>NEW."commandId" OR ex."createdAt"<>NEW."acceptedAt"))
   OR (x."reasonCode" IS NOT NULL AND ex.id IS NOT NULL)
   OR x.snapshot->>'unitId' IS DISTINCT FROM u.id::text OR x.snapshot->>'unitCode' IS DISTINCT FROM u."unitCode"
   OR x.snapshot->>'lotId' IS DISTINCT FROM l.id::text OR x.snapshot->>'skuId' IS DISTINCT FROM sku.id::text
   OR x.snapshot->>'fullSku' IS DISTINCT FROM sku."fullCode" OR x.snapshot->>'productId' IS DISTINCT FROM sku."productId"::text
   OR x.snapshot->>'variantId' IS DISTINCT FROM sku."variantId"::text OR x.snapshot->>'batchId' IS DISTINCT FROM b.id::text
   OR x.snapshot->>'publicBatchCode' IS DISTINCT FROM b."publicCode"
   OR m.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text
   OR e.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text
  )) OR EXISTS(SELECT 1 FROM "CheckoutException" ex LEFT JOIN "CheckoutLine" x ON x.id=ex."lineId"
   WHERE ex."checkoutId"=NEW.id AND (x."checkoutId"<>NEW.id OR x."reasonCode" IS NOT NULL)) THEN
   RAISE EXCEPTION 'Checkout unit, movement, state, reason or provenance mismatch' USING ERRCODE='23514'; END IF;
 SELECT count(*),count(DISTINCT member->>'id') INTO n,d FROM "UnitCommandManifestPage" p
  CROSS JOIN LATERAL jsonb_array_elements(p.members) member WHERE p."commandId"=NEW."commandId";
 IF n<>NEW."unitCount" OR d<>n OR (SELECT count(*) FROM "UnitCommandManifestPage" WHERE "commandId"=NEW."commandId")<>1
 OR EXISTS(SELECT 1 FROM "UnitCommandManifestPage" p CROSS JOIN LATERAL jsonb_array_elements(p.members) member
  LEFT JOIN "CheckoutLine" x ON x."unitId"=(member->>'id')::uuid AND x."checkoutId"=NEW.id
  LEFT JOIN "StockUnit" u ON u.id=(member->>'id')::uuid
  WHERE p."commandId"=NEW."commandId" AND (p.ordinal<>0 OR p."originId"<>NEW."originId" OR x.id IS NULL OR u.id IS NULL
   OR member->>'unitCode' IS DISTINCT FROM u."unitCode" OR member->>'lotId' IS DISTINCT FROM x."lotId"::text
   OR member->>'eventId' IS DISTINCT FROM x."eventId"::text OR member->>'movementId' IS DISTINCT FROM x."movementId"::text
   OR member->>'checkoutLineId' IS DISTINCT FROM x.id::text OR member->>'state' IS DISTINCT FROM 'P')) THEN
   RAISE EXCEPTION 'Incomplete or foreign checkout manifest' USING ERRCODE='23514'; END IF;
 -- One set-based census per checkout, never one per selected unit.
 IF EXISTS(WITH lots AS (SELECT DISTINCT "lotId" FROM "CheckoutLine" WHERE "checkoutId"=NEW.id),
  counts AS (SELECT s."lotId",s.state,count(*) AS n FROM "UnitState" s JOIN lots l ON l."lotId"=s."lotId" GROUP BY s."lotId",s.state)
  SELECT 1 FROM lots l CROSS JOIN (VALUES('U'),('P'),('D')) states(state)
  LEFT JOIN counts c ON c."lotId"=l."lotId" AND c.state=states.state
  LEFT JOIN "StockBalance" b ON b."lotId"=l."lotId" AND b.state=states.state
  WHERE COALESCE(c.n,0)<>COALESCE(b.quantity,0)) THEN
   RAISE EXCEPTION 'Exact unit census must match lot projections' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER checkout_complete AFTER INSERT ON "Checkout" DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION dayari_checkout_complete();
CREATE FUNCTION dayari_issue_transaction_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.type='ISSUE' AND NOT EXISTS(SELECT 1 FROM "Checkout" c WHERE c."transactionId"=NEW.id
  AND c.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
  RAISE EXCEPTION 'Issue requires its complete exact-unit checkout' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER issue_transaction_complete AFTER INSERT ON "StockTransaction" DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION dayari_issue_transaction_complete();
COMMIT;
