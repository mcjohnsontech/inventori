BEGIN;
CREATE OR REPLACE FUNCTION dayari_unit_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Unit projection cannot be removed without matching history' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW."unitId"<>OLD."unitId" OR NEW."lotId"<>OLD."lotId" OR NEW."originId"<>OLD."originId") THEN
  RAISE EXCEPTION 'Unit projection identity is immutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "UnitEvent" e WHERE e.id=NEW."lastEventId" AND e."unitId"=NEW."unitId" AND e."lotId"=NEW."lotId"
  AND e."originId"=NEW."originId" AND e.ordinal=NEW.version AND e."toState"=NEW.state) THEN
  RAISE EXCEPTION 'Unit projection must match immutable events' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
