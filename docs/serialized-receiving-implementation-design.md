# Milestone 2: serialized receiving design

7 November 2026. Implementation authorized by the completion directive. Operational migration/activation and historical enrollment remain separately gated.

## Identity and authority

Each new accepted physical unit receives an immutable UUID and six independent readable characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. PostgreSQL `(originId,unitCode)` uniqueness is authoritative; code allocation retries only that collision, at most 32 rounds, never widens/recycles. Capacity: 887,503,681 permanent codes/origin. Existing P/L namespaces, SKU relationships, receipt snapshots and DYI:1 remain unchanged. A Unit Code can equal a Product Code: typed lookup must not guess by prefix.

StockLot/ledger quantities remain the inventory authority. UnitState is a reconciled projection, not additional stock. Receipt units link the exact receipt line and E-to-U/D movement, actor, timestamp, command and origin. Their product, variant, supplier/source, SKU and batch derive through immutable lot relationships, not independently editable duplicates.

## Additive schema and cutover

New SerializationCutover records the migration/provisioning boundary and origin watermark. LotSerialization classifies pre-existing lots as LEGACY without creating unit identities or changing any ledger row. New lots after installation are automatically NATIVE. Cutover installation itself is the explicit deployment boundary; this simplifies the earlier proposed separate activation command without granting a runtime role permission to disable serialization. It will be exercised only in isolated databases here and remains subject to separate operational migration approval after bypass/benchmark proof.

StockUnit stores immutable receiving identity/provenance and initial state. UnitEvent initially permits only RECEIVED ordinal 1, linked to the exact original movement. UnitState stores state/condition/custody/version/last event and must agree with immutable evidence. UnitCommandManifestPage holds at most 500 exact unit/event memberships, canonical payload and SHA-256, in the same transaction. Receipt responses stay bounded; paginated receipt-unit reads return saved identities.

Deferred checks at receipt acceptance enforce each line's exact usable/damaged unit counts, one matching initial event/state per unit, command/actor/origin/movement provenance, complete nonduplicated manifests and projection agreement. Identity/event/manifest/cutover history is immutable. Per-receipt aggregate checks avoid repeatedly scanning 10,000 rows for every inserted unit. Later transaction/event types remain disabled until their own domains and constraints are implemented.

## Transaction and allocation

Keep origin-first locking, current actor fencing and existing idempotency lookup. Replay an old accepted command unchanged before applying new capacity rules. New serialized receipts validate 100 lines and at most 10,000 total units, pending benchmark acceptance. Allocate batch/receipt/movements once; combine all line/state unit intakes while preserving each unit's exact provenance, then allocate in internal chunks of 500 using bulk INSERT ON CONFLICT DO NOTHING/RETURNING, then initial events/state and manifest pages. Retry only unreserved unit candidates. Audit, outbox, command result and summary manifest references commit atomically. Any collision exhaustion, chunk/evidence failure rolls everything back, including sequence and batch allocation.

No external network calls occur in the stock transaction. Legacy same-key replies do not gain invented units or retroactively changed response fields. Delivery date remains factual; acceptance/order stay server controlled. On operational databases without the new migration the existing receipt capability remains available; unit-specific functionality reports unavailable. After cutover the database rejects stale quantity-only writers regardless of route, caller version or backdated delivery date.

## Historical inventory

No automatic historical unit allocation. A dry-run-only inventory plan can list authoritative U/D balances and unmapped coverage. Physical counts, discrepancy evidence and explicitly accepted baseline assignment belong to the controlled historical onboarding workflow; its real-data execution is not authorized. A legacy QR always resolves its lot and never selects a guessed unit. Quantity-only issuing of legacy/unassigned stock will not be enabled.

## Proof and rollout gates

Test secure grammar/collisions/exhaustion, origin isolation and immutability; same-key and concurrent receipt replay; damaged-only/mixed/multi-source receipts; chunk/audit/outbox failure rollback; exact ledger versus units; orphan/foreign/duplicate/mismatched state and manifest rejection. Run the pre-unit writer and direct restricted-role SQL after cutover and prove atomic rejection. Historical receipts/SKUs/commands/QR/PDF bytes remain unchanged in migration rehearsal. Runtime privileges must not permit DDL or trigger disabling; owner/superuser bypass is explicitly outside that proof.

Benchmark 100/1,000/10,000-unit and 100-line deliveries, chunk alternatives, contention, collision retries and full rollback. Record hardware/runtime/database versions, transaction/end-to-end/lock time, memory, relation/WAL size and repeated measurements. The approved cap is conditional, not a performance claim. Review measured headroom against 15-second DB/20-second request timeouts; do not silently lengthen them or accept partial receipts. Larger deliveries use intentionally separate receipts.

No unit QR/printing, lifecycle checkout, damage transition, historical execution, operational migration or synchronization is implemented by this milestone alone. Those follow sequentially.

## Implementation refinements from verification

Additive migrations 014-018 preserve previously applied files. 015 fences projection identity updates. 016 keeps UUID index joins in deferred membership validation. 017 validates inserted unit/event/state sets with transition tables instead of repeating equivalent provenance queries for every row; foreign keys, checks and immutable guards remain. 018 runs the full existing receipt-group validator once on the DeliveryBatch root. Its child foreign keys and existing same-transaction insertion guard prove that no child can be added without that root check. Receipt-unit completeness and independent balance reconciliation remain deferred. Negative-path regressions must continue to pass after these changes.

Secure code capacity is 31^6 = 887,503,681 permanent identities per origin. At one million allocated identities an individual random draw collides with probability about 0.113%; 10,000 further allocations expect roughly 11 retries. At very high occupancy bounded retries become less reliable; allocation fails atomically after 32 rounds and never widens or recycles. No unapproved capacity threshold or operational rollover policy is inferred. Short-code collisions between shops are valid; authoritative lookup always includes the configured origin and internal UUIDs.

The historical planner is read-only, limited to isolated loopback *_test fixtures and 100-lot cursor pages. It reports authoritative balances, existing coverage and explicitly uncounted/unverified physical quantities. It has no apply mode. Cutover rehearsal compares historical table hashes, same-key receipt replay and original generated PDF bytes. Neither classification nor planning fabricates past unit events.

## Operational installation remains unapproved

A future separately approved maintenance window must stop all writers, take/verify a private backup, apply the complete reviewed migration chain, verify every constraint and preservation check, provision a real least-privilege database login, and only then resume compatible writers. Do not resume between migration 014 and its follow-up safeguards. Failure requires investigation/fix-forward or a separately reviewed restore; never remove guards to admit a stale writer. The current operational database remains through 013. The restricted-role proof uses an actual temporary non-superuser login (current_user equals session_user), rejects trigger disabling even after RESET ROLE, and rejects session_replication_role changes. Database-owner/superuser compromise is outside this application invariant boundary.
