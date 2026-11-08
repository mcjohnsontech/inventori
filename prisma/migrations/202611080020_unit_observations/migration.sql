-- Isolated implementation; no operational migration authorized.
BEGIN;
CREATE TABLE "UnitObservation" (
 id uuid PRIMARY KEY,
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "unitId" uuid NOT NULL,
 "lotId" uuid NOT NULL,
 "actorId" uuid NOT NULL REFERENCES "User"(id),
 "actorRole" "Role" NOT NULL,
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 method text NOT NULL CHECK(method IN ('CAMERA','QR_INPUT')),
 "recordedAt" timestamptz(6) NOT NULL,
 FOREIGN KEY("unitId","lotId") REFERENCES "StockUnit"(id,"lotId")
);
CREATE INDEX "UnitObservation_unitId_recordedAt_id_idx" ON "UnitObservation"("unitId","recordedAt",id);
CREATE INDEX "UnitObservation_originId_actorId_recordedAt_idx" ON "UnitObservation"("originId","actorId","recordedAt");
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON "UnitObservation"
 FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE FUNCTION dayari_unit_observation_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "StockUnit" WHERE id=NEW."unitId" AND "lotId"=NEW."lotId" AND "originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=NEW."originId" AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id
  WHERE u.id=NEW."actorId" AND u.active AND NOT u."mustChangePassword" AND u.role=NEW."actorRole" AND m."originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "commandType"='units.qr.present')
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "actorRole"=NEW."actorRole" AND "subjectId"=NEW.id AND action='units.qr.present')
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."actorId" AND "aggregateId"=NEW.id AND "eventType"='units.qr.present') THEN
  RAISE EXCEPTION 'Incomplete or foreign unit QR presentation evidence' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER unit_observation_complete AFTER INSERT ON "UnitObservation"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_unit_observation_complete();
COMMIT;
