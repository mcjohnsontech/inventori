-- Owner approved Admin and Inventory Manager exact-unit completion, 12 November 2026.
-- No history rewrites or operational backfill. Apply operationally only after separate approval.
BEGIN;
ALTER TABLE "ProductionCompletion" DROP CONSTRAINT "ProductionCompletion_actorRole_check";
ALTER TABLE "ProductionCompletion" ADD CONSTRAINT "ProductionCompletion_actorRole_check" CHECK("actorRole" IN ('ADMIN','MANAGER'));
ALTER TABLE "StockTransaction" DROP CONSTRAINT transaction_enabled_provenance;
ALTER TABLE "StockTransaction" ADD CONSTRAINT transaction_enabled_provenance CHECK (
 (type='RECEIPT' AND "batchId" IS NOT NULL AND "actorRole" IN ('ADMIN','MANAGER')) OR
 (type IN ('ISSUE','DAMAGE') AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER','PRODUCTION')) OR
 (type='DISPOSITION' AND "batchId" IS NULL AND "actorRole"='MANAGER') OR
 (type='COMPLETE' AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER')));
CREATE OR REPLACE FUNCTION dayari_completion_event_guard_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM inserted e LEFT JOIN "UnitState" s ON s."unitId"=e."unitId"
 LEFT JOIN "ProductionCompletionLine" x ON x.id=e."completionLineId" LEFT JOIN "ProductionCompletion" c ON c.id=x."completionId"
 LEFT JOIN "StockMovement" m ON m.id=e."movementId"
 WHERE e.kind='COMPLETED' AND (s."unitId" IS NULL OR x.id IS NULL OR c.id IS NULL OR m.id IS NULL OR s.state<>'P'
 OR s."lastEventId"<>e."previousEventId" OR s.version+1<>e.ordinal OR s."lotId"<>e."lotId" OR s."originId"<>e."originId"
 OR x."unitId"<>e."unitId" OR x."eventId"<>e.id OR x."movementId"<>m.id OR x."previousEventId"<>e."previousEventId"
 OR c."commandId"<>e."commandId" OR c."actorId"<>e."actorId" OR e."actorRole"<>c."actorRole" OR c."recordedAt"<>e."recordedAt"
 OR m."transactionId"<>c."transactionId" OR m."completionLineId"<>x.id OR m."fromState"<>'P' OR m."toState"<>'C' OR m.quantity<>1
 OR c.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
 RAISE EXCEPTION 'Completion event requires current issued unit and new exact completion' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION dayari_completion_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND u.active AND NOT u."mustChangePassword" AND u.role=NEW."actorRole" AND u.role IN ('ADMIN','MANAGER') AND m."originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='production.complete')
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole"=NEW."actorRole" AND action='production.completed' AND "subjectId"=NEW.id AND snapshot->>'manifestHash'=NEW."manifestHash")
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" o JOIN "StockTransaction" t ON t.id=NEW."transactionId" WHERE o."commandId"=NEW."commandId" AND o."originId"=NEW."originId" AND o."actorId"=NEW."actorId" AND o."aggregateId"=NEW.id AND o."eventType"='production.completed' AND o.payload->>'manifestHash'=NEW."manifestHash"
 AND t.type='COMPLETE' AND t."originId"=NEW."originId" AND t."commandId"=NEW."commandId" AND t."actorId"=NEW."actorId" AND t."actorRole"=NEW."actorRole" AND t."recordedAt"=NEW."recordedAt" AND t."originSequence"=o."originSequence"
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
 OR e."actorId"<>NEW."actorId" OR e."actorRole"<>NEW."actorRole" OR e."recordedAt"<>NEW."recordedAt" OR e.ordinal<>prior.ordinal+1 OR e."previousEventId"<>prior.id OR e."movementId"<>m.id
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
COMMIT;
