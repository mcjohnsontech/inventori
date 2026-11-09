# Operational reporting and investigation

Milestone 10 independent scope, 9 November 2026. Extend existing report/history functionality with authorized read models; no migration or inventory mutation. Admin and Inventory Manager use existing operational permissions. Production cannot access these reports or their sensitive fields. No unrestricted audit/security metadata.

## Read models

Authenticated bounded/paginated reports cover accepted ledger movements with exact product/variant/source/SKU/lot/batch provenance, actors and domain drilldowns; repeatable-read period summaries; exact case-preserved reusable Order ID investigation across all matching checkout sessions/units; missing-reason classification evidence and pending requests. Preserve existing stock/receipt/print report access. Unit timelines remain separately scoped authoritative recorded history.

Business dates use Africa/Lagos database boundaries, based on server acceptance timestamps, never backdated delivery dates. Read ranges are explicit and bounded to 366 days per request as an engineering query limit; longer periods use explicit separate reads. Return BIGINT quantities as decimal strings. Every report has local freshness time and an origin sequence fence; it is not a certified daily closing snapshot. Opening/ending ledger quantities are per exact SKU/state, not summed across incompatible products or variants.

Daily charts count accepted receipt/issue transactions when no exact SKU is selected; quantity breakdowns remain per SKU. Reason and discrepancy statistics count evidence records, with original-versus-classified status distinguished. Pending recovery requests never appear as executed recoveries. Filters are parameterized and origin-scoped; page size is fixed with validated bounds. Reads change no stock, audit, command or projection evidence.

## Dependencies and exclusions

Targeted physical counts await the remaining B05 concurrency/recount policy. Certified daily closing and its historical reports depend on that certification workflow and are not presented as complete by these read models. O5 cloud approval delivery/execution remains deferred. No recovery/correction mutation, live mail, operational migration, historical enrollment or deployment.

## Verification

Test role denial/direct API access, origin isolation, date bounds/Lagos edges/backdated delivery, decimal-safe quantities, opening-ending conservation, all enabled movement states, reused/case-sensitive Order IDs spanning multiple actors/receipts/sources, missing and classified reasons, pending-versus-executed distinctions, pagination/filter correctness and unchanged stock/evidence fingerprints. Browser-test real drilldowns/search/empty/errors, five widths and keyboard controls; run existing inventory regressions/typecheck/build before publication.
