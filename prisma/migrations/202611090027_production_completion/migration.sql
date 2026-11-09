-- Explicit Manager-selected production completion. Isolated installation only.
BEGIN;
CREATE TABLE "ProductionCompletion" (
 id uuid PRIMARY KEY,"originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),"actorRole" "Role" NOT NULL CHECK("actorRole"='MANAGER'),
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "transactionId" uuid NOT NULL UNIQUE REFERENCES "StockTransaction"(id),"recordedAt" timestamptz(6) NOT NULL,
 "unitCount" integer NOT NULL CHECK("unitCount" BETWEEN 1 AND 500),manifest jsonb NOT NULL,"canonicalManifest" text NOT NULL,"manifestHash" text NOT NULL,
 CHECK(jsonb_typeof(manifest)='array' AND jsonb_array_length(manifest)="unitCount" AND manifest="canonicalManifest"::jsonb),
 CHECK("manifestHash"=encode(sha256(convert_to("canonicalManifest",'UTF8')),'hex'))
);
CREATE INDEX "ProductionCompletion_originId_recordedAt_id_idx" ON "ProductionCompletion"("originId","recordedAt",id);

CREATE TABLE "ProductionCompletionLine" (
 id uuid PRIMARY KEY,"completionId" uuid NOT NULL REFERENCES "ProductionCompletion"(id),"originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "unitId" uuid NOT NULL UNIQUE REFERENCES "StockUnit"(id),"lotId" uuid NOT NULL REFERENCES "StockLot"(id),"batchId" uuid NOT NULL REFERENCES "DeliveryBatch"(id),
 "checkoutLineId" uuid NOT NULL UNIQUE REFERENCES "CheckoutLine"(id),"previousEventId" uuid NOT NULL UNIQUE REFERENCES "UnitEvent"(id),
 "movementId" uuid NOT NULL UNIQUE REFERENCES "StockMovement"(id) DEFERRABLE INITIALLY DEFERRED,
 "eventId" uuid NOT NULL UNIQUE REFERENCES "UnitEvent"(id) DEFERRABLE INITIALLY DEFERRED,snapshot jsonb NOT NULL
);
CREATE INDEX "ProductionCompletionLine_completionId_idx" ON "ProductionCompletionLine"("completionId");
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON "ProductionCompletion" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON "ProductionCompletionLine" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
ALTER TABLE "StockMovement" ADD COLUMN "completionLineId" uuid UNIQUE REFERENCES "ProductionCompletionLine"(id), DROP CONSTRAINT movement_enabled_provenance;
ALTER TABLE "UnitEvent" ADD COLUMN "completionLineId" uuid UNIQUE REFERENCES "ProductionCompletionLine"(id), DROP CONSTRAINT unit_event_enabled_transition;
ALTER TABLE "StockMovement" ADD CONSTRAINT movement_enabled_provenance CHECK (
 (num_nonnulls("receiptLineId","checkoutLineId","damageLineId","damageReviewLineId","completionLineId")=1) AND (
 ("receiptLineId" IS NOT NULL AND "fromState"='E' AND "toState" IN ('U','D')) OR
 ("checkoutLineId" IS NOT NULL AND "fromState"='U' AND "toState"='P' AND quantity=1) OR
 ("damageLineId" IS NOT NULL AND "fromState" IN ('U','P') AND "toState"='D' AND quantity=1) OR
 ("damageReviewLineId" IS NOT NULL AND "fromState"='D' AND "toState"='X' AND quantity=1) OR ("completionLineId" IS NOT NULL AND "fromState"='P' AND "toState"='C' AND quantity=1)));
ALTER TABLE "UnitEvent" ADD CONSTRAINT unit_event_enabled_transition CHECK (
 ("completionLineId" IS NULL AND ((kind='RECEIVED' AND ordinal=1 AND "fromState"='E' AND "toState" IN ('U','D') AND "previousEventId" IS NULL AND num_nonnulls("checkoutLineId","damageLineId","damageReviewLineId")=0) OR
 (kind='ISSUED' AND ordinal>1 AND "fromState"='U' AND "toState"='P' AND "previousEventId" IS NOT NULL AND "checkoutLineId" IS NOT NULL AND "damageLineId" IS NULL AND "damageReviewLineId" IS NULL) OR
 (kind='BAD_REPORTED' AND ordinal>1 AND "fromState" IN ('U','P') AND "toState"='D' AND "previousEventId" IS NOT NULL AND "damageLineId" IS NOT NULL AND "checkoutLineId" IS NULL AND "damageReviewLineId" IS NULL) OR
 (kind='DAMAGE_REMOVED' AND ordinal>1 AND "fromState"='D' AND "toState"='X' AND "previousEventId" IS NOT NULL AND "damageReviewLineId" IS NOT NULL AND "checkoutLineId" IS NULL AND "damageLineId" IS NULL))) OR (kind='COMPLETED' AND ordinal>1 AND "fromState"='P' AND "toState"='C' AND "previousEventId" IS NOT NULL AND "completionLineId" IS NOT NULL AND num_nonnulls("checkoutLineId","damageLineId","damageReviewLineId")=0));
ALTER TABLE "StockTransaction" DROP CONSTRAINT transaction_enabled_provenance;
ALTER TABLE "StockTransaction" ADD CONSTRAINT transaction_enabled_provenance CHECK (
 (type='RECEIPT' AND "batchId" IS NOT NULL AND "actorRole" IN ('ADMIN','MANAGER')) OR
 (type IN ('ISSUE','DAMAGE') AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER','PRODUCTION')) OR
 (type IN ('DISPOSITION','COMPLETE') AND "batchId" IS NULL AND "actorRole"='MANAGER'));
ALTER TABLE "UnitState" DROP CONSTRAINT unit_state_enabled_shape;
ALTER TABLE "UnitState" ADD CONSTRAINT unit_state_enabled_shape CHECK(version>0 AND (
 (state IN ('U','D') AND custody='SHOP_STORAGE' AND "holderId" IS NULL AND condition=CASE state WHEN 'U' THEN 'USABLE' ELSE 'DAMAGED' END) OR
 (state='P' AND condition='USABLE' AND custody='ISSUED_TO_STAFF' AND "holderId" IS NOT NULL) OR
 (state='C' AND condition='USABLE' AND custody='COMPLETED' AND "holderId" IS NULL) OR
 (state='X' AND condition='DAMAGED' AND custody='REMOVED' AND "holderId" IS NULL)));
CREATE OR REPLACE FUNCTION dayari_receipt_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE created_xid text;
BEGIN
 IF TG_TABLE_NAME='StockTransaction' THEN
  IF NEW.type IN ('ISSUE','DAMAGE','DISPOSITION','COMPLETE') THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='StockMovement' THEN
  IF NEW."completionLineId" IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "ProductionCompletionLine" x JOIN "ProductionCompletion" c ON c.id=x."completionId"
    WHERE x.id=NEW."completionLineId" AND c."transactionId"=NEW."transactionId" AND x."movementId"=NEW.id AND x."lotId"=NEW."lotId" AND x."batchId"=NEW."batchId"
    AND c.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
    RAISE EXCEPTION 'Completion requires new exact domain line' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
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
 (e.kind='COMPLETED' AND OLD.state='P' AND NEW.state='C' AND NEW."holderId" IS NULL) OR
 (e.kind='DAMAGE_REMOVED' AND OLD.state='D' AND NEW.state='X' AND NEW."holderId" IS NULL))) THEN
 RAISE EXCEPTION 'Unit transition requires its new exact authorized domain event' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION dayari_checkout_complete() RETURNS trigger LANGUAGE plpgsql AS $$
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
  SELECT 1 FROM lots l CROSS JOIN (VALUES('U'),('P'),('D'),('C'),('X')) states(state)
  LEFT JOIN counts c ON c."lotId"=l."lotId" AND c.state=states.state
  LEFT JOIN "StockBalance" b ON b."lotId"=l."lotId" AND b.state=states.state
  WHERE COALESCE(c.n,0)<>COALESCE(b.quantity,0)) THEN
   RAISE EXCEPTION 'Exact unit census must match lot projections' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION dayari_damage_complete() RETURNS trigger LANGUAGE plpgsql AS $$
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
 OR NOT EXISTS(SELECT 1 FROM "ReceiptLine" rl WHERE rl.id=u."receiptLineId" AND x.snapshot->>'receiptId'=rl."receiptId"::text)
 OR NOT EXISTS(SELECT 1 FROM "SupplierVariantSku" sku WHERE sku.id=l."skuId" AND x.snapshot->'unit'->>'fullSku'=sku."fullCode"
  AND x.snapshot->'unit'->>'productId'=sku."productId"::text AND x.snapshot->'unit'->>'variantId'=sku."variantId"::text)
 OR (is_bad AND x."fromState"='P' AND x.snapshot->'recordedHolder'->>'id' IS DISTINCT FROM checkout."actorId"::text)
 OR (is_bad AND x."fromState"='U' AND x.snapshot->'recordedHolder' IS DISTINCT FROM 'null'::jsonb)

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
 SELECT 1 FROM lots l CROSS JOIN (VALUES('U'),('P'),('D'),('C'),('X')) states(state)
 LEFT JOIN counts c ON c."lotId"=l."lotId" AND c.state=states.state LEFT JOIN "StockBalance" b ON b."lotId"=l."lotId" AND b.state=states.state
 WHERE COALESCE(c.n,0)<>COALESCE(b.quantity,0)) THEN
 RAISE EXCEPTION 'Damage unit census must match ledger projections' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION dayari_completion_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ProductionCompletion" WHERE id=NEW."completionId" AND "originId"=NEW."originId"
 AND xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
 RAISE EXCEPTION 'Accepted completion cannot be supplemented' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER completion_child_guard BEFORE INSERT ON "ProductionCompletionLine" FOR EACH ROW EXECUTE FUNCTION dayari_completion_child_guard();
CREATE FUNCTION dayari_completion_event_guard_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM inserted e LEFT JOIN "UnitState" s ON s."unitId"=e."unitId"
 LEFT JOIN "ProductionCompletionLine" x ON x.id=e."completionLineId" LEFT JOIN "ProductionCompletion" c ON c.id=x."completionId"
 LEFT JOIN "StockMovement" m ON m.id=e."movementId"
 WHERE e.kind='COMPLETED' AND (s."unitId" IS NULL OR x.id IS NULL OR c.id IS NULL OR m.id IS NULL OR s.state<>'P'
 OR s."lastEventId"<>e."previousEventId" OR s.version+1<>e.ordinal OR s."lotId"<>e."lotId" OR s."originId"<>e."originId"
 OR x."unitId"<>e."unitId" OR x."eventId"<>e.id OR x."movementId"<>m.id OR x."previousEventId"<>e."previousEventId"
 OR c."commandId"<>e."commandId" OR c."actorId"<>e."actorId" OR e."actorRole"<>'MANAGER' OR c."recordedAt"<>e."recordedAt"
 OR m."transactionId"<>c."transactionId" OR m."completionLineId"<>x.id OR m."fromState"<>'P' OR m."toState"<>'C' OR m.quantity<>1
 OR c.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
 RAISE EXCEPTION 'Completion event requires current issued unit and new exact completion' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER completion_event_guard_set AFTER INSERT ON "UnitEvent" REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION dayari_completion_event_guard_set();
CREATE FUNCTION dayari_completion_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND u.active AND NOT u."mustChangePassword" AND u.role='MANAGER' AND m."originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='production.complete')
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole"='MANAGER' AND action='production.completed' AND "subjectId"=NEW.id AND snapshot->>'manifestHash'=NEW."manifestHash")
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" o JOIN "StockTransaction" t ON t.id=NEW."transactionId" WHERE o."commandId"=NEW."commandId" AND o."originId"=NEW."originId" AND o."actorId"=NEW."actorId" AND o."aggregateId"=NEW.id AND o."eventType"='production.completed' AND o.payload->>'manifestHash'=NEW."manifestHash"
 AND t.type='COMPLETE' AND t."originId"=NEW."originId" AND t."commandId"=NEW."commandId" AND t."actorId"=NEW."actorId" AND t."actorRole"='MANAGER' AND t."recordedAt"=NEW."recordedAt" AND t."originSequence"=o."originSequence"
 AND t.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)
 OR (SELECT count(*) FROM "ProductionCompletionLine" WHERE "completionId"=NEW.id)<>NEW."unitCount"
 OR (SELECT count(*) FROM "StockMovement" WHERE "transactionId"=NEW."transactionId")<>NEW."unitCount"
 OR (SELECT count(*) FROM "UnitEvent" WHERE "commandId"=NEW."commandId")<>NEW."unitCount"
 OR (SELECT count(DISTINCT member->>'id') FROM jsonb_array_elements(NEW.manifest) member)<>NEW."unitCount" THEN
 RAISE EXCEPTION 'Incomplete or unauthorized completion evidence' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM "ProductionCompletionLine" x LEFT JOIN "StockUnit" u ON u.id=x."unitId" LEFT JOIN "StockLot" l ON l.id=u."lotId"
 LEFT JOIN "UnitEvent" prior ON prior.id=x."previousEventId" LEFT JOIN "CheckoutLine" cl ON cl.id=x."checkoutLineId" LEFT JOIN "Checkout" co ON co.id=cl."checkoutId"
 LEFT JOIN "SupplierVariantSku" sku ON sku.id=l."skuId" LEFT JOIN "UnitEvent" e ON e.id=x."eventId" LEFT JOIN "StockMovement" m ON m.id=x."movementId"
 LEFT JOIN "UnitState" s ON s."unitId"=u.id
 WHERE x."completionId"=NEW.id AND (u.id IS NULL OR l.id IS NULL OR prior.id IS NULL OR cl.id IS NULL OR co.id IS NULL OR e.id IS NULL OR m.id IS NULL OR s."unitId" IS NULL
 OR x."originId"<>NEW."originId" OR u."originId"<>NEW."originId" OR l."originId"<>NEW."originId" OR co."originId"<>NEW."originId"
 OR x."lotId"<>u."lotId" OR x."batchId"<>l."batchId" OR cl."unitId"<>u.id OR cl."eventId"<>prior.id OR prior.kind<>'ISSUED' OR prior."toState"<>'P'
 OR e.kind<>'COMPLETED' OR e."completionLineId"<>x.id OR e."unitId"<>u.id OR e."lotId"<>l.id OR e."originId"<>NEW."originId" OR e."commandId"<>NEW."commandId"
 OR e."actorId"<>NEW."actorId" OR e."actorRole"<>'MANAGER' OR e."recordedAt"<>NEW."recordedAt" OR e.ordinal<>prior.ordinal+1 OR e."previousEventId"<>prior.id OR e."movementId"<>m.id
 OR m."completionLineId"<>x.id OR m."transactionId"<>NEW."transactionId" OR m."lotId"<>l.id OR m."batchId"<>l."batchId" OR m.quantity<>1 OR m."fromState"<>'P' OR m."toState"<>'C'
 OR s.state<>'C' OR s."lastEventId"<>e.id OR s.version<>e.ordinal
 OR x.snapshot->'unit'->>'unitId' IS DISTINCT FROM u.id::text OR x.snapshot->'unit'->>'unitCode' IS DISTINCT FROM u."unitCode"
 OR x.snapshot->'unit'->>'lotId' IS DISTINCT FROM l.id::text OR x.snapshot->'unit'->>'skuId' IS DISTINCT FROM l."skuId"::text
 OR x.snapshot->'unit'->>'productId' IS DISTINCT FROM sku."productId"::text OR x.snapshot->'unit'->>'variantId' IS DISTINCT FROM sku."variantId"::text
 OR x.snapshot->>'checkoutLineId' IS DISTINCT FROM cl.id::text OR x.snapshot->>'checkoutId' IS DISTINCT FROM co.id::text
 OR x.snapshot->'recordedHolder'->>'id' IS DISTINCT FROM co."actorId"::text
 OR x.snapshot->>'orderReference' IS DISTINCT FROM cl."orderReference"
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.manifest) member WHERE member->>'id'=x.id::text AND member->>'unitId'=u.id::text)
 OR x.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text OR e.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text OR m.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
 RAISE EXCEPTION 'Completion graph, identity, checkout, snapshot or projection mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(WITH lots AS(SELECT DISTINCT "lotId" FROM "ProductionCompletionLine" WHERE "completionId"=NEW.id),
 counts AS(SELECT s."lotId",s.state,count(*) n FROM "UnitState" s JOIN lots l ON l."lotId"=s."lotId" GROUP BY s."lotId",s.state)
 SELECT 1 FROM lots l CROSS JOIN(VALUES('U'),('P'),('D'),('C'),('X')) states(state) LEFT JOIN counts c ON c."lotId"=l."lotId" AND c.state=states.state
 LEFT JOIN "StockBalance" b ON b."lotId"=l."lotId" AND b.state=states.state WHERE COALESCE(c.n,0)<>COALESCE(b.quantity,0)) THEN
 RAISE EXCEPTION 'Completion census must reconcile with stock projections' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER completion_complete AFTER INSERT ON "ProductionCompletion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_completion_complete();
CREATE FUNCTION dayari_completion_transaction_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.type='COMPLETE' AND NOT EXISTS(SELECT 1 FROM "ProductionCompletion" WHERE "transactionId"=NEW.id AND xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
 RAISE EXCEPTION 'Completion transaction requires new domain root' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER completion_transaction_complete AFTER INSERT ON "StockTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_completion_transaction_complete();
COMMIT;
