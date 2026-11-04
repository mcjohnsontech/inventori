# Secure staff email invitations

Owner approved implementation, 3 November 2026, following Slices 1–3 and targeted security decisions. Development/testing uses isolated mail only. Existing supervised provisioning is retained. Operational upgrades, live sender/URL activation and deployment remain separately gated. See the implementation update below and staff-invitation-implementation-report.md.

## Intended workflow and authority

SHOP Admin creates an origin-scoped invitation for normalized email, staff name and one of the three existing roles. Require current Admin proof, server authorization, idempotency, existing origin-first locking and audit/outbox evidence. The employee receives a time-limited link, chooses a password, and activates the explicitly scoped account atomically. No public staff signup or role selection. Pending invitation is not an active login account. Admin cannot email a reusable password.

Proposed separate StaffInvitation record: immutable UUID/origin/email/role/creator/createdAt, token verifier hash, expiry; append-only issuance/revocation/acceptance evidence with a guarded one-time acceptance projection. A cryptographic 32-byte random token is sent once; store only its verifier hash in the invitation. Do not persist plaintext in audit/command responses/logs, URLs in analytics, or replicated public outbox. Email delivery must temporarily access the link: use a narrowly scoped encrypted-at-rest mail payload with an independently supplied key, restricted worker access and deletion after delivery/expiry. Define retention before implementation; do not pretend token-hash-only storage eliminates delivery-queue secrets.

Acceptance POST requires explicit password confirmation, valid unexpired/unrevoked verifier, configured origin and concurrency-safe consume operation. Lock origin then deterministic invitation/account rows; recheck current authority/account state. Atomically enroll/activate permitted account, hash password with existing approved implementation, consume token, revoke conflicting credentials/sessions as appropriate, and commit sanitized audit/outbox/result. Concurrent/replayed acceptance cannot create a second account, change role or reset a password. A lost acceptance response should direct the employee to sign in, not reuse the link as a reset mechanism.

GET/opening the email link never consumes it (mail security scanners may prefetch links). Use the approved APP_PUBLIC_URL/accept-invitation?token=... link, exchanging the token only by explicit setup POST after capture; no third-party assets/analytics, no-store responses, no-referrer policy, strict same-origin protection, HTTPS and no token logging. Remove token from visible history after capture; do not place it in persistent browser storage. Apply per-origin/account/IP bounded attempt and resend limits with generic error handling; expired/revoked/used tokens cannot be reused. Token possession is an activation credential, not authority to alter an existing unrelated account.

## Delivery and offline behavior

Commit invitation and a private mail-queue record together; send only after commit outside the database transaction. Stable delivery/message keys, bounded retries/backoff and pending/sent/failed status prevent false success. SMTP may duplicate delivery after an uncertain response, so the token is still single-use. Never create a new invitation on an automatic send retry. An explicit resend revokes old tokens and issuing a new invitation atomically. Local shop operation remains available during internet loss; email waits and UI says pending. A pending invitation cannot be used to bypass activation offline.

Sender domain/From identity, provider, secrets provisioning, worker encryption/retention, mail readiness and trusted recipient-facing URL must be configured privately. A localhost link cannot reach the shop from the employee's separate device. Do not deploy remote hosting or promise off-site access as part of email setup. Staff name/shop/role and safe invitation instructions are the only email content; no inventory, invoice or reusable password.

## Decision status

- CONFIRMED expiry 24 hours and resend invalidates prior tokens. Engineering limits: 100 issued invitations/hour/origin and 60 acceptance attempts/minute/origin; existing Admin proof limits remain. Payload erasure and five-attempt delivery bounds are specified below.
- CONFIRMED new emails only; pending duplicate blocked; existing/disabled accounts cannot be recovered through invitations. No password reset or automatic takeover.
- CONFIRMED role replacement revokes and reissues, preserving original evidence.
- CONFIRMED six-character password minimum for every role, including Admin, shared by creation/change/acceptance.
- Shop-LAN versus remote activation URL and TLS; chosen sender/provider and credential owner; worker encryption key storage and backup/recovery.
- CONFIRMED supervised provisioning retained pending rollout review. No automatic staff enrollment/email campaign.

Tests for that future slice: expired/reused/revoked/foreign tokens, simultaneous accept, scanner prefetch, duplicate send, provider failure/offline retry, resend races, role/deactivation changes, idempotency, CSRF/rate limiting, secret redaction, no active session before acceptance, correct role/origin after acceptance, account takeover prevention and full transactional rollback. Use synthetic mail transport and isolated accounts. This note authorizes no recovery trust mechanism or operational account mutation.

## Implementation update — 3 November 2026

The owner's subsequent “implement all” authorization supersedes this document's earlier design-only status. Approved rules: 24-hour expiry; resend/role edits revoke old links; new email addresses only; no recovery of existing or disabled accounts; supervised provisioning retained; six-character password minimum for every role. Zero-stock alerts only.

Use APP_PUBLIC_URL + /accept-invitation?token=... as explicitly requested (supersedes fragment proposal). Never infer the URL from incoming Host or hardcode a device address. Remove the token from browser history after capture, use no-referrer/no-store, suppress route request logging and require equivalent proxy log redaction before rollout.

Provisional Brevo host smtp-relay.brevo.com, port 587, mandatory STARTTLS; sender Dayari Inventory / no-reply@dayari.ng awaits verification. No live SMTP delivery is enabled in this slice. Isolated injected mail transport exercises success, failure and retries. Encryption keys and tokens remain private. Erase encrypted mail payload after confirmed delivery, revocation or expiry; retain sanitized evidence. Maximum five delivery attempts, exponential backoff, same one-use token on uncertain delivery. No operational migrations or deployment.
