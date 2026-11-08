# Milestone 6 — Manager missing-reason reconciliation

## Approved behavior and boundary

Owner Complete Application Build Directive section 8 authorizes Manager classification of original missing-reason exceptions, preserving the employee, original timestamp, Order ID, exact unit and checkout evidence. Admin/Manager may review the queue/history; only Inventory Manager resolves. Production receives no reconciliation administration. Existing own checkout status may reflect that its obligation is resolved, without exposing Manager administrative remarks or unrestricted history.

Classification is metadata about an already accepted issue. It must never create StockTransaction/StockMovement/UnitEvent, update UnitState/StockBalance, deduct again, complete production, recover damage or execute a correction. O5 cloud stock-authorization dependency is unrelated to this approved non-stock Manager classification.

## Compatible additive model

Add immutable ReasonReconciliation command/root plus CheckoutReasonResolution rows, each uniquely referencing one initially missing CheckoutException and its exact immutable checkout line/unit. Preserve all original rows; derive unresolved/resolved status from absence/presence of the appended resolution. No editing/reopening resolved classifications in this slice.

The root records Manager/role, origin, server time, approved reason classification, Other explanation when required, optional remarks and an exact canonical hashed selection manifest. Do not reuse UnitCommandManifestPage: that grammar requires a real stock transaction, and classification has none. Bound one explicit command to 500 exception identities and transport-safe payload size; larger selections need separate commands, not partial acceptance.

Resolution remains valid when the original unit has since changed recorded state: it classifies the historical checkout and must not require an invented second issue or force a unit back to In Production. The original Order ID is read-only; this slice does not rename/group transactions retroactively.

## Transaction and database validation

Use existing origin-first lock, current Manager/auth-version/membership fencing, canonical same-key replay/conflict and deterministic sorted exception locks. Recheck every selected exception is in the shop, originally missing a reason, and still unresolved. Different commands competing for one exception cannot both resolve it. One invalid/resolved member rejects the entire command.

One transaction appends root, exact rows, audit, outbox and CommandResult and advances origin metadata sequence. Deferred root completeness verifies current-transaction membership, exact exception/line/unit linkage, original missing state, manifest, Manager authority and evidence; immutable and same-creation-transaction guards reject mutations/deletions/late additions. No network call inside it. Inventory fingerprints must remain unchanged before/after resolution, including retries and concurrency.

## Reads and UI

Paginated queue/history supports checkout date range in Africa/Lagos, original employee, exact reusable Order ID, exact Unit Code and unresolved/resolved/all status. Return only scoped operational staff filter options, not user-administration/security fields. Label dates as checkout business dates; resolution timestamp stays separate.

Managers select exact obligations, inspect original session and permitted unit history, enter classification/remarks, review and explicitly confirm. Preserve selections across paging/filtering and uncertain-response retry with the same key. Confirm draft discard. Admin gets read-only evidence/history. Accepted classification is clearly distinguished from the original missing reason.

Checkout detail/history live outstanding counts exclude resolved exceptions while original acceptance/idempotency evidence stays unchanged. Expose a separate status-as-of timestamp and per-line reconciliation status; do not rewrite original reasons. Operational timelines append classification evidence. Production keeps its existing own-activity history restriction and does not receive Manager-only remarks via timeline or checkout DTOs.

New code must retain receiving/tracking/printing on pre-reconciliation schemas; use readiness gating and explicit legacy selects, not an implicit operational migration.

## Verification

Test Manager-only mutation, Admin/Manager review, Production denial and scoped DTOs; all filters/pagination; mandatory classification and Other validation; missing/nonmissing/unknown/foreign/resolved targets; historical-state independence; same-key replay/conflict/concurrency and competing keys; all-or-nothing failure rollback; immutable/late/orphan rejection; unchanged original checkout, receipt, unit, ledger, balances and print records; live queue/counts versus frozen acceptance; browser draft/Back/retry/focus/five-width review; receiving/checkout/QR/printing regressions, typecheck/build and isolated migration preservation. Operational migrations, real accounts/stock and cloud approval execution remain unapproved.
