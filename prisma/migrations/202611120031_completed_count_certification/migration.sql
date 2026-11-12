-- Preserve completed matching evidence. Only unfinished or stale attempts require recount.
BEGIN;
CREATE INDEX "StockLot_originId_id_idx" ON "StockLot"("originId",id);
CREATE INDEX "AuditEvent_originId_commandId_idx" ON "AuditEvent"("originId","commandId");
CREATE INDEX "CountAttempt_sessionId_recordedAt_id_idx" ON "CountAttempt"("sessionId","recordedAt",id);
CREATE INDEX "StockTransaction_originId_recordedAt_originSequence_idx" ON "StockTransaction"("originId","recordedAt","originSequence");
CREATE OR REPLACE FUNCTION dayari_closing_snapshot(shop uuid, business_day date, cutoff timestamptz, sequence_limit bigint)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET plan_cache_mode = 'force_custom_plan' AS $$
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
  SELECT 'CERTIFICATION_APPROVAL',r.id::text,'Correction awaits deferred cloud authorization','requests'
  FROM "AuthorizationRequest" r WHERE r."originId"=shop AND r.kind='CORRECTION' AND r."recordedAt"<end_at AND r."recordedAt"<=cutoff
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
END $$;

COMMIT;
