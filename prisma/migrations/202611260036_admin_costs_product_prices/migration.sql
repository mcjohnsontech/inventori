-- Owner decisions 26 Nov 2026 (docs/decisions.md):
--  * Money is Admin-only. When a Manager receives without a cost, an Admin adds the
--    per-delivery-line purchase cost afterwards. Costs stay append-only.
--  * One selling price per product covers all variants. A variant may have its own
--    price (an override) until an Admin removes it; it then follows the product price.
-- Additive only: no existing row is changed, no backfill, no stock or closing changes.
BEGIN;

-- 1. Purchase cost entered after receipt (Admin only). Existing rows keep enteredLater=false.
ALTER TABLE "PurchaseCost"
 ADD COLUMN "enteredLater" boolean NOT NULL DEFAULT false,
 ADD COLUMN "originSequence" bigint,
 ADD CONSTRAINT "PurchaseCost_late_sequence_check" CHECK ("enteredLater" = ("originSequence" IS NOT NULL)),
 ADD CONSTRAINT "PurchaseCost_late_outbox_fkey" FOREIGN KEY ("originId","originSequence") REFERENCES "OutboxEvent"("originId","originSequence") DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX "PurchaseCost_commandId_late_key" ON "PurchaseCost"("commandId") WHERE "enteredLater";

CREATE OR REPLACE FUNCTION dayari_cost_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."enteredLater" THEN
  -- One later cost per receipt line (primary key). Only an active Admin of this shop,
  -- for a line received in this shop, in a new command of its own.
  IF NOT EXISTS(SELECT 1 FROM "ReceiptLine" rl JOIN "Receipt" r ON r.id=rl."receiptId" JOIN "StockTransaction" t ON t.id=r."transactionId"
   WHERE rl.id=NEW."receiptLineId" AND t."originId"=NEW."originId" AND t."recordedAt"<=NEW."recordedAt" AND t."commandId"<>NEW."commandId")
  THEN RAISE EXCEPTION 'A later cost must belong to a delivery line received in this shop' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND u.role='ADMIN' AND u.active AND NOT u."mustChangePassword" AND m."originId"=NEW."originId")
  THEN RAISE EXCEPTION 'Only a shop Admin may add a purchase cost after receipt' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId") THEN RAISE EXCEPTION 'A later cost needs its own new command' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "ReceiptLine" rl JOIN "Receipt" r ON r.id=rl."receiptId" JOIN "StockTransaction" t ON t.id=r."transactionId"
 WHERE rl.id=NEW."receiptLineId" AND t."originId"=NEW."originId" AND t."commandId"=NEW."commandId" AND t."actorId"=NEW."actorId" AND t."recordedAt"=NEW."recordedAt")
 THEN RAISE EXCEPTION 'Cost must belong to its original receipt command'; END IF;
 IF EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId") THEN RAISE EXCEPTION 'Historical cost enrollment is not permitted'; END IF;
 RETURN NEW;
END $$;

-- 2. Product selling price: append-only chain per product, Admin only.
CREATE TABLE "ProductSellingPrice" (
 id uuid PRIMARY KEY, "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "productId" uuid NOT NULL REFERENCES "Product"(id), amount numeric(20,2) NOT NULL CHECK(amount>=0),
 currency text NOT NULL CHECK(currency='NGN'), reason text NOT NULL CHECK(length(trim(reason))>=10),
 "previousPriceId" uuid UNIQUE REFERENCES "ProductSellingPrice"(id),
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "actorId" uuid NOT NULL REFERENCES "User"(id), "originSequence" bigint NOT NULL,
 "recordedAt" timestamptz(6) NOT NULL,
 FOREIGN KEY("originId","originSequence") REFERENCES "OutboxEvent"("originId","originSequence") DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ON "ProductSellingPrice"("originId","productId","originSequence" DESC);
CREATE TRIGGER product_selling_price_immutable BEFORE UPDATE OR DELETE ON "ProductSellingPrice" FOR EACH ROW EXECUTE FUNCTION dayari_financial_immutable();
CREATE FUNCTION dayari_product_price_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior uuid;
BEGIN
 PERFORM id FROM "OriginNode" WHERE id=NEW."originId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "Product" WHERE id=NEW."productId" AND "originId"=NEW."originId") OR
 NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND u.role='ADMIN' AND u.active AND NOT u."mustChangePassword" AND m."originId"=NEW."originId")
 THEN RAISE EXCEPTION 'Price authority mismatch'; END IF;
 SELECT id INTO prior FROM "ProductSellingPrice" WHERE "originId"=NEW."originId" AND "productId"=NEW."productId" ORDER BY "originSequence" DESC LIMIT 1;
 IF prior IS DISTINCT FROM NEW."previousPriceId" THEN RAISE EXCEPTION 'Price history changed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER product_selling_price_provenance BEFORE INSERT ON "ProductSellingPrice" FOR EACH ROW EXECUTE FUNCTION dayari_product_price_provenance();

-- 3. Variant price becomes an override. A row with no amount removes the override
--    (the variant follows its product price again). Existing rows all keep their amount.
ALTER TABLE "SellingPrice" ALTER COLUMN amount DROP NOT NULL;
CREATE OR REPLACE FUNCTION dayari_price_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior uuid; prior_amount numeric;
BEGIN
 PERFORM id FROM "OriginNode" WHERE id=NEW."originId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "Variant" WHERE id=NEW."variantId" AND "originId"=NEW."originId") OR
 NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND u.role='ADMIN' AND u.active AND NOT u."mustChangePassword" AND m."originId"=NEW."originId")
 THEN RAISE EXCEPTION 'Price authority mismatch'; END IF;
 SELECT id,amount INTO prior,prior_amount FROM "SellingPrice" WHERE "originId"=NEW."originId" AND "variantId"=NEW."variantId" ORDER BY "originSequence" DESC LIMIT 1;
 IF prior IS DISTINCT FROM NEW."previousPriceId" THEN RAISE EXCEPTION 'Price history changed'; END IF;
 IF NEW.amount IS NULL AND (prior IS NULL OR prior_amount IS NULL) THEN
  RAISE EXCEPTION 'This option has no price of its own to remove' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
