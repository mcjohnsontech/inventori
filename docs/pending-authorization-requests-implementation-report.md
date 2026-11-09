# Pending recovery/correction requests — milestone 7B

Status: software verification complete; milestone publication follows. Cloud approval execution remains deferred. Cloud approval delivery and execution are explicitly deferred under owner O5. This slice does not perform recovery or correction.

## Workflows

Inventory Manager may record an immutable recovery request for exact currently damaged units, including their current recorded versions, last events and BAD or damaged-intake provenance. Manager may also report a quantity discrepancy for one exact existing lot and internal state (Usable, In Production or Damaged), with a nonnegative observed quantity and meaningful explanation/supporting evidence.

Correction review independently reads the immutable ledger total and current projection. Submission echoes those displayed values only as optimistic-concurrency preconditions; the server recalculates both under the origin lock and rejects stale review values. Client quantities never become stock authority. The server derives the signed requested difference. A matching observation is rejected when projection and ledger also agree; an actual projection mismatch can still be investigated. Positive observations do not create extra units or fictitious historical receipts. This observation is request evidence, not a certified physical-count workflow.

Every accepted record stays PENDING_CLOUD_AUTHORIZATION. Admin/Manager can review scoped history/evidence; only Manager submits. Production receives no request administration or supporting evidence. There is no local Approve, Reject, Execute, authorization import, substitute signature/trust mechanism or automatic approval. Same-key retries return the original pending result, including after a later legitimate disposition changes the selected unit. Future cloud authorization must revalidate current state, quantities, identities and provenance before any execution.

## Schema and transaction

- Additive `202611080025_pending_authorization_requests`: immutable AuthorizationRequest and exact AuthorizationRequestUnit tables; hashed canonical evidence, pending-only status, derived BIGINT discrepancy, current damaged-unit/version/provenance checks, complete audit/outbox/result group, no stock transaction/event under the request command, late-child and mutation/deletion guards.
- Additive `202611080026_request_review_preconditions`: new correction evidence must match the reviewed ledger/projection values. NOT VALID preserves any older immutable request evidence while enforcing the constraint for new writes; no historical data is rewritten.

One origin-first transaction fences current Manager/session/membership, locks exact units/state or lot projection deterministically, resolves all targets server-side, appends request/children, audit/outbox/idempotency result and origin metadata sequence, and commits atomically. There are no external calls in the transaction. No StockUnit, UnitState, UnitEvent, StockMovement, StockTransaction, StockBalance, receipt, checkout, damage, QR or print mutation is performed.

The evidence hash is local integrity evidence, never an authorization token or substitute cloud trust mechanism. Accepted request status/evidence is immutable; future decisions require separate approved records/read models.

## API

Authenticated `/v1` endpoints:

- `GET /authorization-request-config`: current origin, selection limit, Manager submission capability, deferred delivery and execution disabled.
- `POST /authorization-requests/preview`: read-only recovery UUID selection or exact correction lot/state.
- `POST /authorization-requests`: Manager only, mandatory Idempotency-Key; strict typed recovery/correction request.
- `GET /authorization-requests?page=1&kind=RECOVERY`: 20-row scoped history; kind optional.
- `GET /authorization-requests/:id`: frozen pending evidence for Admin/Manager.

Recovery example:

```json
{"kind":"RECOVERY","unitIds":["<saved-unit-uuid>"],"reason":"Inspect repaired cover for possible recovery","evidence":"Original BAD record and repair observations reviewed"}
```

Correction example:

```json
{"kind":"CORRECTION","lotId":"<saved-lot-uuid>","state":"U","observedQuantity":"2","reviewedLedgerQuantity":"3","reviewedProjectionQuantity":"3","reason":"One item was not found during observation","evidence":"Observed two usable items; discrepancy remains unresolved"}
```

Response includes request UUID, origin, server recordedAt, accepted originSequence string, Manager, pending status, frozen preview/evidence/hash, observed quantity and signed difference as decimal strings, `stockChanged:false` and `approvalDelivery:DEFERRED`. No success response claims an executed recovery/correction.

## Frontend

Recovery & corrections workspace uses the existing visual system, Manager draft/review/confirmation, exact Unit Code/DYI:2/camera selection, saved lot picker with search/pagination, separate state and observation entry, meaningful evidence, discard confirmation, Back/reload preservation, stable-key uncertain retry, accepted pending evidence and paginated/filterable history. Admin has read-only history with no hidden substitute approval action. Recovery links are available from Manager damage review.

Recovery-request entries appear only in operational unit timelines and are explicitly labelled pending metadata without a stock transition. Production never receives these entries or their supporting evidence. Domain-readiness checks were combined into one query to preserve pre-request schema compatibility and avoid redundant tracking round trips. Record drawers preserve browsing context; unit drill-down does not stack competing modal focus traps.

## Actual verification so far

- Isolated migrations 025/026 and Prisma generation passed.
- Initial request integration suite **9/9 passed**: role/origin scope, canonical concurrent replay/conflict, signed discrepancies, stale review, all-or-nothing validation, complete late-failure rollback, immutable/pending-only history, absent approval/execution endpoints, later disposition replay, pagination and 500-unit metadata capacity with unchanged stock fingerprints.
- Request/damage/tracking integration repeat **25/25 passed together**, including operational timeline inclusion and Production evidence exclusions.
- Full unit suite **77/77 passed**, 23 files.
- Typecheck initially found a wrong reusable search-component import; corrected to existing SearchInput. A subsequent typecheck passed before final browser/rehearsal additions.
- Browser, populated migration preservation, broader regressions and final build/typecheck are being completed; no unexecuted check is counted as passed.

## Closing and deferred execution

An unresolved correction remains certification evidence requiring resolution/authorization. A recovery request by itself does not alter already-certified Damaged accounting or automatically block fully accounted held stock; any underlying discrepancy or missing-evidence blocker still applies. Manager closing implementation under O4 follows in a later milestone and must derive these checks server-side. No client nonblocking override exists.

Supporting evidence here is factual text and record references. File-upload infrastructure, request withdrawal/supersession, cloud decisions/delivery and stock execution are not introduced. Historical extra physical items remain unresolved rather than receiving fabricated identities. Technical limits: 500 exact recovery units, 30,000 normalized UTF-8 input bytes, safe PostgreSQL BIGINT decimal quantities, one atomic request; larger work needs explicit separate requests. Development timing is not shop-hardware certification.

No operational migration, real account/stock mutation, historical enrollment, live mail, deployment, local-server rollout or synchronization transport. Next milestone: Manager-selected Production completion and independent physical-count/discrepancy evidence.


### Browser and preservation checkpoint

Request browser journey passed **1/1** (1.9-minute run), including Manager draft/Back/discard/reload, same-key lost-response retry, quantity review, five-width screenshots, unchanged stock/unit count, Admin read-only evidence and Production denial. Mobile review and desktop accepted screenshots were visually inspected: neutral quantity presentation, explicit pending status, readable exact provenance, reachable actions and no horizontal overflow. A singular/plural history label was then corrected without changing behavior.

Isolated migration rehearsal preserved **all 58 prior-table fingerprints**, fabricated no requests and denied readiness before upgrade. Real synthetic recovery and positive-discrepancy requests then left all existing stock/history fingerprints unchanged; no extra units were created. Latest 500-unit request development sample is captured in pending-request-500-capacity.json; not a production hardware certification. Broader regressions/build/typecheck remain in progress.


### Final backend/build checkpoint

Full PostgreSQL integration suite passed **141/141 across 19 files** (405.46 seconds). Deliberate audit/outbox failure logs are rollback-test stimuli, not failed tests. Final TypeScript check and production API/Next.js build passed. No application timeout or security assertion was relaxed. Seven selected browser regressions are running separately against isolated fixtures.


## Changed files for this slice

- `apps/api/src/authorization-requests.service.ts`
- `apps/web/components/authorization-requests-workspace.tsx`
- `apps/web/lib/authorization-request-draft.ts`
- `docs/evidence/completion/milestone-7/pending-request-500-capacity.json`
- `docs/evidence/completion/milestone-7/pending-request-preservation.json`
- `docs/images/completion/milestone-7/pending-request-accepted-1440.png`
- `docs/images/completion/milestone-7/pending-request-review-1024.png`
- `docs/images/completion/milestone-7/pending-request-review-1440.png`
- `docs/images/completion/milestone-7/pending-request-review-320.png`
- `docs/images/completion/milestone-7/pending-request-review-390.png`
- `docs/images/completion/milestone-7/pending-request-review-768.png`
- `docs/pending-authorization-requests-implementation-report.md`
- `packages/contracts/src/authorization-requests.ts`
- `prisma/migrations/202611080025_pending_authorization_requests/migration.sql`
- `prisma/migrations/202611080026_request_review_preconditions/migration.sql`
- `scripts/rehearse-authorization-requests.ts`
- `tests/e2e/authorization-requests.spec.ts`
- `tests/integration/authorization-requests.test.ts`
- `tests/unit/authorization-requests.test.ts`
- `apps/api/src/app.ts`
- `apps/api/src/damage.service.ts`
- `apps/api/src/unit-tracking.service.ts`
- `apps/web/app/api/[...path]/route.ts`
- `apps/web/components/damage-workspace.tsx`
- `apps/web/components/shell/destinations.ts`
- `apps/web/components/unit-tracking-drawer.tsx`
- `apps/web/components/workspace-router.tsx`
- `docs/IMPLEMENTATION_BRICKS.md`
- `docs/architecture.md`
- `docs/dayari-completion-progress.md`
- `docs/decisions.md`
- `docs/ledger-invariants.md`
- `docs/recovery-correction-request-design.md`
- `docs/requirements-traceability.md`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/permissions.ts`
- `packages/contracts/src/unit-tracking.ts`
- `prisma/schema.prisma`


## Final verification and review

- `npm test`: **77/77**, 23 files.
- `npm run test:integration`: **141/141**, 19 files, 405.46 seconds.
- `npm run typecheck`: passed.
- `npm run build`: API and production Next.js build passed.
- `npm run test:e2e -- tests/e2e/authorization-requests.spec.ts tests/e2e/damage.spec.ts tests/e2e/unit-tracking.spec.ts tests/e2e/receiving.spec.ts tests/e2e/labels.spec.ts tests/e2e/unit-labels.spec.ts tests/e2e/checkouts.spec.ts`: **7/7 passed together**, 4.9 minutes. Includes uncertain retries, role privacy, receiving, BAD, exact checkout, DYI:1/exact-unit printing and tracking regressions.
- Five-width request screenshots saved; final 320px review and 1440px accepted/history screens visually inspected. Existing regression screenshot fixtures were restored rather than replacing prior milestone evidence with random synthetic data.
- Latest 500-unit metadata request sample: **2,473.7507 ms**, one development loopback sample, stock unchanged. This is not production throughput certification.
- Populated isolated migration rehearsal preserved all **58** pre-existing table fingerprints; requests created no extra units and changed no stock/history fingerprints.
- `git diff --check`: passed before publication. No operational migration, historical enrollment, live mail or deployment. Remote CI execution remains unverified.

Screenshots: `docs/images/completion/milestone-7/pending-request-review-{320,390,768,1024,1440}.png` and `pending-request-accepted-1440.png`. Sanitized preservation/capacity evidence is under `docs/evidence/completion/milestone-7/`.

Next: Manager-selected production completion (O8), then targeted counts once the remaining concurrency/recount policy is confirmed. B05 roles, exact scope and zero tolerance are approved; the separate pending policy is not inferred from that approval.
