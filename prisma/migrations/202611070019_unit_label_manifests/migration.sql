-- Isolated development only until operational migration approval.
-- Existing DYI:1 print and inventory tables are not modified.
BEGIN;
CREATE TABLE "UnitLabelJob" (
 id uuid PRIMARY KEY,"originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),
 "actorRole" "Role" NOT NULL CHECK("actorRole" IN ('ADMIN','MANAGER')),
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 kind text NOT NULL CHECK(kind IN ('INITIAL','REPRINT')),"originalJobId" uuid REFERENCES "UnitLabelJob"(id),reason text NOT NULL,
 profile jsonb NOT NULL,"rendererVersion" text NOT NULL,"manifestHash" text NOT NULL,"canonicalManifest" text NOT NULL,
 "totalLabels" integer NOT NULL CHECK("totalLabels" BETWEEN 1 AND 500),"createdAt" timestamptz(6) NOT NULL,
 CHECK((kind='INITIAL' AND "originalJobId" IS NULL AND reason='') OR (kind='REPRINT' AND "originalJobId" IS NOT NULL AND length(btrim(reason))>=10)),
 CHECK("manifestHash"=encode(sha256(convert_to("canonicalManifest",'UTF8')),'hex')),
 CHECK(jsonb_typeof("canonicalManifest"::jsonb)='object')
);
CREATE INDEX "UnitLabelJob_originId_createdAt_idx" ON "UnitLabelJob"("originId","createdAt");
CREATE TABLE "UnitLabelLine" (
 id uuid PRIMARY KEY,"jobId" uuid NOT NULL REFERENCES "UnitLabelJob"(id),"unitId" uuid NOT NULL,
 "lotId" uuid NOT NULL,"receiptLineId" uuid NOT NULL REFERENCES "ReceiptLine"(id),ordinal integer NOT NULL CHECK(ordinal>0),
 purpose text NOT NULL CHECK(purpose IN ('USABLE','DAMAGED_INTAKE')),payload text NOT NULL CHECK(length(payload)=71),content jsonb NOT NULL,
 "originalLineId" uuid REFERENCES "UnitLabelLine"(id),
 FOREIGN KEY("unitId","lotId") REFERENCES "StockUnit"(id,"lotId"),UNIQUE("jobId","unitId"),UNIQUE("jobId",ordinal)
);
CREATE INDEX "UnitLabelLine_unitId_idx" ON "UnitLabelLine"("unitId");
CREATE TABLE "UnitLabelClaim" (
 "unitId" uuid PRIMARY KEY REFERENCES "StockUnit"(id),"lineId" uuid NOT NULL UNIQUE REFERENCES "UnitLabelLine"(id),
 "jobId" uuid NOT NULL REFERENCES "UnitLabelJob"(id)
);
CREATE TABLE "UnitLabelArtifact" (
 id uuid PRIMARY KEY,"jobId" uuid NOT NULL UNIQUE REFERENCES "UnitLabelJob"(id),"originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "actorId" uuid NOT NULL REFERENCES "User"(id),"actorRole" "Role" NOT NULL CHECK("actorRole" IN ('ADMIN','MANAGER')),
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 html text NOT NULL,pdf bytea NOT NULL,"htmlHash" text NOT NULL,"pdfHash" text NOT NULL,layout jsonb NOT NULL,
 pages integer NOT NULL CHECK(pages>0),"createdAt" timestamptz(6) NOT NULL,
 CHECK(length(html)>100 AND octet_length(pdf)>100),
 CHECK("htmlHash"=encode(sha256(convert_to(html,'UTF8')),'hex') AND "pdfHash"=encode(sha256(pdf),'hex'))
);
CREATE TABLE "UnitLabelEvent" (
 id uuid PRIMARY KEY,"jobId" uuid NOT NULL REFERENCES "UnitLabelJob"(id),"artifactId" uuid REFERENCES "UnitLabelArtifact"(id),
 "originId" uuid NOT NULL REFERENCES "OriginNode"(id),"actorId" uuid NOT NULL REFERENCES "User"(id),
 "actorRole" "Role" NOT NULL CHECK("actorRole" IN ('ADMIN','MANAGER')),
 "commandId" uuid NOT NULL UNIQUE REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 kind text NOT NULL CHECK(kind IN ('REQUESTED','ARTIFACT_READY','HANDOFF_REQUESTED')),"attemptId" uuid NOT NULL,"recordedAt" timestamptz(6) NOT NULL,
 CHECK((kind='REQUESTED' AND "artifactId" IS NULL) OR (kind<>'REQUESTED' AND "artifactId" IS NOT NULL)),
 UNIQUE("jobId",kind,"attemptId")
);
CREATE INDEX "UnitLabelEvent_jobId_recordedAt_idx" ON "UnitLabelEvent"("jobId","recordedAt");

CREATE FUNCTION dayari_unit_label_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j "UnitLabelJob";u "StockUnit";r "ReceiptLine";b "DeliveryBatch";old "UnitLabelLine";expected jsonb;
BEGIN
 SELECT * INTO j FROM "UnitLabelJob" WHERE id=NEW."jobId";
 IF NOT EXISTS(SELECT 1 FROM "UnitLabelJob" WHERE id=j.id AND xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
  RAISE EXCEPTION 'Unit label manifest is closed' USING ERRCODE='23514'; END IF;
 SELECT * INTO u FROM "StockUnit" WHERE id=NEW."unitId";
 IF u."originId"<>j."originId" OR u."lotId"<>NEW."lotId" OR u."receiptLineId"<>NEW."receiptLineId"
  OR NEW.payload<>'DYI:2:'||upper(replace(j."originId"::text,'-',''))||':'||upper(replace(u.id::text,'-','')) THEN
  RAISE EXCEPTION 'Unit label identity mismatch' USING ERRCODE='23514'; END IF;
 IF j.kind='INITIAL' THEN
  SELECT * INTO r FROM "ReceiptLine" WHERE id=u."receiptLineId";
  SELECT * INTO b FROM "DeliveryBatch" WHERE id=r."batchId";
  expected:=jsonb_build_object('unitCode',u."unitCode",'productCode',(SELECT code FROM "ProductPublicIdentity" WHERE "productId"=(r.snapshot->>'productId')::uuid),
   'lotCode',(SELECT code FROM "LotPublicIdentity" WHERE "lotId"=u."lotId"),'fullSku',r.snapshot->>'fullCode','publicBatchCode',b."publicCode",
   'productName',r.snapshot->>'productName','variantName',r.snapshot->>'variantName','supplierName',b.snapshot->>'supplierName','sourceName',b.snapshot->>'sourceName');
  IF NEW."originalLineId" IS NOT NULL OR NEW.purpose<>(CASE WHEN u."initialState"='U' THEN 'USABLE' ELSE 'DAMAGED_INTAKE' END) OR NEW.content<>expected THEN
   RAISE EXCEPTION 'Initial unit label snapshot mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO old FROM "UnitLabelLine" WHERE id=NEW."originalLineId";
  IF old.id IS NULL OR old."jobId"<>j."originalJobId" OR old."unitId"<>u.id OR old."lotId"<>NEW."lotId" OR old."receiptLineId"<>NEW."receiptLineId"
   OR old.purpose<>NEW.purpose OR old.payload<>NEW.payload OR old.content<>NEW.content THEN
   RAISE EXCEPTION 'Unit reprint must retain its exact original identity and content' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_label_line_guard BEFORE INSERT ON "UnitLabelLine" FOR EACH ROW EXECUTE FUNCTION dayari_unit_label_line_guard();
CREATE FUNCTION dayari_unit_label_claim_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "UnitLabelLine" l JOIN "UnitLabelJob" j ON j.id=l."jobId" AND j.kind='INITIAL'
  WHERE l.id=NEW."lineId" AND l."unitId"=NEW."unitId" AND j.id=NEW."jobId"
   AND l.xmin::text=(pg_current_xact_id()::text::numeric%4294967296)::text) THEN
  RAISE EXCEPTION 'Initial claim requires its exact new unit label line' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER unit_label_claim_guard BEFORE INSERT ON "UnitLabelClaim" FOR EACH ROW EXECUTE FUNCTION dayari_unit_label_claim_guard();

CREATE FUNCTION dayari_unit_label_evidence(cid uuid,oid uuid,aid uuid,ar "Role",subject uuid,command_type text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "OriginNode" WHERE id=oid AND mode='SHOP')
 OR NOT EXISTS(SELECT 1 FROM "User" u JOIN "ShopMembership" m ON m."userId"=u.id WHERE u.id=aid AND u.active AND NOT u."mustChangePassword" AND u.role=ar AND ar IN ('ADMIN','MANAGER') AND m."originId"=oid)
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=cid AND "originId"=oid AND "actorId"=aid AND "commandType"=command_type)
 OR NOT EXISTS(SELECT 1 FROM "AuditEvent" WHERE "commandId"=cid AND "originId"=oid AND "actorId"=aid AND "actorRole"=ar AND "subjectId"=subject AND action=command_type)
 OR NOT EXISTS(SELECT 1 FROM "OutboxEvent" WHERE "commandId"=cid AND "originId"=oid AND "actorId"=aid AND "aggregateId"=subject AND "eventType"=command_type) THEN
  RAISE EXCEPTION 'Incomplete unit print command evidence' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION dayari_unit_label_job_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual jsonb;n integer;
BEGIN
 PERFORM dayari_unit_label_evidence(NEW."commandId",NEW."originId",NEW."actorId",NEW."actorRole",NEW.id,'unit.labels.jobs.create');
 SELECT count(*) INTO n FROM "UnitLabelLine" WHERE "jobId"=NEW.id;
 SELECT jsonb_build_object('originId',NEW."originId",'kind',NEW.kind,'originalJobId',NEW."originalJobId",'reason',NEW.reason,'profile',NEW.profile,'rendererVersion',NEW."rendererVersion",'lines',
  jsonb_agg(jsonb_build_object('id',l.id,'unitId',l."unitId",'lotId',l."lotId",'receiptLineId',l."receiptLineId",'ordinal',l.ordinal,'purpose',l.purpose,'payload',l.payload,'content',l.content,'originalLineId',l."originalLineId") ORDER BY l.ordinal)) INTO actual
 FROM "UnitLabelLine" l WHERE l."jobId"=NEW.id;
 IF n<>NEW."totalLabels" OR actual IS DISTINCT FROM NEW."canonicalManifest"::jsonb
 OR (SELECT min(ordinal)<>1 OR max(ordinal)<>n FROM "UnitLabelLine" WHERE "jobId"=NEW.id)
 OR (NEW.kind='REPRINT' AND NOT EXISTS(SELECT 1 FROM "UnitLabelJob" WHERE id=NEW."originalJobId" AND "originId"=NEW."originId"))
 OR (NEW.kind='INITIAL' AND EXISTS(SELECT 1 FROM "UnitLabelLine" l LEFT JOIN "UnitLabelClaim" c ON c."lineId"=l.id AND c."unitId"=l."unitId" AND c."jobId"=l."jobId" WHERE l."jobId"=NEW.id AND c."unitId" IS NULL))
 OR NOT EXISTS(SELECT 1 FROM "UnitLabelEvent" WHERE "jobId"=NEW.id AND "commandId"=NEW."commandId" AND kind='REQUESTED') THEN
  RAISE EXCEPTION 'Incomplete exact unit label manifest' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER unit_label_job_complete AFTER INSERT ON "UnitLabelJob" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_unit_label_job_complete();

CREATE FUNCTION dayari_unit_label_artifact_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM dayari_unit_label_evidence(NEW."commandId",NEW."originId",NEW."actorId",NEW."actorRole",NEW."jobId",'unit.labels.artifact.prepare');
 IF NOT EXISTS(SELECT 1 FROM "UnitLabelJob" WHERE id=NEW."jobId" AND "originId"=NEW."originId")
 OR NOT EXISTS(SELECT 1 FROM "UnitLabelEvent" WHERE "artifactId"=NEW.id AND "jobId"=NEW."jobId" AND "commandId"=NEW."commandId" AND kind='ARTIFACT_READY') THEN
  RAISE EXCEPTION 'Incomplete unit label artifact evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER unit_label_artifact_complete AFTER INSERT ON "UnitLabelArtifact" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_unit_label_artifact_complete();
CREATE FUNCTION dayari_unit_label_event_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j "UnitLabelJob";a "UnitLabelArtifact";ct text;
BEGIN
 SELECT * INTO j FROM "UnitLabelJob" WHERE id=NEW."jobId";
 IF j."originId"<>NEW."originId" THEN RAISE EXCEPTION 'Unit print event origin mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.kind='REQUESTED' THEN
  ct:='unit.labels.jobs.create';
  IF NEW."commandId"<>j."commandId" THEN RAISE EXCEPTION 'Invalid unit label request event' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO a FROM "UnitLabelArtifact" WHERE id=NEW."artifactId";
  IF a.id IS NULL OR a."jobId"<>j.id OR a."originId"<>j."originId" THEN RAISE EXCEPTION 'Unit print artifact mismatch' USING ERRCODE='23514'; END IF;
  IF NEW.kind='ARTIFACT_READY' THEN
   ct:='unit.labels.artifact.prepare';
   IF NEW."commandId"<>a."commandId" THEN RAISE EXCEPTION 'Invalid unit artifact event' USING ERRCODE='23514'; END IF;
  ELSE ct:='unit.labels.handoff'; END IF;
 END IF;
 PERFORM dayari_unit_label_evidence(NEW."commandId",NEW."originId",NEW."actorId",NEW."actorRole",j.id,ct);
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER unit_label_event_complete AFTER INSERT ON "UnitLabelEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_unit_label_event_complete();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['UnitLabelJob','UnitLabelLine','UnitLabelClaim','UnitLabelArtifact','UnitLabelEvent'] LOOP
  EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change()',t);
 END LOOP;
END $$;
COMMIT;
