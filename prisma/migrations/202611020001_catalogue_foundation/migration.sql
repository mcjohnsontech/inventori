-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'PRODUCTION');

-- CreateTable
CREATE TABLE "OriginNode" (
    "id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "nextSequence" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OriginNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "originId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceLocation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "originId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierSource" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "originId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "originId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attribute" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "originId" UUID NOT NULL,

    CONSTRAINT "Attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeValue" (
    "id" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "originId" UUID NOT NULL,

    CONSTRAINT "AttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "combinationKey" TEXT NOT NULL,
    "originId" UUID NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantSelection" (
    "variantId" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "valueId" UUID NOT NULL,

    CONSTRAINT "VariantSelection_pkey" PRIMARY KEY ("variantId","attributeId")
);

-- CreateTable
CREATE TABLE "ProductSourcing" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "baseCode" TEXT NOT NULL,
    "originId" UUID NOT NULL,

    CONSTRAINT "ProductSourcing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierVariantSku" (
    "id" UUID NOT NULL,
    "sourcingId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "suffix" TEXT NOT NULL,
    "fullCode" TEXT NOT NULL,
    "originId" UUID NOT NULL,

    CONSTRAINT "SupplierVariantSku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandResult" (
    "id" UUID NOT NULL,
    "originId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "commandType" TEXT NOT NULL,
    "key" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "originId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "actorRole" "Role" NOT NULL,
    "commandId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "originId" UUID NOT NULL,
    "originSequence" BIGINT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "eventType" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxEvent" (
    "id" UUID NOT NULL,
    "originId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "originSequence" BIGINT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierSource_code_key" ON "SupplierSource"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierSource_supplierId_locationId_key" ON "SupplierSource"("supplierId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Attribute_productId_name_key" ON "Attribute"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeValue_attributeId_label_key" ON "AttributeValue"("attributeId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeValue_id_attributeId_key" ON "AttributeValue"("id", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_productId_combinationKey_key" ON "Variant"("productId", "combinationKey");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_id_productId_key" ON "Variant"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSourcing_baseCode_key" ON "ProductSourcing"("baseCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSourcing_sourceId_productId_key" ON "ProductSourcing"("sourceId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSourcing_id_productId_key" ON "ProductSourcing"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierVariantSku_fullCode_key" ON "SupplierVariantSku"("fullCode");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierVariantSku_sourcingId_variantId_key" ON "SupplierVariantSku"("sourcingId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CommandResult_originId_actorId_commandType_key_key" ON "CommandResult"("originId", "actorId", "commandType", "key");

-- CreateIndex
CREATE INDEX "AuditEvent_subjectId_createdAt_idx" ON "AuditEvent"("subjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_originId_originSequence_key" ON "OutboxEvent"("originId", "originSequence");

-- CreateIndex
CREATE UNIQUE INDEX "InboxEvent_originId_eventId_key" ON "InboxEvent"("originId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxEvent_originId_originSequence_key" ON "InboxEvent"("originId", "originSequence");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSource" ADD CONSTRAINT "SupplierSource_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSource" ADD CONSTRAINT "SupplierSource_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "SourceLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribute" ADD CONSTRAINT "Attribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "Attribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantSelection" ADD CONSTRAINT "VariantSelection_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantSelection" ADD CONSTRAINT "VariantSelection_valueId_attributeId_fkey" FOREIGN KEY ("valueId", "attributeId") REFERENCES "AttributeValue"("id", "attributeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSourcing" ADD CONSTRAINT "ProductSourcing_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SupplierSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSourcing" ADD CONSTRAINT "ProductSourcing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierVariantSku" ADD CONSTRAINT "SupplierVariantSku_sourcingId_productId_fkey" FOREIGN KEY ("sourcingId", "productId") REFERENCES "ProductSourcing"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierVariantSku" ADD CONSTRAINT "SupplierVariantSku_variantId_productId_fkey" FOREIGN KEY ("variantId", "productId") REFERENCES "Variant"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandResult" ADD CONSTRAINT "CommandResult_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_originId_fkey" FOREIGN KEY ("originId") REFERENCES "OriginNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Catalogue slice: immutable identity and audit payloads. No stock ledger exists yet.
CREATE FUNCTION dayari_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Dayari immutable history cannot be updated or deleted' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER outbox_immutable BEFORE UPDATE OR DELETE ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER inbox_immutable BEFORE UPDATE OR DELETE ON "InboxEvent" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER command_immutable BEFORE UPDATE OR DELETE ON "CommandResult" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER sourcing_immutable BEFORE UPDATE OR DELETE ON "ProductSourcing" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER sku_immutable BEFORE UPDATE OR DELETE ON "SupplierVariantSku" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER variant_immutable BEFORE UPDATE OR DELETE ON "Variant" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER selection_immutable BEFORE UPDATE OR DELETE ON "VariantSelection" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER source_immutable BEFORE UPDATE OR DELETE ON "SupplierSource" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER location_immutable BEFORE UPDATE OR DELETE ON "SourceLocation" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();

ALTER TABLE "OriginNode" ADD CONSTRAINT origin_mode CHECK (mode IN ('SHOP', 'CLOUD'));
ALTER TABLE "OriginNode" ADD CONSTRAINT origin_sequence_nonnegative CHECK ("nextSequence" >= 0);
ALTER TABLE "OutboxEvent" ADD CONSTRAINT outbox_positive_sequence CHECK ("originSequence" > 0 AND "schemaVersion" > 0);
ALTER TABLE "InboxEvent" ADD CONSTRAINT inbox_positive_sequence CHECK ("originSequence" > 0 AND "schemaVersion" > 0);
ALTER TABLE "SupplierVariantSku" ADD CONSTRAINT full_code_matches_parts CHECK ("fullCode" <> '' AND "suffix" <> '');
ALTER TABLE "AuditEvent" ADD CONSTRAINT audit_command_fk FOREIGN KEY ("commandId") REFERENCES "CommandResult"(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT outbox_command_fk FOREIGN KEY ("commandId") REFERENCES "CommandResult"(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT outbox_actor_fk FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT;

-- Origins are structural foreign keys, not mutable display names.
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['Supplier', 'SourceLocation', 'SupplierSource', 'Product', 'Attribute', 'AttributeValue', 'Variant', 'ProductSourcing', 'SupplierVariantSku', 'CommandResult', 'AuditEvent'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("originId") REFERENCES "OriginNode"(id) ON DELETE RESTRICT', tab, tab || '_origin_fk');
  END LOOP;
END $$;

-- Deferred because a variant and its selections are inserted in the same transaction.
CREATE FUNCTION dayari_validate_variant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE variant_id uuid; stored_key text; actual_key text; parent_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'Variant' THEN variant_id := NEW.id; ELSE variant_id := NEW."variantId"; END IF;
  SELECT "combinationKey", "productId" INTO stored_key, parent_id FROM "Variant" WHERE id = variant_id;
  SELECT COALESCE(string_agg(s."valueId"::text, '|' ORDER BY s."valueId"::text COLLATE "C"), '') INTO actual_key FROM "VariantSelection" s WHERE s."variantId" = variant_id;
  IF actual_key <> stored_key THEN RAISE EXCEPTION 'Variant canonical combination does not match selected values' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM "VariantSelection" s JOIN "Attribute" a ON a.id = s."attributeId" WHERE s."variantId" = variant_id AND a."productId" <> parent_id) THEN
    RAISE EXCEPTION 'Variant attribute belongs to another product' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER variant_combination_check AFTER INSERT ON "Variant" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_validate_variant();
CREATE CONSTRAINT TRIGGER selection_combination_check AFTER INSERT ON "VariantSelection" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_validate_variant();

CREATE FUNCTION dayari_validate_sku() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base text; BEGIN
  SELECT "baseCode" INTO base FROM "ProductSourcing" WHERE id = NEW."sourcingId";
  IF NEW."fullCode" <> base || '-' || NEW.suffix THEN RAISE EXCEPTION 'SKU code does not match allocated base and suffix' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM "Variant" v WHERE v.id = NEW."variantId" AND v."combinationKey" = '' AND EXISTS (SELECT 1 FROM "Attribute" a WHERE a."productId" = v."productId")) THEN
    RAISE EXCEPTION 'Products with attributes require an explicit variant SKU' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sku_code_check BEFORE INSERT ON "SupplierVariantSku" FOR EACH ROW EXECUTE FUNCTION dayari_validate_sku();

