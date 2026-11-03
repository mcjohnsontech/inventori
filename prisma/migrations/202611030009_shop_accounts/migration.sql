-- Isolated development/test validation only. Operational migration/enrollment needs approval.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" boolean NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "originId" uuid REFERENCES "OriginNode"(id) ON DELETE RESTRICT;
CREATE TABLE "ShopMembership" (
  "userId" uuid PRIMARY KEY REFERENCES "User"(id) ON DELETE RESTRICT,
  "originId" uuid NOT NULL REFERENCES "OriginNode"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE ("userId", "originId")
);
CREATE INDEX "ShopMembership_originId_idx" ON "ShopMembership"("originId");
CREATE TRIGGER membership_immutable BEFORE UPDATE OR DELETE ON "ShopMembership"
FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
ALTER TABLE "Session" ADD CONSTRAINT session_shop_membership FOREIGN KEY ("userId", "originId")
REFERENCES "ShopMembership"("userId", "originId") ON DELETE RESTRICT;
-- Historical sessions remain as evidence; null origin sessions cannot authenticate.
-- No membership inferred or inserted for existing operational accounts.
