-- Validate bulk inserts as sets; preserve all row-level foreign keys, checks and immutable history.
BEGIN;
CREATE FUNCTION dayari_unit_insert_guard_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM inserted n WHERE NOT EXISTS(SELECT 1 FROM "StockLot" l JOIN "LotSerialization" p ON p."lotId"=l.id AND p.mode='NATIVE'
  JOIN "ReceiptLine" r ON r."lotId"=l.id JOIN "StockMovement" m ON m."receiptLineId"=r.id AND m.id=n."initialMovementId"
  JOIN "StockTransaction" t ON t.id=m."transactionId"
  WHERE l.id=n."lotId" AND l."originId"=n."originId" AND r.id=n."receiptLineId" AND m."toState"=n."initialState"
  AND t."commandId"=n."registrationCommandId" AND t."actorId"=n."actorId" AND t."actorRole"=n."actorRole" AND t."recordedAt"=n."recordedAt"
  AND l.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
  RAISE EXCEPTION 'Unit must belong to its exact newly accepted receipt movement' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER unit_insert_guard ON "StockUnit";
CREATE TRIGGER unit_insert_guard AFTER INSERT ON "StockUnit" REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION dayari_unit_insert_guard_set();
CREATE FUNCTION dayari_unit_event_guard_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM inserted n WHERE NOT EXISTS(SELECT 1 FROM "StockUnit" u WHERE u.id=n."unitId" AND u."lotId"=n."lotId" AND u."originId"=n."originId"
  AND u."registrationCommandId"=n."commandId" AND u."initialMovementId"=n."movementId" AND u."initialState"=n."toState"
  AND u."actorId"=n."actorId" AND u."actorRole"=n."actorRole" AND u."recordedAt"=n."recordedAt"
  AND u.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text)) THEN
  RAISE EXCEPTION 'Invalid unit receiving event' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER unit_event_insert_guard ON "UnitEvent";
CREATE TRIGGER unit_event_insert_guard AFTER INSERT ON "UnitEvent" REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION dayari_unit_event_guard_set();
CREATE FUNCTION dayari_unit_state_insert_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM inserted n WHERE NOT EXISTS(SELECT 1 FROM "UnitEvent" e WHERE e.id=n."lastEventId" AND e."unitId"=n."unitId" AND e."lotId"=n."lotId" AND e."originId"=n."originId" AND e.ordinal=n.version AND e."toState"=n.state)) THEN
 RAISE EXCEPTION 'Unit projection must match immutable events' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER unit_state_guard ON "UnitState";
CREATE TRIGGER unit_state_guard BEFORE UPDATE OR DELETE ON "UnitState" FOR EACH ROW EXECUTE FUNCTION dayari_unit_state_guard();
CREATE TRIGGER unit_state_insert_guard AFTER INSERT ON "UnitState" REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION dayari_unit_state_insert_set();
COMMIT;
