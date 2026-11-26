-- Local Admin approval of recovery and correction requests.
-- Owner decisions, 24 November 2026 (docs/decisions.md, docs/local-admin-approval-design.md):
--  * An Admin at the shop may approve or reject a pending request; never their own; Managers never approve.
--  * Approved recovery moves the request's exact damaged units back to usable (D -> U).
--  * Approved shortfall correction removes the Admin-selected missing units (U/P/D -> X), exactly the shortfall.
--  * Surplus corrections are closed as "receive as a new delivery"; approval never creates units.
--  * A rejected or receive-as-delivery correction keeps blocking closing until a later matching recount.
-- Append-only: decisions are new rows; requests, movements and events are never edited.
BEGIN;
CREATE TABLE "AuthorizationDecision"(
 id uuid PRIMARY KEY,
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "requestId" uuid NOT NULL UNIQUE REFERENCES "AuthorizationRequest"(id),
 "actorId" uuid NOT NULL REFERENCES "User"(id),
 "actorRole" "Role" NOT NULL CHECK("actorRole"='ADMIN'),
 "commandId" uuid NOT NULL UNIQUE,
 "transactionId" uuid UNIQUE REFERENCES "StockTransaction"(id),
 "recordedAt" timestamptz(6) NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('APPROVED','REJECTED','RECEIVE_AS_DELIVERY')),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 10 AND 2000 AND note ~ '[[:alpha:]]'),
 "unitCount" int NOT NULL CHECK("unitCount" BETWEEN 0 AND 500),
 manifest jsonb NOT NULL,
 "canonicalManifest" text NOT NULL,
 "manifestHash" text NOT NULL,
 CHECK((outcome='APPROVED' AND "transactionId" IS NOT NULL AND "unitCount">=1) OR (outcome<>'APPROVED' AND "transactionId" IS NULL AND "unitCount"=0)));
CREATE INDEX "AuthorizationDecision_originId_recordedAt_id_idx" ON "AuthorizationDecision"("originId","recordedAt",id);
CREATE TABLE "AuthorizationDecisionLine"(
 id uuid PRIMARY KEY,
 "decisionId" uuid NOT NULL REFERENCES "AuthorizationDecision"(id),
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "unitId" uuid NOT NULL,
 "lotId" uuid NOT NULL,
 "batchId" uuid NOT NULL,
 "fromState" text NOT NULL CHECK("fromState" IN ('U','P','D')),
 "toState" text NOT NULL CHECK("toState" IN ('U','X')),
 "previousEventId" uuid NOT NULL REFERENCES "UnitEvent"(id),
 "movementId" uuid NOT NULL UNIQUE,
 "eventId" uuid NOT NULL UNIQUE,
 snapshot jsonb NOT NULL,
 UNIQUE("decisionId","unitId"),
 FOREIGN KEY("unitId","lotId") REFERENCES "StockUnit"(id,"lotId") ON DELETE RESTRICT,
 CHECK(("fromState"='D' AND "toState"='U') OR "toState"='X'));
CREATE INDEX "AuthorizationDecisionLine_unitId_idx" ON "AuthorizationDecisionLine"("unitId");
CREATE TRIGGER history_immutable BEFORE DELETE OR UPDATE ON "AuthorizationDecision" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER history_immutable BEFORE DELETE OR UPDATE ON "AuthorizationDecisionLine" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();

ALTER TABLE "StockMovement" ADD COLUMN "decisionLineId" uuid UNIQUE REFERENCES "AuthorizationDecisionLine"(id);
ALTER TABLE "StockMovement" DROP CONSTRAINT movement_enabled_provenance;
ALTER TABLE "StockMovement" ADD CONSTRAINT movement_enabled_provenance CHECK (
 num_nonnulls("receiptLineId","checkoutLineId","damageLineId","damageReviewLineId","completionLineId","decisionLineId")=1 AND (
 ("receiptLineId" IS NOT NULL AND "fromState"='E' AND "toState" IN ('U','D')) OR
 ("checkoutLineId" IS NOT NULL AND "fromState"='U' AND "toState"='P' AND quantity=1) OR
 ("damageLineId" IS NOT NULL AND "fromState" IN ('U','P') AND "toState"='D' AND quantity=1) OR
 ("damageReviewLineId" IS NOT NULL AND "fromState"='D' AND "toState"='X' AND quantity=1) OR
 ("completionLineId" IS NOT NULL AND "fromState"='P' AND "toState"='C' AND quantity=1) OR
 ("decisionLineId" IS NOT NULL AND quantity=1 AND (("fromState"='D' AND "toState"='U') OR ("fromState" IN ('U','P','D') AND "toState"='X')))));
ALTER TABLE "UnitEvent" ADD COLUMN "decisionLineId" uuid UNIQUE REFERENCES "AuthorizationDecisionLine"(id);

ALTER TABLE "UnitEvent" DROP CONSTRAINT unit_event_enabled_transition;
ALTER TABLE "UnitEvent" ADD CONSTRAINT unit_event_enabled_transition CHECK (
 ((((("completionLineId" IS NULL) AND (((kind = 'RECEIVED'::text) AND (ordinal = 1) AND ("fromState" = 'E'::text) AND ("toState" = ANY (ARRAY['U'::text, 'D'::text])) AND ("previousEventId" IS NULL) AND (num_nonnulls("checkoutLineId", "damageLineId", "damageReviewLineId") = 0)) OR ((kind = 'ISSUED'::text) AND (ordinal > 1) AND ("fromState" = 'U'::text) AND ("toState" = 'P'::text) AND ("previousEventId" IS NOT NULL) AND ("checkoutLineId" IS NOT NULL) AND ("damageLineId" IS NULL) AND ("damageReviewLineId" IS NULL)) OR ((kind = 'BAD_REPORTED'::text) AND (ordinal > 1) AND ("fromState" = ANY (ARRAY['U'::text, 'P'::text])) AND ("toState" = 'D'::text) AND ("previousEventId" IS NOT NULL) AND ("damageLineId" IS NOT NULL) AND ("checkoutLineId" IS NULL) AND ("damageReviewLineId" IS NULL)) OR ((kind = 'DAMAGE_REMOVED'::text) AND (ordinal > 1) AND ("fromState" = 'D'::text) AND ("toState" = 'X'::text) AND ("previousEventId" IS NOT NULL) AND ("damageReviewLineId" IS NOT NULL) AND ("checkoutLineId" IS NULL) AND ("damageLineId" IS NULL)))) OR ((kind = 'COMPLETED'::text) AND (ordinal > 1) AND ("fromState" = 'P'::text) AND ("toState" = 'C'::text) AND ("previousEventId" IS NOT NULL) AND ("completionLineId" IS NOT NULL) AND (num_nonnulls("checkoutLineId", "damageLineId", "damageReviewLineId") = 0)))) AND "decisionLineId" IS NULL) OR
 (kind IN ('RECOVERED','CORRECTION_REMOVED') AND ordinal>1 AND "previousEventId" IS NOT NULL AND "decisionLineId" IS NOT NULL
  AND num_nonnulls("checkoutLineId","damageLineId","damageReviewLineId","completionLineId")=0
  AND ((kind='RECOVERED' AND "fromState"='D' AND "toState"='U') OR (kind='CORRECTION_REMOVED' AND "fromState" IN ('U','P','D') AND "toState"='X'))));
ALTER TABLE "UnitState" DROP CONSTRAINT unit_state_enabled_shape;
ALTER TABLE "UnitState" ADD CONSTRAINT unit_state_enabled_shape CHECK (version>0 AND (
 (state IN ('U','D') AND custody='SHOP_STORAGE' AND "holderId" IS NULL AND condition=CASE state WHEN 'U' THEN 'USABLE' ELSE 'DAMAGED' END) OR
 (state='P' AND condition='USABLE' AND custody='ISSUED_TO_STAFF' AND "holderId" IS NOT NULL) OR
 (state='C' AND condition='USABLE' AND custody='COMPLETED' AND "holderId" IS NULL) OR
 (state='X' AND condition IN ('DAMAGED','USABLE') AND custody='REMOVED' AND "holderId" IS NULL)));
ALTER TABLE "StockTransaction" DROP CONSTRAINT transaction_enabled_provenance;
ALTER TABLE "StockTransaction" ADD CONSTRAINT transaction_enabled_provenance CHECK (
 (type='RECEIPT' AND "batchId" IS NOT NULL AND "actorRole" IN ('ADMIN','MANAGER')) OR
 (type IN ('ISSUE','DAMAGE') AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER','PRODUCTION')) OR
 (type='DISPOSITION' AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER')) OR
 (type='COMPLETE' AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER')) OR
 (type IN ('RECOVERY','CORRECTION') AND "batchId" IS NULL AND "actorRole"='ADMIN'));

CREATE OR REPLACE FUNCTION public.dayari_receipt_insert_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE created_xid text;
BEGIN
 IF TG_TABLE_NAME='StockTransaction' THEN
  IF NEW.type IN ('ISSUE','DAMAGE','DISPOSITION','COMPLETE','RECOVERY','CORRECTION') THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='StockMovement' THEN
  IF NEW."decisionLineId" IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "AuthorizationDecisionLine" x JOIN "AuthorizationDecision" d ON d.id=x."decisionId"
    WHERE x.id=NEW."decisionLineId" AND d."transactionId"=NEW."transactionId" AND x."movementId"=NEW.id AND x."lotId"=NEW."lotId" AND x."batchId"=NEW."batchId"
    AND x."fromState"=NEW."fromState" AND x."toState"=NEW."toState" AND d.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
    RAISE EXCEPTION 'Approved request movement requires its new exact decision line' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  IF NEW."completionLineId" IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "ProductionCompletionLine" x JOIN "ProductionCompletion" c ON c.id=x."completionId"
    WHERE x.id=NEW."completionLineId" AND c."transactionId"=NEW."transactionId" AND x."movementId"=NEW.id AND x."lotId"=NEW."lotId" AND x."batchId"=NEW."batchId"
    AND c.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
    RAISE EXCEPTION 'Completion requires new exact domain line' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  IF NEW."damageLineId" IS NOT NULL OR NEW."damageReviewLineId" IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "DamageLine" x JOIN "DamageReport" r ON r.id=x."reportId" WHERE x.id=NEW."damageLineId"
    AND r."transactionId"=NEW."transactionId" AND x."movementId"=NEW.id AND x."lotId"=NEW."lotId" AND x."batchId"=NEW."batchId"
    AND r.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)
   AND NOT EXISTS(SELECT 1 FROM "DamageReviewLine" x JOIN "DamageReview" r ON r.id=x."reviewId" WHERE x.id=NEW."damageReviewLineId"
    AND r."transactionId"=NEW."transactionId" AND x."movementId"=NEW.id AND x."lotId"=NEW."lotId" AND x."batchId"=NEW."batchId"
    AND r.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
    RAISE EXCEPTION 'Damage movement requires its new exact domain line' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  IF NEW."checkoutLineId" IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "CheckoutLine" x JOIN "Checkout" c ON c.id=x."checkoutId"
    JOIN "StockTransaction" t ON t.id=c."transactionId" WHERE x.id=NEW."checkoutLineId" AND t.type='ISSUE'
    AND t.id=NEW."transactionId" AND x."movementId"=NEW.id AND x."lotId"=NEW."lotId" AND x."batchId"=NEW."batchId"
    AND c.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
     RAISE EXCEPTION 'Issue movement requires its new exact checkout line' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
 END IF;
 SELECT xmin::text INTO created_xid FROM "DeliveryBatch" WHERE id=NEW."batchId";
 IF created_xid IS DISTINCT FROM (pg_current_xact_id()::text::numeric%4294967296)::text THEN
  RAISE EXCEPTION 'An accepted delivery cannot be supplemented' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.dayari_unit_event_guard_set()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM inserted n WHERE n.kind='RECEIVED' AND NOT EXISTS(
  SELECT 1 FROM "StockUnit" u WHERE u.id=n."unitId" AND u."lotId"=n."lotId" AND u."originId"=n."originId"
  AND u."registrationCommandId"=n."commandId" AND u."initialMovementId"=n."movementId" AND u."initialState"=n."toState"
  AND u."actorId"=n."actorId" AND u."actorRole"=n."actorRole" AND u."recordedAt"=n."recordedAt"
  AND u.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
  RAISE EXCEPTION 'Invalid unit receiving event' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM inserted n WHERE n.kind='ISSUED' AND NOT EXISTS(
  SELECT 1 FROM "UnitState" s JOIN "CheckoutLine" x ON x."unitId"=s."unitId"
  JOIN "Checkout" c ON c.id=x."checkoutId" JOIN "StockMovement" m ON m.id=x."movementId"
  JOIN "StockTransaction" t ON t.id=c."transactionId"
  WHERE x.id=n."checkoutLineId" AND x."eventId"=n.id AND s."unitId"=n."unitId" AND s."lotId"=n."lotId"
  AND s."originId"=n."originId" AND s.state='U' AND s."lastEventId"=n."previousEventId" AND n.ordinal=s.version+1
  AND c."originId"=n."originId" AND c."commandId"=n."commandId" AND c."actorId"=n."actorId"
  AND c."actorRole"=n."actorRole" AND c."acceptedAt"=n."recordedAt" AND t.type='ISSUE'
  AND m.id=n."movementId" AND m."checkoutLineId"=x.id AND m."transactionId"=t.id AND m."lotId"=n."lotId"
  AND m.quantity=1 AND m."fromState"='U' AND m."toState"='P'
  AND c.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
  RAISE EXCEPTION 'Invalid exact-unit issue event' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM inserted n JOIN "UnitState" s ON s."unitId"=n."unitId"
  WHERE n.kind IN ('BAD_REPORTED','DAMAGE_REMOVED') AND (
   s."lotId"<>n."lotId" OR s."originId"<>n."originId" OR s.state<>n."fromState" OR s."lastEventId"<>n."previousEventId" OR n.ordinal<>s.version+1
   OR NOT EXISTS(SELECT 1 FROM "StockMovement" m JOIN "StockTransaction" t ON t.id=m."transactionId"
    WHERE m.id=n."movementId" AND m."lotId"=n."lotId" AND m.quantity=1 AND m."fromState"=n."fromState" AND m."toState"=n."toState"
    AND t."originId"=n."originId" AND t."commandId"=n."commandId" AND t."actorId"=n."actorId" AND t."actorRole"=n."actorRole" AND t."recordedAt"=n."recordedAt"
    AND ((n.kind='BAD_REPORTED' AND t.type='DAMAGE' AND m."damageLineId"=n."damageLineId") OR
         (n.kind='DAMAGE_REMOVED' AND t.type='DISPOSITION' AND m."damageReviewLineId"=n."damageReviewLineId"))))) THEN
   RAISE EXCEPTION 'Invalid exact-unit damage transition' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM inserted n JOIN "UnitState" s ON s."unitId"=n."unitId"
  WHERE n.kind IN ('RECOVERED','CORRECTION_REMOVED') AND (
   s."lotId"<>n."lotId" OR s."originId"<>n."originId" OR s.state<>n."fromState" OR s."lastEventId"<>n."previousEventId" OR n.ordinal<>s.version+1
   OR NOT EXISTS(SELECT 1 FROM "StockMovement" m JOIN "StockTransaction" t ON t.id=m."transactionId"
    WHERE m.id=n."movementId" AND m."lotId"=n."lotId" AND m.quantity=1 AND m."fromState"=n."fromState" AND m."toState"=n."toState"
    AND t."originId"=n."originId" AND t."commandId"=n."commandId" AND t."actorId"=n."actorId" AND t."actorRole"=n."actorRole" AND t."recordedAt"=n."recordedAt"
    AND m."decisionLineId"=n."decisionLineId"
    AND ((n.kind='RECOVERED' AND t.type='RECOVERY') OR (n.kind='CORRECTION_REMOVED' AND t.type='CORRECTION'))))) THEN
   RAISE EXCEPTION 'Invalid approved request transition' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.dayari_unit_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Unit projection cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW."unitId"<>OLD."unitId" OR NEW."lotId"<>OLD."lotId" OR NEW."originId"<>OLD."originId" THEN
 RAISE EXCEPTION 'Unit projection identity is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM "UnitEvent" e WHERE e.id=NEW."lastEventId" AND e."unitId"=NEW."unitId"
 AND e."lotId"=NEW."lotId" AND e."originId"=NEW."originId" AND e.ordinal=NEW.version AND e."toState"=NEW.state AND e."fromState"=OLD.state
 AND e."previousEventId"=OLD."lastEventId" AND e.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text AND (
 (e.kind='ISSUED' AND OLD.state='U' AND NEW.state='P' AND e."actorId"=NEW."holderId") OR
 (e.kind='BAD_REPORTED' AND OLD.state IN ('U','P') AND NEW.state='D' AND NEW."holderId" IS NULL) OR
 (e.kind='COMPLETED' AND OLD.state='P' AND NEW.state='C' AND NEW."holderId" IS NULL) OR
 (e.kind='DAMAGE_REMOVED' AND OLD.state='D' AND NEW.state='X' AND NEW."holderId" IS NULL) OR
 (e.kind='RECOVERED' AND OLD.state='D' AND NEW.state='U' AND NEW."holderId" IS NULL) OR
 (e.kind='CORRECTION_REMOVED' AND OLD.state IN ('U','P','D') AND NEW.state='X' AND NEW."holderId" IS NULL))) THEN
 RAISE EXCEPTION 'Unit transition requires its new exact authorized domain event' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $function$;

CREATE FUNCTION dayari_decision_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_xid text;
BEGIN
 SELECT xmin::text INTO parent_xid FROM "AuthorizationDecision" WHERE id=NEW."decisionId" AND "originId"=NEW."originId";
 IF parent_xid IS DISTINCT FROM (pg_current_xact_id()::text::numeric%4294967296)::text THEN RAISE EXCEPTION 'Accepted decision evidence cannot be supplemented' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER decision_child_guard BEFORE INSERT ON "AuthorizationDecisionLine" FOR EACH ROW EXECUTE FUNCTION dayari_decision_child_guard();
CREATE FUNCTION dayari_decision_transaction_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.type IN ('RECOVERY','CORRECTION') AND NOT EXISTS(SELECT 1 FROM "AuthorizationDecision" WHERE "transactionId"=NEW.id AND xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
 RAISE EXCEPTION 'Approval transactions require their complete new decision' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER decision_transaction_complete AFTER INSERT ON "StockTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_decision_transaction_complete();
CREATE FUNCTION dayari_decision_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "AuthorizationRequest"; expected_type text; n bigint;
BEGIN
 SELECT * INTO r FROM "AuthorizationRequest" WHERE id=NEW."requestId";
 IF NOT FOUND OR r."originId"<>NEW."originId" THEN RAISE EXCEPTION 'Decision requires a request from this shop' USING ERRCODE='23514'; END IF;
 IF r."actorId"=NEW."actorId" THEN RAISE EXCEPTION 'An Admin cannot decide their own request' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND u.active AND NOT u."mustChangePassword"
  AND u.role='ADMIN' AND u.role=NEW."actorRole" AND m."originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='inventory.authorization.decide')
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole"=NEW."actorRole"
  AND "subjectId"=NEW.id AND action='inventory.authorization.decided' AND snapshot->>'manifestHash'=NEW."manifestHash" AND snapshot->>'outcome'=NEW.outcome)
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId"
  AND "aggregateId"=NEW.id AND "eventType"='inventory.authorization.decided' AND payload->>'manifestHash'=NEW."manifestHash" AND payload->>'outcome'=NEW.outcome) THEN
 RAISE EXCEPTION 'Incomplete or unauthorized decision evidence' USING ERRCODE='23514'; END IF;
 IF NOT ((r.kind='RECOVERY' AND NEW.outcome IN ('APPROVED','REJECTED'))
  OR (r.kind='CORRECTION' AND (NEW.outcome='REJECTED'
   OR (NEW.outcome='APPROVED' AND r."observedQuantity"<r."ledgerQuantity" AND r."projectionQuantity"=r."ledgerQuantity" AND NEW."unitCount"=r."ledgerQuantity"-r."observedQuantity")
   OR (NEW.outcome='RECEIVE_AS_DELIVERY' AND r."observedQuantity">r."ledgerQuantity")))) THEN
 RAISE EXCEPTION 'Decision outcome does not fit this request' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM "AuthorizationDecisionLine" WHERE "decisionId"=NEW.id;
 IF n<>NEW."unitCount" OR (SELECT count(DISTINCT member->>'id') FROM jsonb_array_elements(NEW.manifest) member)<>n THEN
 RAISE EXCEPTION 'Incomplete exact decision membership' USING ERRCODE='23514'; END IF;
 IF NEW.outcome<>'APPROVED' THEN
  IF EXISTS(SELECT 1 FROM "StockTransaction" WHERE "commandId"=NEW."commandId") OR EXISTS(SELECT 1 FROM "UnitEvent" WHERE "commandId"=NEW."commandId") THEN
  RAISE EXCEPTION 'Rejected or redirected requests cannot move stock' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 expected_type:=CASE r.kind WHEN 'RECOVERY' THEN 'RECOVERY' ELSE 'CORRECTION' END;
 IF NOT EXISTS(SELECT 1 FROM "StockTransaction" t JOIN "OutboxEvent" o ON o."commandId"=t."commandId" WHERE t.id=NEW."transactionId"
  AND t.type=expected_type AND t."batchId" IS NULL AND t."originId"=NEW."originId" AND t."commandId"=NEW."commandId"
  AND t."actorId"=NEW."actorId" AND t."actorRole"=NEW."actorRole" AND t."recordedAt"=NEW."recordedAt"
  AND t."originSequence"=o."originSequence" AND t.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)
 OR (SELECT count(*) FROM "StockMovement" WHERE "transactionId"=NEW."transactionId")<>NEW."unitCount"
 OR (SELECT count(*) FROM "UnitEvent" WHERE "commandId"=NEW."commandId")<>NEW."unitCount" THEN
 RAISE EXCEPTION 'Incomplete approval transaction group' USING ERRCODE='23514'; END IF;
 IF r.kind='RECOVERY' AND (NEW."unitCount"<>r."unitCount" OR EXISTS(
  SELECT "unitId","previousEventId" FROM "AuthorizationRequestUnit" WHERE "requestId"=r.id
  EXCEPT SELECT "unitId","previousEventId" FROM "AuthorizationDecisionLine" WHERE "decisionId"=NEW.id)) THEN
 RAISE EXCEPTION 'Recovery must return exactly the requested unchanged units' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM "AuthorizationDecisionLine" x LEFT JOIN "StockUnit" u ON u.id=x."unitId" LEFT JOIN "StockLot" l ON l.id=u."lotId"
  LEFT JOIN "UnitState" s ON s."unitId"=u.id LEFT JOIN "UnitEvent" prior ON prior.id=x."previousEventId"
  LEFT JOIN "StockMovement" m ON m.id=x."movementId" LEFT JOIN "UnitEvent" e ON e.id=x."eventId"
  LEFT JOIN LATERAL (SELECT member FROM jsonb_array_elements(NEW.manifest) member WHERE member->>'id'=x.id::text) manifest ON true
  WHERE x."decisionId"=NEW.id AND (u.id IS NULL OR l.id IS NULL OR s."unitId" IS NULL OR prior.id IS NULL OR m.id IS NULL OR e.id IS NULL OR manifest.member IS NULL
  OR x."originId"<>NEW."originId" OR u."originId"<>NEW."originId" OR l."originId"<>NEW."originId"
  OR x."lotId"<>u."lotId" OR x."batchId"<>l."batchId" OR prior."unitId"<>u.id OR prior."toState"<>x."fromState"
  OR manifest.member->>'unitId' IS DISTINCT FROM u.id::text
  OR x.snapshot->'unit'->>'unitId' IS DISTINCT FROM u.id::text OR x.snapshot->'unit'->>'unitCode' IS DISTINCT FROM u."unitCode"
  OR (r.kind='RECOVERY' AND (x."fromState"<>'D' OR x."toState"<>'U'))
  OR (r.kind='CORRECTION' AND (x."lotId"<>r."lotId" OR x."fromState"<>r.state OR x."toState"<>'X'))
  OR m."transactionId"<>NEW."transactionId" OR m."decisionLineId" IS DISTINCT FROM x.id OR m."lotId"<>l.id OR m."batchId"<>l."batchId"
  OR m.quantity<>1 OR m."fromState"<>x."fromState" OR m."toState"<>x."toState"
  OR e."movementId"<>m.id OR e."unitId"<>u.id OR e."originId"<>NEW."originId" OR e."lotId"<>l.id OR e."decisionLineId" IS DISTINCT FROM x.id
  OR e."commandId"<>NEW."commandId" OR e."actorId"<>NEW."actorId" OR e."actorRole"<>NEW."actorRole" OR e."recordedAt"<>NEW."recordedAt"
  OR e."previousEventId"<>prior.id OR e.ordinal<>prior.ordinal+1 OR e."fromState"<>x."fromState" OR e."toState"<>x."toState"
  OR e.kind<>CASE r.kind WHEN 'RECOVERY' THEN 'RECOVERED' ELSE 'CORRECTION_REMOVED' END
  OR s.state<>e."toState" OR s."lastEventId"<>e.id OR s.version<>e.ordinal
  OR x.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text OR m.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text OR e.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
 RAISE EXCEPTION 'Decision provenance, unit state, manifest or movement mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(WITH lots AS (SELECT DISTINCT "lotId" FROM "AuthorizationDecisionLine" WHERE "decisionId"=NEW.id),
  counts AS (SELECT s."lotId",s.state,count(*) AS n FROM "UnitState" s JOIN lots l ON l."lotId"=s."lotId" GROUP BY s."lotId",s.state)
  SELECT 1 FROM lots l CROSS JOIN (VALUES('U'),('P'),('D'),('C'),('X')) states(state)
  LEFT JOIN counts c ON c."lotId"=l."lotId" AND c.state=states.state LEFT JOIN "StockBalance" b ON b."lotId"=l."lotId" AND b.state=states.state
  WHERE COALESCE(c.n,0)<>COALESCE(b.quantity,0)) THEN
 RAISE EXCEPTION 'Approval unit census must match ledger projections' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER decision_complete AFTER INSERT ON "AuthorizationDecision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_decision_complete();

CREATE OR REPLACE FUNCTION public.dayari_closing_snapshot(shop uuid, business_day date, cutoff timestamp with time zone, sequence_limit bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE start_at timestamptz; end_at timestamptz; blockers jsonb; balances jsonb; flows jsonb; evidence jsonb; carry jsonb;
BEGIN
 start_at=business_day::timestamp AT TIME ZONE 'Africa/Lagos';
 end_at=(business_day+1)::timestamp AT TIME ZONE 'Africa/Lagos';
 WITH findings AS (
  SELECT 'MISSING_REASON' kind,e.id::text id,'Checkout reason is not provided' message,'reconciliation' workspace
  FROM "CheckoutException" e JOIN "Checkout" c ON c.id=e."checkoutId"
  WHERE e."originId"=shop AND c."acceptedAt"<end_at AND c."acceptedAt"<=cutoff
   AND NOT EXISTS(SELECT 1 FROM "CheckoutReasonResolution" x JOIN "ReasonReconciliation" r ON r.id=x."reconciliationId" WHERE x."exceptionId"=e.id AND r."recordedAt"<=cutoff)
  UNION ALL
  SELECT 'COUNT_REQUIRED',s.id::text,'Required count is incomplete, stale or unmatched','counts'
  FROM "CountSession" s LEFT JOIN LATERAL (
   SELECT a.id,a.snapshot,r.status FROM "CountAttempt" a LEFT JOIN "CountResult" r ON r."attemptId"=a.id AND r."recordedAt"<=cutoff
   WHERE a."sessionId"=s.id AND a."recordedAt"<=cutoff ORDER BY a."recordedAt" DESC,a.id DESC LIMIT 1
  ) latest ON true
  WHERE s."originId"=shop AND s."recordedAt"<end_at AND s."recordedAt"<=cutoff
   AND latest.status IS DISTINCT FROM 'MATCHED'
  UNION ALL
  SELECT 'COUNT_MISMATCH',r.id::text,'Unexplained physical count discrepancy','counts'
  FROM "CountResult" r JOIN "CountAttempt" a ON a.id=r."attemptId" JOIN "CountSession" s ON s.id=a."sessionId"
  WHERE r."originId"=shop AND s."recordedAt"<end_at AND r."recordedAt"<=cutoff AND r.status='MISMATCH'
   AND NOT EXISTS(SELECT 1 FROM "CountResolution" resolved WHERE resolved."resultId"=r.id AND resolved."recordedAt"<=cutoff)
  UNION ALL
  SELECT 'CERTIFICATION_APPROVAL',r.id::text,'Correction awaits an Admin decision or a matching recount','requests'
  FROM "AuthorizationRequest" r WHERE r."originId"=shop AND r.kind='CORRECTION' AND r."recordedAt"<end_at AND r."recordedAt"<=cutoff
  AND NOT EXISTS(SELECT 1 FROM "AuthorizationDecision" d WHERE d."requestId"=r.id AND d."recordedAt"<=cutoff AND (d.outcome='APPROVED' OR EXISTS(
   SELECT 1 FROM "CountResult" cr JOIN "CountAttempt" ca ON ca.id=cr."attemptId" JOIN "CountSession" cs ON cs.id=ca."sessionId"
   WHERE cs."originId"=shop AND cs."lotId"=r."lotId" AND cs.state=r.state AND cr.status='MATCHED' AND cr."recordedAt">d."recordedAt" AND cr."recordedAt"<=cutoff)))
  UNION ALL
  SELECT 'BALANCE_MISMATCH',l.id::text||':'||states.state,'Ledger, balance projection or native unit census disagree','inventory'
  FROM "StockLot" l JOIN "DeliveryBatch" b ON b.id=l."batchId"
  CROSS JOIN (VALUES('U'),('P'),('D'),('C'),('X')) states(state)
  LEFT JOIN "StockBalance" projection ON projection."lotId"=l.id AND projection.state=states.state
  LEFT JOIN "LotSerialization" serial ON serial."lotId"=l.id
  CROSS JOIN LATERAL (SELECT COALESCE(sum(CASE WHEN m."toState"=states.state THEN m.quantity WHEN m."fromState"=states.state THEN -m.quantity ELSE 0 END),0) quantity FROM "StockMovement" m WHERE m."lotId"=l.id) ledger
  WHERE l."originId"=shop AND b."acceptedAt"<end_at AND b."acceptedAt"<=cutoff AND
   (ledger.quantity<0 OR ledger.quantity<>COALESCE(projection.quantity,0) OR
    (serial.mode='NATIVE' AND ledger.quantity<>(SELECT count(*) FROM "UnitState" u WHERE u."lotId"=l.id AND u.state=states.state)))
  UNION ALL
  SELECT 'MOVEMENT_EVIDENCE',t.id::text,'Required accepted-command or movement evidence is missing','reports'
  FROM "StockTransaction" t WHERE t."originId"=shop AND t."recordedAt"<end_at AND t."recordedAt"<=cutoff AND t."originSequence"<=sequence_limit AND
   (NOT EXISTS(SELECT 1 FROM "CommandResult" c WHERE c.id=t."commandId" AND c."originId"=shop AND c."actorId"=t."actorId") OR
    NOT EXISTS(SELECT 1 FROM "AuditEvent" a WHERE a."commandId"=t."commandId" AND a."originId"=shop AND a."actorId"=t."actorId") OR
    NOT EXISTS(SELECT 1 FROM "OutboxEvent" o WHERE o."commandId"=t."commandId" AND o."originId"=shop AND o."originSequence"=t."originSequence") OR
    NOT EXISTS(SELECT 1 FROM "StockMovement" m WHERE m."transactionId"=t.id) OR
    EXISTS(SELECT 1 FROM "StockMovement" m JOIN "LotSerialization" s ON s."lotId"=m."lotId" WHERE m."transactionId"=t.id AND s.mode='NATIVE' AND m.quantity<>(SELECT count(*) FROM "UnitEvent" e WHERE e."movementId"=m.id)))
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'message',message,'workspace',workspace) ORDER BY kind,id),'[]'::jsonb) INTO blockers FROM findings;

 WITH quantities AS (
  SELECT l.id AS lot_id,l."skuId",l."batchId",sku."fullCode",p.name AS product,v.name AS variant,li.code AS lot_code,b."publicCode",states.state,
   COALESCE(sum(CASE WHEN m."toState"=states.state THEN m.quantity WHEN m."fromState"=states.state THEN -m.quantity ELSE 0 END) FILTER(WHERE t."recordedAt"<start_at),0)::text AS opening,
   COALESCE(sum(m.quantity) FILTER(WHERE t."recordedAt">=start_at AND m."toState"=states.state),0)::text AS incoming,
   COALESCE(sum(m.quantity) FILTER(WHERE t."recordedAt">=start_at AND m."fromState"=states.state),0)::text AS outgoing,
   COALESCE(sum(CASE WHEN m."toState"=states.state THEN m.quantity WHEN m."fromState"=states.state THEN -m.quantity ELSE 0 END),0)::text AS closing
  FROM "StockLot" l JOIN "DeliveryBatch" b ON b.id=l."batchId" JOIN "SupplierVariantSku" sku ON sku.id=l."skuId" JOIN "Product" p ON p.id=sku."productId" JOIN "Variant" v ON v.id=sku."variantId" LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id
  CROSS JOIN (VALUES('U'),('P'),('D'),('C'),('X')) states(state)
  LEFT JOIN ("StockMovement" m JOIN "StockTransaction" t ON t.id=m."transactionId" AND t."recordedAt"<end_at AND t."recordedAt"<=cutoff AND t."originSequence"<=sequence_limit) ON m."lotId"=l.id
  WHERE l."originId"=shop AND b."acceptedAt"<end_at AND b."acceptedAt"<=cutoff
  GROUP BY l.id,sku."fullCode",p.name,v.name,li.code,b."publicCode",states.state
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('lotId',lot_id,'skuId',"skuId",'batchId',"batchId",'fullSku',"fullCode",'productName',product,'variantName',variant,'lotCode',lot_code,'publicBatchCode',"publicCode",'state',state,'opening',opening,'incoming',incoming,'outgoing',outgoing,'closing',closing) ORDER BY lot_id,state),'[]'::jsonb) INTO balances FROM quantities;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('transactionId',t.id,'type',t.type,'recordedAt',t."recordedAt",'originSequence',t."originSequence"::text,'commandId',t."commandId") ORDER BY t."originSequence"),'[]'::jsonb) INTO flows FROM "StockTransaction" t WHERE t."originId"=shop AND t."recordedAt">=start_at AND t."recordedAt"<end_at AND t."recordedAt"<=cutoff AND t."originSequence"<=sequence_limit;
 SELECT jsonb_build_object(
  'reconciliations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'recordedAt',r."recordedAt",'manifestHash',r."manifestHash") ORDER BY r.id) FROM "ReasonReconciliation" r WHERE r."originId"=shop AND r."recordedAt"<=cutoff),'[]'::jsonb),
  'countResults',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'attemptId',r."attemptId") ORDER BY r.id) FROM "CountResult" r JOIN "CountAttempt" a ON a.id=r."attemptId" JOIN "CountSession" s ON s.id=a."sessionId" WHERE s."originId"=shop AND s."recordedAt"<end_at AND r."recordedAt"<=cutoff),'[]'::jsonb),
  'countResolutions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'resultId',r."resultId",'matchingResultId',r."matchingResultId") ORDER BY r.id) FROM "CountResolution" r WHERE r."originId"=shop AND r."recordedAt"<=cutoff),'[]'::jsonb),
  'pendingRecoveries',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'status',r.status) ORDER BY r.id) FROM "AuthorizationRequest" r WHERE r."originId"=shop AND r.kind='RECOVERY' AND r."recordedAt"<end_at AND r."recordedAt"<=cutoff),'[]'::jsonb)
 ) INTO evidence;
 SELECT COALESCE(jsonb_agg(member ORDER BY member->>'lotId',member->>'state'),'[]'::jsonb) INTO carry FROM jsonb_array_elements(balances) member WHERE member->>'state' IN ('P','D') AND (member->>'closing')::numeric>0;
 RETURN jsonb_build_object('businessDate',business_day::text,'timezone','Africa/Lagos','basis','ACCEPTED_AT','cutoffAt',cutoff,'cutoffSequence',sequence_limit::text,'blockers',blockers,'balances',balances,'transactions',flows,'carryForward',carry,'evidence',evidence);
END $function$;

COMMIT;
