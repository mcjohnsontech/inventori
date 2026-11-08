# Milestone 5 — exact-unit Production checkout

Status: software implementation and isolated verification complete. Git publication is tracked in dayari-completion-progress.md. Operational activation remains unapproved.

## Workflow

Admin, Inventory Manager and Production can select saved individual units by scanner/keyboard DYI:2, camera or six-character Unit Code. Repeated scanner input returns focus to the input and announces the added identity. Browser camera is local, with permission-denial fallback and stream cleanup. Shared DYI:1 labels remain supported by existing lookup/printing but cannot identify an exact checkout item.

The actor/shop-scoped browser session draft preserves unit selection, session reason/optional Order ID, explicit per-item overrides and the pending confirmation key/payload. Back preserves the draft; discarding a populated draft requires confirmation. Missing reasons remain explicit Manager obligations. Other requires an explanation. Review shows saved SKU, unit, lot and batch identities and exact effective reasons/references; only explicit confirmation deducts stock. No reservation or quantity-only fallback.

Accepted results show the immutable transaction reference and exact selected units. They are acceptance evidence, not a claim that saved balances remain current. The accepted result precedes the next empty cart; starting another checkout is explicit. Paginated history supports exact reusable Order ID filtering. Production sees its own checkouts only. Authoritative unit tracking adds actual ISSUED evidence, with own checkout references/reasons available to Production and no receiving/supplier/invoice/damaged/print administration disclosure.

Structured QR input reuses the separate QR-presentation metadata workflow and explicit retry; manual short-code lookup is a read. Neither lookup, camera decoding, cart edits nor print actions deduct stock or certify physical custody/attachment.

## Schema and safeguards

New additive migration: `202611080021_exact_unit_checkout`.

- Immutable Checkout, CheckoutLine and CheckoutException record exact saved unit membership and initially missing reasons.
- StockTransaction enables RECEIPT and ISSUE only. Receipt retains its exact non-null unique batch; multi-batch ISSUE has no single header batch.
- StockMovement has exclusive receipt/checkout provenance. An issue line has exactly one positive quantity-one U-to-P movement for the exact lot and batch.
- ISSUED UnitEvent references the previous event and checkout line, with contiguous unit ordinal. UnitState records P, usable condition and confirming staff holder; its immutable unit/origin/lot identity cannot change.
- Deferred checkout completeness checks exact lines, movements, events, projections, exceptions, hashed manifest, actor/membership, command, audit and outbox. No late supplementation or orphan ISSUE transaction is accepted. Once-per-checkout affected-lot census preserves the set-based receiving validation strategy.
- Balance projections reconcile net incoming minus outgoing immutable movements, remain nonnegative and never create an E balance. Future lifecycle transaction/event types remain disabled.

All effects commit together under existing origin-first locking, current actor/auth-version/membership fencing and deterministic unit/state/lot locks. Same key/body returns original acceptance; changed request conflicts. Different keys cannot issue the same usable unit twice. One unavailable selected unit rejects the whole group. No rendering/network calls inside the transaction.

Technical confirmation bound: 500 exact units and 30,000 normalized UTF-8 request bytes under the existing 32 KB transport bound. Oversized requests require separate explicit confirmations; there is no truncation/partial acceptance. The receiving 10,000-unit/100-line policy is unchanged.

## API

Authenticated same-origin frontend proxy and versioned Nest API:

```http
GET  /v1/checkout-config
POST /v1/checkouts/preview
POST /v1/checkouts
GET  /v1/checkouts?page=1&orderReference=Order-A
GET  /v1/checkouts/{checkoutUuid}
```

```json
{
  "reason": { "code": "PRODUCTION_USE", "note": "" },
  "orderReference": "Order-A",
  "lines": [
    { "unitId": "11111111-1111-4111-8111-111111111111" },
    { "unitId": "22222222-2222-4222-8222-222222222222", "reason": null, "orderReference": null }
  ]
}
```

Writes require a UUID Idempotency-Key. Omitted line fields inherit; explicit null records no reason/reference. Order IDs are opaque, unverified and case-preserved after outer whitespace normalization; they are not unique. The accepted response contains transaction/origin sequence/time, original actor, exact identity/line/event/movement references, initial/outstanding reason counts, manifest hash and decimal-string usable balances as of acceptance. No sensitive Admin-only response is cached for later role-demotion replay.

## Verification executed

- Shared contract build/schema validation passed. Full unit suite: **64/64 tests, 20 files**.
- Full PostgreSQL regression repeat: **114/114 tests, 16 files**. Final affected-suite repeat after explicit old-schema selects and Manager acceptance: **37/37**, including **9 checkout cases**. There are 115 distinct integration cases with successful results across these runs; no claim of one full 115-case run.
- Checkout tests cover all three roles, missing reasons/overrides, same-key replay/conflict/concurrency, different-key contention, unknown identities, Production own-history/privacy, cloud denial, forced audit failure rollback including sequence/command/outbox/projections, immutable records, late lines, orphan ISSUE rejection, mixed supplier/batch sourcing and capacity.
- Browser regression subset: seven existing inventory/identity/receiving/Production/QR/printing/tracking cases passed together. Checkout passed targeted reruns, including reload/Back, duplicate selection, camera-denial fallback, scanner focus, five widths, lost-response retry and one new transaction under an already-used Order ID. Final accepted-first/focus rerun also passed. All eight distinct relevant browser cases have successful results across these runs; no claim of one green full eight-case run.
- Final `npm run build` passed after the last UI refinement; final `npm run typecheck` also passed.
- Fresh isolated schema smoke check applied all 21 migrations without fabricated inventory. Retained legacy fixture: all 49 prior table field fingerprints preserved.
- Additional populated compatibility rehearsal received with current application code against schemas 013 and 020, generated native units/print/presentation evidence, then installed 021. Every previous field fingerprint, legacy receipt/SKU/P/L history, native unit/event/state and both print histories remained unchanged. New nullable columns are excluded only when comparing prior-field fingerprints. No units/checkouts were fabricated by the migration.
- Read-only operational check: latest migration remains `202611040013_receiving_product_identity`, StockUnit absent. No operational upgrade/enrollment, real stock/account mutation, real invitation, deployment or cloud transport.

Capacity sample: **2109.06 ms for 500 units** in an isolated development loopback confirmation, with the existing 15-second transaction limit. This is one measured sample in the retained final artifact, not certification of production hardware, peak concurrency or a 500-lot worst case. Repeated successful test runs do not replace a formal shop-hardware benchmark.

### Failures and corrections

Initial restricted-loopback unit run had one SMTP fixture connection failure; its isolated-network rerun and full 64-case repeat passed. Initial full integration run had 113 passes/one receipt reconciliation failure because the old assertion summed only incoming stock. It now tests net accepted movements across all records, including checkout; no exclusion or weaker balance assertion. Full repeat passed.

The eight-case browser subset had seven passes/one cold-login synchronization failure before checkout. The checkout test now awaits/asserts the successful session response. A subsequent checkout run completed its workflow but incorrectly assumed no pre-existing session under the reusable Order ID. It now checks the exact accepted transaction and a count increment of one while retaining earlier sessions. Targeted repeat passed. The populated fixture helper initially tried to recreate the migration-seeded Lagos registry; it now selects the existing registry, and the fresh rehearsal passed. No failed attempt is counted as a pass.

## Visual evidence and refinement

Reviewed actual 320px and 1440px review/accepted screenshots; overflow checks ran at 320/390/768/1024/1440. Improved title spacing, focus return after scan, explicit unknown-response retry, camera fallback, accessible accepted-state focus, and receipt-unit P badges. Historical regression images regenerated by tests are not new immutable stock evidence.

- [Desktop review](images/completion/milestone-5/checkout-review-1440.png)
- [Mobile review](images/completion/milestone-5/checkout-review-320.png)
- [Accepted checkout](images/completion/milestone-5/checkout-accepted-1440.png)
- [Migration preservation](evidence/completion/milestone-5/checkout-migration-preservation.json)
- [Populated compatibility](evidence/completion/milestone-5/checkout-populated-compatibility.json)
- [Capacity sample](evidence/completion/milestone-5/checkout-500-capacity.json)

## Limits, approval gates and next slice

Operational migration/activation, historical enrollment, hardware acceptance, live email and deployment remain gated. Camera/USB physical-device reliability is not certified by synthetic browser tests. There is no mandatory physical-scan or print-success claim. Local browser drafts are not server stock reservations or persisted pre-confirmation stock events.

Manager reason reconciliation is milestone 6; its append-only resolution will update live outstanding counts without editing original checkout or deducting stock. BAD/disposition, Manager-selected completion, counts and daily closing remain later slices. O5 permits pending recovery/correction request evidence only: no local Admin approval/substitute delivery/stock execution. O8 requires Manager confirmation of selected eligible P units without a second U deduction. O4 requires Manager-only immutable closing, Admin review-only and certification blockers; fully certified held damage can carry forward. These rules are in decisions.md and the request design; actual PRD addendum/affected workflow tests belong to their implementation milestones, not a false completion claim here.

Next: commit/push this verified milestone, then implement Manager missing-reason reconciliation. Continue independent milestones; deferred cloud approval delivery does not stop the build.

## Changed files

- `apps/api/src/app.ts`
- `apps/api/src/checkouts.service.ts`
- `apps/api/src/receiving.service.ts`
- `apps/api/src/unit-tracking.service.ts`
- `apps/web/app/api/[...path]/route.ts`
- `apps/web/app/page.tsx`
- `apps/web/components/checkout-workspace.tsx`
- `apps/web/components/labels/unit-identity-result.tsx`
- `apps/web/components/production-workspace.tsx`
- `apps/web/components/receiving/received-units.tsx`
- `apps/web/components/shell/destinations.ts`
- `apps/web/components/unit-camera-input.tsx`
- `apps/web/components/unit-tracking-drawer.tsx`
- `apps/web/components/workspace-router.tsx`
- `apps/web/lib/checkout-draft.ts`
- `docs/IMPLEMENTATION_BRICKS.md`
- `docs/architecture.md`
- `docs/dayari-completion-progress.md`
- `docs/decisions.md`
- `docs/evidence/completion/milestone-5/checkout-500-capacity.json`
- `docs/evidence/completion/milestone-5/checkout-migration-preservation.json`
- `docs/evidence/completion/milestone-5/checkout-populated-compatibility.json`
- `docs/images/completion/milestone-5/checkout-accepted-1440.png`
- `docs/images/completion/milestone-5/checkout-review-1024.png`
- `docs/images/completion/milestone-5/checkout-review-1440.png`
- `docs/images/completion/milestone-5/checkout-review-320.png`
- `docs/images/completion/milestone-5/checkout-review-390.png`
- `docs/images/completion/milestone-5/checkout-review-768.png`
- `docs/ledger-invariants.md`
- `docs/production-checkout-implementation-design.md`
- `docs/production-checkout-implementation-report.md`
- `docs/recovery-correction-request-design.md`
- `docs/requirements-traceability.md`
- `packages/contracts/src/checkouts.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/permissions.ts`
- `packages/contracts/src/unit-tracking.ts`
- `prisma/migrations/202611080021_exact_unit_checkout/migration.sql`
- `prisma/schema.prisma`
- `scripts/rehearse-checkout-compatibility.ts`
- `scripts/rehearse-checkout-preservation.ts`
- `scripts/rehearse-checkout-schema.mjs`
- `tests/e2e/checkouts.spec.ts`
- `tests/e2e/production.spec.ts`
- `tests/integration/checkouts.test.ts`
- `tests/integration/receiving.test.ts`
- `tests/unit/checkouts.test.ts`
