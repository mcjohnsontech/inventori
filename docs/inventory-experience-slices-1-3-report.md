# Inventory experience — Slices 1–3

Status: implementation in progress. Owner authorized Slices 1–3 only; unit serialization, V2 QR, printing changes, invitations and operational migrations are excluded.

## Slice 1 — compact navigation

Grouped all existing destinations by stock/operations, catalogue, tools/reports and workspace. Removed tall explanatory blocks, retained all role-aware destinations and existing routes, added desktop icon-only collapse/expand. Normal desktop navigation does not scroll internally; short screens use document scrolling. Mobile menu retains Escape/focus behavior.

Executed successfully: typecheck, full production build, 3 browser tests (compact navigation across all three roles and five viewport widths, existing role/CSRF/session checks and service-error/session-expiration recovery). Desktop screenshot inspected: [navigation](images/inventory-slices/navigation-admin-1440.png). No backend/schema/migration change. No lint command is configured.

Changed files: apps/web/components/app-shell.tsx, apps/web/app/globals.css, tests/e2e/compact-navigation.spec.ts, this report and navigation screenshot. Commit/publication evidence will be recorded after push verification.

## Pending slices

Slice 2 inventory sheet and details drawer, Slice 3 stock-focused overview; design correction and invitation note will be delivered with documentation. No later implementation slice authorized.
