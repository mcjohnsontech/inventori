BEGIN;
ALTER TABLE "ReasonReconciliation" DROP CONSTRAINT "ReasonReconciliation_actorRole_check";
ALTER TABLE "ReasonReconciliation" ADD CONSTRAINT "ReasonReconciliation_actorRole_check" CHECK("actorRole" IN ('ADMIN','MANAGER'));
CREATE OR REPLACE FUNCTION dayari_reason_reconciliation_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id
  WHERE u.id=NEW."actorId" AND u.active AND NOT u."mustChangePassword" AND u.role=NEW."actorRole" AND u.role IN ('ADMIN','MANAGER') AND m."originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='production.reasons.reconcile')
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole"=NEW."actorRole"
  AND "subjectId"=NEW.id AND action='production.reasons.reconciled' AND snapshot->>'reconciliationId'=NEW.id::text AND snapshot->>'manifestHash'=NEW."manifestHash")
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId"
  AND "aggregateId"=NEW.id AND "eventType"='production.reasons.reconciled' AND payload->>'reconciliationId'=NEW.id::text AND payload->>'manifestHash'=NEW."manifestHash")
 OR EXISTS(SELECT 1 FROM "StockTransaction" WHERE "commandId"=NEW."commandId")
 OR EXISTS(SELECT 1 FROM "UnitEvent" WHERE "commandId"=NEW."commandId")
 OR (SELECT count(*) FROM "CheckoutReasonResolution" WHERE "reconciliationId"=NEW.id)<>NEW."exceptionCount" THEN
  RAISE EXCEPTION 'Incomplete or stock-changing reason classification' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM "CheckoutReasonResolution" r JOIN "CheckoutException" e ON e.id=r."exceptionId"
  JOIN "CheckoutLine" x ON x.id=e."lineId" JOIN "Checkout" c ON c.id=x."checkoutId"
  WHERE r."reconciliationId"=NEW.id AND (r."originId"<>NEW."originId" OR e."originId"<>NEW."originId" OR c."originId"<>NEW."originId"
   OR r."checkoutId"<>c.id OR e."checkoutId"<>c.id OR r."checkoutLineId"<>x.id OR r."unitId"<>x."unitId"
   OR x."reasonCode" IS NOT NULL OR NOT x."initiallyMissingReason"
   OR r.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
  RAISE EXCEPTION 'Reason classification must reference an original missing-reason exception' USING ERRCODE='23514'; END IF;
 IF (SELECT count(DISTINCT member->>'exceptionId') FROM jsonb_array_elements(NEW.manifest) member)<>NEW."exceptionCount"
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.manifest) member
  LEFT JOIN "CheckoutReasonResolution" r ON r.id=(member->>'id')::uuid AND r."reconciliationId"=NEW.id
  WHERE r.id IS NULL OR member->>'exceptionId' IS DISTINCT FROM r."exceptionId"::text
   OR member->>'checkoutId' IS DISTINCT FROM r."checkoutId"::text OR member->>'checkoutLineId' IS DISTINCT FROM r."checkoutLineId"::text
   OR member->>'unitId' IS DISTINCT FROM r."unitId"::text) THEN
  RAISE EXCEPTION 'Reason classification manifest does not match its exact saved exceptions' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
COMMIT;
