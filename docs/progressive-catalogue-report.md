# Progressive catalogue slice

This slice implements the user's request to separate occasional supplier setup from ordinary product entry. No receiving, quantity change, QR printing, production or cloud transport was added.

## Resulting workflow

**Add supplier** opens Supplier → Location → Review prefix. Enter a new supplier name directly. Existing supplier location setup is opened separately from its supplier row; that supplier is fixed for the form. Pick a registered location (Lagos = LG is approved), or register a location with an explicit Admin code. Optionally specify a more precise source area. Review the composed prefix before the atomic save.

**Add product** opens Supplier → Product → Variants → Review. Select an already configured supplier location, create or reuse a shared parent product, then enter explicit variant rows or select existing variants. A no-options product uses STD. Review shows the prefix and suffix; the final random five-digit number is allocated only on save. All selected variants share that base, such as CHILG03849-RED and CHILG03849-BRN. The same source/product reuses its saved base and SKU identities; another source gets a distinct base.

Back/Continue preserves drafts. Escape/Close on a populated draft presents Keep editing / Discard draft. Native dialog behavior traps keyboard focus. No records are accepted while navigating. A final invalid row or code conflict rolls back all new setup records, audit and outbox effects. The final response survives retries under the same idempotency key.

## Existing data

No supplier/source/base/SKU codes are backfilled or renamed. The existing supplier/source whose recorded prefix is CHILG can be configured from **Suppliers → Set up location**, selecting its existing location and **Keep this location’s existing prefix**. This creates an immutable prefix registration; it does not concatenate LG onto CHILG or merge suppliers with the same display name. After this one-time setup, product entry selects that saved supplier location directly.

The random allocator uses cryptographic five-digit draws, rejects occupied bases and conflicts with existing full SKUs, and handles a dense namespace with a bounded scan from a random starting point. Exhausting all 100,000 candidates reports a conflict, rather than reusing codes or silently changing the format. Database uniqueness and the existing sole-shop-writer transaction lock enforce concurrency correctness. Accepted product/source identities are immutable.

## Changed files

- Schema/migration: `prisma/schema.prisma`, `prisma/migrations/202611020003_progressive_catalogue/migration.sql`. Adds immutable `LocationRegistry` and `SupplierLocationPrefix`; seeds the approved Lagos/LG registry entry only. No existing operational identity is changed.
- Contracts/API: `packages/contracts/src/index.ts`, `apps/api/src/catalogue.service.ts`, new `apps/api/src/catalogue-setup.ts`, new `apps/api/src/product-code.ts`. New authenticated Admin-only `/v1/catalogue/supplier-setups` and `/v1/catalogue/product-setups` operations use validation, idempotency, transaction, audit and outbox. GET catalogue includes registry, prefix and sourcing data; legacy operations remain available.
- Web: `apps/web/app/page.tsx`, `apps/web/app/api/[...path]/route.ts`, new `apps/web/components/catalogue/setup-wizards.tsx`, new `wizard-shell.tsx`. Replaces the generic record-type modal with task buttons/forms and preserves explicit shared-parent selection.
- Tests: new `tests/unit/product-code.test.ts`; expanded `tests/integration/catalogue.test.ts`; replacement `tests/e2e/progressive.spec.ts`. The obsolete seven-form browser scenario was moved to ignored `.local/catalogue-legacy.spec.ts` and is no longer an active test.
- Documentation: `docs/decisions.md`, `docs/catalogue-workflow-proposal.md`, `docs/requirements-traceability.md`, `docs/data-model.md`, `README.md`, and this report.

## Verification

- `npm run build:contracts`, `npm run db:generate`: passed.
- `npm run db:migrate`: applied migration 202611020003 to development PostgreSQL.
- `npm exec -- tsx scripts/migrate-test-db.ts`: applied the same migration to isolated test PostgreSQL.
- `npm run typecheck`: passed, including the replacement browser scenario.
- `node scripts/run-vitest.mjs run`: 8 unit tests passed, including random-number padding, repeated collision and namespace exhaustion.
- `node scripts/run-vitest.mjs run --config vitest.integration.config.ts`: 11 integration tests passed, including atomic aggregate rollback, shared variant/source reuse, concurrent random bases, idempotent allocation, legacy prefix adoption and immutable prefixes.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 1 progressive browser acceptance scenario passed (44.3 seconds), covering draft navigation, mobile width/focus, atomic save, shared-parent reuse and discard.
- Desktop/mobile review screenshots inspected; long dialogs scroll within the viewport.
- `npm run build`: passed (contracts, Prisma, API TypeScript and Next.js production build).
- No failing tests remain. Node emitted non-blocking NO_COLOR/FORCE_COLOR warnings during browser startup.

## Remaining scope

Catalogue permissions and stock scope remain unchanged. The progressive UI creates new products with flexible attribute rows and connects existing variants; it does not yet edit/supersede established product identities or edit established variant identities. The subsequent variant-extension task now adds new combinations to an already populated set; see `variant-extension-report.md`. Existing products with attributes but no explicit combinations can now create their first variants. Source-prefix setup must be completed once for legacy locations. Normal code allocation requires no network access beyond the local server; transport-level cloud replay and receipt/ledger slice remain future work. The 100,000-product-per-prefix capacity requires an explicit extension policy if reached.


## Blank Variants step correction

An existing parent could have configured attributes but only its automatic default variant. The wizard filtered out that ineligible default and rendered an empty selection list. `apps/web/components/catalogue/setup-wizards.tsx` now detects this state, explains it, and shows variant-entry rows using the saved attribute names. Saving uses the existing atomic setup endpoint and keeps the parent UUID. Existing populated variant lists and standard products retain their previous behavior. No migration or allocation/permission decision is required.

Regression coverage in `tests/e2e/progressive.spec.ts` provisions a parent with Colour and Size but no combinations, verifies required fields prevent advancing empty, retains values on Back and saves RED-A5 against the same parent. `npm run typecheck` passed. `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` passed both browser scenarios, including the new regression (20.2 seconds). The new variant-entry screenshot was visually inspected. No test failures, schema changes, migrations or new business decisions. Next recommended vertical slice remains receiving and its immutable ledger.


## Supplier creation form correction

Add supplier now starts with the new supplier name and generated code preview, without an existing-supplier dropdown. The separate per-supplier Set up location action passes a fixed supplier identity and displays its name as a summary. Product entry still selects existing suppliers. No API, migration, allocation rule or permission change was required. Changed files: `apps/web/components/catalogue/setup-wizards.tsx`, `tests/e2e/progressive.spec.ts`, and this report. Acceptance assertions cover both creation without a supplier selector and the contextual location-setup route. `npm run typecheck` passed; `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` passed both browser scenarios. No failures. README also updated. Next recommended slice remains receiving and its immutable ledger.
