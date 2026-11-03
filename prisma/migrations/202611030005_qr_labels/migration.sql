CREATE TABLE "LabelPrintJob" (
 id uuid PRIMARY KEY, "receiptId" uuid NOT NULL REFERENCES "Receipt"(id) ON DELETE RESTRICT,
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id) ON DELETE RESTRICT, "actorId" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 kind text NOT NULL CHECK (kind IN ('INITIAL','REPRINT')), "originalJobId" uuid REFERENCES "LabelPrintJob"(id) ON DELETE RESTRICT,
 reason text NOT NULL, profile jsonb NOT NULL, "rendererVersion" text NOT NULL, "manifestHash" text NOT NULL,
 "totalCopies" bigint NOT NULL CHECK ("totalCopies">0), "createdAt" timestamptz(6) NOT NULL,
 CHECK ((kind='INITIAL' AND "originalJobId" IS NULL) OR (kind='REPRINT' AND "originalJobId" IS NOT NULL AND length(btrim(reason))>=10))
);
CREATE UNIQUE INDEX label_one_initial ON "LabelPrintJob"("receiptId") WHERE kind='INITIAL';
CREATE INDEX ON "LabelPrintJob"("receiptId","createdAt");
CREATE TABLE "LabelPrintJobLine" (
 id uuid PRIMARY KEY, "jobId" uuid NOT NULL REFERENCES "LabelPrintJob"(id) ON DELETE RESTRICT,
 "receiptLineId" uuid NOT NULL REFERENCES "ReceiptLine"(id) ON DELETE RESTRICT, "lotId" uuid NOT NULL REFERENCES "StockLot"(id) ON DELETE RESTRICT,
 purpose text NOT NULL CHECK (purpose IN ('USABLE','DAMAGED_INTAKE')), copies bigint NOT NULL CHECK(copies>0), payload text NOT NULL CHECK(length(payload)=71),
 content jsonb NOT NULL, ordinal integer NOT NULL CHECK(ordinal>0), UNIQUE("jobId","lotId",purpose), UNIQUE("jobId",ordinal)
);
CREATE TABLE "LabelPrintEvent" (
 id uuid PRIMARY KEY, "jobId" uuid NOT NULL REFERENCES "LabelPrintJob"(id) ON DELETE RESTRICT,
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id) ON DELETE RESTRICT, "actorId" uuid NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 kind text NOT NULL CHECK(kind IN ('REQUESTED','ARTIFACT_READY','HANDOFF_REQUESTED','DIALOG_OPENED','OPERATOR_REPORTED_PRINTED','CANCELLED_BEFORE_HANDOFF','FAILED','OUTCOME_UNKNOWN')),
 chunk text NOT NULL CHECK(chunk ~ '^(0|[1-9][0-9]{0,11})$'), "attemptId" uuid NOT NULL, copies bigint NOT NULL CHECK(copies BETWEEN 0 AND 500),
 "artifactHash" text, note text NOT NULL, "createdAt" timestamptz(6) NOT NULL
);
CREATE INDEX ON "LabelPrintEvent"("jobId","createdAt");
CREATE UNIQUE INDEX label_artifact_once ON "LabelPrintEvent"("jobId",chunk) WHERE kind='ARTIFACT_READY';
CREATE UNIQUE INDEX label_attempt_event_once ON "LabelPrintEvent"("jobId","attemptId",kind) WHERE kind NOT IN ('ARTIFACT_READY','REQUESTED');
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['LabelPrintJob','LabelPrintJobLine','LabelPrintEvent'] LOOP
 EXECUTE format('CREATE TRIGGER label_history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change()',t);
END LOOP; END $$;
CREATE FUNCTION dayari_label_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j "LabelPrintJob"; l "ReceiptLine"; b "DeliveryBatch"; xid text; expected text;
BEGIN
 SELECT * INTO j FROM "LabelPrintJob" WHERE id=NEW."jobId";
 SELECT xmin::text INTO xid FROM "LabelPrintJob" WHERE id=NEW."jobId";
 IF xid IS DISTINCT FROM (pg_current_xact_id()::text::numeric % 4294967296)::text THEN RAISE EXCEPTION 'Print manifest is closed' USING ERRCODE='23514'; END IF;
 SELECT * INTO l FROM "ReceiptLine" WHERE id=NEW."receiptLineId";
 SELECT * INTO b FROM "DeliveryBatch" WHERE id=l."batchId";
 expected := 'DYI:1:' || upper(replace(b."originId"::text,'-','')) || ':' || upper(replace(l."lotId"::text,'-',''));
 IF l."receiptId"<>j."receiptId" OR l."lotId"<>NEW."lotId" OR b."originId"<>j."originId" OR NEW.payload<>expected
 OR (NEW.purpose='USABLE' AND l."usableQuantity"=0) OR (NEW.purpose='DAMAGED_INTAKE' AND l."damagedQuantity"=0) THEN RAISE EXCEPTION 'Print manifest provenance mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER label_line_guard BEFORE INSERT ON "LabelPrintJobLine" FOR EACH ROW EXECUTE FUNCTION dayari_label_line_guard();
CREATE FUNCTION dayari_label_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid uuid; j "LabelPrintJob";
BEGIN
 IF TG_TABLE_NAME='LabelPrintJob' THEN jid:=NEW.id; ELSE jid:=NEW."jobId"; END IF;
 SELECT * INTO j FROM "LabelPrintJob" WHERE id=jid;
 IF j."totalCopies"<>(SELECT COALESCE(sum(copies),0) FROM "LabelPrintJobLine" WHERE "jobId"=jid)
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" c WHERE c.id=j."commandId" AND c."originId"=j."originId" AND c."actorId"=j."actorId")
 OR (j.kind='INITIAL' AND EXISTS (SELECT 1 FROM "ReceiptLine" l WHERE l."receiptId"=j."receiptId" AND
 (l."usableQuantity"<>COALESCE((SELECT copies FROM "LabelPrintJobLine" WHERE "jobId"=jid AND "receiptLineId"=l.id AND purpose='USABLE'),0)
 OR l."damagedQuantity"<>COALESCE((SELECT copies FROM "LabelPrintJobLine" WHERE "jobId"=jid AND "receiptLineId"=l.id AND purpose='DAMAGED_INTAKE'),0))))
 THEN RAISE EXCEPTION 'Incomplete print manifest' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER label_job_complete AFTER INSERT ON "LabelPrintJob" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_label_complete();
CREATE CONSTRAINT TRIGGER label_lines_complete AFTER INSERT ON "LabelPrintJobLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_label_complete();
