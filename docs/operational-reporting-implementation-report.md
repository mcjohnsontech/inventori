# Operational reporting and investigation implementation

Milestone 10 independent read-model slice. Status: software verification complete. Count certification and certified closing/history remain dependent work, not completed reporting features.

## Implemented read models

Admin and Inventory Manager can inspect bounded, paginated accepted movement history with product/variant/supplier SKU/source/lot/batch, actor, state transfer, quantity and original receipt/checkout drilldowns. Exact individual transitions link to saved Unit Codes and tracking; a shared receipt movement is not misrepresented as one unique item.

Repeatable-read period reports derive opening and ending U/P/D/C/X balances per exact SKU from immutable accepted movements. They never sum unlike product quantities into one stock authority. Daily receipt/checkout charts count distinct accepted transactions within the selected scope. Reason summaries preserve original missing reasons, later Manager classifications and current outstanding evidence. Pending recovery/correction requests are labelled as request metadata, not executed stock changes.

Exact, trimmed, case-preserved Order ID lookup returns every matching checkout line/session across actors and suppliers with current unit state and original versus classified reasons. Repeated references do not merge transaction identities or completion boundaries.

The frontend retains existing stock/receipt/print source reports under Source records. New analysis has explicit applied period, product/source/SKU scope, server pagination, all-state drawer, source evidence drawer and exact-unit tracking. Filters remain intact during drawer navigation. Responsive item rows avoid narrow mobile description columns. Query ranges are limited to 366 inclusive business dates as an engineering read limit; longer reporting uses explicit separate ranges.

## API and integrity

No migration or domain mutation. Authenticated GET /v1/reports/config, /reports/movements, /reports/summary and /reports/orders. Production denied directly. Shared Zod contracts reject malformed dates, reverse/oversized ranges, unexpected parameters and invalid identifiers/pages. Parameterized Prisma SQL scopes all records to the configured origin. Movement-type filters apply only to movement history; balance reports reject them rather than silently showing incomplete stock.

Africa/Lagos boundaries are evaluated in PostgreSQL against acceptance timestamps, never deliveredOn. Local freshness timestamp and origin sequence identify the read snapshot. Quantity values remain decimal strings. These reports are not certified daily closing records or cloud-live views. No raw security audit, password/session secret or valuation endpoint is added.

## Verification so far

Initial integration run: 6/7 passed; the midnight fixture attempted to mock JavaScript Date for receiving, which correctly uses the database clock. The corrected isolated fixture controls checkout service Date only and keeps receiving clock behavior unchanged. Subsequent **7/7 integration tests passed** (14.95 seconds), including all enabled movement states, decimal quantities, opening/ending conservation, reasons/requests, exact repeated Order IDs, role/origin isolation, Lagos midnight/backdated delivery and unchanged ledger/evidence. Expanded cross-supplier and StockBalance preservation tests follow.

Initial frontend typecheck found native-select props on the shared Radix control; corrected to its approved options/label/value callback API. Subsequent typecheck passed. Browser, full regressions and final build/type checks remain in progress; no unexecuted check is counted as passed.

## Dependencies and boundaries

Targeted counts await the separately asked B05 concurrency/recount/resolution policy. Strict O4 daily closing and historical certified-close reporting are not silently bypassed by these ledger views. O5 approval delivery and execution remain deferred; no executed recovery/correction metric is fabricated. Physical-count verification is not inferred from QR presentation, lookup, checkout or completion. No operational migration, historical enrollment, live email, local-server rollout, synchronization transport or deployment.


### Expanded read-model verification

- Expanded reporting integration **8/8 passed** (19.29 seconds), including independent supplier SKUs/source balances for the same parent/variant and explicit StockBalance preservation.
- Reporting browser **1/1 passed** (1.7 minutes): real product filters, all-state and movement drilldowns, repeated Order ID sessions, current Completed versus In Production, Manager classifications, role denial and original receipt source reports.
- Unit suite **81/81 passed**, 25 files.
- Initial visual review found an overly narrow mobile Order ID input; changed it to a stacked form and compact two-column report tabs. Source-record regressions keep their original quantity/receipt assertions with the explicit Source records navigation step.
- Added per-SKU period flow quantities and metadata-only versus terminal damage-review summaries. Reporting/public-identity suites then passed **15/15 together** (57.17 seconds), with all prior field assertions and original deadlines.

The first full integration attempt was interrupted after existing public-identity cases timed out. Inspection found their snapshots transferred every retained fixture row, including unrelated origins. The helper now compares every field across all origins owned by that fixture; foreign-origin collision/forgery cases remain, and no assertion or timeout was removed/relaxed. The legacy migration/backfill rehearsal remains isolated. Full regression repeat is running without a competing production build.

Receipt drilldowns reuse ReceivedUnits with an optional parent tracking callback; the reusable drawer can be inactive while keeping its children mounted. Exactly one dialog owns focus, and receipt pagination/expansion context can survive unit drilldown. Report-mode switching likewise preserves mounted analysis/source filters without redundant refetches. Final browser/accessibility/type/build checks follow.

## Final verification — 9 November 2026

- Full PostgreSQL integration suite: **162/162 passed**, 21 files, 421.11 seconds. The interrupted initial run is not counted as a pass.
- Final browser regression group: **5/5 passed**, 4.1 minutes (reporting, receiving, inventory sheet, application visual/accessibility and shared pages). Receipt-to-unit drilldowns retain context and only one active dialog. Existing shared lot-print assertions remain.
- Final typecheck and production build passed. Unit suite: **81/81 passed**, 25 files.
- Reviewed mobile Order ID screenshot; stacked input and compact tabs remain readable. Five viewport captures are in `docs/images/completion/milestone-10/`.
- No migration, dependency, operational-data change or deployment. Reads do not append stock/audit/command records; integration tests compare ledger, balance and evidence fingerprints.

## Changed files

API reports service and routing; shared reporting contracts/export; web proxy allowlist/router; operational reporting workspace and retained source-record workspace; reusable drawer active state, mobile table description sizing and receipt-unit tracking callback; reporting unit/integration/browser tests; scoped public-identity fixture snapshots; existing visual/shared browser selectors; architecture, traceability, brick/progress documents and five screenshots.

## Remaining work

Count certification and immutable daily closing remain separate milestones. Owner has now approved the remaining count concurrency/recount rule; their implementation follows. Cloud approval execution, operational migration/enrollment, real mail and hardware acceptance remain gated. Reporting periods are operational views, not certified closing snapshots. Production has no reporting-administration access. Remote CI is not claimed green; only executed local checks are reported.
