# Inventory experience — Slices 1–3

Status: Slices1–3 implemented and verified; final publication in progress. Owner authorized Slices 1–3 only; unit serialization, V2 QR, printing changes, invitations and operational migrations are excluded.

## Slice 1 — compact navigation

Grouped all existing destinations by stock/operations, catalogue, tools/reports and workspace. Removed tall explanatory blocks, retained all role-aware destinations and existing routes, added desktop icon-only collapse/expand. Normal desktop navigation does not scroll internally; short screens use document scrolling. Mobile menu retains Escape/focus behavior.

Executed successfully: typecheck, full production build, 3 browser tests (compact navigation across all three roles and five viewport widths, existing role/CSRF/session checks and service-error/session-expiration recovery). Desktop screenshot inspected: [navigation](images/inventory-slices/navigation-admin-1440.png). No backend/schema/migration change. No lint command is configured.

Changed files: apps/web/components/app-shell.tsx, apps/web/app/globals.css, tests/e2e/compact-navigation.spec.ts, this report and navigation screenshot. Commit/publication evidence will be recorded after push verification.

## Scope

All three authorized slices are implemented. No later implementation slice is authorized.
## Slice 2 — inventory sheet and details drawer

Compact delivery-lot and SKU tables replace the card grid; mobile uses one-column sheet rows. Product/Lot Codes appear only where assigned. Search, product/source/availability filters, no-usable filter, existing pagination and complete-SKU totals remain explicit. A native modal right drawer (full-width mobile) retains current filters, traps keyboard focus, closes on Escape and restores trigger focus. Detail fetching is cancellable and refuses mismatched stale lot evidence. Existing receiving/provenance services and permission guards are unchanged.

Actual checks: inventory-sheet browser scenario passed (known isolated two-batch quantities 3+5 usable, 1 damaged, exact code search, aggregate SKU8/1, drawer error/retry, focus and five widths, no read-induced stock changes). Initial regression run had 1 passed/2 failures: identity and receipt assertions raced still-pending requests during concurrent cold compilation. Trace snapshots showed loading/pending calls. Added explicit response/status checks without weakening quantity/security assertions; receiving and identity regressions then passed 2/2. Production build and typecheck passed for application changes; final test-source typecheck recorded before commit. Desktop and mobile sheet/drawer screenshots inspected and retained in images/inventory-slices.

No schema/migration/stock mutation added. Existing stock API still returns all authorized filtered lots; UI paging/search remain client-side, an acknowledged scaling limit rather than a new universal discovery engine. Server paging can be a later read-only performance slice. No Unit Codes are fabricated. Slice1 published at 41297947d400a21f142ad24dd40192ae00b751ba; remote SHA verified.

Changed files: inventory-workspace.tsx, ui/details-drawer.tsx, globals.css, inventory-sheet.spec.ts, receiving.spec.ts, public-identities.spec.ts and admin-journeys.spec.ts (existing card selectors now target rows/Details), four sheet/drawer screenshots and this report.

## Slice 3 — stock-focused overview

Primary sheet shows registered product variants, exact usable/damaged quantities, never-received and no-usable states. It aggregates only within the same variant across saved supplier SKUs and batches, retaining all lot provenance and BIGINT precision. No parent/cross-product grand total or invented reorder threshold. Compact clickable count strip filters attention; mobile prioritizes the product sheet. Expand a variant's lots and open the exact inventory drawer via #inventory/<productId>/<lotId>, including refresh support. Recent receipts retain delivery versus acceptance dates; guide/help/actions remain available below stock.

Focused unit suite passed27/27 (11 files). Final typecheck passed after correcting synthetic fixture casts. Initial focused browser run: Admin navigation and Manager passed; new stock test found an exact-label issue, fixed with explicit accessible stock-status naming; its rerun passed, including three Red lots across suppliers/batches (10 usable/1 damaged), damaged-only Brown and never-received Green. Final browser execution details are recorded below. Visual review fixed mobile count wrapping and enlarged sheet text. Admin journey cold-read assertions now await completed responses with the expected status (including the intentional503). This ignores canceled development effect requests and unrelated older successes while retaining actual rendered/error/security assertions. No assertion on identities, quantities, roles or error recovery was removed.

Slice2 published at15283d5189b037fcaa0064cc041c69625b5575c1; remote SHA verified. Final tests, files and Slice3 publication follow below.

## Preserved boundaries and limitations

No API, shared domain contract, Prisma schema or migration changes in these slices. `git diff dbde56d493cd9d2bfe22c7af2dcbbb7a368de087 --quiet -- apps/api prisma packages/contracts` confirmed these match the completed Phase B baseline. Stock remains the server ledger projection; frontend sums are presentation within exact variant IDs, never stock authority or a write command. No operational stock/account mutations, migrations, backfills or deployment were performed for this task. All mutation-heavy browser fixtures use the guarded local *_test database.

Existing Product/Lot mappings, supplier SKUs, receipts, ledger, DYI:1 and print evidence remain unchanged. Historical missing Product/Lot Codes are shown only in details, not fabricated or backfilled. Receiving, account security, fixed-role guards, scan/print commands and renderer semantics remain intact.

Known limitations: existing stock API is unbounded and sheet paging/search remains client-side. Catalogue metadata is loaded with the workspace/session; reload after concurrent catalogue changes to see newly registered identities. Overview is a recorded-stock view, not an independent physical count or demand forecast. No reorder thresholds or cross-variant unit-of-measure assumptions were added. Recent receiving uses the existing latest100 read, showing the most recent3; no all-time receipt-volume metric is inferred. Browser evidence is Chromium at five widths, not physical printer/scanner certification.

## Future design decisions delivered

- [Six-character Unit Codes](six-character-unit-code-design.md): exactly6 characters, no fixed U prefix, readable31-character alphabet, capacity887,503,681/origin, secure allocation/database uniqueness/bounded32 collision retries, no widening/recycling, typed manual lookup including Product/Unit same-string ambiguity, UUID-backed DYI:2, prominent label code and negative/concurrency/exhaustion tests. This is design only; no unit schema/contracts/endpoints activated. Product/Lot formats and V1 QR remain unchanged.
- [Staff invitations](staff-invitation-design.md): approved future direction, employee-set password, single-use token/hash, expiry/revocation, private encrypted delivery queue, post-commit offline-safe send/retry, origin/audit protections and takeover/CSRF/rate-limit testing. No invitation implementation, provider or password-policy change. Still requires owner decisions on expiry/resend/retention, existing/disabled email handling, role-change invalidation, password-policy scope, trusted URL/TLS/provider and secret/key ownership, plus legacy provisioning transition.
- Updated architecture, data model, decisions, traceability, implementation bricks and prior UX/unit designs distinguish completed UI from future implementation. Unit serialization/cutover/benchmarks, historical onboarding, V2 QR, individual-unit/native printing and verification remain gated. Issuing, recovery, closing and synchronization remain excluded.

Recommended next step: owner acceptance of the three UI slices, then choose a separately authorized invitation or unit-serialization milestone. No automatic continuation.


## Final executed checks

| Check | Actual result |
| --- | --- |
| npm test | 27/27 tests,11 files passed |
| npm run typecheck | Contracts/API/web/root passed |
| npm run test:integration | 62/62 PostgreSQL tests,10 files passed; isolated local test DB only |
| PLAYWRIGHT_CHANNEL=chrome npm run test:e2e | Full18-scenario run:17 passed,1 test-helper response race; all application scenarios exercised |
| Final npm run test:e2e -- tests/e2e/admin-journeys.spec.ts | 2/2 passed after helper correction; both full Admin journey and intentional error/stale-result scenario. All18 current browser scenarios now have successful coverage across these runs, not a claim that the initial full command passed |
| npm run build | Contracts, Prisma client generation, Nest build and optimized Next production build passed |
| git diff --check | Passed; no lint script is configured |

Earlier targeted failures are retained above. A helper attempt using the first request failed on React development-mode cancellation (null response); final helper waits for a completed expected response. A selector timeout on the stock-status label and mobile count wrapping were corrected. No tests were disabled or quantity/permission assertions weakened. Existing pg query deprecation/NO_COLOR warnings persist. Integration forced-outbox errors are expected rollback fixtures, not hidden successes. No new physical printing/scan trial, invitation flow or unit-serialization benchmark was performed.

## Browser and visual evidence

Nine PNGs plus sizes/SHA256 are retained under [images/inventory-slices](images/inventory-slices/README.md), with [evidence.json](images/inventory-slices/evidence.json). The tests cover Admin/Manager/Production navigation,320/390/768/1024/1440 widths, short-height navigation, list identities/quantities/search, native drawer focus/Escape/retry, old receiving lost-response idempotency, existing DYI:1/P/L lookup and printing/reprints, and role/field restrictions.

Representative screens: [inventory desktop](images/inventory-slices/inventory-1440.png), [inventory mobile](images/inventory-slices/inventory-320.png), [drawer desktop](images/inventory-slices/drawer-1440.png), [drawer mobile](images/inventory-slices/drawer-320.png), [overview desktop](images/inventory-slices/overview-1440.png), [overview mobile](images/inventory-slices/overview-320.png). Synthetic fixture counts are real test-data counts, not fabricated shop statistics.

## Database and API changes

**None.** No new migrations, endpoints, shared domain contracts, dependencies, ledger transitions or operational data changes. The proposed six-character unit constraint/contract is documentation for the separately gated future model only.
