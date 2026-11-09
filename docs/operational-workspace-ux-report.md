# Operational workspace UX refinements

## Scope

- Distinct sidebar icons for checkout, completion, counts, reconciliation, damage and recovery; denser desktop navigation while keeping mobile targets larger.
- Usable-stock browsing groups by immutable parent product, not by variant or lot. Accessible click/keyboard expansion reveals variant, supplier-specific SKU, lot, batch and authoritative usable quantity. Product pages and expanded lot pages paginate independently; search and browsing context remain in place. No incompatible variant quantities are summed.
- Checkout and QR/code lookup share a workspace with two modes. The separate QR menu is removed; historical #qr links still resolve. Identification is read-only; only existing explicit checkout confirmation changes stock. Switching modes uses the existing navigation guard, persisted checkout draft, request cancellation and camera cleanup.
- BAD-report entry is a focus-trapped modal; the history and Manager disposition workspace remain available on the page. Closing preserves the draft; accepted commands, idempotency, review and explicit confirmation are unchanged.

## Contracts and integrity

Additive read option: GET /v1/availability?view=products&page=1&q=... returns product summaries with productCode, variantCount and lotCount. Existing default lot response remains supported. Expanded details use the existing productId lot filter. Both reads remain origin-scoped and usable-only; Production receives no supplier identity, invoices, damage history, audit or print administration data. Counts and page data use the existing repeatable-read transaction. UUID, SKU, Product/Lot/Unit Codes, QR payloads, ledger and stock mutations are unchanged. No database migration, enrollment or operational stock change is required.

## Verification

- Full unit suite: 87/87 passed across 28 files.
- Isolated availability integration suite: 3/3 passed, including grouping two variants/three lots under one product, product paging, exact detail quantities and sensitive-field exclusions.
- First browser run: checkout, damage and grouped stock passed; compact-navigation test exposed desktop overflow. Desktop item spacing was corrected. A generated modal description ID mismatch was also fixed.
- Final browser rerun, current typecheck/build and publication: recorded after execution below.

Browser tests use isolated synthetic receiving, checkout and damage fixtures; no staging or local operational inventory is changed. Existing unrelated local-upgrade records and closing-design draft remain outside this change.

## Limitations

Only the usable-stock discovery screen is grouped here; operational inventory sheets retain exact lot rows for accounting and provenance. Registered variants without usable stock are not presented as available. Product totals count matches, not a mixed-unit quantity. Hover is optional; all details are available by click, keyboard and touch. No new stock workflow, permission, future approval mechanism or daily closing functionality is introduced.

Final browser rerun: 4/4 passed (2.0 minutes), covering all-role navigation, grouped stock, lookup/checkout mode-switch draft preservation, checkout duplicate/lost-response safety, BAD modal close/reopen/reload, damage retries and Manager dispositions. Responsive checks covered 320, 390, 768, 1024 and 1440px. Current typecheck and API build passed. Browser screenshots under docs/images/operational-workspace-ux were visually reviewed; mobile modal and desktop grouped list/navigation fit without horizontal overflow. Remaining console warnings: existing pg client query-serialization deprecation and NO_COLOR/FORCE_COLOR notices; the new modal description warning was fixed.

Final production frontend build passed. Backend publication must precede the frontend because product grouping is additive API behavior. Only the existing approved isolated Heroku/Vercel staging environment is targeted.

## Changed files

- `apps/api/src/availability.service.ts`
- `apps/web/components/checkout-lookup-workspace.tsx`
- `apps/web/components/damage-workspace.tsx`
- `apps/web/components/production-workspace.tsx`
- `apps/web/components/shell/app-shell.tsx`
- `apps/web/components/shell/destinations.ts`
- `apps/web/components/shell/sidebar.tsx`
- `apps/web/components/ui/report-modal.tsx`
- `apps/web/components/workspace-router.tsx`
- `docs/images/completion/milestone-5/checkout-accepted-1440.png`
- `docs/images/completion/milestone-5/checkout-review-1024.png`
- `docs/images/completion/milestone-5/checkout-review-1440.png`
- `docs/images/completion/milestone-5/checkout-review-320.png`
- `docs/images/completion/milestone-5/checkout-review-390.png`
- `docs/images/completion/milestone-5/checkout-review-768.png`
- `docs/images/completion/milestone-7/bad-review-1024.png`
- `docs/images/completion/milestone-7/bad-review-1440.png`
- `docs/images/completion/milestone-7/bad-review-320.png`
- `docs/images/completion/milestone-7/bad-review-390.png`
- `docs/images/completion/milestone-7/bad-review-768.png`
- `docs/images/completion/milestone-7/damage-review-accepted-1440.png`
- `docs/images/operational-workspace-ux/combined-lookup-desktop.png`
- `docs/images/operational-workspace-ux/damage-modal-mobile.png`
- `docs/images/operational-workspace-ux/usable-products-desktop.png`
- `docs/images/operational-workspace-ux/usable-products-mobile.png`
- `docs/operational-workspace-ux-report.md`
- `packages/contracts/src/availability.ts`
- `tests/e2e/admin-journeys.spec.ts`
- `tests/e2e/admin.spec.ts`
- `tests/e2e/checkouts.spec.ts`
- `tests/e2e/compact-navigation.spec.ts`
- `tests/e2e/damage.spec.ts`
- `tests/e2e/labels.spec.ts`
- `tests/e2e/production.spec.ts`
- `tests/integration/availability.test.ts`
- `tests/unit/availability.test.ts`

Application commit: [a1443448226ac1096eb36a1d0790f7904a604e17](https://github.com/mcjohnsontech/inventori/commit/a1443448226ac1096eb36a1d0790f7904a604e17), pushed to feat/complete-application-systems. Heroku staging release v7 succeeded, reported no pending migrations, and API health returned HTTP 200. No new paid resources or database changes were introduced.

Vercel deployment dpl_BFnmPLzSywYJdQ1E9Y72aTicC2WV reached Ready and is aliased to https://dayari-inventory-staging.vercel.app/. Read-only published-asset checks confirmed the grouped product expander, combined QR/checkout mode control and damage-modal action are in the deployed frontend. Frontend returned HTTP 200; unauthenticated session proxy returned 401. Hosted inventory/account data was not changed for verification.
