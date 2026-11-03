# Receiving and immutable ledger — approved implementation design

Owner authorized Brick 4 + Brick 5A on 2 November 2026. The approved rules here supersede the earlier review draft and conflicting Brick 0 proposals. Actual checks and file manifest: `receiving-implementation-report.md`.

## Approved scope and business rules

One delivery creates one new immutable batch, exactly one supplier/source, with any number of sourced products/variants (up to the engineering request limit of 100 distinct SKU lines). No accepted batch edits, reopening or supplementation. Admin and Manager can receive/view operational quantities; Production denied. Catalogue creation stays Admin-only; receiving never allocates catalogue identities. Inactive identity flags do not exist in the current catalogue; missing/foreign source/SKU identities are rejected rather than inventing a deactivation workflow.

Each line has nonnegative usableQuantity and damagedQuantity, at least one positive. totalQuantity is generated in PostgreSQL from their sum. Positive usable creates E→U, positive damaged E→D, never zero movements. Damaged arrivals require a trimmed explanation of 10–2000 characters containing a letter, retained in immutable receiving evidence. Intake creates no production-damage/BAD/disposition/recovery workflow.

All internal balance states U/P/D/C/X are nonnegative for every role. E is only a bookkeeping boundary, never a balance row. Future states are reserved but current SQL permits only RECEIPT transactions and E→U/D movements; later types require new domain records, authorization and reviewed constraints. No Admin override.

## Batch numbers and dates

Immutable UUID is authoritative batch identity. Public format B-YYYYMMDD-NNNN uses the **server acceptance date in Africa/Lagos**, not deliveredOn. Under the existing origin-row lock, allocate max(dailyOrdinal)+1 for that origin/numberedOn. Four digits is minimum width: after 9999, use 10000; after integer capacity fail safely, no wrap/reuse. Failed transactions consume no ordinal. Index uniqueness: (originId,numberedOn,dailyOrdinal) and (originId,publicCode).

Independent origins can use the same readable code. Global display identity is the origin UUID plus public code, both returned in every batch response; internal links use batch UUID. This is the approved origin-aware strategy without random abbreviations or parsing codes. There is no separate mutable counter table; seven-table scope is retained.

deliveredOn is a Gregorian DATE from 0001-01-01 through the current Lagos acceptance date. Valid historical delivery dates are accepted with no closing cutoff; future dates are not yet delivered. recordedAt/acceptedAt are server timestamps, timestamptz(6), derived after acquiring the origin lock. originSequence is accepted-command order. Backdating deliveredOn never changes recordedAt, code date or sequence.

## Seven-table implementation

Prisma models expose scalar IDs; migration SQL owns the foreign keys, generated column, immutable guards and deferred constraints. Future schema migrations must preserve these SQL constraints; generated Prisma diffs require review, especially totalQuantity's generated-column expression.

| Table | Identity and immutable evidence |
| --- | --- |
| DeliveryBatch | UUID, origin/source FKs, publicCode, numberedOn/dailyOrdinal, deliveredOn, optional invoice reference, acceptedAt, supplier/source display snapshot; origin-qualified unique codes |
| StockTransaction | UUID, unique batch FK, unique command FK (deferred), origin/actor FK, role snapshot, originSequence unique within origin, recordedAt; RECEIPT only; deferred outbox stream FK |
| Receipt | UUID, unique batch and stock-transaction FKs, source FK, acceptedAt |
| StockLot | UUID, SKU/batch/source/origin FKs, unique (skuId,batchId); exact SKU plus delivery batch is stock identity |
| ReceiptLine | UUID, receipt/batch/SKU/lot FKs; unique SKU per receipt and one line per lot; line number; usable/damaged BIGINT, generated total, damage reason, immutable product/variant/SKU/attribute snapshot |
| StockMovement | UUID, transaction/batch/lot/receipt-line FKs, E→U or E→D, positive BIGINT quantity; unique (receiptLineId,toState), allowing up to two exact parts |
| StockBalance | (lotId,state) PK, nonnegative BIGINT, version and lastTransaction FK; mutable derived projection, no E |

Every accepted receipt has at least one line and one movement. Deferred completeness triggers on all new business rows check the **whole group**: exactly one batch/receipt/transaction, aligned source/origin/time/actor/command/outbox/audit, every lot linked to a receipt line, SKU sourcing source matches batch, line/lot/SKU relationships match, no unrelated movement, and sum E→U/D equals the line's usable/damaged parts. FKs prevent orphans; unique indexes prevent duplicate lines/parts. All six historical tables reject UPDATE/DELETE.

Insert guards also require child records to be inserted in the batch's database creation transaction. They compare the batch row's PostgreSQL xmin with the current transaction ID (modulo the 32-bit xid representation). This prevents adding a line/lot/movement to an already committed batch, even without changing its old rows. Future nonreceipt operations must introduce their own typed domain/guard migration; these guards must not simply be removed.

StockBalance deferred checks compare its final quantity to ledger sums, prohibit identity reassignment and verify lastTransaction belongs to that lot's batch. Receipt completeness independently checks U/D projection equality, including missing positive projections. A forged standalone quantity update or deletion of positive balances cannot commit. No stock seed or unexplained initial quantity exists.

## API and atomic transaction

Authenticated task-scoped endpoints:
- GET /v1/receiving/options: sourced supplier/location/product/variant/SKU identifiers, names and saved codes only.
- GET /v1/receipts: latest 100 accepted delivery summaries for this origin.
- GET /v1/receipts/:id: immutable accepted receipt detail for this origin.
- POST /v1/receipts: sourceId, deliveredOn, optional invoiceReference, distinct lines of skuId/usableQuantity/damagedQuantity/damageReason; UUID Idempotency-Key required.
- GET /v1/stock with optional sourceId/skuId/productId/batchId UUID filters: lot-level U/D and derived SKU/product aggregates, local as-of timestamp.

No valuation, unrestricted audit, credentials or administrative controls are returned. All response fields are allowlisted. Quantities and sequences are JSON decimal strings, avoiding BIGINT precision loss. A shared product aggregate never replaces the exact lot provenance also returned.

Transaction order: authenticate/authorize and Zod validate → begin → lock OriginNode FOR UPDATE → recheck SHOP mode → User FOR SHARE and active role → same-key/hash replay or conflict → obtain server clock and resolve source/SKU links → allocate batch ordinal → create stock transaction/receipt/lots/lines → append positive movements and U/D projections → immutable audit and complete versioned outbox envelope → CommandResult response → deferred constraints → commit.

A lost response returns the original saved receipt on retry with the same actor/key/hash. Different hashes conflict; different keys are intentional separate receipts. Invoice reference is optional/nonunique and never a deduplication key. No external network or print operation occurs inside the transaction.

Existing READ COMMITTED plus origin serialization is retained. Every receiving lot is new, so balance inserts cannot race over an existing lot. Future deductions must lock existing lot/state rows in sorted order **after** origin lock, then exact issue/approval attribution in a shared documented order. P2034 deadlock/serialization errors retry at most twice with the same key; exhausted failures do not commit. No generic movement writer is exposed.

One sequence increment, audit, outbox and command result belongs to the entire group. The outbox envelope carries transaction and movement UUIDs plus the accepted receipt, identity snapshots and decimal-string quantities. Sync transport is not implemented. Cloud-side stock writes are denied.

## Invariants, reconciliation and future workflows

For every lot/state: balance = sum(accepted incoming) − sum(accepted outgoing). U/D projections are checked against immutable accepted receipt movements at commit. Operational stock reads use a repeatable-read transaction so lot detail and all aggregates share a snapshot. The integration suite independently reconciles projections to movements. Physical count accuracy remains a separate future requirement; arithmetic equality does not prove shelf stock.

Future production issue U→P must lock exact lot availability; production damage P→D must retain the originating issue and never deduct U twice. Recovery D→U needs exact BAD/approval/application links. Corrections/reversals append inverse/compensating events with bounded eligible quantities and explicit approval, never edits/deletes. Current schema does not enable these transitions or claim those workflows implemented.

## Migration and review boundaries

202611020004_receiving_ledger is additive: seven tables, indexes, FKs and SQL guards. Prior three migration files and catalogue records remain unchanged. No stock backfill, resets or production deployment. Development and isolated test databases upgraded in place. A rollback-only isolated schema rehearsal applies the first three migrations, inserts legacy/generated SKU/prefix identities, applies the new migration and verifies all identity rows unchanged and ledger empty.

Before rollout, backup/restore, separate migration/runtime database privileges, hardware/HTTPS and owner pilot sign-off remain operational requirements. Do not roll back stock by dropping history tables; restore a whole consistent snapshot only with explicit recovery approval or roll forward compatibly. No new approval is needed to complete this authorized slice. Review is required before QR printing or production scanning, which remain excluded.
