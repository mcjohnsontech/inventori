-- New correction requests must preserve the quantities explicitly reviewed by the Manager.
-- Existing immutable request evidence is grandfathered rather than rewritten.
BEGIN;
ALTER TABLE "AuthorizationRequest" ADD CONSTRAINT correction_reviewed_quantities CHECK(kind<>'CORRECTION' OR (
 payload->'input'->>'reviewedLedgerQuantity' IS NOT DISTINCT FROM "ledgerQuantity"::text AND
 payload->'input'->>'reviewedProjectionQuantity' IS NOT DISTINCT FROM "projectionQuantity"::text)) NOT VALID;
COMMIT;
