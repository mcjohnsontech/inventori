# Vercel + Heroku isolated staging

Owner approved isolated staging with a fresh database on 9 November 2026, then approved one Heroku Basic dyno ($7/month) and Essential-0 PostgreSQL ($5/month), approximately $12/month before tax. No Vercel plan upgrade is authorized. Existing local operations, stock, credentials and the existing unrelated Heroku app are outside this deployment.

## Topology and scope

Vercel hosts the Next.js frontend in `apps/web`, including its same-origin authenticated API proxy. Heroku hosts the existing NestJS modular monolith and a new PostgreSQL database. The staging API simulates exactly one isolated SHOP origin with a freshly generated UUID; it is not the operational shop writer or the deferred cloud synchronization/approval service. Internet connectivity is required for staging. No local database export, historical enrollment, cloud approvals or daily-close implementation is included.

Created API app: `dayari-inventory-staging-api`, US region/heroku-24, https://dayari-inventory-staging-api-797073a989e1.herokuapp.com/. Fresh Essential-0 PostgreSQL 17 is attached. Deployment verification and frontend URL follow after actual publication.

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

Four deployment unit tests passed; isolated staging-bootstrap/authentication/RBAC integration tests passed 10/10. Current typecheck and full production build passed, with web output separated from the running local frontend. Package-lock comparison confirms zero dependency version changes; only runtime/dev classification changed. Private environment files/backups are not tracked or selected for deployment commits. Vercel project root, Node version and stable domain are verified. Hosted build/runtime/login verification remains next; no hosted success is claimed here yet.
