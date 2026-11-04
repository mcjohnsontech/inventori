# Staff invitation email implementation — 4 November 2026

Implemented a Brevo-compatible SMTP transport with mandatory STARTTLS/certificate validation, authenticated delivery, sanitized failures, bounded timeouts and stable message identity. Mail sends remain outside database transactions. Isolated messages cannot be sent when switching to SMTP. Invitations preserve single-use 24-hour tokens, six-character minimum passwords, origin isolation, revocation, idempotency and audited activation. Supervised account creation remains available and explicitly sends no email.

The Users & Access page prioritizes email invitations and displays queued, mail-server accepted, failed and isolated-test outcomes honestly, refreshing pending delivery. SMTP acceptance does not establish inbox delivery. Configuration and a no-message connection diagnostic are documented in invitation-email-setup.md.

## Verification

- npm test: 42 tests passed, 14 files (including real SMTP exchanges with an isolated loopback TLS fixture, connection verification without sending, downgrade/certificate/rejection/mode-isolation tests).
- npm run test:integration: 80 tests passed, 11 files; includes SMTP queue/activation/idempotency and prevention of isolated queue delivery after cutover.
- PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- tests/e2e/invitations.spec.ts tests/e2e/accounts.spec.ts: 2 passed. Invitation setup, supervised provisioning, directory filters, single-use rejection and responsive acceptance checked. Evidence: images/invitations/acceptance-desktop.png, acceptance-mobile.png, reused-mobile.png. All fixtures isolated.
- npm run typecheck: passed.
- npm run mail:check: exited 1 as expected because operational SMTP is unconfigured; no message sent.
- Production build: result recorded below after completion.

## Authorized local upgrade

Owner approved existing migrations 011/012. Applied successfully after pausing the API and making a private ACL-restricted logical backup. Canonical row count/hash checks verified all 33 pre-existing application tables unchanged, including account/password/session, inventory, receipt, ledger, identity and print records. Four invitation tables empty. API restarted. No operational invitations, accounts or emails created. No new migration files, backfill, stock mutation or production deployment.

## Changed files

API: invitation-mail.ts, invitations.service.ts, new smtp-invitation-transport.ts, API package.json. Web: invitations-panel.tsx, users-workspace.tsx. Tests: smtp-invitations.test.ts, invitations.test.ts and refreshed invitation browser screenshots. Tooling: root package.json/lock, .env.example, scripts/check-invitation-mail.ts. Documentation: setup, rollout plan, this report, architecture, decisions, traceability and implementation bricks.

## Remaining gates

Real Brevo delivery remains disabled. Privately configure credentials, persistent encryption key, verified sender and employee-accessible HTTPS APP_PUBLIC_URL, then verify the actual transport and controlled mailbox delivery. Do not fabricate a public URL or enable an unverified sender. SMTP cannot guarantee exactly-once email delivery after a lost provider response; stable Message-ID and single-use activation prevent duplicate account creation. Production rollout and recovery of existing accounts remain separate approvals.

Final production build: npm run build passed (contracts, Prisma generation, API and Next production build). Browser screenshots reviewed.
