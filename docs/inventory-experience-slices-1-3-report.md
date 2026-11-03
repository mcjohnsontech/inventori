# Inventory experience — Slices 1–3

Status: implementation in progress. Owner authorized Slices 1–3 only; unit serialization, V2 QR, printing changes, invitations and operational migrations are excluded.

## Slice 1 — compact navigation

Grouped all existing destinations by stock/operations, catalogue, tools/reports and workspace. Removed tall explanatory blocks, retained all role-aware destinations and existing routes, added desktop icon-only collapse/expand. Normal desktop navigation does not scroll internally; short screens use document scrolling. Mobile menu retains Escape/focus behavior.

Executed successfully: typecheck, full production build, 3 browser tests (compact navigation across all three roles and five viewport widths, existing role/CSRF/session checks and service-error/session-expiration recovery). Desktop screenshot inspected: [navigation](images/inventory-slices/navigation-admin-1440.png). No backend/schema/migration change. No lint command is configured.

Changed files: apps/web/components/app-shell.tsx, apps/web/app/globals.css, tests/e2e/compact-navigation.spec.ts, this report and navigation screenshot. Commit/publication evidence will be recorded after push verification.

## Pending slices

Slice 2 inventory sheet and details drawer, Slice 3 stock-focused overview; design correction and invitation note will be delivered with documentation. No later implementation slice authorized.
## Slice 2 — inventory sheet and details drawer

Compact delivery-lot and SKU tables replace the card grid; mobile uses one-column sheet rows. Product/Lot Codes appear only where assigned. Search, product/source/availability filters, no-usable filter, existing pagination and complete-SKU totals remain explicit. A native modal right drawer (full-width mobile) retains current filters, traps keyboard focus, closes on Escape and restores trigger focus. Detail fetching is cancellable and refuses mismatched stale lot evidence. Existing receiving/provenance services and permission guards are unchanged.

Actual checks: inventory-sheet browser scenario passed (known isolated two-batch quantities 3+5 usable, 1 damaged, exact code search, aggregate SKU8/1, drawer error/retry, focus and five widths, no read-induced stock changes). Initial regression run had 1 passed/2 failures: identity and receipt assertions raced still-pending requests during concurrent cold compilation. Trace snapshots showed loading/pending calls. Added explicit response/status checks without weakening quantity/security assertions; receiving and identity regressions then passed 2/2. Production build and typecheck passed for application changes; final test-source typecheck recorded before commit. Desktop and mobile sheet/drawer screenshots inspected and retained in images/inventory-slices.

No schema/migration/stock mutation added. Existing stock API still returns all authorized filtered lots; UI paging/search remain client-side, an acknowledged scaling limit rather than a new universal discovery engine. Server paging can be a later read-only performance slice. No Unit Codes are fabricated. Slice1 published at 41297947d400a21f142ad24dd40192ae00b751ba; remote SHA verified.

Changed files: inventory-workspace.tsx, ui/details-drawer.tsx, globals.css, inventory-sheet.spec.ts, receiving.spec.ts, public-identities.spec.ts and admin-journeys.spec.ts (existing card selectors now target rows/Details), four sheet/drawer screenshots and this report.
