-- Non-stock Manager classification evidence. Operational migration remains separately gated.
BEGIN;
CREATE INDEX "CheckoutException_originId_createdAt_id_idx" ON "CheckoutException"("originId","createdAt",id);
CREATE TABLE "ReasonReconciliation" (
 id uuid PRIMARY KEY, "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "actorId" uuid NOT NULL REFERENCES "User"(id), "actorRole" "Role" NOT NULL CHECK("actorRole"='MANAGER'),
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "recordedAt" timestamptz(6) NOT NULL, "reasonCode" text NOT NULL CHECK("reasonCode" IN ('PRODUCTION_USE','SAMPLE','INTERNAL_USE','OTHER')),
 "reasonNote" text NOT NULL CHECK(length("reasonNote")<=2000), remarks text NOT NULL CHECK(length(remarks)<=2000),
 "exceptionCount" integer NOT NULL CHECK("exceptionCount" BETWEEN 1 AND 500),
 manifest jsonb NOT NULL, "canonicalManifest" text NOT NULL, "manifestHash" text NOT NULL,
 CHECK("reasonCode"<>'OTHER' OR (length(btrim("reasonNote"))>=10 AND "reasonNote" ~ '[[:alpha:]]')),
 CHECK(jsonb_typeof(manifest)='array' AND jsonb_array_length(manifest)="exceptionCount"),
 CHECK(manifest="canonicalManifest"::jsonb),
 CHECK("manifestHash"=encode(sha256(convert_to("canonicalManifest",'UTF8')),'hex'))
);
CREATE INDEX "ReasonReconciliation_originId_recordedAt_id_idx" ON "ReasonReconciliation"("originId","recordedAt",id);
CREATE TABLE "CheckoutReasonResolution" (
 id uuid PRIMARY KEY, "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "reconciliationId" uuid NOT NULL REFERENCES "ReasonReconciliation"(id),
 "exceptionId" uuid NOT NULL UNIQUE REFERENCES "CheckoutException"(id),
 "checkoutLineId" uuid NOT NULL REFERENCES "CheckoutLine"(id),
 "checkoutId" uuid NOT NULL REFERENCES "Checkout"(id), "unitId" uuid NOT NULL REFERENCES "StockUnit"(id)
);
CREATE INDEX "CheckoutReasonResolution_reconciliationId_idx" ON "CheckoutReasonResolution"("reconciliationId");
CREATE INDEX "CheckoutReasonResolution_unitId_idx" ON "CheckoutReasonResolution"("unitId");
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ReasonReconciliation','CheckoutReasonResolution'] LOOP
  EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change()',t);
 END LOOP;
END $$;
CREATE FUNCTION dayari_reason_resolution_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ReasonReconciliation" r WHERE r.id=NEW."reconciliationId" AND r."originId"=NEW."originId"
  AND r.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
   RAISE EXCEPTION 'An accepted reconciliation cannot be supplemented' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reason_resolution_insert_guard BEFORE INSERT ON "CheckoutReasonResolution"
 FOR EACH ROW EXECUTE FUNCTION dayari_reason_resolution_insert_guard();
CREATE FUNCTION dayari_reason_reconciliation_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id
  WHERE u.id=NEW."actorId" AND u.active AND NOT u."mustChangePassword" AND u.role='MANAGER' AND m."originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='production.reasons.reconcile')
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole"='MANAGER'
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
CREATE CONSTRAINT TRIGGER reason_reconciliation_complete AFTER INSERT ON "ReasonReconciliation"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_reason_reconciliation_complete();
COMMIT;
