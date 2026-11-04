-- Harden newly introduced invitation records without rewriting any applied migration.
CREATE FUNCTION dayari_invitation_new_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status<>'PENDING' OR NEW."userId" IS NOT NULL THEN RAISE EXCEPTION 'Invitation starts pending'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invitation_new_state BEFORE INSERT ON "InvitationState" FOR EACH ROW EXECUTE FUNCTION dayari_invitation_new_state();
CREATE FUNCTION dayari_invitation_identity_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "InvitationState" WHERE "invitationId"=NEW.id)
 OR NOT EXISTS(SELECT 1 FROM "InvitationMail" WHERE "invitationId"=NEW.id)
 OR NOT EXISTS(SELECT 1 FROM "InvitationEvent" WHERE "invitationId"=NEW.id AND type='CREATED' AND "commandId"=NEW."commandId")
 OR NOT EXISTS(SELECT 1 FROM "CommandResult" WHERE id=NEW."commandId" AND "originId"=NEW."originId" AND "actorId"=NEW."creatorId" AND "commandType" IN ('invitations.create','invitations.resend')) THEN
 RAISE EXCEPTION 'Invitation identity requires atomic command, state, delivery and evidence'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER invitation_identity_complete AFTER INSERT ON "StaffInvitation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dayari_invitation_identity_complete();
