# Production completion — milestone 8A

Status: software verification complete; publication follows. This is the approved O8 slice, separate from B05 physical counts. No operational migration or deployment.

## Implemented behavior

Only a current Inventory Manager confirms an explicit selection of eligible In Production units. Admin reviews work/history; Production has no completion administration. Exact Unit Code/DYI:2/camera selection, paginated work search, review, draft Back/discard/reload, stable-key uncertain retry, immutable accepted evidence and history preserve original checkout/holder/order/lot context. Order IDs remain reusable opaque references: completing one subset never completes other units or reopens old history.

Each selected unit records one P → C movement and a contiguous COMPLETED event. Completed quantities remain in the ledger and C projection; usable stock is not deducted again. Damaged, removed, usable and already-completed units are rejected atomically. No recovery, correction execution or generic set-state endpoint.

## Schema and transaction

Additive isolated migration `202611090027_production_completion` adds immutable ProductionCompletion and ProductionCompletionLine, exact checkout/unit/previous-event/movement/event uniqueness, nullable provenance columns on StockMovement/UnitEvent, and only the Manager COMPLETE/P-to-C branch. New completion groups require complete domain/ledger/audit/outbox/command evidence, current Manager membership, exact graph and snapshot checks, no late children, matching projections and native census including C. Existing enabled receipt/checkout/damage branches are retained. No applied migration was edited.

Origin-first transaction: lock current shop/actor, verify session/membership/Manager, canonical replay/conflict, sorted exact unit/state/lot locks, server resolve current issued provenance, allocate command/transaction, append root/lines/movements/events, update rebuildable P/C projections, audit/outbox/idempotency result and origin sequence, commit together. No network calls. Concurrent BAD and completion serialize; only one transition accepts.

## API

Authenticated `/v1`: GET completion-config, GET completion-options?page=1&query=..., POST completions/preview, POST completions (Idempotency-Key required), GET completions?page=1&query=..., GET completions/:id. Operational Admin/Manager reads, Manager-only write; Production denied directly.

POST example: `{ "unitIds": ["<saved-exact-unit-uuid>"] }`. The response preserves completion UUID, origin, server recordedAt, decimal originSequence, transaction UUID, Manager, manifest hash and exact accepted lines with saved Unit Code, supplier SKU, lot/batch, original checkout/line, Order ID and recorded holder. Replays return the frozen result.

## Verification in progress

- Isolated migration 027 and Prisma generation passed.
- Initial targeted run exposed an outbox shape error and cascading failures; corrected without changing immutable migration history. The rollback fingerprint test initially hashed the entire growing test database and timed out; scoped it to the synthetic shop rather than relaxing its assertion or timeout.
- Subsequent targeted completion integration: **9/9 passed** (14.21 seconds): Manager-only mutation, subset/no U deduction, canonical concurrent replay/conflict, ineligible/mixed rollback, independent repeated Order IDs, BAD/completion race, complete late-failure rollback, immutable records/projection bypass/origin isolation and pagination.
- First frontend typecheck exposed mismatched reusable component/hook signatures; corrected to existing APIs. A subsequent typecheck passed before final browser/evidence changes.
- Populated isolated rehearsal preserved **60** prior-table field fingerprints, fabricated no completions, denied pre-migration readiness and preserved all prior immutable identities/receipts/checkouts/QR/print/request history after real synthetic completion. U quantity and projection version unchanged. Only the newly added nullable provenance field was excluded when comparing prior fields.
- First browser fixture referenced receipt-unit `unitId` instead of its actual `id`; corrected fixture. Browser repeat, final multi-source/500-unit tests, full regressions/typecheck/build and visual review remain in progress. No unexecuted check is counted as passed.

## Boundaries and next work

Maximum 500 exact selected units per atomic confirmation; larger work uses separate explicit confirmations. Performance evidence is development-only, not shop hardware certification. Historical stock without enrolled units cannot be completed by inventing identities. No live enrollment, operational migration, approval-delivery trust mechanism, cloud synchronization, live email or deployment.

B05 targeted-count roles/exact scope/zero tolerance are approved. The separately asked concurrency/recount/resolution policy remains pending; this O8 implementation does not infer its approval. Counts/closing are not complete. Next independent milestones remain counts, strict Manager closing, investigation/reporting, authentication hardening and final UX/regressions as permitted by their policy dependencies.


### Browser and unit checkpoint

Completion browser journey passed 1/1 (1.3 minutes): Manager exact selection, Back/discard/reload, lost-response same-key retry, immutable checkout context, no additional U deduction, untouched other same-order units and Admin review-only page. Full unit suite passed 79/79 across 24 files. Visual inspection found narrow mobile description columns and damaged separator glyphs; corrected local mobile item-row presentation and separators. Final browser repeat will verify those changes. No assertion was disabled.


### Browser and unit checkpoint
Completion browser journey passed 1/1 (1.3 minutes): Manager exact selection, Back/discard/reload, lost-response same-key retry, immutable checkout context, no additional U deduction, untouched other same-order units and Admin review-only page. Full unit suite passed 79/79 across 24 files. Visual inspection found narrow mobile description columns and damaged separator glyphs; corrected local mobile item-row presentation and separators. Final browser repeat will verify those changes. No assertion was disabled.


### Expanded regression checkpoint

The full integration run reported 151 passes and one new 500-unit fixture failure (missing required nullable Order ID in the preparatory checkout). The fixture now supplies `orderReference:null`; the final expanded completion suite passed **12/12** (21.17 seconds), including cross-source/batch/holder provenance, actual 500-unit completion, late-child/deletion denial, cloud-write denial and completed timeline provenance. Thus 153 distinct integration cases have successful executions across the full and targeted runs; this is not labelled a single all-green full run. Latest completion sample: **1,866.3694 ms**, one development loopback/one-lot sample, U projection unchanged.

The eight-browser regression run had six passes and two failures: completion asserted retry visibility before the simulated failed response completed; fixed the test to await the actual failed request. Receiving exceeded its unchanged 90-second test deadline during a host pause (reported elapsed 6.9 minutes). Both are being repeated without increasing application/test deadlines or weakening assertions. Mobile rows and separator glyphs are visually corrected; final screenshot review follows.

A final root typecheck caught nullable JSON typing in the late-child negative fixture; explicit JSON input conversion fixed it, and typecheck then passed. Production build passed; final layout compile/publication follows.


### Final database guard checks
The final completion integration suite passed **13/13** (15.89 seconds). It explicitly verifies the late-child guard message and an otherwise valid command/outbox COMPLETE transaction lacking its domain root. The orphan test initially failed on its missing outbox foreign key; supplying valid prerequisite evidence made it exercise the intended completion constraint. Its command/outbox/transaction all roll back. Across the full and targeted runs, **154 distinct integration cases** have successful executions; no single all-green full-run claim is made. Final production build and root typecheck passed.

Completion and receiving browser repeats passed **2/2 together** (2.1 minutes), resolving the timing/host-pause failures without longer deadlines. The six other affected browser journeys passed in the preceding run. Mobile review rows and desktop accepted evidence were visually inspected, including reachable controls and full-width product/SKU/lot context. A final text-only timezone/singular correction is receiving a fresh screenshot pass. Latest 500-unit development sample: **1,157.7105 ms**, one sample/one lot, U projection unchanged; not hardware certification.


## Changed files

- `apps/api/src/completions.service.ts`
- `apps/web/components/completion-workspace.tsx`
- `apps/web/lib/completion-draft.ts`
- `docs/evidence/completion/milestone-8/completion-500-capacity.json`
- `docs/evidence/completion/milestone-8/completion-preservation.json`
- `docs/images/completion/milestone-8/completion-accepted-1440.png`
- `docs/images/completion/milestone-8/completion-review-1024.png`
- `docs/images/completion/milestone-8/completion-review-1440.png`
- `docs/images/completion/milestone-8/completion-review-320.png`
- `docs/images/completion/milestone-8/completion-review-390.png`
- `docs/images/completion/milestone-8/completion-review-768.png`
- `docs/production-completion-implementation-design.md`
- `docs/production-completion-implementation-report.md`
- `packages/contracts/src/completions.ts`
- `prisma/migrations/202611090027_production_completion/migration.sql`
- `scripts/rehearse-completion-preservation.ts`
- `tests/e2e/completions.spec.ts`
- `tests/integration/completions.test.ts`
- `tests/unit/completions.test.ts`
- `apps/api/src/app.ts`
- `apps/api/src/unit-tracking.service.ts`
- `apps/web/app/api/[...path]/route.ts`
- `apps/web/components/damage-workspace.tsx`
- `apps/web/components/labels/unit-identity-result.tsx`
- `apps/web/components/receiving/received-units.tsx`
- `apps/web/components/shell/destinations.ts`
- `apps/web/components/unit-tracking-drawer.tsx`
- `apps/web/components/workspace-router.tsx`
- `docs/IMPLEMENTATION_BRICKS.md`
- `docs/architecture.md`
- `docs/dayari-completion-progress.md`
- `docs/ledger-invariants.md`
- `docs/requirements-traceability.md`
- `packages/contracts/src/damage.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/permissions.ts`
- `packages/contracts/src/unit-tracking.ts`
- `prisma/schema.prisma`


Final completion browser repeat passed 1/1 (1.3 minutes), with final five-width screenshots and desktop accepted screen reviewed. Timezone appears once; singular item wording is corrected. All eight affected browser cases have successful runs. `git diff --check` passed; previously tracked regression screenshots were restored. No operational migration, live stock/account mutation, historical enrollment, live mail, deployment or cloud approval execution. Remote CI execution remains unverified.
