# Vercel + Heroku isolated staging

Owner approved isolated staging with a fresh database on 9 November 2026, then approved one Heroku Basic dyno ($7/month) and Essential-0 PostgreSQL ($5/month), approximately $12/month before tax. No Vercel plan upgrade is authorized. Existing local operations, stock, credentials and the existing unrelated Heroku app are outside this deployment.

## Topology and scope

Vercel hosts the Next.js frontend in `apps/web`, including its same-origin authenticated API proxy. Heroku hosts the existing NestJS modular monolith and a new PostgreSQL database. The staging API simulates exactly one isolated SHOP origin with a freshly generated UUID; it is not the operational shop writer or the deferred cloud synchronization/approval service. Internet connectivity is required for staging. No local database export, historical enrollment, cloud approvals or daily-close implementation is included.

Created API app: `dayari-inventory-staging-api`, US region/heroku-24, https://dayari-inventory-staging-api-797073a989e1.herokuapp.com/. Fresh Essential-0 PostgreSQL 17 is attached. Frontend: https://dayari-inventory-staging.vercel.app/. Both deployments are published; actual verification is recorded below.

## Build and runtime

Heroku `heroku-postbuild` builds contracts, generates Prisma and compiles only the API. Prisma CLI and dotenv stay in production dependencies so release-time migration works after dev-dependency pruning. Versions are unchanged. Procfile release runs guarded staging migrations; web runs the compiled API. HOST defaults to loopback locally; Heroku explicitly uses 0.0.0.0 and its assigned PORT. Fonts remain bundled in apps/api/assets/fonts; label evidence/artifacts use the existing PostgreSQL-backed implementations rather than dyno disk.

Vercel project root: `apps/web`; include files outside that root. Install: `cd ../.. && npm ci --include=dev`. Build: `cd ../.. && npm run build:web`. Node 24.x. Configure server-side API_URL to the exact HTTPS Heroku URL and APP_ORIGIN to the stable HTTPS staging frontend origin. The session remains HttpOnly/Secure/SameSite=Strict; no browser token or database URL is exposed. Different preview origins must not silently bypass the explicit CSRF origin check.

`.vercelignore` and `.slugignore` exclude local/private environment files, backups, local directories and generated evidence. Upload from the repository root with project root apps/web; do not upload the local workspace via an unrestricted archive. `.vercel` metadata is ignored by Git.

## Fresh account initialization

The manual `scripts/bootstrap-staging.mjs` requires explicit staging/production/Heroku markers, a fresh nonlocal database, a fresh origin, disabled invitations and one-time owner authorization. It refuses any existing account/origin/catalogue/inventory. Owner-selected Admin email is configured privately. Generate an unpredictable initial password, hash with existing scrypt, force change at first login, preserve shop membership and append audit/outbox/command evidence atomically. Bootstrap is never run by application startup, never resets an existing account and creates no inventory. Remove initial-password/bootstrap config after success; retain the private handover only under ignored `.local/staging-deploy/`. Do not print credentials or store them in Git/logs/chat.

Staging uses Heroku's documented PostgreSQL TLS configuration (`PGSSLMODE=no-verify`) scoped only to this synthetic staging app. Transport is encrypted but its database certificate is not verified under that provider recipe. No global NODE_TLS_REJECT_UNAUTHORIZED override is used and local database configuration is unchanged. Real operational hosting requires a separate security/authority review; it is not approved by this staging setup.

## Configuration and exclusions

Heroku: DATABASE_URL provided by its new add-on; NODE_ENV=production; HOST=0.0.0.0; DAYARI_DEPLOYMENT=staging; AUTHORITY_MODE=SHOP; fresh SHOP_NODE_ID; INVITATION_TRANSPORT=disabled; INVITATION_LIVE_ENABLED=0; INVITATION_WORKER=0. No live SMTP sender, invitation transport, sync transport or approval executor. APP_PUBLIC_URL is unnecessary while invitations are disabled.

Use the existing authorized feature branch. Stage only deployment changes; preserve the uncommitted closing draft and local-upgrade records. Never force push, merge to main, export local data or provision further paid tiers without approval. Staging publication resumes deployment work only; feature milestones 9/11/12/13 remain paused.

## Verification plan

Run unit host/port and release-guard tests, isolated fresh-bootstrap/auth/RBAC tests, typecheck and production build. Verify dependency versions remain unchanged. After deployment, verify release migrations and API health; bootstrap exactly one owner; verify initial-password change restriction and protected endpoints without adding stock. Verify frontend page, same-origin login/proxy and rejection of unauthorized writes. Never record passwords, tokens or connection strings in deployment output. Record actual URLs, commit/deployment IDs, executed results and any unresolved limitations after completion.

Official references: [Heroku Node build lifecycle](https://devcenter.heroku.com/articles/nodejs-classic-buildpack-builds), [Heroku PostgreSQL connections](https://devcenter.heroku.com/articles/connecting-heroku-postgres), [Vercel monorepos](https://vercel.com/docs/monorepos/monorepo-faq), [Heroku pricing](https://www.heroku.com/pricing/).

## Pre-publication checks executed

Four deployment unit tests passed; isolated staging-bootstrap/authentication/RBAC integration tests passed 10/10. Current typecheck and full production build passed, with web output separated from the running local frontend. Package-lock comparison confirms zero dependency version changes; only runtime/dev classification changed. Private environment files/backups are not tracked or selected for deployment commits. Vercel project root, Node version and stable domain are verified. Hosted build/runtime/login verification was subsequently executed as recorded below.

## Publication verification — 9 November 2026

Application source commit: `398e4b0df4b88de2421a1b1a1f06427a34035201`, pushed to `feat/complete-application-systems`. Heroku source release v5 completed successfully, including all 28 additive migrations on the fresh hosted database. Vercel deployment `dayari-inventory-staging-1bgvh40xq-mc-johnsons-projects.vercel.app` reached Ready and the stable staging alias is https://dayari-inventory-staging.vercel.app/.

Executed hosted smoke checks: frontend HTTP 200; API health HTTP 200; unauthenticated proxy/me and protected API return 401; foreign-Origin sign-in returns 403. Owner sign-in through the Vercel proxy passed; mandatory first-password change is true; cookie is HttpOnly/Secure/SameSite=Strict; authenticated me returns 200; stock access before password change returns 403. Logout succeeded and reuse of the revoked session returns 401. No stock was created by smoke tests. Temporary bootstrap/email/password configuration was removed after provisioning.

Owner: `240504047@live.unilag.edu.ng`. The generated initial password is handed over only in ignored local `.local/staging-deploy/private.json`; it is not published in source, logs or this report. Owner must choose a new password at first login. Live email remains disabled. Staging is internet-dependent, isolated from shop operations, and is not a production or offline/synchronization rollout. Existing completion/read-timeout risk and unfinished daily closing/final application QA remain outside this deployment milestone. No full application regression rerun is claimed for this deployment-only change.

Previously uncommitted local-upgrade documentation, generated Next typings and the closing-design draft remain preserved and excluded from deployment commits. Documentation-only follow-up does not require redeploying application source.

Read-only hosted database verification: 28 migration records; exactly one active ADMIN with mandatory password change, one origin and one shop membership; zero receipts, stock lots, stock units and movements. Platform verification confirms one Basic web dyno. Bootstrap settings are absent and invitations remain disabled.

## Approved hosted invitation rollout — 10 November 2026

Owner authorized live invitations and explicitly confirmed account-wide SMTP IP-blocking deactivation in Brevo. The release guard now permits SMTP only with STAGING_EMAIL_APPROVED=1, INVITATION_TRANSPORT=smtp, INVITATION_LIVE_ENABLED=1, SMTP_SENDER_VERIFIED=1 and a complete valid invitation configuration. All authority, origin and hosted-database safeguards remain. Fresh-account bootstrap still rejects live mail unconditionally. No migration or stock/account backfill is added. The original no-mail configuration described above records the initial deployment; this explicit rollout supersedes that email-only restriction.

## Owner-authorized hosted release — 12 November 2026
Owner requested “push to prod” after the verified sprint checkpoint. Updated the existing hosted application (still named staging); no new environment, authority change, cloud transport or local-shop migration was introduced.

Source: `8cce89e0c2fe071eb84a9b5907bd83389700c9b5`. A clean Git archive excluded all unrelated working-tree edits. Heroku PostgreSQL backup `b001` completed before release. Backend release **v17** succeeded and its guarded release phase applied **029, 030 and 031** successfully. Vercel deployment **dpl_52qhdRin5LucANtzF5FMCf5ojbov** reached READY, target production, and was aliased to https://dayari-inventory-staging.vercel.app/. API: https://dayari-inventory-staging-api-797073a989e1.herokuapp.com/.

Read-only hosted checks executed successfully: frontend HTTP200; API health HTTP200 (SHOP authority, cloud synchronization not configured); direct API closing-config and production/orders HTTP401 without authentication; same-origin proxy me/closing-config/production/orders HTTP401 without authentication. All 12 referenced frontend script assets returned successfully; Orders and daily-closing markers were present. No receipt, checkout, closing, print job or account mutation was performed for smoke testing. Authenticated end-to-end workflows were verified in isolated tests before publication, not repeated against hosted stock.

The earlier sprint's no-deployment/isolated-migration statements record its original checkpoint; this later owner-authorized release supersedes that restriction solely for the existing hosted app. Local operational data and historical unit enrollment remain untouched. Cloud approval execution, synchronization, hardware certification and the deferred local-server infrastructure are not completed by this release.


## Owner-authorized completion workflow deployment — 12 November 2026
Owner instruction: “go ahead deploy.” This authorizes migration 032 and publication of the tested Admin/Manager completion and UI refinements to the existing hosted application; it does not authorize local shop upgrades, cloud synchronization or historical enrollment.

Source: `b93cbd35a1b489eebcf373e2aba2a7392e6788e4`, deployed from a clean Git archive excluding unrelated working-tree edits. Heroku backup **b002** completed before upgrade. Public API access was temporarily placed in maintenance mode during the database release and restored afterward. Backend release **v18** succeeded; additive migration **202611120032_admin_production_completion** applied successfully. Pre/post full-row fingerprints matched for all **3 supplier SKUs, 1 receipt, 7 stock movements and 0 existing completions**. No historical records were rewritten.

Vercel deployment **dpl_CJhW2vs7paY8rXeTUaWEim6fWRLn** reached **READY**, target production. Deployment URL: https://dayari-inventory-staging-9k0u5hc2r-mc-johnsons-projects.vercel.app . Stable alias: https://dayari-inventory-staging.vercel.app/ . Backend: https://dayari-inventory-staging-api-797073a989e1.herokuapp.com/ .

Hosted smoke checks passed: frontend and API health HTTP200; API authority SHOP with cloud synchronization not configured; direct completion-config/completion-sessions/checkouts HTTP401 without authentication; proxy me/completion-config/completion-sessions/checkouts HTTP401; foreign-Origin sign-in HTTP403. All 12 referenced frontend scripts returned successfully and contained the new checkout-history, completion-session and compact-filter workflow markers. A fresh-browser check rendered the Email address field and Sign in action successfully with zero browser runtime errors; no credentials were entered. No hosted receipt, checkout, completion, stock, invitation or account was created by smoke tests. Authenticated stock-changing workflows remain covered by the isolated pre-release tests, not repeated on hosted stock.

The earlier report's no-deployment/isolated-migration statements describe its original review checkpoint; this later owner instruction supersedes them solely for migration 032 and this hosted release. Manager-only daily closing, deferred cloud approvals, local-server infrastructure and other existing gates remain unchanged.
