-- Owner decision, 24 November 2026 (docs/decisions.md): Admin may do everything an Inventory Manager may do:
-- stock counts, daily closing confirmation, damage decisions and recovery/correction requests.
-- Only role checks change, from MANAGER to ADMIN or MANAGER. History is not rewritten; no backfill.
-- Function bodies are the current definitions with only those role checks widened.
BEGIN;
ALTER TABLE "AuthorizationRequest" DROP CONSTRAINT "AuthorizationRequest_actorRole_check";
ALTER TABLE "AuthorizationRequest" ADD CONSTRAINT "AuthorizationRequest_actorRole_check" CHECK("actorRole" IN ('ADMIN','MANAGER'));
ALTER TABLE "DamageReview" DROP CONSTRAINT "DamageReview_actorRole_check";
ALTER TABLE "DamageReview" ADD CONSTRAINT "DamageReview_actorRole_check" CHECK("actorRole" IN ('ADMIN','MANAGER'));
ALTER TABLE "StockTransaction" DROP CONSTRAINT transaction_enabled_provenance;
ALTER TABLE "StockTransaction" ADD CONSTRAINT transaction_enabled_provenance CHECK (
 (type='RECEIPT' AND "batchId" IS NOT NULL AND "actorRole" IN ('ADMIN','MANAGER')) OR
 (type IN ('ISSUE','DAMAGE') AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER','PRODUCTION')) OR
 (type='DISPOSITION' AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER')) OR
 (type='COMPLETE' AND "batchId" IS NULL AND "actorRole" IN ('ADMIN','MANAGER')));
CREATE OR REPLACE FUNCTION public.dayari_authorization_request_complete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE actual numeric; projected bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND u.active
  AND NOT u."mustChangePassword" AND u.role IN ('ADMIN','MANAGER') AND m."originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='inventory.authorization.request')
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole" IN ('ADMIN','MANAGER')
  AND "subjectId"=NEW.id AND action='inventory.authorization.requested' AND snapshot->>'evidenceHash'=NEW."evidenceHash")
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId"
  AND "aggregateId"=NEW.id AND "eventType"='inventory.authorization.requested' AND payload->>'evidenceHash'=NEW."evidenceHash")
 OR EXISTS(SELECT 1 FROM "StockTransaction" WHERE "commandId"=NEW."commandId") OR EXISTS(SELECT 1 FROM "UnitEvent" WHERE "commandId"=NEW."commandId")
 OR NEW.payload->'input'->>'kind' IS DISTINCT FROM NEW.kind OR NEW.payload->'input'->>'reason' IS DISTINCT FROM NEW.reason OR NEW.payload->'input'->>'evidence' IS DISTINCT FROM NEW.evidence
 OR NEW.payload->'preview'->>'kind' IS DISTINCT FROM NEW.kind
 OR jsonb_typeof(NEW.payload->'members') IS DISTINCT FROM 'array'
 OR jsonb_array_length(NEW.payload->'members')<>NEW."unitCount"
 OR (SELECT count(DISTINCT member->>'id') FROM jsonb_array_elements(NEW.payload->'members') member)<>NEW."unitCount"
 OR (SELECT count(*) FROM "AuthorizationRequestUnit" WHERE "requestId"=NEW.id)<>NEW."unitCount" THEN
 RAISE EXCEPTION 'Incomplete or stock-changing pending request' USING ERRCODE='23514'; END IF;
 IF NEW.kind='CORRECTION' THEN
  IF NOT EXISTS(SELECT 1 FROM "StockLot" WHERE id=NEW."lotId" AND "originId"=NEW."originId")
  OR NEW.payload->'input'->>'lotId' IS DISTINCT FROM NEW."lotId"::text OR NEW.payload->'input'->>'state' IS DISTINCT FROM NEW.state
  OR NEW.payload->'input'->>'observedQuantity' IS DISTINCT FROM NEW."observedQuantity"::text
  OR NEW.payload->'preview'->'target'->>'lotId' IS DISTINCT FROM NEW."lotId"::text OR NEW.payload->'preview'->'target'->>'state' IS DISTINCT FROM NEW.state
  OR NEW.payload->'preview'->'target'->>'ledgerQuantity' IS DISTINCT FROM NEW."ledgerQuantity"::text
  OR NEW.payload->'preview'->'target'->>'projectionQuantity' IS DISTINCT FROM NEW."projectionQuantity"::text THEN
  RAISE EXCEPTION 'Correction request must retain its exact lot and factual observation' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(CASE WHEN "toState"=NEW.state THEN quantity ELSE -quantity END),0) INTO actual FROM "StockMovement"
   WHERE "lotId"=NEW."lotId" AND ("toState"=NEW.state OR "fromState"=NEW.state);
  SELECT COALESCE((SELECT quantity FROM "StockBalance" WHERE "lotId"=NEW."lotId" AND state=NEW.state),0) INTO projected;
  IF actual<>NEW."ledgerQuantity" OR projected<>NEW."projectionQuantity" THEN RAISE EXCEPTION 'Correction evidence must preserve accepted ledger and projection quantities' USING ERRCODE='23514'; END IF;
 ELSE
  IF jsonb_typeof(NEW.payload->'preview'->'units') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.payload->'preview'->'units')<>NEW."unitCount"
  OR jsonb_typeof(NEW.payload->'input'->'unitIds') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.payload->'input'->'unitIds')<>NEW."unitCount"
  OR EXISTS(SELECT 1 FROM "AuthorizationRequestUnit" x LEFT JOIN "StockUnit" u ON u.id=x."unitId" LEFT JOIN "UnitState" s ON s."unitId"=u.id
   LEFT JOIN "UnitEvent" e ON e.id=x."previousEventId" LEFT JOIN "DamageLine" bad ON bad.id=x."damageLineId"
   WHERE x."requestId"=NEW.id AND (x."originId"<>NEW."originId" OR u."originId"<>NEW."originId" OR x."lotId"<>u."lotId" OR s."unitId" IS NULL OR s.state<>'D'
   OR s."lastEventId"<>x."previousEventId" OR s.version<>x."recordedVersion" OR e.ordinal<>x."recordedVersion" OR e.id IS NULL OR e."unitId"<>u.id OR e."toState"<>'D'
   OR (x."damageLineId" IS NULL AND NOT(e.kind='RECEIVED' AND u."initialState"='D'))
   OR (x."damageLineId" IS NOT NULL AND (bad.id IS NULL OR bad."unitId"<>u.id OR bad."eventId"<>e.id))
   OR x.snapshot->>'recordedVersion' IS DISTINCT FROM x."recordedVersion"::text OR x.snapshot->>'previousEventId' IS DISTINCT FROM e.id::text
   OR x.snapshot->'unit'->>'unitId' IS DISTINCT FROM u.id::text OR x.snapshot->'unit'->>'unitCode' IS DISTINCT FROM u."unitCode"
   OR NOT(NEW.payload->'input'->'unitIds' @> jsonb_build_array(u.id::text))
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.payload->'members') member WHERE member->>'id'=x.id::text AND member->>'unitId'=u.id::text)
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.payload->'preview'->'units') candidate WHERE candidate=x.snapshot)
   OR x.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
  RAISE EXCEPTION 'Recovery request requires exact currently damaged units and original damage/intake provenance' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.dayari_close_complete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='inventory.day.close' AND response->>'id'=NEW.id::text AND response->>'snapshotHash'=NEW."snapshotHash")
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole" IN ('ADMIN','MANAGER') AND action='inventory.day.closed' AND "subjectId"=NEW.id AND snapshot->>'snapshotHash'=NEW."snapshotHash")
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "originSequence"=NEW."originSequence" AND "actorId"=NEW."actorId" AND "eventType"='inventory.day.closed' AND "aggregateId"=NEW.id AND payload->>'snapshotHash'=NEW."snapshotHash")
 OR EXISTS(SELECT 1 FROM "StockTransaction" WHERE "commandId"=NEW."commandId") OR EXISTS(SELECT 1 FROM "UnitEvent" WHERE "commandId"=NEW."commandId") THEN RAISE EXCEPTION 'Incomplete or stock-changing daily close' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.dayari_close_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE seq bigint;
BEGIN
 SELECT "nextSequence" INTO seq FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP' FOR UPDATE;
 IF seq IS NULL OR seq<>NEW."originSequence" OR NEW."businessDate">(NEW."recordedAt" AT TIME ZONE 'Africa/Lagos')::date OR NEW."recordedAt">clock_timestamp()+interval '1 second'
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND u.role IN ('ADMIN','MANAGER') AND u.active AND NOT u."mustChangePassword" AND m."originId"=NEW."originId")
 OR NEW.snapshot IS DISTINCT FROM dayari_closing_snapshot(NEW."originId",NEW."businessDate",NEW."recordedAt",NEW."cutoffSequence")
 OR jsonb_array_length(NEW.snapshot->'blockers')<>0 THEN RAISE EXCEPTION 'Closing requires an active shop Manager and complete unblocked authoritative snapshot' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.dayari_count_complete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='inventory.count.'||lower(TG_TABLE_NAME) AND (response->>'id'=NEW.id::text OR (TG_TABLE_NAME='CountObservation' AND response->'observationIds' @> jsonb_build_array(NEW.id::text))))
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole" IN ('ADMIN','MANAGER') AND ("subjectId"=NEW.id OR TG_TABLE_NAME='CountObservation') AND action='inventory.count.'||lower(TG_TABLE_NAME))
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND ("aggregateId"=NEW.id OR TG_TABLE_NAME='CountObservation') AND "eventType"='inventory.count.'||lower(TG_TABLE_NAME))
 OR EXISTS(SELECT 1 FROM "StockTransaction" WHERE "commandId"=NEW."commandId") OR EXISTS(SELECT 1 FROM "UnitEvent" WHERE "commandId"=NEW."commandId") THEN RAISE EXCEPTION 'Incomplete or stock-changing count command' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.dayari_count_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE c "CountSession";a "CountAttempt";r "CountResult";matched "CountResult";other "CountAttempt";
BEGIN
 PERFORM id FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId" AND m."originId"=NEW."originId" AND u.active AND NOT u."mustChangePassword" AND u.role IN ('ADMIN','MANAGER')) THEN RAISE EXCEPTION 'Counts require an active shop Admin or Manager' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='CountSession' THEN
  IF NOT EXISTS(SELECT 1 FROM "StockLot" l JOIN "LotSerialization" s ON s."lotId"=l.id WHERE l.id=NEW."lotId" AND l."originId"=NEW."originId") THEN RAISE EXCEPTION 'Invalid count lot' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='CountAttempt' THEN
  SELECT * INTO STRICT c FROM "CountSession" WHERE id=NEW."sessionId";
  IF c."originId"<>NEW."originId" OR NEW.snapshot IS DISTINCT FROM dayari_count_snapshot(c."lotId",c.state) OR EXISTS(SELECT 1 FROM "CountAttempt" prior WHERE prior."sessionId"=c.id AND NOT EXISTS(SELECT 1 FROM "CountResult" WHERE "attemptId"=prior.id)) THEN RAISE EXCEPTION 'Invalid or concurrent count attempt' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME IN ('CountObservation','CountResult') THEN
  SELECT * INTO STRICT a FROM "CountAttempt" WHERE id=NEW."attemptId";SELECT * INTO STRICT c FROM "CountSession" WHERE id=a."sessionId";
  IF a."originId"<>NEW."originId" OR EXISTS(SELECT 1 FROM "CountResult" WHERE "attemptId"=a.id) THEN RAISE EXCEPTION 'Count attempt unavailable or finalized' USING ERRCODE='23514';END IF;
  IF TG_TABLE_NAME='CountObservation' THEN
   IF a.snapshot->>'mode'<>'NATIVE' OR NOT EXISTS(SELECT 1 FROM "StockUnit" WHERE id=NEW."unitId" AND "lotId"=c."lotId" AND "originId"=NEW."originId") THEN RAISE EXCEPTION 'Count observation requires exact native lot unit' USING ERRCODE='23514';END IF;
  ELSE
   IF NEW.status IS DISTINCT FROM dayari_count_status(a.id,NEW."observedQuantity",NEW."unidentifiedExtras") OR
    (a.snapshot->>'mode'='NATIVE' AND NEW."observedQuantity"<>(SELECT count(*) FROM "CountObservation" WHERE "attemptId"=a.id)+NEW."unidentifiedExtras") OR
    (a.snapshot->>'mode'='LEGACY' AND NEW."unidentifiedExtras"<>0) THEN RAISE EXCEPTION 'Count result must reconcile actual evidence' USING ERRCODE='23514';END IF;
  END IF;
 ELSE
  SELECT * INTO STRICT r FROM "CountResult" WHERE id=NEW."resultId";SELECT * INTO STRICT matched FROM "CountResult" WHERE id=NEW."matchingResultId";
  SELECT * INTO STRICT a FROM "CountAttempt" WHERE id=r."attemptId";SELECT * INTO STRICT other FROM "CountAttempt" WHERE id=matched."attemptId";SELECT * INTO STRICT c FROM "CountSession" WHERE id=a."sessionId";
  IF r."originId"<>NEW."originId" OR matched."originId"<>NEW."originId" OR a."sessionId"<>other."sessionId" OR r.status<>'MISMATCH' OR matched.status<>'MATCHED' OR matched."recordedAt"<=r."recordedAt" OR other.snapshot->>'fingerprint' IS DISTINCT FROM dayari_count_snapshot(c."lotId",c.state)->>'fingerprint' THEN RAISE EXCEPTION 'Mistaken finding requires later matching same-scope recount' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.dayari_damage_complete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE is_bad boolean:=TG_TABLE_NAME='DamageReport'; removed boolean; action_name text; command_name text; expected_type text; root_tx uuid; n bigint;
BEGIN
 removed:=NOT is_bad AND to_jsonb(NEW)->>'outcome' IN ('DISCARDED','RETURNED_TO_VENDOR');
 action_name:=CASE WHEN is_bad THEN 'inventory.damage.reported' ELSE 'inventory.damage.reviewed' END;
 command_name:=CASE WHEN is_bad THEN 'inventory.damage.report' ELSE 'inventory.damage.review' END;
 expected_type:=CASE WHEN is_bad THEN 'DAMAGE' ELSE 'DISPOSITION' END;
 root_tx:=NEW."transactionId";
 IF NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=NEW."actorId"
  AND u.active AND NOT u."mustChangePassword" AND u.role=NEW."actorRole" AND m."originId"=NEW."originId"
  AND (is_bad OR u.role IN ('ADMIN','MANAGER')))
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"=command_name)
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole"=NEW."actorRole"
  AND "subjectId"=NEW.id AND action=action_name AND snapshot->>'manifestHash'=NEW."manifestHash")
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId"
  AND "aggregateId"=NEW.id AND "eventType"=action_name AND payload->>'manifestHash'=NEW."manifestHash") THEN
 RAISE EXCEPTION 'Incomplete or unauthorized damage command evidence' USING ERRCODE='23514'; END IF;
 IF is_bad OR removed THEN
  IF NOT EXISTS(SELECT 1 FROM "StockTransaction" t JOIN "OutboxEvent" o ON o."commandId"=t."commandId" WHERE t.id=root_tx
   AND t.type=expected_type AND t."batchId" IS NULL AND t."originId"=NEW."originId" AND t."commandId"=NEW."commandId"
   AND t."actorId"=NEW."actorId" AND t."actorRole"=NEW."actorRole" AND t."recordedAt"=NEW."recordedAt"
   AND t."originSequence"=o."originSequence" AND t.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)
  OR (SELECT count(*) FROM "StockMovement" WHERE "transactionId"=root_tx)<>NEW."unitCount"
  OR (SELECT count(*) FROM "UnitEvent" WHERE "commandId"=NEW."commandId")<>NEW."unitCount" THEN
  RAISE EXCEPTION 'Incomplete damage transaction group' USING ERRCODE='23514'; END IF;
 ELSE
  IF root_tx IS NOT NULL OR EXISTS(SELECT 1 FROM "StockTransaction" WHERE "commandId"=NEW."commandId") OR EXISTS(SELECT 1 FROM "UnitEvent" WHERE "commandId"=NEW."commandId") THEN
  RAISE EXCEPTION 'Held and reworked reviews cannot move stock' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT count(*) INTO n FROM (
  SELECT id FROM "DamageLine" WHERE is_bad AND "reportId"=NEW.id UNION ALL
  SELECT id FROM "DamageReviewLine" WHERE NOT is_bad AND "reviewId"=NEW.id) lines;
 IF n<>NEW."unitCount" OR (SELECT count(DISTINCT member->>'id') FROM jsonb_array_elements(NEW.manifest) member)<>n THEN
 RAISE EXCEPTION 'Incomplete exact damage membership' USING ERRCODE='23514'; END IF;
 IF EXISTS(WITH lines AS (
  SELECT id,"originId","unitId","lotId","batchId","fromState","previousEventId","checkoutLineId",NULL::uuid AS "damageLineId","movementId","eventId",snapshot,xmin::text AS created_xid
   FROM "DamageLine" WHERE is_bad AND "reportId"=NEW.id UNION ALL
  SELECT id,"originId","unitId","lotId","batchId",'D',"previousEventId",NULL::uuid,"damageLineId","movementId","eventId",snapshot,xmin::text
   FROM "DamageReviewLine" WHERE NOT is_bad AND "reviewId"=NEW.id)
 SELECT 1 FROM lines x LEFT JOIN "StockUnit" u ON u.id=x."unitId" LEFT JOIN "StockLot" l ON l.id=u."lotId"
 LEFT JOIN "UnitState" s ON s."unitId"=u.id LEFT JOIN "UnitEvent" prior ON prior.id=x."previousEventId"
 LEFT JOIN "StockMovement" m ON m.id=x."movementId" LEFT JOIN "UnitEvent" e ON e.id=x."eventId"
 LEFT JOIN "CheckoutLine" checkout_line ON checkout_line.id=x."checkoutLineId"
 LEFT JOIN "Checkout" checkout ON checkout.id=checkout_line."checkoutId"
 LEFT JOIN "DamageLine" bad ON bad.id=x."damageLineId"
 LEFT JOIN LATERAL (SELECT member FROM jsonb_array_elements(NEW.manifest) member WHERE member->>'id'=x.id::text) manifest ON true
 WHERE u.id IS NULL OR l.id IS NULL OR s."unitId" IS NULL OR prior.id IS NULL OR manifest.member IS NULL
 OR x."originId"<>NEW."originId" OR u."originId"<>NEW."originId" OR l."originId"<>NEW."originId"
 OR x."lotId"<>u."lotId" OR x."batchId"<>l."batchId" OR prior."unitId"<>u.id OR prior."lotId"<>l.id OR prior."toState"<>x."fromState"
 OR x.created_xid<>(pg_current_xact_id()::text::numeric%4294967296)::text
 OR manifest.member->>'unitId' IS DISTINCT FROM u.id::text
 OR x.snapshot->'unit'->>'unitId' IS DISTINCT FROM u.id::text OR x.snapshot->'unit'->>'unitCode' IS DISTINCT FROM u."unitCode"
 OR x.snapshot->'unit'->>'lotId' IS DISTINCT FROM l.id::text OR x.snapshot->'unit'->>'skuId' IS DISTINCT FROM l."skuId"::text
 OR x.snapshot->'unit'->>'batchId' IS DISTINCT FROM l."batchId"::text
 OR NOT EXISTS(SELECT 1 FROM "ReceiptLine" rl WHERE rl.id=u."receiptLineId" AND x.snapshot->>'receiptId'=rl."receiptId"::text)
 OR NOT EXISTS(SELECT 1 FROM "SupplierVariantSku" sku WHERE sku.id=l."skuId" AND x.snapshot->'unit'->>'fullSku'=sku."fullCode"
  AND x.snapshot->'unit'->>'productId'=sku."productId"::text AND x.snapshot->'unit'->>'variantId'=sku."variantId"::text)
 OR (is_bad AND x."fromState"='P' AND x.snapshot->'recordedHolder'->>'id' IS DISTINCT FROM checkout."actorId"::text)
 OR (is_bad AND x."fromState"='U' AND x.snapshot->'recordedHolder' IS DISTINCT FROM 'null'::jsonb)

 OR (is_bad AND x."fromState"='P' AND (checkout_line.id IS NULL OR checkout_line."unitId"<>u.id OR checkout_line."eventId"<>prior.id
   OR checkout."originId"<>NEW."originId" OR (NEW."actorRole"='PRODUCTION' AND checkout."actorId"<>NEW."actorId")))
 OR (is_bad AND x."fromState"='U' AND NEW."actorRole"='PRODUCTION')
 OR (NOT is_bad AND ((x."damageLineId" IS NULL AND NOT(prior.kind='RECEIVED' AND u."initialState"='D'))
  OR (x."damageLineId" IS NOT NULL AND (bad.id IS NULL OR bad."unitId"<>u.id OR bad."eventId"<>prior.id))))
 OR ((is_bad OR removed) AND (m.id IS NULL OR e.id IS NULL OR m."transactionId"<>root_tx OR m."lotId"<>l.id OR m."batchId"<>l."batchId"
  OR m.quantity<>1 OR m."fromState"<>x."fromState" OR m."toState"<>CASE WHEN is_bad THEN 'D' ELSE 'X' END
  OR (is_bad AND m."damageLineId" IS DISTINCT FROM x.id) OR (NOT is_bad AND m."damageReviewLineId" IS DISTINCT FROM x.id)
  OR e."movementId"<>m.id OR e."unitId"<>u.id OR e."originId"<>NEW."originId" OR e."lotId"<>l.id
  OR e."commandId"<>NEW."commandId" OR e."actorId"<>NEW."actorId" OR e."actorRole"<>NEW."actorRole" OR e."recordedAt"<>NEW."recordedAt"
  OR e."previousEventId"<>prior.id OR e.ordinal<>prior.ordinal+1 OR e."fromState"<>x."fromState" OR e."toState"<>m."toState"
  OR (is_bad AND (e.kind<>'BAD_REPORTED' OR e."damageLineId" IS DISTINCT FROM x.id))
  OR (NOT is_bad AND (e.kind<>'DAMAGE_REMOVED' OR e."damageReviewLineId" IS DISTINCT FROM x.id))
  OR s.state<>e."toState" OR s."lastEventId"<>e.id OR s.version<>e.ordinal
  OR m.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text OR e.xmin::text<>(pg_current_xact_id()::text::numeric%4294967296)::text))
 OR (NOT is_bad AND NOT removed AND (x."movementId" IS NOT NULL OR x."eventId" IS NOT NULL OR s.state<>'D' OR s."lastEventId"<>prior.id OR s.version<>prior.ordinal))) THEN
 RAISE EXCEPTION 'Damage provenance, permission, unit state, manifest or movement mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(WITH lots AS (
 SELECT "lotId" FROM "DamageLine" WHERE is_bad AND "reportId"=NEW.id UNION SELECT "lotId" FROM "DamageReviewLine" WHERE NOT is_bad AND "reviewId"=NEW.id),
 counts AS (SELECT s."lotId",s.state,count(*) AS n FROM "UnitState" s JOIN lots l ON l."lotId"=s."lotId" GROUP BY s."lotId",s.state)
 SELECT 1 FROM lots l CROSS JOIN (VALUES('U'),('P'),('D'),('C'),('X')) states(state)
 LEFT JOIN counts c ON c."lotId"=l."lotId" AND c.state=states.state LEFT JOIN "StockBalance" b ON b."lotId"=l."lotId" AND b.state=states.state
 WHERE COALESCE(c.n,0)<>COALESCE(b.quantity,0)) THEN
 RAISE EXCEPTION 'Damage unit census must match ledger projections' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $function$;
COMMIT;
