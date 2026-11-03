# Admin experience implementation plan

Status: audit complete; implementation pending. Scope: existing authorized capabilities only.

## Audit and capability inventory

The current Next.js client has one workspace-switching page. Authentication and the same-origin API proxy are established; NestJS enforces roles. Catalogue, progressive supplier/product setup, variant extension, atomic receiving, stock projections, exact identities, DYI:1 QR lookup and immutable PDF print evidence are implemented. All must remain authoritative.

| Area | Existing capability | Experience gap / planned work |
| --- | --- | --- |
| Navigation | Four local workspace buttons | Shared responsive shell, clear destinations, URL context, mobile navigation and account context |
| Overview | No dashboard | Real catalogue counts, recent receipts, identity links; no interchangeable-unit grand totals |
| Catalogue | Products/suppliers/SKUs, progressive creation and extension | Product details, configured variants, source relationships, discoverable extension, code-aware filtering and useful empty states |
| Suppliers | Registration and source-prefix setup | Dedicated supplier/source workspace linked to saved SKUs and products; no purchasing/financial features |
| Inventory | Authoritative lot/SKU/product projections | Dedicated stock exploration, source filters, usable/damaged distinction, exact lot and batch provenance |
| Receiving | Four-step multi-product receipt; retry key and submission latch | Separate entry from stock/history, searchable choices, clearer review and confirmation, retained draft safeguards |
| Receipts | Latest 100 and accepted details | Dedicated history with filters and detail context; clarify bounded history |
| QR | DYI:1, camera/HID/manual and exact P/L codes | Clear lookup choices, readable results and camera cleanup preserved |
| Labels | Initial/reprint manifests, chunked A4 PDF, operator outcomes | Better selection/context, readable history and explicit uncertain/partial outcomes; retain renderer and evidence |
| Administration | Session identity, health; no user-management commands | Honest read-only account/system information; no invented role/user controls |

### Cross-cutting findings

- Sidebar becomes a large stacked block on small screens; workflow content has inconsistent widths and repeated headings.
- Catalogue search promises codes but filters product names only. Product → variant → supplier SKU → lot context is difficult to follow.
- Receiving, stock and receipt history compete on one long page. Some product-level quantity totals obscure variant differences.
- Fetch/error handling is duplicated; several reads lack cancellation or retry. Empty/loading states and keyboard feedback are inconsistent.
- Modal variant grids and dense tables need 320px review. Preserve existing Back/discard behavior and idempotency keys on ambiguous failures.
- Catalogue read queries need origin-isolation review. Any fix must narrow foreign-data access without expanding roles.
- There are no supported rename/delete, user administration, generic audit-reader or stock-correction commands. These remain unavailable.

## Implementation milestones and publication gates

1. Audit/plan: this inventory, source-of-truth review and baseline checks. Commit `docs(admin): complete admin experience audit and implementation plan`.
2. Design/navigation: reusable shell, mobile navigation, page/state components and consistent styling. Commit `feat(admin): implement design system and application navigation`.
3. Dashboard/catalogue: real overview, product discovery/details and authorized creation/extension. Commit `feat(admin): build dashboard and product management`.
4. Suppliers/inventory: dedicated source relationships and authoritative lot workspace. Commit `feat(admin): implement supplier and inventory workspaces`.
5. Receiving/receipts: focused receipt entry/history/details and retry/error UX. Commit `feat(admin): improve receiving and receipt management`.
6. QR/labels/admin: existing lookup, PDF/reprint evidence and supported account/system interface. Commit `feat(admin): complete QR labels and administration workflows`.
7. Verification/refinement: regression suites, responsive/keyboard screenshots, fixes and implementation report. Commit `test(admin): finalize end-to-end verification and UX refinements`.

Each milestone receives relevant checks, diff review, its own commit and a verified push before proceeding. Repository inspection found no local Git history and an empty existing GitHub repository (`mcjohnsontech/inventori`); the pre-existing implementation is preserved separately in a baseline commit on `admin-experience`. Secrets, local databases, generated/private evidence and dependency/build directories are excluded.

## Verification strategy

Run unit tests, TypeScript checking and production build as baseline and appropriate milestone gates. Run PostgreSQL integration and Playwright acceptance suites against isolated fixtures for domain/security changes and final regression. There is no configured lint command; do not report lint as executed. Heavy suites run sequentially.

Exercise Admin, Manager and Production denial, catalogue creation/extension and unchanged identities, multi-source receiving/replay, stock U/D, public-code lookup, DYI:1 and PDF/reprint evidence. Extend browser coverage for new navigation, filters, error recovery, keyboard and widths 320/390/768/1024/1440. Capture synthetic-fixture screenshots; review rendered screens and fix overflow. Never create operational stock to demonstrate UI.

## Boundaries and approval gates

No schema changes, migrations, operational backfills, production deployment, new inventory mutations, allocation policies, permissions, StockUnit/DYI:2, full Phase 3 search, unit cart, label verification, production issues, recovery, closing or synchronization. Safe bounded read-only APIs may expose existing operational data through existing role restrictions; never raw security/audit metadata. Unsupported administration remains explicitly documented, not represented by fake actions. Stop for targeted owner approval if a restricted change becomes necessary.
