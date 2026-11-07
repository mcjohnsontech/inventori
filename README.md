# Dayari Inventory

## Completion verification and CI

The active sequential completion record is [docs/dayari-completion-progress.md](docs/dayari-completion-progress.md). It distinguishes implemented/tested milestones from pending policy and operational gates. Dedicated shop-server/LAN deployment and cloud synchronization are deferred by the owner; the existing development setup remains available.

`.github/workflows/verify.yml` runs Node 24 against a disposable PostgreSQL 17 `dayari_test` service: isolated migrations, unit tests, typecheck, PostgreSQL integration tests, Chromium browser workflows and production build. It does not seed an operational database, deploy the app or send real invitations. SMTP is disabled by default in integration tests; invitation suites inject isolated transports. Workflow success must be verified on GitHub after publication rather than inferred from this file.

Local-first inventory and production accountability. The first implemented slice is an authenticated, create-only catalogue: shared products, configurable variants, suppliers, stable sources and automatically allocated supplier-specific SKUs. Receiving and its immutable stock ledger are implemented. A4 QR labels and read-only lookup are implemented for local trials. Production issuing, approvals, closing and cloud transport remain subsequent slices.

Read [the decision register](docs/decisions.md) and [build plan](docs/build-plan.md) before extending behavior. The authoritative PRD is currently at the repository root, despite the older instructions naming a `docs/` path.

## Development setup

Requires Node.js 24.15+ and PostgreSQL. Docker Compose is the primary development database setup. This repository is not configured for production deployment.

1. `npm ci` (or `npm install` before the initial lockfile is generated).
2. Copy `.env.example` to `.env`, replacing all placeholder credentials with unique local values. If this workspace already has a generated `.env`, preserve it. Never commit it. The local Admin email/password are in that ignored file.
3. `docker compose up -d postgres`.
4. `npm run build:contracts` then `npm run db:generate` then `npm run db:migrate`.
5. In PowerShell, set `$env:ALLOW_DEV_SEED='yes'` and run `npm run db:seed`. Only a local `*_dev` database with `NODE_ENV=development` is accepted. This provisions an empty shop and development Admin, with no stock or sample catalogue. Existing passwords are not reset.
6. In separate terminals, run `npm run dev:api` and `npm run dev:web` from the root. Open [the local app](http://127.0.0.1:3000). Log in using the generated `.env` credentials.

API binds to loopback port 4000. Browser calls go through the same-origin Next.js proxy; opaque sessions use HttpOnly, SameSite cookies, with secure cookies required in production. The API expects bearer authentication and has no permissive CORS. Local HTTP is for loopback development; shop Wi-Fi/camera use requires the approved HTTPS/hardware setup before rollout.

The development browser origin defaults to `http://127.0.0.1:3000`. Configure `APP_ORIGIN` explicitly for any different port/origin; production requires it and HTTPS. Do not relax origin validation to work around an incorrect deployment setting. The API uses NestJS's Fastify adapter; no file-upload middleware is installed.

If Docker Desktop cannot start, the optional native PostgreSQL development helper runs real PostgreSQL 17, binds only to loopback, creates `.local/postgres` and preserves it on shutdown. Run `npm run dev:db` in a separate terminal instead of Docker; never run both on the same port. It does not install a system service or create an OS account. It is a development fallback, not the approved production deployment.

## Catalogue workflow

Use **Add supplier** for occasional setup: new supplier name → location → review prefix. Existing supplier location setup is opened from its supplier row, with that supplier fixed. Supplier codes use the first three letters of the first word (Chioma → CHI), with -02/-03 collision suffixes. Select an Admin-managed location code; Lagos starts with LG. The resulting supplier-location prefix is stored once.

Use **Add product** for ordinary entry: select a supplier location → create or select a shared parent product → enter variants → review and save. The server allocates a unique random five-digit product number after the prefix, shared by all that source/product's variants. Enter explicit suffixes such as RED; no-options products use STD. For a populated option product, choose **Add new variant combinations** on the Variants step to add combinations using the saved attributes and source base; existing variants/SKUs stay unchanged. For example: CHILG03849-RED. Back retains entered details; final save is atomic and retry-safe.

Existing codes are preserved. For the existing CHILG source, open **Suppliers → Set up location**, select the existing source and Lagos registry, and keep **Keep this location’s existing prefix** selected. Subsequent products can select that saved source directly. Do not recreate or merge suppliers to adopt an existing prefix. Catalogue edits/deletes and stock balances remain outside this slice. See [the progressive catalogue report](docs/progressive-catalogue-report.md) for implemented behavior and limitations.

Inventory Managers can read existing catalogue entries. Production accounts cannot administer/read this catalogue surface. No user-administration interface or production provisioning is implemented yet. Development provisioning is not a substitute for production account setup.

Catalogue mutations require UUID `Idempotency-Key`; request hash, response, audit and immutable outbox event commit together. A retry retains its key; key reuse for a changed request conflicts. Browser pending-command metadata is kept in session storage, never the authentication token. Sync transport is not implemented: the UI explicitly says cloud sync is not configured.

## Receiving and stock

Admin and Manager can open **Receiving & stock → Receive delivery**. Choose one supplier/source, select variants across several sourced products, enter usable and damaged quantities separately, add delivery date/invoice reference, review and confirm. Damaged arrivals require an explanation. Existing saved SKUs are used; no catalogue creation occurs in receiving. Production cannot access this surface.

Accepted deliveries get immutable origin-qualified batch identities and readable codes such as B-20261102-0001. Stock can be viewed by exact SKU/batch or aggregated by SKU/shared product. All quantities derive from accepted ledger movements; accepted receipts cannot be edited or supplemented. Browser retry preserves its idempotency key. See [receiving implementation report](docs/receiving-implementation-report.md).

## A4 labels and QR lookup

Admin/Manager: open an accepted receipt and expand **Print labels for this receipt**, or use **Labels & printing**. Review accepted usable/damaged counts, create the full initial manifest, prepare a PDF part (at most500 labels), preview/download, and explicitly open the PDF viewer to print. Use A4 actual size/100%, disable Fit to page and test alignment first. No printer/adhesive-sheet compatibility is certified. Damaged copies are visibly marked; staff must attach/segregate them. Explicit reprints require original lot/purpose and reason.

All roles have **QR lookup**, using the focused2D scanner input, camera when a trusted secure context is available, or exact manual source/SKU/batch fallback. Production sees minimal identity/usable availability and cannot print or receive. Scanning/printing never issues, reserves or deducts stock. Camera on shop phones requires approved LAN HTTPS/trust; HTTP LAN IP is insufficient. No thermal helpers or silent printing exist.

See [the QR/label report](docs/qr-label-implementation-report.md) for payload/API, PDF geometry, actual tests, sample artifacts, retention and the required physical acceptance checklist. Bundle apps/api/assets/fonts with the API build. Preserve old renderer/profile/assets with database backups so historical manifests remain reconstructible.

## Verification

`npm test` runs rule/security tests. `npm run typecheck` and `npm run build` check both applications.

For PostgreSQL integration tests, create an isolated database with `npm exec -- tsx scripts/prepare-test-db.ts`, set `TEST_DATABASE_URL` in `.env`, run `npm exec -- tsx scripts/migrate-test-db.ts`, then `npm run test:integration`. Tests refuse nonlocal/non-`*_test` URLs. They add isolated records; they do not drop/reset databases or erase history.

For browser acceptance, install Chromium with `npm exec -- playwright install chromium`, then `npm run test:e2e`. Alternatively, use installed Chrome by setting `$env:PLAYWRIGHT_CHANNEL='chrome'` in PowerShell. Playwright starts isolated app processes on ports 3101/4101 against the migrated test database and provisions a test-only Admin with a generated password. Desktop/mobile screenshots are generated under ignored `test-results/`.

See [the slice report](docs/brick-1-report.md) for actual command results, failures and limitations. No production readiness or completed inventory correctness is implied by the catalogue slice.

## Phase1 Product/Lot identities

P+5 identifies a shared parent; L+5 identifies one exact SKU/batch lot. Codes are immutable and origin-scoped, never replacements for UUIDs or SKUs. Exact code lookup is available in catalogue, receiving/stock and QR workspaces with role-limited data. Old unmapped records show Code not assigned; page loads never backfill them. No Unit Codes/serialization/DYI:2 introduced.

Migrations007/008 were first verified on dayari_test, then explicitly approved by the owner and applied to local dayari_dev to resolve the app/schema mismatch. No backfill was performed. Do not migrate any other operational/production target without separate authorization. Existing unmapped records remain Code not assigned. See docs/phase-1-implementation-report.md and docs/prd-human-identities-addendum.md.

Backfill rehearsal only: explicitly set IDENTITY_BACKFILL_DATABASE_URL to an isolated local *_test target; run npm run identity:backfill with --origin, --actor (active Admin UUID), --kind PRODUCT or LOT, --limit (1..500) and --out plan.json. Default is a no-write dry run; apply explicitly with --apply --plan plan.json. Saved plans retain replay keys; repeat the same plan after a lost result, or plan the next page using nextCursor. Utility refuses operational/remote databases; no operational backfill is authorized.

### Serialized receiving rehearsal (isolated fixtures only)

Operational unit migration/activation remains owner-gated. Migrations 014-018 enable serialized receiving only on the database where they are explicitly installed. Existing local operational migration 013 remains usable with quantity receiving until separately upgraded.

- `npm run units:benchmark`: uses explicit loopback `TEST_DATABASE_URL` ending in `_test`; four capacity cases, repeated samples and sanitized metrics under ignored `artifacts/completion`.
- `npm run units:benchmark-contention`: additional chunk-size/contention diagnostics using the prior synthetic benchmark origin.
- `npm run units:create-cutover-fixture`: requires a fresh `UNIT_CUTOVER_REHEARSAL_DATABASE_URL` named `dayari_cutover_*_test`; refuses overwriting an existing database and prepares migration-013 fixtures.
- `npm run units:rehearse-cutover`: same explicit URL, creates synthetic receipt/print evidence and verifies preservation across migration deployment. Refuses a database already containing StockUnit.
- `npm run units:plan-history -- --origin <UUID> --out <new-plan.json> [--after <UUID>]`: read-only, requires explicit `HISTORICAL_UNIT_PLAN_DATABASE_URL` pointing to an isolated loopback `_test` fixture. Reports uncounted/unverified historical coverage; no apply mode, historical unit creation or stock adjustment.

Keep all URL credentials private. These tools do not authorize operational migrations, historical enrollment, physical verification, QR V2 deployment or production rollout. See `docs/serialized-receiving-implementation-report.md`.
