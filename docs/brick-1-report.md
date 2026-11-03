# Brick 1 catalogue slice report

Status: first catalogue slice implemented and verified for local development. The complete MVP is not implemented by this slice. No production deployment, stock-entry authorization or hardware readiness is claimed.

## Authorized scope

The user authorized MVP work and explicitly approved Admin-only catalogue creation, Manager access to existing entries, denial of Production catalogue administration, manual base/suffix SKU allocation without automatic generation, immutable UUID/value-combination identity, and a sole local writer. Offline approval, closing and hardware decisions remain deferred. See `decisions.md` for the recorded approval.

Implemented scope: TypeScript npm-workspace monorepo; Next.js/Tailwind UI with repository-owned shadcn-style button; NestJS service/API; Prisma/PostgreSQL catalogue schema; local session authentication; supplier/location/product/variant/sourcing/SKU relationships; audit, idempotency and outbox/inbox foundations. No receipt or balance-changing API is present. The UI shows actual database catalogue counts and explicitly says cloud sync is not configured.

## Changed files

- Root tooling: `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `compose.yaml`, `README.md`, `tsconfig.base.json`, `tsconfig.json`, `prisma.config.ts`, `vitest.config.ts`, `vitest.integration.config.ts`, `playwright.config.ts`.
- Contracts: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`.
- API: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/app.ts`, `apps/api/src/main.ts`, `apps/api/src/catalogue.service.ts`, `apps/api/src/database.ts`, `apps/api/src/security.ts`.
- Web: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next-env.d.ts`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/globals.css`, `apps/web/app/api/[...path]/route.ts`, `apps/web/components/ui/button.tsx`. Next.js also generated `apps/web/AGENTS.md`; its framework guide instructions are retained, and bundled route-handler, client/server and cookie guides were checked.
- Database: `prisma/schema.prisma`, `prisma/guards.sql`, `prisma/migrations/migration_lock.toml`, `prisma/migrations/202611020001_catalogue_foundation/migration.sql`.
- Development/test helpers: `scripts/seed.ts`, `scripts/local-postgres.ts`, `scripts/prepare-test-db.ts`, `scripts/migrate-test-db.ts`, `scripts/run-vitest.mjs`.
- Tests: `tests/unit/contracts.test.ts`, `tests/unit/security.test.ts`, `tests/integration/catalogue.test.ts`, `tests/e2e/setup.ts`, `tests/e2e/catalogue.spec.ts`.
- Documentation: updated `docs/decisions.md`, `docs/requirements-traceability.md`, `docs/build-plan.md`, `docs/architecture.md`, `docs/data-model.md`; this report added.
- Ignored local-only artifacts: generated `.env` credentials, dependency/generated/build outputs, `.local/` database/temp/download data and browser test screenshots. No credentials are embedded in source or printed in the report.

## Migration and correctness boundaries

`202611020001_catalogue_foundation` creates immutable UUID catalogue identities, separate supplier and location/source relationships, shared parent variants, source/product base allocation and unique full SKUs, plus local users/sessions, audit, command results, origin committed sequence and outbox/inbox IDs. Composite FKs prevent sourcing/variant parent mismatch. Deferred validation verifies variant selections and canonical combination agree. Immutable database triggers guard audit/outbox/inbox/command records and key catalogue identities. SQL guards are included in the actual migration; `guards.sql` is its reviewable source, not a second command to run after migration.

Catalogue commands serialize on the shop origin counter, then atomically commit domain data, audit, event and saved response. This deliberately simple initial concurrency strategy ensures a contiguous committed origin watermark; throughput must be measured before stock rollout. A cloud-configured service rejects catalogue writes.

This is development provisioning, not a production account/security/backup deployment. Development database ownership can bypass database guards with DDL; a separate least-privilege runtime role and migration role are required before rollout. Session revocation is local only; no cloud account cache/revocation synchronization exists yet. There are no rename/supersession, user administration, valuation, receiving, stock ledger, QR printing, issue, damage, approval, completion or close workflows yet.

## Validation results

| Actual command/check | Result |
| --- | --- |
| `npm install`, subsequent targeted dependency upgrades | Completed; committed lockfile resolves Next.js 16.4.4, NestJS 12.3.2 with Fastify, Prisma 7.10.1; Tailwind pinned to published 4.1.18 |
| `npm run db:generate` | Passed; generated Prisma Client |
| `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output ...` | Generated initial SQL; reviewed guards appended before first application |
| `npm run db:migrate` | Passed against local `dayari_dev`; one migration applied |
| `npm exec -- tsx scripts/migrate-test-db.ts` | Passed against separate local `dayari_test`; same migration applied |
| `ALLOW_DEV_SEED=yes` with `npm run db:seed` | Passed with development guards; empty shop/Admin provisioned, no sample inventory/catalogue inserted |
| `npm test`; final `node scripts/run-vitest.mjs run` | Five unit tests passed, including final UUID-case canonicalization assertion |
| `npm run test:integration`; final `node scripts/run-vitest.mjs run --config vitest.integration.config.ts` | Seven real PostgreSQL integration tests passed, including final uppercase-UUID input, concurrent retries/collisions, rollback, role checks and immutability guards |
| `npm run typecheck` | Passed for API, web, scripts, test/config files after resolving test-only dependency type lookup |
| `npm run build` | Passed with Webpack and appropriate worker filesystem access; contracts, Prisma Client, API and optimized web build completed |
| `PLAYWRIGHT_CHANNEL=chrome` with `npm run test:e2e` | One complete browser scenario passed: reject foreign origin, sign in, register parent/attribute/value/variant, two supplier sources, two distinct SKUs, mobile view and sign out |
| Desktop/mobile screenshots | Opened and visually inspected `test-results/catalogue-desktop.png` and `catalogue-mobile.png`; screenshot data is isolated test data, not shop inventory |
| `npm audit --json` | Final result: zero informational, low, moderate, high or critical advisories |
| Local HTTP checks | API health `ok`, authority `SHOP`, cloud sync `not-configured`; web returned HTTP 200 |
| Development sign-in smoke check | Actual generated development credentials signed in as Admin (HTTP 200), HttpOnly/SameSite=Strict cookie confirmed, logout HTTP 200; no password/token printed |

The full-MVP mandatory receiving, stock, label, damage and outage tests remain planned for their slices. Passing catalogue tests does not establish stock accounting or production readiness. No lint command is configured; no lint result is claimed.

Environment failures resolved or bounded: npm registry connection reset and stale cached metadata were resolved by refreshing metadata and retrying; Docker Desktop remains unable to start because of its internal inference-manager socket error. No Docker factory reset, image/volume deletion or system account creation was attempted. Native PostgreSQL 17 is running from `.local/postgres` as a loopback-only development fallback, with persistent development/test data. Its initially missing optional Windows package was installed. Docker Compose itself has not been successfully exercised on this host.

Other failed checks and fixes: initial Vitest sandbox run could not rename temporary files; the runner now uses `.local/tmp`. Typecheck during an in-progress dependency update failed on temporarily absent Next declarations; settled-dependency checks passed. Turbopack failed to start its CSS worker; Webpack is selected. Restricted build workers also hit a directory-permission error; the final full build passed with appropriate execution access. Initial browser startup exposed a decorator-config issue; E2E now exercises compiled API JavaScript and the development watch command has explicit configuration. The real sign-in test caught a genuine origin-validation bug; the proxy now compares to an explicit trusted origin, and production fails closed if no origin is configured. A later browser test used the wrong lookup method for a native dropdown; accessible combobox selectors fixed the test. Attempting development web startup while Playwright owned the same Next directory was rejected; normal startup succeeded after test teardown. No failed check is counted as a passing test.

Initial dependency findings were eliminated by patched Next.js and NestJS releases and a supported Fastify adapter; no vulnerable upload stack or temporary dependency override remains. A fresh audit returned zero findings. Automated browser download was cancelled in favor of already installed Chrome; no browser installation is required for the recorded run.

## Local review

The development web app is available at `http://127.0.0.1:3000`, with API on port 4000 and PostgreSQL on 54329. Use `DEV_ADMIN_EMAIL` and `DEV_ADMIN_PASSWORD` from the ignored root `.env` file; credentials are not reproduced here. Development data is empty, separate from populated test data. Keep the local database/API/web processes running while reviewing; restart commands are in `README.md`. Stopping the database preserves `.local/postgres`; no automatic database reset is configured.

These are loopback development services, not an authorized shop Wi-Fi deployment. Production/local-network HTTPS, certificate trust, hardware and separate database runtime/migration privileges still require their approved setup. The production proxy requires `APP_ORIGIN` matching its exact public origin and secure cookies.

## Next recommended slice

Brick 2: atomic multi-variant receipt → usable-stock ledger → exact batch QR/print jobs. Before that slice, resolve O2/O3/O7/B02/B06: actual printer/label trial and infrastructure, intake damage semantics, whether an accepted batch can accept supplementary lines, and exceptional negative-stock policy. Do not add stock through catalogue fixtures or direct balance edits. Other deferred decisions remain slice-gated as documented.
