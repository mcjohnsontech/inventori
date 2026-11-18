# Staging and production environment separation

Owner direction: 17 November 2026. This replaces the single hosted staging topology as the deployment target. It does not authorize a production release, a merge into main, operational migration, account/stock transfer or production activation.

## Initial platform state — 17 November 2026 (follow-up below)

| Environment | Frontend | Backend | Database | Branch |
|---|---|---|---|---|
| Staging | https://dayari-inventory-staging.vercel.app | https://dayari-inventory-staging-api.onrender.com | New Render PostgreSQL 17, Free | staging |
| Production, unreleased | https://infentri.dayari.ng (DNS pending) | Existing Heroku app reserved for later cutover | Owner choice pending; existing database preserved | main |

Render web service `srv-dbudgqmk1f9s739ugt7g` is Free, Oregon. Its initial deployment `dep-dbudgrmk1f9s739ugvrg` succeeded at source `c1efe4cf3b54485d85efdfb4fcfeb2449c606f08`. It uses Node 24, repository root, `npm ci --include=dev && npm run build:api`, `node apps/api/dist/main.js`, and `/v1/health`. Auto-Deploy was changed from On Commit to **After CI Checks Pass**, tracking staging. No paid service or unrelated Render resource was changed.

New database `dpg-dbudf0g8v5cc738p86e0-a` is PostgreSQL 17, Free, Oregon. The owner explicitly approved temporary free PostgreSQL after being informed of expiration. Render shows expiration **17 December 2026**. This database is disposable staging, not a durable production store. Upgrade or replace it before expiration if its test data must survive; neither an upgrade nor copying operational data is authorized. The service sleeps when idle; first requests can exceed the existing frontend proxy timeout and may require retry. No artificial keep-alive or paid uptime upgrade was added.

The database was verified to have zero public tables before applying the existing 33 migrations. All completed successfully, including 033 financial evidence. No migration file was added/edited, and no Heroku migration ran. The new database has no staff or inventory enrollment. A new origin UUID is configured exclusively in Render. A fresh staging owner is awaiting the owner's email/provisioning confirmation; authenticated workflows have not yet been verified. Existing Heroku credentials will not work on fresh staging, and no account/password copy was performed.

Vercel staging project `prj_zj858Mo9fngD9lmWbdrdndFo2Jkh` retains its existing stable domain and `apps/web` root. GitHub was connected and its served branch changed to **staging**. Its Ignored Build Step returns 1 only for staging (continue build), 0 otherwise (skip), per Vercel's documented semantics. Its production-target API_URL now points only to Render. In this project, Vercel's platform target named "production" means the stable **staging** site; it is not the separate Dayari production environment.

Staging frontend deployment `dpl_6GFrMzXv8Vu8aMHgEMxFDdHxMjac` reached READY from staging at the exact source above. URL: https://dayari-inventory-staging-9jki1hn3c-mc-johnsons-projects.vercel.app . Stable staging alias points to it.

The already-existing production Vercel project `prj_e7qeUPA9LpSm3BzCvw8wD2xJBAFL` (`dayari-inventory-production`) was connected to the repository and verified to track **main**. It has **zero deployments**, no API_URL, preview deployments disabled, Ignored Build Step `exit 0`, and **Auto-assign Custom Production Domains disabled**. APP_ORIGIN is production-only. These are release gates, not a production deployment. No main commit/merge/push was performed. Main currently points to the older `b7172d351650374108380be1d3d29714c7e5d232`; it has not been promoted to the tested staging source.

## Production DNS and database gates

`infentri.dayari.ng` is attached and ownership-verified in Vercel, but its DNS is misconfigured. Authoritative nameservers are `ns1.dns-parking.com` and `ns2.dns-parking.com`. Vercel recommends:

| Type | Host under dayari.ng | Value |
|---|---|---|
| CNAME | infentri | a1764a9507e1083a.vercel-dns-017.com. |

Replace only conflicting records at infentri. Do not change the root domain, MX, sender verification or other email records. DNS-account access is not available; the owner has been asked to save this record. Ownership verification alone does not prove correct DNS routing or a valid live production deployment.

Existing Heroku app `dayari-inventory-staging-api` and attached Essential-0 PostgreSQL remain intact. The application's API is still https://dayari-inventory-staging-api-797073a989e1.herokuapp.com . No app rename, dyno shutdown, DATABASE_URL switch, SMTP change, release, account write, stock write or historical migration occurred there. Its staging markers and existing mail link configuration are intentionally retained until replacement staging is fully verified and a production cutover is approved.

The owner has been asked whether to reserve this existing PostgreSQL for production (separate from the new Render database), or add a fresh Essential-0 production database for about $5/month extra while retaining the old data. No extra paid add-on has been provisioned. Production API_URL will be configured only after the backend/database boundary is established; it must never point to Render staging. Production activation and release remain separate approvals. Existing staging-only Heroku release/bootstrap guards were not weakened to enable production implicitly.

## Environment isolation

- No database URL, password hash, session, account or inventory was copied between environments.
- Render uses its own private database URL and fresh SHOP_NODE_ID. SHOP is an isolated hosted test origin, not synchronization or the deferred shop LAN deployment.
- Render invitations/worker are disabled. No Heroku SMTP credentials or invitation encryption key were copied. Production mail configuration must be reviewed at cutover.
- Vercel API_URL remains server-only. No database credential is installed in either frontend. Host-only HttpOnly/Secure/SameSite Strict cookies and exact APP_ORIGIN mutation checks remain unchanged.
- Browser calls use the same-origin Next proxy; NestJS cross-origin browser access was not enabled and no wildcard CORS was added.
- Production has no API_URL yet. Never deploy it with the localhost fallback; complete approved production configuration before the first release.
- Private connection details and provider evidence are under ignored `.local/environment-split/`; never commit this directory.

## Workflow

1. Implement on a feature branch; test using isolated fixtures.
2. Review and move intended changes to staging. CI already covers main, staging and feat/**. Render waits for checks; Vercel staging only builds staging.
3. Verify staging login/RBAC and the affected workflows before requesting promotion.
4. Obtain owner approval for the exact production revision and any production database changes. Do not promote staging automatically or overwrite main.
5. On that later approval, complete production-only backend/database/secret/mail configuration, take a backup, run the approved release procedure and verify preservation. Main must contain the reviewed revision through an approved promotion.
6. Publish and manually promote only the production Vercel project after its API is ready. Keep its staging counterpart isolated.
7. Retire old staging configuration only after replacement staging's authenticated checks and the approved production cutover succeed. Preserve the old database until separately authorized otherwise.

This task did not add a GitHub production-deployment Action or protected-branch rules. The project build/domain gates are verified; GitHub reviewer/check protection remains a separate hardening step. The Render Blueprint is a reproducible staging-only definition; the resources were created/configured in the dashboard, not imported into Blueprint management. Do not apply it again expecting an in-place import without reviewing Render's resource ownership.

## Executed verification

- New Render database: empty before migration; 33 migrations completed; latest 033 finished, none rolled back.
- Render hosted API build and deployment: succeeded. Health 200; unauthenticated me, stock and Admin directory 401.
- Vercel staging production build: READY from staging; stable frontend 200; proxy me 401; foreign-Origin sessions POST 403.
- Browser: staging sign-in fields and Sign in action render. No credentials entered; no accepted stock transaction or invitation created.
- `npm test -- tests/unit/staging-deployment.test.ts`: **2/2 passed**.
- Vercel API read-back: staging branch staging; production branch main, ignored builds, no deployments, automatic domain assignment false, no API connection.
- Full unit/integration/browser business regression suites were not rerun for this infrastructure-only configuration. Authenticated staging smoke remains blocked on owner provisioning. No claim of fully verified operational staging or production readiness is made.

Evidence screenshots (private local files, not credentials): `.local/environment-split/render-staging-settings.png`, `vercel-staging-tracking.png`, `vercel-production-gate.png`, `staging-sign-in.png`. Additional deployment/migration/smoke records are retained privately alongside them.

References: [Render free services and expiry](https://render.com/docs/free), [Vercel branch tracking](https://vercel.com/docs/git), [Vercel ignored-build exit codes](https://vercel.com/docs/project-configuration/vercel-json).


## Owner-confirmed follow-up — 18 November 2026

This section supersedes the pending owner, DNS, database-choice and production API_URL statuses in the initial record above.

- Owner selected **mcj26017@gmail.com** for fresh Render staging. The existing atomic bootstrap created exactly that active ADMIN with explicit staging-origin membership, mandatory password change, audit/outbox/command evidence. No existing account was copied or reset. All receipt, lot, unit and movement counts remained zero. A cold local Prisma transaction-start attempt failed before beginning; the same saved credential was retained and the retry warmed the connection before the unchanged bootstrap completed.
- Authenticated smoke through the stable Vercel staging proxy passed: login 200, ADMIN role, mustChangePassword true, HttpOnly/Secure/SameSite Strict cookie, me 200, stock before password change 403, logout 200, revoked-session replay 401. No password was changed automatically, no stock was created and no real email was sent. The employee must complete the password-change screen before operational access.
- The owner saved the DNS CNAME. Vercel verification returned configuredBy CNAME, the exact recommended target, no conflicts and **misconfigured=false**. This is DNS verification, not a production release. A separate local DNS resolver refused its query; the successful provider verification is the recorded evidence.
- Owner explicitly chose to **retain the existing Heroku PostgreSQL database for production**. It is separate from Render staging. No extra paid database, data copy, migration, DATABASE_URL switch or historical enrollment is needed or was performed.
- The unreleased production Vercel project's production-only API_URL was configured to the retained Heroku API after staging isolation and the owner's database decision. It never points to Render. Read-back confirms main tracking, ignored builds, automatic domain assignment false, API_URL present and **zero deployments**. Existing backend runtime/release/mail markers remain unchanged pending the separately approved production cutover.
- Staging configuration commit 9bb7697b0478de35626c6fb612d56b3c655e8db5 automatically built successfully as deployment dpl_4g4gCKgk9X8xCoV24nV6r3aojfHF, READY with the stable staging alias.

Private handover: .local/environment-split/staging-owner-private.json and staging-owner-handover.txt. These are ignored, contain credentials and must never be staged, logged, uploaded or included in deployment archives. Only non-secret test results are recorded here.

Remaining gates: owner changes the new staging password; production promotion/release authorization for the tested revision; production-only backend mail/public URL/release configuration at that later cutover; no implicit merge into main or production activation. The existing Heroku database and historical accounts/inventory are preserved. No new infrastructure charges were introduced.

Local tooling issue: the disk was full. Removed only the generated Git deployment ZIP/extracted snapshot and generated .next-e2e/cache/webpack cache; preserved source, unrelated dirty files, database backups, credentials and screenshots. Approximately 188 MB was reclaimed at verification, so further local disk cleanup is advisable before additional builds.
