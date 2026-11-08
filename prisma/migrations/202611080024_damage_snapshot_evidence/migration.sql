-- Strengthen immutable damage provenance evidence without changing existing records.
BEGIN;
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
 SELECT 1 FROM lots l CROSS JOIN (VALUES('U'),('P'),('D'),('X')) states(state)
 LEFT JOIN counts c ON c."lotId"=l."lotId" AND c.state=states.state LEFT JOIN "StockBalance" b ON b."lotId"=l."lotId" AND b.state=states.state
 WHERE COALESCE(c.n,0)<>COALESCE(b.quantity,0)) THEN
 RAISE EXCEPTION 'Damage unit census must match ledger projections' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
COMMIT;
