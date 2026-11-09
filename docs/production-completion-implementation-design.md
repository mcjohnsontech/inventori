# Production completion — milestone 8A

CONFIRMED O8: only an Inventory Manager explicitly confirms selected eligible In Production units. Admin reviews; Production has no completion administration. Order references are reusable grouping text, not transaction identities or completion boundaries. A later checkout with the same reference remains independent. Damaged/Removed/Completed units cannot complete normally.

## Proposed implementation within the approved policy

Add immutable ProductionCompletion and ProductionCompletionLine records, binding each exact unit, original checkout/line, prior event/version, recorded holder, Manager, timestamp and command. Add only the P-to-C COMPLETE transaction/event branch with domain provenance, exact quantity-one movements, contiguous event chains and completed projection shape. Existing receipt/issue/damage branches and historical rows remain unchanged. Completed stock remains accounted in C and is never usable; there is no second usable deduction.

Use origin-first locking, current Manager/session/membership fencing, sorted unit/state/lot locks, canonical idempotency and one transaction for root/lines/movements/events/projections/audit/outbox/result/sequence. Reject mixed or stale ineligible selections atomically. Database constraints must reject orphan groups, graph mismatches, late supplementation, mutation/deletion and projection bypasses. Native unit census reconciliation must include C in every affected domain; regression tests must exercise damage/checkout on lots containing completed units. No generic transition endpoint is introduced.

Provide paginated eligible work/history, exact Unit Code/QR selection, explicit review, recorded holder/checkout context, draft Back/discard/reload, uncertain-response stable-key retry, accepted evidence and role-scoped timeline integration. No automatic completion by Order ID.

Tests: Manager-only mutation; Admin review/Production denial; explicit subset across orders/holders/batches; later same-reference checkout; damaged/removed/already-completed denial; concurrent damage/completion and duplicate completion; canonical replay/conflict/lost response; rollback after prepared lines; immutable groups and no U deduction; populated migration preservation; receiving/checkout/damage/printing regressions; five-width browser evidence/typecheck/build.

B05 targeted counts are a separate 8B slice. The approved role/scope/zero-tolerance baseline is recorded, while the separately asked concurrency/recount/resolution baseline remains pending. Completion does not assume an answer. No operational migration, historical enrollment, cloud approval execution or deployment.
