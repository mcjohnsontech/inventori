-- Preserve allocated and legacy supplier codes when display names change.
CREATE FUNCTION dayari_guard_supplier_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Supplier identity cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.code IS DISTINCT FROM OLD.code OR NEW."originId" IS DISTINCT FROM OLD."originId" THEN
    RAISE EXCEPTION 'Supplier identity and allocated code are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER supplier_identity_immutable BEFORE UPDATE OR DELETE ON "Supplier" FOR EACH ROW EXECUTE FUNCTION dayari_guard_supplier_identity();
