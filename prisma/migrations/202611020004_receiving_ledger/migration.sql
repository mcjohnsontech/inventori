-- Additive receiving ledger. Existing catalogue identities and migrations are untouched.
CREATE TABLE "DeliveryBatch" (
 id uuid PRIMARY KEY, "originId" uuid NOT NULL REFERENCES "OriginNode"(id) ON DELETE RESTRICT,
 "sourceId" uuid NOT NULL REFERENCES "SupplierSource"(id) ON DELETE RESTRICT,
 "publicCode" text NOT NULL, "numberedOn" date NOT NULL, "dailyOrdinal" integer NOT NULL CHECK ("dailyOrdinal">0),
 "deliveredOn" date NOT NULL CHECK ("deliveredOn">=DATE '0001-01-01'), "invoiceReference" text,
 "acceptedAt" timestamptz(6) NOT NULL, snapshot jsonb NOT NULL,
 UNIQUE ("originId","publicCode"), UNIQUE ("originId","numberedOn","dailyOrdinal"),
 CHECK ("numberedOn"=("acceptedAt" AT TIME ZONE 'Africa/Lagos')::date),
 CHECK ("deliveredOn"<="numberedOn"),
 CHECK ("publicCode"='B-' || to_char("numberedOn",'YYYYMMDD') || '-' || lpad("dailyOrdinal"::text,greatest(4,length("dailyOrdinal"::text)),'0'))
);
CREATE INDEX ON "DeliveryBatch"("sourceId","deliveredOn");
CREATE TABLE "StockTransaction" (
 id uuid PRIMARY KEY, "batchId" uuid NOT NULL UNIQUE REFERENCES "DeliveryBatch"(id) ON DELETE RESTRICT,
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id) ON DELETE RESTRICT,
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 "originSequence" bigint NOT NULL CHECK ("originSequence">0), type text NOT NULL CHECK (type='RECEIPT'),
 "actorId" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT, "actorRole" "Role" NOT NULL CHECK ("actorRole" IN ('ADMIN','MANAGER')),
 "recordedAt" timestamptz(6) NOT NULL, UNIQUE ("originId","originSequence"),
 FOREIGN KEY ("originId","originSequence") REFERENCES "OutboxEvent"("originId","originSequence") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE "Receipt" (
 id uuid PRIMARY KEY, "batchId" uuid NOT NULL UNIQUE REFERENCES "DeliveryBatch"(id) ON DELETE RESTRICT,
 "transactionId" uuid NOT NULL UNIQUE REFERENCES "StockTransaction"(id) ON DELETE RESTRICT,
 "sourceId" uuid NOT NULL REFERENCES "SupplierSource"(id) ON DELETE RESTRICT, "acceptedAt" timestamptz(6) NOT NULL
);
CREATE TABLE "StockLot" (
 id uuid PRIMARY KEY, "skuId" uuid NOT NULL REFERENCES "SupplierVariantSku"(id) ON DELETE RESTRICT,
 "batchId" uuid NOT NULL REFERENCES "DeliveryBatch"(id) ON DELETE RESTRICT,
 "sourceId" uuid NOT NULL REFERENCES "SupplierSource"(id) ON DELETE RESTRICT,
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id) ON DELETE RESTRICT, UNIQUE ("skuId","batchId")
);
CREATE INDEX ON "StockLot"("batchId");
CREATE TABLE "ReceiptLine" (
 id uuid PRIMARY KEY, "receiptId" uuid NOT NULL REFERENCES "Receipt"(id) ON DELETE RESTRICT,
 "batchId" uuid NOT NULL REFERENCES "DeliveryBatch"(id) ON DELETE RESTRICT,
 "skuId" uuid NOT NULL REFERENCES "SupplierVariantSku"(id) ON DELETE RESTRICT,
 "lotId" uuid NOT NULL UNIQUE REFERENCES "StockLot"(id) ON DELETE RESTRICT,
 "lineNumber" integer NOT NULL CHECK ("lineNumber">0),
 "usableQuantity" bigint NOT NULL CHECK ("usableQuantity" BETWEEN 0 AND 2147483647),
 "damagedQuantity" bigint NOT NULL CHECK ("damagedQuantity" BETWEEN 0 AND 2147483647),
 "totalQuantity" bigint GENERATED ALWAYS AS ("usableQuantity"+"damagedQuantity") STORED,
 "damageReason" text NOT NULL, snapshot jsonb NOT NULL,
 CHECK ("usableQuantity"+"damagedQuantity">0),
 CHECK ("damagedQuantity"=0 OR (length(btrim("damageReason")) BETWEEN 10 AND 2000 AND "damageReason" ~ '[[:alpha:]]')),
 UNIQUE ("receiptId","skuId"), UNIQUE ("receiptId","lineNumber")
);
CREATE INDEX ON "ReceiptLine"("batchId");
CREATE TABLE "StockMovement" (
 id uuid PRIMARY KEY, "transactionId" uuid NOT NULL REFERENCES "StockTransaction"(id) ON DELETE RESTRICT,
 "batchId" uuid NOT NULL REFERENCES "DeliveryBatch"(id) ON DELETE RESTRICT,
 "lotId" uuid NOT NULL REFERENCES "StockLot"(id) ON DELETE RESTRICT,
 "receiptLineId" uuid NOT NULL REFERENCES "ReceiptLine"(id) ON DELETE RESTRICT,
 "fromState" text NOT NULL CHECK ("fromState"='E'), "toState" text NOT NULL CHECK ("toState" IN ('U','D')),
 quantity bigint NOT NULL CHECK (quantity>0), UNIQUE ("receiptLineId","toState")
);
CREATE INDEX ON "StockMovement"("lotId");
CREATE INDEX ON "StockMovement"("transactionId");
CREATE INDEX ON "StockMovement"("batchId");
CREATE TABLE "StockBalance" (
 "lotId" uuid NOT NULL REFERENCES "StockLot"(id) ON DELETE RESTRICT,
 state text NOT NULL CHECK (state IN ('U','P','D','C','X')), quantity bigint NOT NULL CHECK (quantity>=0),
 version bigint NOT NULL DEFAULT 1 CHECK (version>0),
 "lastTransactionId" uuid NOT NULL REFERENCES "StockTransaction"(id) ON DELETE RESTRICT,
 PRIMARY KEY ("lotId",state)
);
-- Prevent supplementing committed deliveries: every child must be inserted in the batch's creation transaction.
CREATE FUNCTION dayari_receipt_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE created_xid text;
BEGIN
 SELECT xmin::text INTO created_xid FROM "DeliveryBatch" WHERE id=NEW."batchId";
 IF created_xid IS DISTINCT FROM (pg_current_xact_id()::text::numeric % 4294967296)::text THEN
  RAISE EXCEPTION 'An accepted delivery cannot be supplemented' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['StockTransaction','Receipt','StockLot','ReceiptLine','StockMovement'] LOOP
  EXECUTE format('CREATE TRIGGER receipt_insert_guard BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION dayari_receipt_insert_guard()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['DeliveryBatch','StockTransaction','Receipt','StockLot','ReceiptLine','StockMovement'] LOOP
  EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change()',t);
 END LOOP;
END $$;
-- Full accepted group is checked at commit, including command/audit/outbox and projection equality.
CREATE FUNCTION dayari_validate_receipt_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bid uuid; b "DeliveryBatch"; r "Receipt"; t "StockTransaction"; bad boolean;
BEGIN
 IF TG_TABLE_NAME='DeliveryBatch' THEN bid:=NEW.id; ELSE bid:=NEW."batchId"; END IF;
 SELECT * INTO b FROM "DeliveryBatch" WHERE id=bid;
 SELECT * INTO r FROM "Receipt" WHERE "batchId"=bid;
 SELECT * INTO t FROM "StockTransaction" WHERE "batchId"=bid;
 IF r.id IS NULL OR t.id IS NULL OR r."transactionId"<>t.id OR r."sourceId"<>b."sourceId"
 OR t."originId"<>b."originId" OR r."acceptedAt"<>b."acceptedAt" OR t."recordedAt"<>b."acceptedAt"
 OR NOT EXISTS (SELECT 1 FROM "OriginNode" WHERE id=b."originId" AND mode='SHOP')
 OR NOT EXISTS (SELECT 1 FROM "CommandResult" c WHERE c.id=t."commandId" AND c."originId"=t."originId" AND c."actorId"=t."actorId" AND c."commandType"='receiving.receipts.create')
 OR NOT EXISTS (SELECT 1 FROM "AuditEvent" a WHERE a."commandId"=t."commandId" AND a."subjectId"=r.id AND a."actorId"=t."actorId" AND a."actorRole"=t."actorRole" AND a."originId"=b."originId" AND a.action='inventory.receipt.accepted')
 OR NOT EXISTS (SELECT 1 FROM "OutboxEvent" o WHERE o."commandId"=t."commandId" AND o."originId"=t."originId" AND o."originSequence"=t."originSequence" AND o."aggregateId"=r.id AND o."actorId"=t."actorId" AND o."eventType"='inventory.receipt.accepted')
 OR NOT EXISTS (SELECT 1 FROM "ReceiptLine" WHERE "receiptId"=r.id)
 OR (SELECT count(*) FROM "ReceiptLine" WHERE "receiptId"=r.id)>100 THEN
 RAISE EXCEPTION 'Incomplete receipt transaction evidence' USING ERRCODE='23514'; END IF;
 SELECT EXISTS (
  SELECT 1 FROM "StockLot" l JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "ProductSourcing" p ON p.id=s."sourcingId"
  WHERE l."batchId"=bid AND (l."sourceId"<>b."sourceId" OR p."sourceId"<>b."sourceId" OR l."originId"<>b."originId" OR NOT EXISTS (SELECT 1 FROM "ReceiptLine" x WHERE x."lotId"=l.id AND x."receiptId"=r.id))
 ) OR EXISTS (
  SELECT 1 FROM "ReceiptLine" x JOIN "StockLot" l ON l.id=x."lotId" WHERE (x."batchId"=bid OR x."receiptId"=r.id) AND
  (x."batchId"<>bid OR x."receiptId"<>r.id OR l."batchId"<>bid OR l."skuId"<>x."skuId"
   OR COALESCE((SELECT sum(m.quantity) FROM "StockMovement" m WHERE m."receiptLineId"=x.id AND m."toState"='U'),0)<>x."usableQuantity"
   OR COALESCE((SELECT sum(m.quantity) FROM "StockMovement" m WHERE m."receiptLineId"=x.id AND m."toState"='D'),0)<>x."damagedQuantity")
 ) OR EXISTS (
  SELECT 1 FROM "StockMovement" m JOIN "ReceiptLine" x ON x.id=m."receiptLineId" WHERE (m."batchId"=bid OR m."transactionId"=t.id OR x."receiptId"=r.id) AND
  (m."batchId"<>bid OR m."transactionId"<>t.id OR m."lotId"<>x."lotId" OR x."receiptId"<>r.id)
 ) INTO bad;
 IF bad THEN RAISE EXCEPTION 'Receipt source, lot or movement mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM "StockLot" l CROSS JOIN (VALUES ('U'),('D')) states(s) WHERE l."batchId"=bid AND
   COALESCE((SELECT quantity FROM "StockBalance" WHERE "lotId"=l.id AND state=states.s),0) <>
   COALESCE((SELECT sum(quantity) FROM "StockMovement" WHERE "lotId"=l.id AND "toState"=states.s),0)) THEN
  RAISE EXCEPTION 'Receipt projection does not match ledger' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['DeliveryBatch','StockTransaction','Receipt','StockLot','ReceiptLine','StockMovement'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER receipt_complete AFTER INSERT ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_validate_receipt_group()',t);
 END LOOP;
END $$;
CREATE FUNCTION dayari_validate_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lid uuid; s text; expected numeric; actual bigint;
BEGIN
 IF TG_OP='DELETE' THEN lid:=OLD."lotId"; s:=OLD.state; ELSE lid:=NEW."lotId"; s:=NEW.state; END IF;
 IF TG_OP='UPDATE' AND (NEW."lotId"<>OLD."lotId" OR NEW.state<>OLD.state) THEN RAISE EXCEPTION 'Projection identity is fixed' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(sum(CASE WHEN "toState"=s THEN quantity ELSE -quantity END),0) INTO expected FROM "StockMovement" WHERE "lotId"=lid AND ("toState"=s OR "fromState"=s);
 SELECT quantity INTO actual FROM "StockBalance" WHERE "lotId"=lid AND state=s;
 IF COALESCE(actual,0)<>expected OR EXISTS (SELECT 1 FROM "StockBalance" v JOIN "StockTransaction" t ON t.id=v."lastTransactionId" JOIN "StockLot" l ON l.id=v."lotId" WHERE v."lotId"=lid AND v.state=s AND t."batchId"<>l."batchId") THEN
  RAISE EXCEPTION 'Stock projection must match accepted ledger' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balance_ledger_check AFTER INSERT OR UPDATE OR DELETE ON "StockBalance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_validate_balance();
