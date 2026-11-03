-- Strengthen print metadata only; no stock table or prior migration is changed.
CREATE FUNCTION dayari_label_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid uuid; cmd uuid; actor uuid; origin uuid; j "LabelPrintJob"; c "CommandResult";
BEGIN
 IF TG_TABLE_NAME='LabelPrintJob' THEN jid:=NEW.id; ELSE jid:=NEW."jobId"; END IF;
 SELECT * INTO j FROM "LabelPrintJob" WHERE id=jid;
 cmd:=NEW."commandId";actor:=NEW."actorId";origin:=NEW."originId";
 SELECT * INTO c FROM "CommandResult" WHERE id=cmd;
 IF origin<>j."originId" OR NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=origin AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" WHERE id=actor AND active AND role IN ('ADMIN','MANAGER'))
 OR c.id IS NULL OR c."actorId"<>actor OR c."originId"<>origin OR c."commandType" NOT LIKE 'labels.%'
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=cmd AND "actorId"=actor AND "originId"=origin)
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=cmd AND "actorId"=actor AND "originId"=origin)
 THEN RAISE EXCEPTION 'Invalid label command evidence' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='LabelPrintJob' THEN
  IF NOT EXISTS(SELECT 1 FROM "Receipt" r JOIN "DeliveryBatch" b ON b.id=r."batchId" WHERE r.id=j."receiptId" AND b."originId"=origin)
  OR (j.kind='REPRINT' AND NOT EXISTS(SELECT 1 FROM "LabelPrintJob" original WHERE original.id=j."originalJobId" AND original."receiptId"=j."receiptId" AND original."originId"=origin AND original.profile=j.profile AND original."rendererVersion"=j."rendererVersion")) THEN
   RAISE EXCEPTION 'Invalid original print provenance' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER label_job_evidence AFTER INSERT ON "LabelPrintJob" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_label_evidence_guard();
CREATE CONSTRAINT TRIGGER label_event_evidence AFTER INSERT ON "LabelPrintEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_label_evidence_guard();
CREATE FUNCTION dayari_reprint_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j "LabelPrintJob";
BEGIN
 SELECT * INTO j FROM "LabelPrintJob" WHERE id=NEW."jobId";
 IF j.kind='REPRINT' AND (NEW.copies>10000 OR NOT EXISTS(SELECT 1 FROM "LabelPrintJobLine" original WHERE original."jobId"=j."originalJobId" AND original."receiptLineId"=NEW."receiptLineId" AND original."lotId"=NEW."lotId" AND original.purpose=NEW.purpose AND original.payload=NEW.payload AND original.content=NEW.content)) THEN
  RAISE EXCEPTION 'Reprint must preserve original label content' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reprint_line_provenance BEFORE INSERT ON "LabelPrintJobLine" FOR EACH ROW EXECUTE FUNCTION dayari_reprint_line_guard();
