# Staff invitation implementation report

Status: development implementation verified with isolated transport. No operational migration, live email or deployment.

## Workflow

Admin can create, resend (optionally changing the assigned approved role), or revoke a staff invitation in Users & access. Every resend creates a new immutable invitation and revokes the old token in the same transaction. Only new email addresses qualify; existing/disabled staff use existing administration, never invitations for recovery. Supervised initial-password provisioning is retained. Employee opens /accept-invitation?token=..., explicitly chooses/confirms a six-character-or-longer password, accepts once, then signs in normally. GET never consumes credentials. Product, lot, SKU, receipts and stock remain untouched.

Passwords now share the owner-approved six-character minimum across all roles and existing creation/change forms. Scrypt hashing, current-password confirmation, mandatory first change for supervised provisioning, throttling, session revocation and shop membership remain in place.

## Schema and transactions

New additive migrations 202611030011_staff_invitations and 202611030012_invitation_completeness were exercised only on dayari_test. Four tables: immutable StaffInvitation, terminal InvitationState projection, immutable InvitationEvent, private encrypted InvitationMail. Deferred completeness requires command/state/mail/creation evidence; terminal acceptance checks email, role, membership and expiry. No old migration is rewritten.

Admin commands take origin lock then actor lock, revalidate current authority, enforce key/hash replay, commit identity/state/queue/audit/outbox/result and sequence atomically. Acceptance locks the origin, rechecks pending unexpired token and current creator authority, creates User/membership and consumes the token atomically. Repeated acceptance fails; if response is lost, sign in with the chosen password. Account password/role/status changes revoke pending invitations issued by that Admin. Database unique email prevents cross-origin account takeover races.

Delivery claims a fenced bounded lease under the origin lock, sends outside the transaction, then records sanitized outcome. Five attempts with bounded exponential retry; uncertain delivery may repeat the same single-use link. Ciphertext uses AES-256-GCM and a separately provided 32-byte key; plaintext never enters command/audit/outbox responses. Payload is erased after delivery, cancellation or exhausted retries. An expired pending queue entry is erased by the worker. No transport errors containing secret links are logged.

## API

- GET /v1/admin/invitations: latest 100 safe summaries, Admin only.
- POST /v1/admin/invitations: {name,email,role,currentPassword}, Idempotency-Key required.
- POST /v1/admin/invitations/:id/resend: {currentPassword,role?}; old token revoked.
- POST /v1/admin/invitations/:id/revoke: {currentPassword}.
- POST /v1/invitations/accept: {token,password,confirmation}, Idempotency-Key required. Token/passwords sent in the POST body only; success {ok:true,signInRequired:true}.

Invitation summaries expose id/name/email/role/status/delivery/expiresAt/createdAt, never token verifier, encrypted queue, plaintext link or credentials. Invalid public acceptance has generic failure. No unrestricted audit or mailbox endpoint exists.

## Configuration and rollout gates

Only isolated transport is implemented. Privately supply INVITATION_TRANSPORT=isolated, APP_PUBLIC_URL and a base64 32-byte INVITATION_ENCRYPTION_KEY. INVITATION_WORKER=1 starts a five-second isolated worker; it keeps at most 100 synthetic messages in process memory for test/development and sends no email. Otherwise explicit injected transport/worker is used in tests. No default host, sender, encryption key or credential is supplied. Features report unavailable on missing configuration/schema while current account provisioning remains usable.

Brevo smtp-relay.brevo.com:587 with required STARTTLS is provisional, not an enabled adapter. Dayari Inventory / no-reply@dayari.ng, sender/domain verification, an employee-accessible APP_PUBLIC_URL, TLS and proxy request-log redaction require owner confirmation before any live rollout. Invitations do not solve off-site reachability or local internet outages. Existing pending mail can wait; a pending invitation cannot log in.

The acceptance page removes its query token immediately, uses no-store/no-referrer, and has no third-party assets. Next development request logging excludes the route. Infrastructure access logs must also redact token queries before rollout. Browser refresh requires reopening the original email link; token is intentionally not persisted in browser storage.

## Verification

Executed: npm test — 29/29 tests, 12 files passed. npm run test:integration — final run 76/76 tests, 11 files passed, including 14 invitation cases. npm run typecheck passed after correcting a noUncheckedIndexedAccess assertion in the encryption test. Final production build passed after UI refinements. Initial browser run: existing account provisioning passed; invitation setup/sign-in/reused-token denial worked but its final broad role=alert locator also matched Next's announcement element. The locator was scoped to the expected error; the final full browser run passed all 19/19 tests (7.2 minutes). An earlier integration run had a stale compiled resend contract failure; rebuilding and the final 76-test run resolved it without weakening assertions.

No live email was sent and no operational stock/accounts were changed. Tests use guarded localhost *_test databases and synthetic identities. Expected forced-failure tests deliberately reject outbox writes and prove rollback. PostgreSQL adapter emits an existing client-query deprecation warning; no security assertion was disabled.

## Remaining scope

This is the invitation vertical slice of the expanded request. Unit serialization, DYI:2, individual-label cart and controlled historical rehearsal follow as separate tested slices. Production issues, damage/recovery, closing, cloud transport, operational enrollment and deployment remain excluded or approval gated.

## Browser and visual evidence

Screenshots: docs/images/invitations/acceptance-desktop.png, acceptance-mobile.png and reused-mobile.png. Desktop and 390px screenshots were visually inspected. Browser layout checks passed at 320, 390, 768, 1024 and 1440px with no horizontal overflow. A real HEAD request to the isolated acceptance page returned Referrer-Policy: no-referrer and Cache-Control: no-store. Existing role navigation, catalogue/extension, supplier sourcing, receiving/lost-response replay, inventory, Product/Lot lookup and DYI:1/printing browser cases all passed in the full run.

## Remaining rollout risks

Physical email delivery, SMTP integration/certification and external-device reachability are not claimed. The provisional Brevo configuration is recorded but no SMTP adapter is enabled. The queue key must remain available for pending deliveries; key rotation/backup recovery needs an operational runbook before live rollout. A sent email may arrive after revocation, but its token remains invalid. Isolated messages are transient process-memory fixtures, not a live mailbox. Invitation directory currently shows the latest 100 records; no unrestricted audit export is added.

Final incremental verification after audit-command linkage: account/invitation integration 21/21 passed; authentication integration 5/5 passed; typecheck and API production compilation passed. No frontend behavior changed after the full 19-test browser run.

## Changed files

- apps/api/src/invitation-mail.ts
- apps/api/src/invitation-revocation.ts
- apps/api/src/invitations.service.ts
- apps/web/app/accept-invitation/page.tsx
- apps/web/components/invitations-panel.tsx
- docs/images/invitations/acceptance-desktop.png
- docs/images/invitations/acceptance-mobile.png
- docs/images/invitations/reused-mobile.png
- docs/remaining-experience-implementation-plan.md
- docs/staff-invitation-implementation-report.md
- packages/contracts/src/invitations.ts
- prisma/migrations/202611030011_staff_invitations/migration.sql
- prisma/migrations/202611030012_invitation_completeness/migration.sql
- tests/e2e/invitations.spec.ts
- tests/integration/invitations.test.ts
- tests/unit/invitations.test.ts
- apps/api/src/accounts.service.ts
- apps/api/src/app.ts
- apps/web/app/api/[...path]/route.ts
- apps/web/components/account-security.tsx
- apps/web/components/users-workspace.tsx
- apps/web/next.config.ts
- docs/IMPLEMENTATION_BRICKS.md
- docs/architecture.md
- docs/decisions.md
- docs/requirements-traceability.md
- docs/staff-invitation-design.md
- packages/contracts/src/accounts.ts
- packages/contracts/src/index.ts
- playwright.config.ts
- prisma/schema.prisma
