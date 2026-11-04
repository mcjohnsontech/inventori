-- Additive only; isolated development/test deployment. No operational enrollment.
CREATE TABLE "StaffInvitation" (
 "id" uuid PRIMARY KEY, "originId" uuid NOT NULL REFERENCES "OriginNode"(id),
 "creatorId" uuid NOT NULL, "creatorVersion" integer NOT NULL CHECK ("creatorVersion">=0),
 "name" text NOT NULL, "email" text NOT NULL CHECK (email=lower(email)), "role" "Role" NOT NULL,
 "tokenHash" text NOT NULL UNIQUE CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
 "expiresAt" timestamptz(6) NOT NULL, "createdAt" timestamptz(6) NOT NULL DEFAULT now(),
 "commandId" uuid NOT NULL REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY ("creatorId","originId") REFERENCES "ShopMembership"("userId","originId"),
 CHECK ("expiresAt">"createdAt" AND "expiresAt"<="createdAt"+interval '24 hours')
);
CREATE INDEX "StaffInvitation_originId_createdAt_idx" ON "StaffInvitation"("originId","createdAt");
CREATE TABLE "InvitationState" (
 "invitationId" uuid PRIMARY KEY REFERENCES "StaffInvitation"(id),
 "status" text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REVOKED')),
 "userId" uuid REFERENCES "User"(id), "changedAt" timestamptz(6) NOT NULL DEFAULT now(),
 CHECK ((status='ACCEPTED')=("userId" IS NOT NULL))
);
CREATE TABLE "InvitationEvent" (
 id uuid PRIMARY KEY, "invitationId" uuid NOT NULL REFERENCES "StaffInvitation"(id),
 type text NOT NULL CHECK(type IN ('CREATED','ACCEPTED','REVOKED','DELIVERY_SENT','DELIVERY_FAILED','DELIVERY_EXPIRED')),
 "commandId" uuid REFERENCES "CommandResult"(id) DEFERRABLE INITIALLY DEFERRED,
 "createdAt" timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX "InvitationEvent_invitationId_createdAt_idx" ON "InvitationEvent"("invitationId","createdAt");
CREATE TABLE "InvitationMail" (
 "invitationId" uuid PRIMARY KEY REFERENCES "StaffInvitation"(id), "encryptedPayload" text,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','FAILED','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 "availableAt" timestamptz(6) NOT NULL DEFAULT now(), "leaseId" uuid, "leaseUntil" timestamptz(6),
 "updatedAt" timestamptz(6) NOT NULL DEFAULT now(),
 CHECK(status NOT IN ('SENT','CANCELLED') OR "encryptedPayload" IS NULL)
);
CREATE INDEX "InvitationMail_status_availableAt_idx" ON "InvitationMail"(status,"availableAt");
CREATE TRIGGER invitation_immutable BEFORE UPDATE OR DELETE ON "StaffInvitation" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE TRIGGER invitation_event_immutable BEFORE UPDATE OR DELETE ON "InvitationEvent" FOR EACH ROW EXECUTE FUNCTION dayari_reject_history_change();
CREATE FUNCTION dayari_invitation_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'PENDING' OR NEW."invitationId"<>OLD."invitationId" OR NEW.status='PENDING' THEN
  RAISE EXCEPTION 'Invitation acceptance/revocation is terminal';
 END IF;
 IF NEW.status='ACCEPTED' AND NOT EXISTS (
  SELECT 1 FROM "StaffInvitation" i JOIN "User" u ON u.id=NEW."userId"
  JOIN "ShopMembership" m ON m."userId"=u.id AND m."originId"=i."originId"
  WHERE i.id=NEW."invitationId" AND i.email=u.email AND i.role=u.role AND u.active AND i."expiresAt">clock_timestamp()
 ) THEN RAISE EXCEPTION 'Invalid invitation acceptance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invitation_state_guard BEFORE UPDATE OR DELETE ON "InvitationState" FOR EACH ROW EXECUTE FUNCTION dayari_invitation_state_guard();
CREATE FUNCTION dayari_invitation_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wanted text;
BEGIN
 SELECT status INTO wanted FROM "InvitationState" WHERE "invitationId"=NEW."invitationId";
 IF NOT EXISTS (SELECT 1 FROM "InvitationEvent" WHERE "invitationId"=NEW."invitationId" AND type=CASE wanted WHEN 'PENDING' THEN 'CREATED' ELSE wanted END) THEN
 RAISE EXCEPTION 'Invitation requires immutable state evidence'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER invitation_complete AFTER INSERT OR UPDATE ON "InvitationState" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_invitation_complete();
