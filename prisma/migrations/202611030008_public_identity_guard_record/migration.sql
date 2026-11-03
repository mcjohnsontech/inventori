-- Applied 007 is retained. Shared trigger records require JSON extraction in cross-kind expressions.
BEGIN;
CREATE OR REPLACE FUNCTION dayari_validate_public_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject_origin uuid; c "CommandResult"; product boolean; expected_action text;
BEGIN
 product:=TG_TABLE_NAME='ProductPublicIdentity';
 IF product THEN SELECT "originId" INTO subject_origin FROM "Product" WHERE id=NEW."productId";
 ELSE SELECT "originId" INTO subject_origin FROM "StockLot" WHERE id=NEW."lotId"; END IF;
 SELECT * INTO c FROM "CommandResult" WHERE id=NEW."commandId";
 expected_action:=CASE WHEN c."commandType"='identity.backfill' THEN 'identity.backfill'
 WHEN product THEN 'catalogue.' || c."commandType" || '.created' ELSE 'inventory.receipt.accepted' END;
 IF subject_origin IS DISTINCT FROM NEW."originId" OR c.id IS NULL OR c."originId"<>NEW."originId"
 OR NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=c."actorId" AND active AND
   (role='ADMIN' OR (NOT product AND c."commandType"='receiving.receipts.create' AND role='MANAGER')))
 OR (product AND c."commandType" NOT IN ('products','product-setups','identity.backfill'))
 OR (NOT product AND c."commandType" NOT IN ('receiving.receipts.create','identity.backfill'))
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=c.id AND "originId"=NEW."originId" AND "actorId"=c."actorId" AND action=expected_action)
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=c.id AND "originId"=NEW."originId" AND "actorId"=c."actorId" AND "eventType"=expected_action)
 OR (c."commandType"='identity.backfill' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.response->'mapped') m WHERE m->>'id'=CASE WHEN product THEN to_jsonb(NEW)->>'productId' ELSE to_jsonb(NEW)->>'lotId' END AND m->>'code'=NEW.code))
 OR (product AND c."commandType" IN ('products','product-setups') AND c.response->>'id' IS DISTINCT FROM to_jsonb(NEW)->>'productId')
 OR (NOT product AND c."commandType"='receiving.receipts.create' AND NOT EXISTS(SELECT 1 FROM "StockLot" l JOIN "StockTransaction" t ON t."batchId"=l."batchId" WHERE l.id=(to_jsonb(NEW)->>'lotId')::uuid AND t."commandId"=c.id))
 THEN RAISE EXCEPTION 'Invalid public identity provenance/evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

COMMIT;
