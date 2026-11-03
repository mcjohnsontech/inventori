CREATE TABLE "LocationRegistry" (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  "normalizedName" text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{1,32}$'),
  "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SupplierLocationPrefix" (
  id uuid PRIMARY KEY,
  "sourceId" uuid NOT NULL UNIQUE REFERENCES "SupplierSource"(id) ON DELETE RESTRICT,
  "registryId" uuid NOT NULL REFERENCES "LocationRegistry"(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE CHECK (length(code) > 0),
  "originId" uuid NOT NULL REFERENCES "OriginNode"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Approved canonical registry entry. Operational supplier/source identities are not changed.
INSERT INTO "LocationRegistry"(id, name, "normalizedName", code)
VALUES ('33333333-3333-4333-8333-333333333333', 'Lagos', 'lagos', 'LG');
CREATE TRIGGER location_registry_immutable BEFORE UPDATE OR DELETE ON "LocationRegistry" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER supplier_location_prefix_immutable BEFORE UPDATE OR DELETE ON "SupplierLocationPrefix" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
