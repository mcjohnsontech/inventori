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
