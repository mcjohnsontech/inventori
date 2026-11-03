# Variant extension and receiving-design handoff

2 November 2026. Task 1 implemented; Task 2 proposed for review; Task 3 not started. No QR printing, production issue, damage, closing or cloud transport was added.

## Delivered behavior

Admin opens Add product, chooses the saved supplier location and existing populated option product, then chooses **Add new variant combinations** at the Variants step. Enter Green/Tan and explicit suffixes, review and save. All existing attribute names are used; adding/removing attribute dimensions is deliberately excluded because existing variant identities must stay unchanged. Up to the existing 30-row request limit applies to new rows, not the product's total variant count.

The request uses existing `product-setups` with optional `extendVariants: true`. The ordinary setup request omits this field, preserving its canonical payload/replay behavior. Extension requires an existing parent, nonempty new-combination rows and the complete existing attribute set. An already existing combination returns 409 instead of implicitly reusing or renaming it. Case-sensitive attribute/value matching follows the established identity rules; this task does not introduce guessed aliases or new normalization rules.

Existing parent/variant/supplier/source/SKU records are never updated. Attribute values, combinations and selected-source SKUs are inserted inside the existing origin-locked transaction. The saved source/product base is reused, and new full codes append explicit approved suffixes. Other suppliers are not automatically allocated SKUs; the new shared variants can later be selected for their sourcing. An allocated standard product is not automatically converted to an option product. First-combination setup and ordinary existing-variant selection remain available.

Database uniqueness and immutable guards stay in force. Duplicate combinations, duplicate rows, suffix collisions or incomplete/changed dimensions roll back all inserted values, variants, SKUs, audit, command and outbox effects. Same-key same-body retry returns the saved response. Different-key attempts to add the same combination serialize and produce one success/one conflict. Existing Admin-only creation, Manager-read and Production-denied catalogue permissions remain unchanged. The existing accepted snapshot/outbox event includes the parent and new accepted SKU group; no stock changes occur.

Back between Variants/Review retains rows. Closing still asks to discard the draft. Browser acceptance covers Keep editing with Green/Tan retained and saves against the original parent/base. Product reselection still starts the selected product's variant draft, as before.

## Files changed

Code and tests:
- `packages/contracts/src/index.ts`: optional extension flag, existing suffix/row validation preserved.
- `apps/api/src/catalogue-setup.ts`: strict extension guards and duplicate-combination conflicts; existing transaction/audit/idempotency runner reused.
- `apps/web/components/catalogue/setup-wizards.tsx`: extension action and existing-attribute draft rows.
- `tests/integration/catalogue.test.ts`: extension/identity/rollback/concurrency/authorization coverage; terminal Admin-deactivation test remains last.
- `tests/e2e/progressive.spec.ts`: Green/Tan extension, Back/Keep editing and old SKU checks.

Documentation:
- `README.md`, `docs/progressive-catalogue-report.md`, `docs/decisions.md`, `docs/requirements-traceability.md`, `docs/ledger-invariants.md`.
- New `docs/variant-extension-report.md` (this report).
- New `docs/receiving-ledger-design.md`: proposed schema, ERD, API/transaction boundaries, invariant/concurrency rules, migration plan, acceptance matrix and owner decisions.

## Database migrations

None. Current Prisma schema and migrations 202611020001–003 are unchanged. Existing constraints already enforce canonical combination uniqueness and immutable variant/SKU/source identity. No operational records were renamed, merged or backfilled. Test records were added only to the isolated local test database.

The proposed receiving migration has not been generated or applied. It adds seven tables and supporting provenance indexes only after owner review.

## Actual verification

- `npm run typecheck`: passed.
- `node scripts/run-vitest.mjs run`: 8 unit tests passed.
- `node scripts/run-vitest.mjs run --config vitest.integration.config.ts`: 12 tests passed, including transactional late-row rollback, rejected duplicate combinations, suffix collision, incomplete/foreign attributes, same-key concurrent replay, different-key duplicate race, supplier-specific sourcing, preserved old variants/SKUs and role/authentication rejection.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 2 browser scenarios passed. The progressive scenario now extends Red/Brown with Green/Tan, retains both draft rows and verifies the original base and SKU codes. The blank-first-combination regression also passed.
- `npm run build`: passed (contracts, Prisma generation, API TypeScript and Next.js production build).

Two initial integration runs failed because the newly appended test ran after the existing test that deactivates its shared Admin. Moved the deactivation test back to the end and reran successfully. This was test setup/order, not a permission bypass or production behavior change. Non-blocking Node NO_COLOR/FORCE_COLOR warnings appeared in browser startup.

## Design review and affected behavior

`receiving-ledger-design.md` is PROPOSED. Confirm batch scope/supplementation, damaged intake, task-level Manager/Admin visibility, batch code/date policy and nonnegative foundation constraints before Task 3. Existing prefix/random SKU/suffix policies are not reopened. Deferred approvals/closing/hardware decisions remain deferred.

Task 1 adds an explicit extension mode to the existing setup endpoint and wizard; it does not edit old variants, change legacy API reuse behavior, expand Manager permissions, allocate variants automatically to every supplier or implement stock. No receiving endpoint/table exists yet. Next action is owner review of the design, not receiving implementation.
