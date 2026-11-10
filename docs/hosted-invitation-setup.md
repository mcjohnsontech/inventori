# Hosted staff invitation configuration — 10 November 2026

Target: the existing isolated Heroku app dayari-inventory-staging-api and frontend https://dayari-inventory-staging.vercel.app/. The Vercel production alias does not change this environment into the operational shop system.

## Completed

Inspected the existing SMTP transport, encrypted queue and invitation lifecycle. Hosted SMTP credentials, sender, public URL and encryption key were initially absent; live mail was explicitly disabled. Configured APP_PUBLIC_URL to the stable HTTPS frontend, SMTP_HOST to smtp-relay.brevo.com and SMTP_PORT to 587. Generated one stable 32-byte encryption key, stored in Heroku configuration with an ignored private local backup. No credentials or tokens are stored in this document or Git. Existing stock, accounts and invitation history were not changed.

Existing behavior: Admin invitation, staff-selected password, 24-hour single-use links, hashed tokens, encrypted delivery queue, revocation/resend, explicit role/origin restrictions, bounded retries, STARTTLS and TLS certificate validation. SMTP acceptance is distinguished from inbox delivery. Existing accounts cannot be recovered through invitations. No password is emailed.

## Required private provider setup

The owner must provide a Brevo-verified sender address and configure SMTP_USER and SMTP_PASSWORD privately in Heroku Config Vars. SMTP_PASSWORD must be the provider SMTP key, not a general API key. The earlier no-reply@dayari.ng proposal was provisional and must not be assumed verified. Do not paste secrets into chat.

After sender verification and credential availability: set SMTP_FROM_ADDRESS, verify TLS connection/authentication without sending, review the hosted pending queue, then enable SMTP_SENDER_VERIFIED=1, INVITATION_TRANSPORT=smtp and INVITATION_LIVE_ENABLED=1. SMTP mode automatically runs the bounded worker. Do not rotate the encryption key during normal restarts or discard an existing key with pending deliveries. Send an explicitly requested controlled invitation only after checking its recipient and account eligibility; verify provider acceptance and recipient redemption without recording the token.

## Executed checks

Invitation/SMTP unit suites: 9/9 passed across 2 files, including isolated TLS SMTP tests. No real email was sent. Live delivery remains blocked on credentials and verified sender; no live inbox delivery or production invitation success is claimed. No application-code change, new dependency or migration is needed for these configuration steps.

Isolated invitation integration suite: 16/16 passed. The first attempt could not start because local PostgreSQL was stopped; after starting the existing local service, the rerun passed. Hosted API health returned HTTP 200 after configuration restart. No new application code was changed, so typecheck/build were not repeated for this configuration-only step.

## Credential verification attempt — 10 November 2026

Owner confirmed mark.abiodun@primewealthcapital.com as the verified sender; sender configuration was saved. SMTP_USER and SMTP_PASSWORD are now present (values never logged). The hosted queue contained no invitations. Verification from the Heroku runtime failed; sanitized direct SMTP diagnostics returned EAUTH with response code 525. Brevo documents 525 as an unauthorized client IP. Live delivery remains disabled, and no email was sent. The initial detached verification process exited before its state could be polled and its success could not be established from log retrieval; the attached runtime verification and sanitized diagnostic are the authoritative executed results. Credentials are not declared invalid on this evidence. SMTP IP authorization must be resolved before enabling delivery.

## Approved SMTP rollout

Owner gave action-time confirmation for account-wide SMTP IP-blocking deactivation. Brevo UI now shows SMTP keys Deactivated. After this change, the attached Heroku runtime SMTP verification passed with exit code 0; no email was sent. Brevo UI independently confirms both mark.abiodun@primewealthcapital.com and mcj26017@gmail.com are verified. Heroku now contains the latter sender, which is preserved rather than overwriting the owner's saved configuration; this was disclosed before enablement.

Initial enablement was rejected by the original staging release safeguard that disallowed all live mail. The release-only exception now requires explicit STAGING_EMAIL_APPROVED=1 and verified, fully configured SMTP. Bootstrap retains the original mail-disabled requirement. Targeted guard/invitation/SMTP unit suites: 11/11 passed. Actual final rollout and service-health results follow after execution.

Compiled API build passed. No frontend change or new migration is included in this rollout.
