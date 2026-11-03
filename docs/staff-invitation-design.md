# Secure staff email invitations

Owner approved direction, 3 November 2026. **Design only. No endpoints, tables, email provider, password reset, activation or password-policy changes authorized in Slices 1–3.** Existing supervised initial-password creation continues unchanged until a separately approved implementation replaces it.

## Intended workflow and authority

SHOP Admin creates an origin-scoped invitation for normalized email, staff name and one of the three existing roles. Require current Admin proof, server authorization, idempotency, existing origin-first locking and audit/outbox evidence. The employee receives a time-limited link, chooses a password, and activates the explicitly scoped account atomically. No public staff signup or role selection. Pending invitation is not an active login account. Admin cannot email a reusable password.

Proposed separate StaffInvitation record: immutable UUID/origin/email/role/creator/createdAt, token verifier hash, expiry; append-only issuance/revocation/acceptance evidence with a guarded one-time acceptance projection. A cryptographic 32-byte random token is sent once; store only its verifier hash in the invitation. Do not persist plaintext in audit/command responses/logs, URLs in analytics, or replicated public outbox. Email delivery must temporarily access the link: use a narrowly scoped encrypted-at-rest mail payload with an independently supplied key, restricted worker access and deletion after delivery/expiry. Define retention before implementation; do not pretend token-hash-only storage eliminates delivery-queue secrets.

Acceptance POST requires explicit password confirmation, valid unexpired/unrevoked verifier, configured origin and concurrency-safe consume operation. Lock origin then deterministic invitation/account rows; recheck current authority/account state. Atomically enroll/activate permitted account, hash password with existing approved implementation, consume token, revoke conflicting credentials/sessions as appropriate, and commit sanitized audit/outbox/result. Concurrent/replayed acceptance cannot create a second account, change role or reset a password. A lost acceptance response should direct the employee to sign in, not reuse the link as a reset mechanism.

GET/opening the email link never consumes it (mail security scanners may prefetch links). Prefer a token URL fragment exchanged only by explicit setup POST; no third-party assets/analytics, no-store responses, no-referrer policy, strict same-origin protection, HTTPS and no token logging. Remove token from visible history after capture; do not place it in persistent browser storage. Apply per-origin/account/IP bounded attempt and resend limits with generic error handling; expired/revoked/used tokens cannot be reused. Token possession is an activation credential, not authority to alter an existing unrelated account.

## Delivery and offline behavior

Commit invitation and a private mail-queue record together; send only after commit outside the database transaction. Stable delivery/message keys, bounded retries/backoff and pending/sent/failed status prevent false success. SMTP may duplicate delivery after an uncertain response, so the token is still single-use. Never create a new invitation on an automatic send retry. An explicit resend proposes revoking old tokens and issuing a new invitation atomically. Local shop operation remains available during internet loss; email waits and UI says pending. A pending invitation cannot be used to bypass activation offline.

Sender domain/From identity, provider, secrets provisioning, worker encryption/retention, mail readiness and trusted recipient-facing URL must be configured privately. A localhost link cannot reach the shop from the employee's separate device. Do not deploy remote hosting or promise off-site access as part of email setup. Staff name/shop/role and safe invitation instructions are the only email content; no inventory, invoice or reusable password.

## Decisions still requiring approval

- Proposed expiry 24 hours, resend invalidates prior tokens, rate limits and retention periods.
- Handling duplicate/pending/existing/disabled emails, especially whether reactivation requires a separate Admin command; no automatic account takeover or password reset.
- Whether role edits revoke/reissue pending invitations; proposed yes, preserving original evidence.
- Password minimum/role scope and any stronger Admin requirement. The earlier six-character request is recorded; current 16-character implementation is not changed in this task.
- Shop-LAN versus remote activation URL and TLS; chosen sender/provider and credential owner; worker encryption key storage and backup/recovery.
- Existing staff transition and whether legacy supervised provisioning is retired or retained as a separately controlled fallback. No automatic staff enrollment/email campaign.

Tests for that future slice: expired/reused/revoked/foreign tokens, simultaneous accept, scanner prefetch, duplicate send, provider failure/offline retry, resend races, role/deactivation changes, idempotency, CSRF/rate limiting, secret redaction, no active session before acceptance, correct role/origin after acceptance, account takeover prevention and full transactional rollback. Use synthetic mail transport and isolated accounts. This note authorizes no recovery trust mechanism or operational account mutation.
