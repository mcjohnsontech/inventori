-- Keep indexed UUID joins while validating exact receipt membership. Malformed UUIDs reject the transaction.
BEGIN;
CREATE OR REPLACE FUNCTION dayari_validate_receipt_units() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid; total bigint; member_count bigint; distinct_count bigint;
BEGIN
 SELECT "commandId" INTO cid FROM "StockTransaction" WHERE id=NEW."transactionId";
 SELECT sum("totalQuantity") INTO total FROM "ReceiptLine" WHERE "receiptId"=NEW.id;
 IF total>10000 OR total IS NULL OR NOT EXISTS(SELECT 1 FROM "SerializationCutover" c WHERE c."originId"=(SELECT "originId" FROM "DeliveryBatch" WHERE id=NEW."batchId")) THEN
  RAISE EXCEPTION 'Serialized receipt exceeds capacity or lacks cutover provenance' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM "ReceiptLine" r JOIN "StockLot" l ON l.id=r."lotId" LEFT JOIN "LotSerialization" p ON p."lotId"=l.id
  WHERE r."receiptId"=NEW.id AND (p.mode IS DISTINCT FROM 'NATIVE' OR p."originId"<>l."originId"
   OR (SELECT count(*) FROM "StockUnit" u WHERE u."receiptLineId"=r.id AND u."initialState"='U')<>r."usableQuantity"
   OR (SELECT count(*) FROM "StockUnit" u WHERE u."receiptLineId"=r.id AND u."initialState"='D')<>r."damagedQuantity")) THEN
  RAISE EXCEPTION 'Receipt units do not exactly match usable/damaged intake' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM "StockUnit" u LEFT JOIN "UnitState" s ON s."unitId"=u.id LEFT JOIN "UnitEvent" e ON e.id=s."lastEventId"
  WHERE u."registrationCommandId"=cid AND (s."unitId" IS NULL OR e.id IS NULL OR s.state<>u."initialState" OR e."commandId"<>cid)) THEN
  RAISE EXCEPTION 'Incomplete initial unit event/projection group' USING ERRCODE='23514'; END IF;
 SELECT count(*),count(DISTINCT m->>'id') INTO member_count,distinct_count FROM "UnitCommandManifestPage" p CROSS JOIN LATERAL jsonb_array_elements(p.members) m WHERE p."commandId"=cid;
 IF member_count<>total OR distinct_count<>total OR NOT EXISTS(SELECT 1 FROM "UnitCommandManifestPage" WHERE "commandId"=cid)
  OR EXISTS(SELECT 1 FROM "UnitCommandManifestPage" p CROSS JOIN LATERAL jsonb_array_elements(p.members) m
    LEFT JOIN "StockUnit" u ON u.id=(m->>'id')::uuid LEFT JOIN "UnitEvent" e ON e.id=(m->>'eventId')::uuid
    WHERE p."commandId"=cid AND (u.id IS NULL OR e.id IS NULL OR u."registrationCommandId"<>cid OR e."unitId"<>u.id
     OR u."originId"<>p."originId" OR u."unitCode" IS DISTINCT FROM m->>'unitCode' OR u."lotId"::text IS DISTINCT FROM m->>'lotId'
     OR u."initialState" IS DISTINCT FROM m->>'state')) THEN
  RAISE EXCEPTION 'Incomplete, duplicated or unrelated unit manifest' USING ERRCODE='23514'; END IF;
 IF (SELECT min(ordinal)<>0 OR max(ordinal)<>count(*)-1 FROM "UnitCommandManifestPage" WHERE "commandId"=cid) THEN
  RAISE EXCEPTION 'Unit manifest pages must be contiguous' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
COMMIT;
