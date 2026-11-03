# Brick 4 + Brick 5A — receiving implementation report

Authorization: owner Task 3 approval, 2 November 2026. Local development implementation only; no production deployment. QR/labels, production issues, production damage, recoveries/dispositions, corrections, physical counts, closing and synchronization transport are **not implemented**.

## Delivered workflow

Admin and Inventory Manager have a Receiving & stock workspace. Receive delivery progresses through Supplier/source → Products/variants → Quantities/delivery details → Review → Confirm receipt. One source may include several distinct parent products and variants, always using saved source-specific SKUs. No catalogue creation or SKU reallocation is performed. Missing catalogue entries must be prepared by Admin separately.

Enter usable and damaged integer quantities separately, with a meaningful explanation for damaged arrivals. Derived delivered totals are shown per line and overall. Back retains entries, draft lines can be removed, Escape/Close asks to discard, Keep editing retains rows. Only final confirmation writes. A submission ref blocks accidental double clicks; the request fingerprint and UUID idempotency key remain in session storage on failure and are reused by retry.

Acceptance shows the immutable batch code, origin-qualified identity, factual delivery date, server acceptance time, lines, damage evidence and usable/damaged totals. Operational stock refreshes after acceptance and can be viewed by exact SKU/batch, by SKU totals or by shared parent totals. These aggregates retain their underlying lot provenance. Recent receipts show the latest 100 and reopen accepted detail. Production has no receiving navigation, and all backend receiving/stock endpoints deny Production independently of UI.

## Schema and migration

Added seven Prisma models and `prisma/migrations/202611020004_receiving_ledger/migration.sql`:

| Model | Purpose |
| --- | --- |
| DeliveryBatch | One immutable delivery/source; UUID identity, origin-scoped public number, delivery date and acceptance metadata/snapshot |
| Receipt | Accepted batch and stock transaction linkage |
| ReceiptLine | Exact SKU/lot, usable/damaged BIGINT parts, database-generated total, damage explanation and historical identity snapshot |
| StockLot | Immutable SKU + batch identity, with source/origin provenance |
| StockTransaction | RECEIPT-only accepted command group, actor/role/time/origin sequence |
| StockMovement | Positive E→U/E→D parts, exact line/lot/transaction, no zero movements |
| StockBalance | Nonnegative internal-state projection derived from accepted movements |

Applied the additive migration to both local development and isolated test PostgreSQL. Earlier migration files are unchanged. Existing supplier, parent, variant, source, sourcing, prefix and SKU records were not renamed, merged or backfilled. No opening stock or development sample stock was seeded.

A migration rehearsal uses a temporary schema inside a rollback-only test transaction: apply migrations 001–003, insert legacy CHILG03849-STD and generated GENLG00001-STD under shared parent/variant identities, snapshot all catalogue rows, apply 004, compare identities unchanged and verify empty ledger. It does not reset either working database or erase accepted history.

## Allocation, dates and API boundaries

Batch codes use B-YYYYMMDD-NNNN, with the date taken from acceptance in Africa/Lagos. Number scope is origin + acceptance date, guarded by the same OriginNode row lock as catalogue writes; max daily ordinal +1, unique database indexes. Failed transactions consume no number. Width expands at 10000; integer capacity exhaustion returns conflict rather than wrapping. No counter table is needed. Across independent origins a readable code may repeat: the globally meaningful public identity is (origin UUID, publicCode); batch UUID is always the primary identity.

Factual deliveredOn is DATE, validated as a real Gregorian date from 0001-01-01 through the current Lagos date; no historical closing restriction. acceptedAt/recordedAt are server-controlled timezone-aware timestamps obtained after the origin lock. originSequence is accepted-command order. A backdated delivery retains today's acceptance order/code date. This slice introduces no business closing calendar.

Each quantity part is a JSON integer 0..2147483647, at most 100 distinct SKU lines, positive derived line sum. The existing 32,000-byte API/proxy request cap also applies; a large number of maximum-length explanations can exceed that transport limit and must be shortened before submission. Damaged explanation is trimmed 10..2000 characters and must include a letter. These documented request/resource limits are engineering validation choices. All persisted quantities/sequence fields returned through JSON use decimal strings. The client cannot supply totalQuantity, batch code/UUID, timestamps, state, actor, origin or balances.

| Endpoint | Access / result |
| --- | --- |
| GET /v1/receiving/options | Admin/Manager: sourced supplier/source/product/variant/SKU selection fields |
| POST /v1/receipts | Admin/Manager, SHOP only, required UUID Idempotency-Key; atomic multi-product receipt |
| GET /v1/receipts | Admin/Manager: current origin's latest 100 receipt summaries |
| GET /v1/receipts/:id | Admin/Manager: immutable accepted detail, current origin only |
| GET /v1/stock | Admin/Manager: local U/D lot balances plus SKU/product aggregates and asOf; optional sourceId/skuId/productId/batchId UUID filters |

Receiving responses are allowlisted; no valuation, credentials or unrestricted audit payload is exposed. Existing same-origin Next proxy and HttpOnly session handling are reused, including origin checks for POST. No external call occurs in the stock transaction; the browser uses only the local shop service. Cloud receiving writes return 403.

Example request (UUIDs are placeholders):

```json
{
  "sourceId": "<supplier-source UUID>",
  "deliveredOn": "2026-11-02",
  "invoiceReference": "INV-42",
  "lines": [
    { "skuId": "<Red SKU UUID>", "usableQuantity": 30, "damagedQuantity": 2, "damageReason": "Covers damaged during delivery" },
    { "skuId": "<Brown SKU UUID>", "usableQuantity": 20, "damagedQuantity": 0 },
    { "skuId": "<Pen SKU UUID>", "usableQuantity": 12, "damagedQuantity": 1, "damageReason": "Pen barrel cracked on arrival" }
  ]
}
```

Response includes id, batch {id,originId,publicCode,deliveredOn,numberedOn,acceptedAt,invoiceReference,supplierName,sourceName}, originSequence, immutable line details and totals `{ "usable": "62", "damaged": "3", "delivered": "65" }`. Stock responses include exact lotId/skuId/batchId/sourceId/productId provenance and decimal-string usable/damaged values; aggregate views never replace those lot records.

## Transaction, ledger and projection invariants

Authenticate/authorize → validate Zod → transaction → origin FOR UPDATE → User FOR SHARE and active-role recheck → same key/hash replay or changed-body 409 → resolve immutable source/SKU relationships → allocate batch → stock transaction, receipt, lines/lots → movements/projections → audit/outbox → stored command response → deferred constraints → commit.

Every new receipt lot is new and independent. The origin lock prevents code/sequence/idempotency races; future existing-lot operations must add sorted lot/state locks after the origin lock. P2034 conflicts retry twice with the same key. No balance update can bypass movement evidence. Same actor/key/body returns the original accepted response; another body conflicts; different keys are deliberate separate deliveries. Invoice references are optional and nonunique.

Deferred SQL checks require complete accepted transaction evidence, matching source/lot/SKU/batch relationships, one distinct SKU line, at most one U and one D part per line, exact usable/damaged sums, no unrelated/orphan movements, and matching U/D projections. FKs and origin/actor/command/outbox/audit checks preserve provenance. All six historical tables reject UPDATE/DELETE. Creation-transaction insert guards prevent supplementation of committed batches. StockBalance forbids negatives and E rows; deferred equality guards reject forged quantities and deletion of positive projections. totalQuantity is generated, not client-trusted.

For every lot/state, balance = sum accepted incoming − sum accepted outgoing. Damaged intake never increases U. Operational stock reads use a repeatable-read transaction so details and aggregates share a snapshot. Independent integration reconciliation compares every projection to ledger sums. This proves internal accounting, not physical shelf accuracy.

Future U→P/P→D/D→U and correction/reversal transitions remain disabled until their domain records, eligibility, authorization and compensating-event constraints are implemented. Nothing in this milestone enables a generic movement editor.

## Executed verification

- Prisma generation: passed.
- Development and isolated test `prisma migrate deploy`: migration 004 applied successfully to both databases.
- Unit tests (`node scripts/run-vitest.mjs run`): 11 passed across 4 files, including date/calendar, Lagos midnight, batch width, damaged evidence, duplicate/unknown inputs and quantity boundaries.
- Integration (`node scripts/run-vitest.mjs run --config vitest.integration.config.ts`): 25 passed across 3 files. Includes all 12 catalogue/variant-extension regression tests, 12 receiving tests and the migration rehearsal.
- Initial browser suite (`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`): 3 passed, including existing catalogue/variant-extension scenarios and new Manager receiving.
- Final browser rerun after allowlist/modal refinements and scenario timeout correction: all 3 passed (37.0s catalogue/extension, 22.9s first-combination regression, 15.9s receiving).
- Typecheck: final `npm run typecheck` passed, including all new integration/browser test sources.
- Production build: passed after the UTF-8 correction (contracts, Prisma, API and optimized Next.js build).

Receiving integration evidence covers: 62 usable/3 damaged/65 delivered in one three-SKU multi-product batch; second Red delivery in a new lot; same shared variant from another supplier; per-lot/SKU/product totals; concurrent same-key replay; changed-body conflict; lost-response-style replay; separate intentional receipts; concurrent unique codes; backdated date versus sequence; damaged-only intake without a zero usable movement; real database width expansion past 9999; independent origins with equal readable codes/different UUIDs; role/auth/cloud denial; allowlist checks; rollback after prepared movements/audit/outbox failure; immutable history; negative/forged balances; external-boundary rejection; supplementation rejection; duplicate lines, missing movements, orphan movement, cross-source and SKU/lot mismatch, zero/negative movements, incorrect sums and missing transaction evidence; global projection reconciliation.

Browser evidence: Manager selects Red/Brown notebooks plus Pen, enters 30/2 +20/0 +12/1, reviews 62/3/65, retains quantities through Back and Keep editing, submits a receipt whose successful upstream response is deliberately replaced by a simulated 503, retries the same key and receives the same accepted receipt with exactly three lots. Production navigation/API access is denied. Screenshots generated under ignored test-results: receiving-review-desktop.png, receiving-review-mobile.png and receiving-accepted.png; inspected visually.

Development failures corrected: initial typecheck found an unchecked database-clock array element and test typing issues; receiving fixture login failed because stored test email used uppercase while login normalizes lowercase; migration test SQL quoting was corrected before its successful execution. One build failed on a Windows-encoded separator introduced in a UI edit; file was corrected to UTF-8. Final results above are updated only after successful reruns. The later long catalogue regression hit its 60-second whole-scenario timeout after successfully saving the variant extension (at the final catalogue GET); both other scenarios passed. Its scenario-specific budget was increased to 120 seconds for its multiple supplier/product/extension/discard journeys, with no assertion removed. Final rerun is recorded above. Node NO_COLOR/FORCE_COLOR warnings are non-blocking.

## Files changed

- `prisma/schema.prisma`; new `prisma/migrations/202611020004_receiving_ledger/migration.sql`.
- `packages/contracts/src/index.ts`.
- New `apps/api/src/receiving.service.ts`; `apps/api/src/app.ts`.
- New `apps/web/components/receiving/receiving-workspace.tsx`; `apps/web/components/catalogue/wizard-shell.tsx`; `apps/web/app/page.tsx`; `apps/web/app/api/[...path]/route.ts`.
- New `tests/unit/receiving.test.ts`, `tests/integration/receiving.test.ts`, `tests/integration/receiving-migration.test.ts`, `tests/e2e/receiving.spec.ts`; `tests/e2e/setup.ts` adds test-only Manager/Production accounts; `tests/e2e/progressive.spec.ts` gives its long regression scenario a 120-second budget.
- `README.md`; `docs/receiving-ledger-design.md`; `docs/decisions.md`; `docs/architecture.md`; `docs/data-model.md`; `docs/ledger-invariants.md`; `docs/requirements-traceability.md`; `docs/IMPLEMENTATION_BRICKS.md`; new `docs/receiving-implementation-report.md`.

## Limitations, review and next milestone

No unresolved business decision blocks the implemented approved slice. Existing catalogue has no active/deactivated flags, so receiving does not claim inactive-identity filtering beyond current identity/role rules. Latest-receipt list is capped at 100; known receipt UUIDs remain retrievable. Operational stock currently returns all matching lots; pagination/performance tuning should precede a large rollout. Immutable snapshots preserve receipt-time display identities, while current stock views use current names and immutable IDs.

Drafts persist while the modal is open; session storage preserves pending request fingerprint/key for same-payload retries, not a complete reloadable draft. After an uncertain response, retry unchanged or check recent receipts before intentionally creating a separate delivery. Distinct keys are not automatically deduplicated by invoice.

Runtime/migration credential separation, backup/restore and shop HTTPS/hardware readiness remain rollout hardening work. Local smoke check signed in and read receiving/options, stock and receipts successfully (HTTP 200); web returned HTTP 200. An initial smoke attempt hit the API watcher during restart, and a duplicate startup attempt found the existing port occupied; the duplicate was stopped and the existing service verified. No development stock was created by this check. The existing local native PostgreSQL fallback is preserved; starting an empty Docker database instead would not carry this data. No production deployment was performed. SQL deferred/provenance/generated-column constraints must be preserved in future migrations; never blindly regenerate/delete these guards.

Recommended next milestone after owner review: Brick 5B QR identity/label design and hardware validation, or a separately authorized production issue slice after its permissions/reference decisions. Neither has begun. Stop here for review.
