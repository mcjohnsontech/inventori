BEGIN;
-- Additive alternate identities. No historical backfill and no stock edits.
CREATE TABLE "ProductPublicIdentity" (
 "productId" uuid PRIMARY KEY REFERENCES "Product"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id) ON DELETE RESTRICT,
 code text NOT NULL CHECK (code ~ '^P[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'),
 "policyVersion" integer NOT NULL DEFAULT 1 CHECK ("policyVersion"=1),
 "commandId" uuid NOT NULL REFERENCES "CommandResult"(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 "assignedAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("originId",code)
);
CREATE TABLE "LotPublicIdentity" (
 "lotId" uuid PRIMARY KEY REFERENCES "StockLot"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id) ON DELETE RESTRICT,
 code text NOT NULL CHECK (code ~ '^L[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'),
 "policyVersion" integer NOT NULL DEFAULT 1 CHECK ("policyVersion"=1),
 "commandId" uuid NOT NULL REFERENCES "CommandResult"(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 "assignedAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("originId",code)
);
CREATE TRIGGER product_public_identity_immutable BEFORE UPDATE OR DELETE ON "ProductPublicIdentity" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER lot_public_identity_immutable BEFORE UPDATE OR DELETE ON "LotPublicIdentity" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();

-- INSERT-only deferred triggers grandfather all existing subjects without a timestamp heuristic.
-- Table DDL locks fence concurrent INSERTs during migration. Every later INSERT must map.
CREATE FUNCTION dayari_require_public_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='Product' THEN
  IF NOT EXISTS(SELECT 1 FROM "ProductPublicIdentity" WHERE "productId"=NEW.id AND "originId"=NEW."originId") THEN
   RAISE EXCEPTION 'New product requires public identity' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "LotPublicIdentity" WHERE "lotId"=NEW.id AND "originId"=NEW."originId") THEN
   RAISE EXCEPTION 'New lot requires public identity' USING ERRCODE='23514'; END IF;
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER product_public_identity_required AFTER INSERT ON "Product" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_require_public_identity();
CREATE CONSTRAINT TRIGGER lot_public_identity_required AFTER INSERT ON "StockLot" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_require_public_identity();

CREATE FUNCTION dayari_validate_public_identity() RETURNS trigger LANGUAGE plpgsql AS $$
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
 OR (NOT product AND c."commandType"='receiving.receipts.create' AND NOT EXISTS(SELECT 1 FROM "StockLot" l JOIN "StockTransaction" t ON t."batchId"=l."batchId" WHERE l.id=NEW."lotId" AND t."commandId"=c.id))
 THEN RAISE EXCEPTION 'Invalid public identity provenance/evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER product_public_identity_evidence AFTER INSERT ON "ProductPublicIdentity" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_validate_public_identity();
CREATE CONSTRAINT TRIGGER lot_public_identity_evidence AFTER INSERT ON "LotPublicIdentity" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_validate_public_identity();
CREATE FUNCTION dayari_guard_product_public_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."originId" IS DISTINCT FROM OLD."originId" AND EXISTS(SELECT 1 FROM "ProductPublicIdentity" WHERE "productId"=OLD.id) THEN
 RAISE EXCEPTION 'Mapped product origin is immutable' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER product_public_origin_guard BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION dayari_guard_product_public_origin();

COMMIT;
