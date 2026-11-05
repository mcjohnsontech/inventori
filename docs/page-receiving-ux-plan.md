# Page and receiving UX refinement — 4 November 2026

## Approved scope

Simplify shared page titles, remove clickable overview summary cards and receiving instruction cards, place exact identity lookup above lists, paginate browsable results, compact supplier/source presentation and use neutral receiving totals. Automatically use a supplier's sole saved location; preserve explicit selection for legacy multi-location suppliers. No location/SKU/ledger migration or historical rewriting.

Owner explicitly approved Admin and Inventory Manager registration of products/variants inside receiving. Add a dedicated receiving product-setup endpoint, reusing audited transactional catalogue allocation with role/origin checks and command idempotency. General catalogue writes remain Admin-only. Registration is a separate catalogue command; cancelling a receipt does not delete the registered product and creates no stock. Preserve receipt draft, refresh source SKUs and select the newly registered variants on return.

## Verification

Cover Manager registration, Admin registration, Production denial, general catalogue denial for Manager, origin/source mismatch and replay/conflict/rollback. Browser-check simplified headers, static summaries, sole-source selection, inline registration with preserved receipt draft, neutral quantities, top lookup, list pagination and responsive layouts. Run unit/integration/browser regressions, typecheck and build; inspect screenshots before completion. No operational test mutations.
