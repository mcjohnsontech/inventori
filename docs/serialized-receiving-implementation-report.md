# Serialized receiving implementation report - milestone 2

Status: implementation and verification complete; feature-branch publication pending. No operational migration or deployment.

## Implemented

New receipts after the additive serialization cutover create exact physical-unit UUIDs, immutable six-character Unit Codes, initial receiving events, reconciled unit projections and hashed command-manifest pages. Allocation uses secure randomness, origin-scoped PostgreSQL uniqueness and 32 bounded collision rounds. Units never independently add stock. New intake remains one atomic origin-locked receipt command including ledger, balances, audit, outbox and idempotency.

Admin and Manager can inspect saved Unit Codes in a paginated accepted-receipt table. The review explains unit creation and validates the conditional 10,000-unit maximum. Production cannot access receipt administration. Existing catalogue allocation, Product/Lot Codes and DYI:1/lot printing remain unchanged.

## Migrations

014 adds StockUnit, UnitEvent, UnitState, UnitCommandManifestPage, SerializationCutover and LotSerialization. Historical classification creates metadata only, with no units. 015 prevents state-projection identity reassignment. 016 retains indexed UUID manifest joins. 017 performs equivalent insert-provenance validation with PostgreSQL transition sets. 018 removes redundant child receipt-group checks while retaining the deferred root validation, every child batch FK/same-transaction insertion guard, balance checks and unit completeness. Previously applied migration files were not modified.

Applied only to isolated local test fixtures. Operational database migration/activation remains separately gated.

## API

- `GET /v1/receiving/options`: optional `serializationActive` and `unitLimit` capability information.
- Existing `POST /v1/receipts`, same request and idempotency semantics; accepted native receipts add `serialization: {unitCount:"50",manifestPages:1}`. Quantities still derive from accepted movements.
- `GET /v1/receipts/:id/units?page=1&lotId=<optional UUID>`: Admin/Manager, current-origin accepted receipt; 20 units/page. Returns UUID, saved Unit Code, lot/receipt-line identities, product/variant/SKU, initial/current stock state and recorded time. No command secrets, password data or invoice metadata. Production denied. Unknown/foreign receipts return 404. Invalid queries rejected. Schema-unavailable unit reads return 503; existing pre-cutover receiving remains available.

Example saved Unit Code: `A7K2M9` (illustrative, not an operational allocation). Every character is part of the random code; there is no fixed U prefix. Receipt replay returns the original saved result, never new codes. Unit-Code search and DYI:2 are subsequent milestones.

## Correctness and preservation

The frozen pre-serialization receiving service is retained as a test fixture from commit 1839aa7. After cutover, its quantity-only and backdated writes are rejected atomically, including under a restricted runtime role unable to disable triggers. SQL checks reject late unit supplementation, immutable event/identity changes, projection identity forgery, incomplete initial evidence and duplicate/foreign manifest membership. Forced collisions, exhaustion, second-chunk failures and audit/outbox failures leave no receipt, ledger, balance, sequence, allocation or command-result effects.

Fresh isolated pre-014 rehearsal passed: historical catalogue/SKU/Product/Lot/receipt/ledger/command/audit/outbox/print tables unchanged, original PDF SHA-256 unchanged, historical replay identical, zero historical units, one explicit LEGACY lot, old writer rejected. Audit and outbox payloads include ordered immutable manifest page IDs and hashes. Initial rehearsal comparison failed on JSON object ordering; corrected canonical comparison passed on a fresh fixture. Planner rehearsal is read-only and reports one uncounted/unverified historical lot; no apply mode exists.

## Capacity evidence

Intel Core i5-8350U, 8 logical CPUs, approximately 8.42 GB RAM, Windows 10.0.26200; Node 24.16.0, PostgreSQL 17 (full recorded version in JSON). One warmup and three measured runs/case. HTTP maxima after warmup:

| Units | Receipt lines | Median ms | Max ms |
|---|---|---|---|
| 100 | 1 | 389.51 | 810.48 |
| 1,000 | 1 | 1,941.15 | 2,626.76 |
| 10,000 | 1 | 9,302.41 | 9,852.76 |
| 10,000 | 100 | 12,034.72 | 12,091.72 |

Final 100-line warmup: 13,033.61 ms. Database and proxy timeouts remain 15/20 seconds. Measurements include commit/deferred checks; p95 in the JSON means maximum of only three samples, not a production statistical guarantee. Peak process RSS and cluster WAL/storage growth are recorded. Internal chunks contain at most 500 units across line/state groups; exact unit provenance is retained. Observed random collisions retried successfully.

Earlier attempts failed at 10,000-unit timeout, and redundant deferred checks pushed commit beyond the request budget. Those failures drove indexed/set-based/bounded-chunk improvements; they are not passing runs. Benchmark CLI initially failed TypeScript decorator setup and variant-setup limits, both corrected without changing catalogue policy.

This demonstrates feasibility on this development host, not shop hardware certification. Rebenchmark on the intended hardware before operational cutover; 100-line headroom is modest. Larger deliveries require intentionally separate receipts. No partial receipt acceptance.

## Tests

- Unit suite: 51 tests / 16 files passed.
- Targeted receiving suites: 20 tests passed after chunk/set-validation changes.
- Full suite first attempt: 86 passed, 3 timeout/connection failures during multi-hour host timing gaps; not counted as passing. Repeat in progress.
- Final TypeScript check passed; production build passed before the final typography refinement. Final production build passed; final TypeScript rerun passed. Full browser run: 20 passed, two failed (an ambiguous heading locator after adding the unit section, and an invitation whole-test timeout). The corrected batch locator and unchanged invitation scenario subsequently passed together (2/2). The final typography capture rerun exceeded its 60-second whole-journey budget after all five captures; this expanded scenario now has a documented 90-second total budget with unchanged individual assertions and application timeouts. Final expanded-scenario retry passed (1/1), including receipt replay, all unit/pagination assertions, stock provenance and five width captures. This is not a claim that a single full 22-test run passed.
- Full PostgreSQL repeat: 89 tests / 12 files passed in 175.80 seconds with unchanged assertions/timeouts.
- Additional synthetic diagnostics: 1,000 units with 250-row chunks took 2,722.33 ms; 500-row chunks 1,391.29 ms; two concurrent 1,000-unit receipts at one origin completed as two distinct batches in 2,393.81 ms. These are single diagnostic runs, not percentile guarantees.
- Read-only operational inspection: dayari_dev remains through migration 013, StockUnit absent.

Evidence: `docs/evidence/completion/milestone-2/`. Screenshots at 320/390/768/1024/1440 pixels are in `docs/images/completion/milestone-2/`; actual captures at all five sizes were inspected. Unit Code typography was strengthened after visual review. Forty refreshed existing synthetic regression captures were reviewed in a contact sheet. Contention metrics and preservation/planner evidence are retained. Commit publication follows final verification.

## Limits and next milestone

No operational stock changed, no historical enrollment, no real email, deployment or hardware certification. No new lifecycle transition is enabled. Unit QR/printing, exact-unit lookup/timeline, checkout/reconciliation, damage/recovery, counts and daily close remain subsequent milestones. Checkout reason taxonomy remains open; Admin/Manager/Production checkout roles are approved. Dedicated server/LAN/sync transport remain deferred.

## Files and commands

Source: `prisma/schema.prisma`; new migrations 014-018; `apps/api/src/unit-receiving.ts`, receiving service/controller; same-origin API allowlist; shared units contracts/index; receiving wizard/details/new received-units component. Test support: frozen old receiving fixture, serialized/unit test suites, receiving regression adaptation and receiving browser assertions. Tools: serialized capacity/contention benchmarks, fresh fixture creation, cutover rehearsal and read-only historical planner; npm script entries. Documentation: README, architecture, ledger invariants, decisions, traceability, implementation bricks, progress, design/report, sanitized evidence and reviewed synthetic screenshots. Next's generated route-type reference changes follow build output. Exact paths are retained in `docs/evidence/completion/milestone-2/changed-files.json`.

Commands actually executed: `npm test`; `npm run typecheck`; `npm run build`; `npm run test:integration` and targeted receiving/serialized suites; `npm run test:e2e` and targeted invitation/receiving retries; `npm run units:benchmark`; `npm run units:benchmark-contention`; `npm run units:create-cutover-fixture`; `npm run units:rehearse-cutover`; `npm run units:plan-history -- --origin <synthetic UUID> --out <new fixture plan>`. Read-only operational migration-watermark inspection and `git diff --check` were also performed. No live SMTP or operational migration/backfill/stock command was executed.
