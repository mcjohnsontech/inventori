# Automatic supplier code slice

The user approved first-three-letter abbreviation of the first word: Chioma Ventures → CHI, Lagos Paper Supplies → LAG; collisions use -02/-03 and codes remain fixed after saving. This bounded catalogue change implements that rule. The four-step catalogue wizard remains a proposal; no stock workflow or automatic full-SKU/source-code allocation was introduced.

## Changes

- `packages/contracts/src/index.ts`: shared abbreviation/collision helpers, name-only supplier creation contract, validation for a first word without letters. Uppercase Unicode letters are used after compatibility normalization, punctuation/digits are skipped, short names are not padded. No transliteration or guessed fallback.
- `apps/api/src/catalogue.service.ts`: allocate the unique supplier code inside the existing shop-writer-locked transaction; persist the same code in response, audit and outbox. Replayed requests return the original allocation. Clients cannot override it.
- `apps/web/app/page.tsx`: supplier name input with live read-only code preview and save-time uniqueness explanation. No manual supplier-code field is submitted.
- `prisma/migrations/202611020002_supplier_code_identity/migration.sql`: reject supplier code/ID/origin changes and deletion; display-name updates remain possible without altering code. Existing rows are not rewritten.
- `tests/unit/contracts.test.ts`, `tests/integration/catalogue.test.ts`, `tests/e2e/catalogue.spec.ts`: updated name-only requests; abbreviation, collision gaps, invalid input, concurrent allocation, response replay, legacy-code preservation, rename safety and browser preview/read-only checks.
- `apps/web/next.config.ts`, `playwright.config.ts`, `.gitignore`: separate `.next-e2e` output for browser tests so they can run alongside the review app without a dev-directory lock collision.
- `docs/decisions.md`, `docs/catalogue-workflow-proposal.md`, `README.md`: record the selected rule and distinguish it from still-proposed workflow/full-SKU generation. This report added.

## Verification

- `npm run build:contracts`: passed.
- `npm run db:migrate`: supplier identity migration applied successfully to local development PostgreSQL.
- `npm exec -- tsx scripts/migrate-test-db.ts`: same migration applied successfully to isolated test PostgreSQL.
- `node scripts/run-vitest.mjs run`: 6 unit tests passed.
- `node scripts/run-vitest.mjs run --config vitest.integration.config.ts`: 8 integration tests passed against real PostgreSQL, including concurrent supplier collisions/retries and immutable code after name change.
- `npm run typecheck`: passed.
- `PLAYWRIGHT_CHANNEL=chrome` with `npm run test:e2e`: 1 complete browser scenario passed, including live CHI/SEC abbreviation previews, collision-compatible codes and read-only code field, followed by successful saves and source/SKU registration.
- `npm run build`: passed; contracts, Prisma Client, API and optimized Next.js web build completed.
- Final local HTTP checks: API `ok`; web HTTP 200 on `http://127.0.0.1:3000`.

No test failure occurred in these executed suites. During editing, the running API briefly reloaded before the new contracts export had been built; rebuilding contracts restored it and later integration/browser checks passed. No data reset, supplier-code backfill, ledger rewrite or production deployment occurred.

## Remaining work

The proposed progressive setup flow is documented in `catalogue-workflow-proposal.md`: Product → Variants → Supplier/source → Review/save, preserving context and allowing inline prerequisite creation. Implement that as the next bounded UX/API slice. Full-SKU/source code policy, stock receiving and the previously recorded operational decisions remain separate. Supplier creation still uses the previously approved Admin-only permission.
