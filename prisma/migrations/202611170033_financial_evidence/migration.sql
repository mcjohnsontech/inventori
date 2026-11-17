-- Additive evidence only. No cost/price backfill and no stock/closing changes.
BEGIN;
CREATE TABLE "PurchaseCost" (
 "receiptLineId" uuid PRIMARY KEY REFERENCES "ReceiptLine"(id) ON DELETE RESTRICT,
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id) ON DELETE RESTRICT,
 amount numeric(20,2) NOT NULL CHECK(amount>=0), currency text NOT NULL CHECK(currency='NGN'),
 "zeroReason" text NOT NULL CHECK(amount<>0 OR length(trim("zeroReason"))>=10),
 "commandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "actorId" uuid NOT NULL REFERENCES "User"(id), "recordedAt" timestamptz(6) NOT NULL
);
CREATE INDEX ON "PurchaseCost"("originId","recordedAt");
CREATE TABLE "SellingPrice" (
 id uuid PRIMARY KEY, "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "variantId" uuid NOT NULL REFERENCES "Variant"(id), amount numeric(20,2) NOT NULL CHECK(amount>=0),
 currency text NOT NULL CHECK(currency='NGN'), reason text NOT NULL CHECK(length(trim(reason))>=10),
 "previousPriceId" uuid UNIQUE REFERENCES "SellingPrice"(id),
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "actorId" uuid NOT NULL REFERENCES "User"(id), "originSequence" bigint NOT NULL,
 "recordedAt" timestamptz(6) NOT NULL,
 FOREIGN KEY("originId","originSequence") REFERENCES "OutboxEvent"("originId","originSequence") DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ON "SellingPrice"("originId","variantId","originSequence" DESC);
CREATE FUNCTION dayari_financial_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Financial evidence is append-only'; END $$;
CREATE TRIGGER purchase_cost_immutable BEFORE UPDATE OR DELETE ON "PurchaseCost" FOR EACH ROW EXECUTE FUNCTION dayari_financial_immutable();
CREATE TRIGGER selling_price_immutable BEFORE UPDATE OR DELETE ON "SellingPrice" FOR EACH ROW EXECUTE FUNCTION dayari_financial_immutable();
CREATE FUNCTION dayari_cost_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ReceiptLine" rl JOIN "Receipt" r ON r.id=rl."receiptId" JOIN "StockTransaction" t ON t.id=r."transactionId"
 WHERE rl.id=NEW."receiptLineId" AND t."originId"=NEW."originId" AND t."commandId"=NEW."commandId" AND t."actorId"=NEW."actorId" AND t."recordedAt"=NEW."recordedAt")
 THEN RAISE EXCEPTION 'Cost must belong to its original receipt command'; END IF;
 IF EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId") THEN RAISE EXCEPTION 'Historical cost enrollment is not permitted'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER purchase_cost_provenance BEFORE INSERT ON "PurchaseCost" FOR EACH ROW EXECUTE FUNCTION dayari_cost_provenance();
CREATE FUNCTION dayari_price_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior uuid;
BEGIN
 PERFORM id FROM "OriginNode" WHERE id=NEW."originId" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "Variant" WHERE id=NEW."variantId" AND "originId"=NEW."originId") OR
 NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND u.role='ADMIN' AND u.active AND NOT u."mustChangePassword" AND m."originId"=NEW."originId")
 THEN RAISE EXCEPTION 'Price authority mismatch'; END IF;
 SELECT id INTO prior FROM "SellingPrice" WHERE "originId"=NEW."originId" AND "variantId"=NEW."variantId" ORDER BY "originSequence" DESC LIMIT 1;
 IF prior IS DISTINCT FROM NEW."previousPriceId" THEN RAISE EXCEPTION 'Price history changed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER selling_price_provenance BEFORE INSERT ON "SellingPrice" FOR EACH ROW EXECUTE FUNCTION dayari_price_provenance();
COMMIT;
