# Pricing and receiving extension

17 November 2026. Authorized scope: restore nested vendor onboarding, record actual receipt costs, maintain Admin selling prices and expose evidence-based valuation in the existing application. No deployment, operational migration, historical enrollment, backfill or real stock changes are authorized.

## Implemented behavior

- Receiving has Add Vendor beside its selector. The existing supplier/location/prefix wizard and setup service are reused through a receiving-scoped authenticated command. Admin/Manager may create vendors; Production is denied. New registry codes remain Admin-only. NFKC/whitespace/case-normalized duplicate names are rejected, existing code allocation/collision rules remain, and unchanged retries retain their command key. The receiving component remains mounted; nested cancellation retains its draft and successful creation refreshes and selects the vendor/source. If retained SKU lines belong to a prior vendor, they are shown with an explicit mismatch warning rather than reassigned.
- Optional receipt-line PurchaseCost evidence records exact NGN per-unit acquisition cost. Blank means unknown. A zero amount requires an explicit acquisition explanation. One immutable cost association covers all units originating from that receipt line, including damaged arrivals. A new receipt never updates an earlier cost. Existing unknown-cost receipts are left untouched. No cost-edit/backfill endpoint exists.
- SellingPrice is append-only, variant-scoped across supplier SKUs, NGN only, Admin-write/Admin-and-Manager-read. A reason, explicit review/confirmation, expected previous price and idempotency key are required. Concurrent stale edits conflict. Price, command result, audit, outbox and origin sequence commit atomically.
- Catalogue product details contain prices/history; receiving contains costs/review and accepted cost evidence; stock lot details contain valuation; Overview contains Financial Analytics; Reports & History contains Financial. No sidebar destination was added.

## Accounting and permissions

This extension uses the existing Admin/Manager operational read boundary for financial reports and purchase evidence. SELLING_PRICE_WRITE is Admin-only; Managers gain no selling-price editing or general catalogue administration. Production receives no financial endpoints or UI. All new endpoints require authentication, with origin membership and active capability rechecked under the write lock. Responses retain no-store proxy behavior. Location registry administration stays Admin-only.

NUMERIC(20,2) stores NGN evidence; validated decimal strings cross the API and integer kobo arithmetic calculates totals. No floating-point monetary storage/calculation is used. Units remain integer quantities.

Valuation reads each lot once and reconstructs U/D from StockMovement joined to accepted StockTransaction time. It never adds serialized unit counts to lot quantities. Issued P, completed C and disposed X stock are excluded from available inventory. D is reported separately as damaged/held exposure. Thus the ledger quantities reconcile with operational reports regardless of legacy/native unit coverage. Original StockUnit -> receiptLineId -> PurchaseCost provides cost provenance through the full lifecycle.

Known-cost value is a subtotal over units with cost evidence. Unknown cost is never treated as a known zero. Potential selling value includes only priced usable units. Unrealized potential gross profit and margin use the intersection of usable units with both a cost and a selling price; their coverage is displayed separately. Margin is (paired selling value - paired purchase cost) / paired selling value, percent truncated to two decimal places, or unknown when the denominator is zero. These are not realized sales/revenue/net profit/cash metrics.

Reports default to now. Through date selects ledger movements and latest price accepted before the end of that Lagos business date, capped at observation time. From date limits purchase/price history only, preserving opening inventory in valuation. Delivery dates are shown independently and never used to backdate acceptance. Trends show actual dated receipt cost observations and selling-price changes, without interpolated points or invented historical inventory snapshots. Original O4 daily snapshots are unchanged.

## Schema and API

Additive migration 033 creates PurchaseCost and SellingPrice, numeric/currency/zero constraints, immutable update/delete guards, same-receipt-command cost provenance and Admin/origin/previous-price price guards. No existing table is backfilled or stock history modified. An unavailable schema returns an explicit upgrade-required error; ordinary unknown-cost receiving remains compatible with earlier schema versions.

- POST /v1/receiving/supplier-setups: existing supplier setup input and Idempotency-Key.
- POST /v1/financial/selling-prices: variantId, amount (decimal string), currency NGN, reason, previousPriceId (nullable), confirmed true, Idempotency-Key.
- GET /v1/financial/report: optional from/to Lagos dates and productId/variantId/supplierId/lotId. Returns lot evidence, calculated coverage/valuation and dated purchase/price history under a repeatable-read snapshot.
- Existing receipt input/output gains optional purchaseCost {amount,currency,zeroReason}; absence remains unknown.

## Validation and limitations

Verification results and final revision are recorded below after execution. Intermediate runs exposed fixture authorization errors, an invalid checkout fixture and a negative formatting calculation; fixes retained all assertions. The initial integration attempt had no running test server. The first build lacked network access for configured fonts; the network-enabled build compiled then stopped at a dependency security notice. These attempts are not counted as passing builds.

Financial history is an evidence-based report, not a certified accounting statement. Current reports fetch the scoped lot/history evidence in one read snapshot with UI pagination; large production volumes are not benchmark-certified. No FX, sales/payment integrations, historical cost enrollment, cost corrections, automated price recommendations or approval-execution changes are included. Physical hardware acceptance and existing deployment gates remain separate. Next recommended slice is owner review of the tested extension and a separately authorized operational migration/rollout, with production-volume report performance acceptance.

## Executed verification

- `npm run typecheck`: passed, including API, web and test TypeScript projects.
- `npm test`: 96/96 tests passed in 31 files.
- Focused PostgreSQL regression command covering financial, catalogue, receiving, checkouts, completions and closing: 74/74 passed in six files. Injected audit/outbox failures intentionally produced error logs and rolled back correctly.
- Focused Playwright command covering financial.spec.ts and receiving-registration.spec.ts: all four journeys passed on the final run. Earlier connection-reset and label-selection failures are not counted as successes. Fixed the filter label association; did not increase timeouts or weaken assertions.
- Reports captured at 1440, 390 and 320 pixels; desktop and 320px full-page captures visually inspected. No horizontal overflow in asserted captures. Artifacts remain in ignored test-results/financial.
- Migration 033 applied only via the guarded migrate-test-db.ts utility to loopback dayari_test. Prisma client generated. No operational migration or enrollment performed.
- Read-only timing on retained synthetic fixture: financial report for 538 lots completed in approximately 712ms. This is development evidence, not a production capacity certification.
- `git diff --check`: passed. Unrelated preexisting workspace edits excluded from the feature commit.

`npm run build` completed with exit code 0 on the immediate advisory retry, including contracts, Prisma generation, API compilation and the optimized Next.js build. The first attempt in that invocation stopped at the installed Next.js security reminder; its documented immediate retry continued successfully. The existing Next.js security upgrade recommendation remains a known dependency maintenance item; dependency versions were not changed by this extension.

Changed areas: scoped supplier command/service and receiving wizard; financial service/controller/proxy; shared contracts/capabilities; receipt cost evidence; product/dashboard/inventory/report panels; additive migration 033 and Prisma models; focused unit/integration/browser tests; permission, traceability and implementation report documentation.

## Selling price from Receiving follow-up

Owner requested selling-price entry during receiving. Each selected receipt line now offers Set selling price to Admin and View selling price to Manager. The action opens the existing exact-variant pricing editor, with its validation, reason, explicit confirmation, idempotency, audit and history. Returning or cancelling preserves the receiving quantity, delivery date, invoice and purchase-cost draft. No new permissions or database migration were added.

Confirmed selling prices remain current variant prices across suppliers, saved separately from receipt acceptance. The UI explicitly explains that cancelling a receipt does not reverse a confirmed price change. Saving a price creates no receipt or stock movement. Existing receipt costs and financial/closing history remain unchanged.

Follow-up verification: `npm run typecheck` passed; financial integration suite 10/10 passed; focused Receiving selling-price browser journey passed (42 seconds), covering separate price save, no premature stock change, receipt draft retention, accepted cost/value and Manager read-only access. 390px pricing drawer screenshot inspected. No new migration. Local API refreshed; web/API health HTTP200. The first browser invocation found an old isolated test server on port 4101; only task-owned test processes were stopped before the successful rerun. Production build passed in .next-e2e with exit code 0 after the existing Next.js advisory immediate retry, preserving the running local development frontend. The existing dependency security warning remains; no dependency change or deployment was included.
