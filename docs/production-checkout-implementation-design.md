# Milestone 5 — exact-unit production checkout

## Approved behavior

Admin, Inventory Manager and Production may explicitly confirm checkout. Reasons are Production use, Sample, Internal use and Other (meaningful explanation required). An explicit reason-not-provided exception remains allowed and creates a Manager reconciliation obligation. Order IDs are optional, opaque, unverified and reusable across sessions/dates/actors; they are never unique transaction identities or validated against external orders.

Scanning/lookup only identifies a unit. A bounded actor/origin draft may contain multiple products, variants, suppliers and batches at the same shop. Review supports session defaults and explicit line overrides. Confirmation resolves immutable SKU/lot/variant relationships server-side and checks every selected unit is currently usable. No arbitrary quantity, supplier/SKU creation, DYI:1 quantity fallback, negative override or automatic scan deduction.

## Compatible schema extension

Add immutable Checkout, CheckoutLine and CheckoutException records. One line is one exact saved unit and one U-to-P movement; duplicate unit membership in a checkout is prohibited. Each initially missing reason has one immutable exception row. Later reconciliation appends separate classification evidence; it never edits a line or deducts again.

Extend StockTransaction with ISSUE while retaining RECEIPT constraints and provenance; ISSUE has no single batch because one checkout may contain multiple batches. Existing receipt batch associations remain unchanged. Extend StockMovement with a nullable checkout-line link and exclusive receipt/issue provenance checks; existing receipt-line links/rows remain unchanged. ISSUE quantity is exactly one per unit, exact lot/batch/SKU, from U to P. Other transaction types remain disabled.

Append ISSUED UnitEvents with previous-event identity and contiguous ordinal, update the matching UnitState projection to P/usable/recorded staff custody, and retain the confirming actor as recorded holder. Unit UUID/code/registration/initial movement and all previous events remain immutable. New current-state fields are additive. Initial receiving validation remains intact.

Add a bounded exact command manifest using the existing hashed UnitCommandManifestPage mechanism. An initial technical checkout bound of 500 units keeps HTTP payloads and one manifest page bounded; larger selections require separate explicit confirmations, never truncation or partial acceptance. This is distinct from the approved receiving limit. Normalized request JSON is limited to 30,000 UTF-8 bytes under the existing 32 KB transport bound. Oversized override notes/selections require explicit separate confirmations; no truncation or partial acceptance.

## Transaction and database safeguards

Use existing origin-first locking and current actor/auth-version fencing. Lock selected units/state and balances deterministically. Same key/same canonical request returns original result; changed request conflicts. Different keys contending for the same usable unit cannot both succeed. An unavailable unit rejects the entire checkout before acceptance; no partial issue.

One transaction commits checkout/header/lines/exceptions, ISSUE StockTransaction, positive movements, exact events, current projections, balance projections, manifest, audit/outbox and command result. Rendering/network calls stay outside it. No cloud-side write.

Extend existing insert/state guards in a new migration; never edit applied migrations or receipt history. Every ISSUE must have its complete new checkout root, current-transaction lines/movements/events, matching actor/command/evidence and exact unit census. Accepted checkout groups cannot be supplemented. Deferred root validation checks all related records once, preserving the receiving performance design instead of introducing per-unit quadratic census checks. Balance projections reconcile against net immutable movements, with nonnegative quantities and no E projection. Native unit states and lot balances must agree.

## API and UX

Authenticated versioned checkout options/preview/create/history/detail endpoints use explicit role DTOs. Production sees its own checkout records and minimal eligible identities, never supplier/invoice/damaged history/print/audit administration. Operational Admin/Manager reads remain shop-scoped. No user-controlled origin or actor fields.

A role-aware checkout workspace uses local QR/manual Unit Code selection and an exact-unit cart, reason/default Order ID controls, line overrides, full review and explicit confirm. Preserve draft and idempotency key on retries/navigation; confirm discard. Accepted confirmation displays transaction reference, exact units, missing-reason obligations and authoritative updated availability. Existing receiving/catalogue/labels/lookup remain compatible. Unit tracking adds the actual ISSUED event and permitted own issue evidence.

## Acceptance

Mixed products/variants/batches/suppliers; optional reused Order IDs; explicit blank reasons and Other validation; line overrides; same-key replay/conflict/concurrency/lost response; competing different-key issue of one unit; unavailable/damaged/foreign/duplicate/legacy selection; complete failure rollback; immutable history and orphan/quantity-only bypass rejection; role/field/origin tests; per-lot balance/unit census; receipt/QR/print regressions; draft/keyboard/five-width browser checks; typecheck/build and isolated preservation/capacity rehearsal. No operational migration or real stock mutation.

O4/O5/O8 are now confirmed in decisions.md and concern later closing, pending approval requests and Manager-selected completion, not this already approved checkout transfer. No recovery, disposition, completion, correction or closing transition is enabled by milestone 5.
