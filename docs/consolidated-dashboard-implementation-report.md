# Consolidated dashboard — implementation report

12 November 2026. Implements the owner-approved dashboard/workspace direction using existing authorized commands and reads. Detailed whole-application audit: [current-application-audit.md](current-application-audit.md). Design baseline: [consolidated-dashboard-workflow-proposal.md](consolidated-dashboard-workflow-proposal.md).

## Delivered behavior

| Main area | Workflow |
|---|---|
| Overview | Noninteractive summary metrics, zero-stock/unreceived attention, recent accepted receipts and task shortcuts. No duplicate full inventory table or mixed-product quantity total. |
| Inventory | Parent-product groups expand to exact variant/SKU/lot quantities; delivery-lot and SKU sheet modes remain. Count history, pending requests and BAD/damage are internal views. Stock filters/pages survive switching Inventory views. Production gets the existing restricted usable inventory implementation. |
| Receiving | One receipt-history destination plus the existing progressive receiving modal. Accepted receipt inspection is a drawer; history filters remain after closing it. Existing same-source, damaged-intake and retry semantics are unchanged. |
| Production | Checkout/lookup, In Production completion and reason follow-up share a main destination. Existing eligible-unit selection, explicit confirmation and role restrictions are unchanged. |
| Labels & printing | Existing exact-unit cart, label preview, native print/PDF fallback, reprint and history preserved. Supported profile selection is in Print settings. Historical shared-lot rendering remains available. |
| Catalogue | Products and Suppliers share a main destination. Product inspection and compact supplier/source evidence open in drawers. Existing catalogue and variant-extension commands remain intact. |
| Reports & history | Existing read-only operational reports and exact Order ID investigation retained. No certified closing claim. |
| Users & settings | My account, Admin staff/invitations and Help use internal navigation. Staff inspection/supervised creation use a drawer; email invitation entry uses a task modal. |

Admin sees eight main destinations; Manager sees its permitted subset; Production sees Inventory, Production and Users & settings. Existing route hashes/deep links continue to resolve. Navigation labels/icons come from the existing shared destination configuration.

## Interaction/integrity details

- Native task dialogs keep supported draft fields mounted when closed, restore focus, prevent closing while a submission is active, and retain existing explicit discard/retry behavior. Count, completion, reconciliation, request and invitation entry use these dialogs. Existing receive/catalogue/BAD modals remain.
- Select menus are portalled into their owning native dialog, avoiding inert/inaccessible options behind the modal.
- Count errors and stable-key retry actions are inside the active dialog. Reopening the same count from history retains its unsaved fields. Accepted reconciliation closes its task dialog before focusing the recorded result.
- Product/receipt drawer selection follows accepted parent navigation, so a refused discard does not first clear local selected-record state. Product inspection temporarily suspends while its catalogue wizard owns the dialog, then returns.
- No backend permission, stock command, QR payload, ledger constraint, schema, migration, dependency or operational data is changed by this slice. Existing 28 migrations remain unchanged. No historical enrollment or stock adjustment was run.
- This does not claim every proposed illustrative modal/drawer was redesigned. Checkout review and some printing/reprint evidence retain their established layouts. Daily closing and remote approval execution were not added.

## Tests actually executed

- Unit suite: **89/89 passed**, 29 files, 19.22 seconds. New tests assert eight main destinations, compatibility aliases and Production presentation versus API-capability boundaries.
- Browser group: **7/7 passed**, 5.9 minutes: staff provisioning/session/password handover, pending requests, Manager completion, consolidated navigation/draft preservation, targeted count/recount/lost response, invitation acceptance/single-use denial and Manager reason reconciliation. Isolated fixtures only; no real mail.
- An initial overloaded parallel run was stopped after timing/fixture-response delays; a navigation helper also queried mobile controls before login rendered. Sequential rerun passed after the helper correction. The count-modal retry placement and select portal issues were fixed rather than weakening assertions.
- Across targeted browser runs, **19 distinct cases passed**: accounts, invitations, requests, completion, reconciliation, counts, compact navigation, consolidated role/draft navigation, parent grouping/drawers, BAD reporting, inventory sheet, read-error recovery, checkout, receiving, shared-lot labels, exact-unit labels, responsive account/settings screens catalogue extension/deep links and Overview loading/error recovery. This is not a claim that the entire Playwright suite ran in one green execution.
- The final catalogue journey passed **1/1 in 1.6 minutes**, including 320/390/768/1024/1440 viewports, variant extension, immutable original SKUs and unchanged accepted receipt. Responsive staff/settings and read-retry group passed **2 cases**; the preceding Admin failure was a selector ambiguity between product card and drawer, now corrected and rerun.
- The initial broader 11-case run had five failures: outdated Production subtab helper (checkout and both label journeys), a Windows screenshot write, and an any-dialog assertion after receiving now legitimately opened a receipt drawer. The corrected focused group passed checkout/counts/both printing/receiving/read-retry (**6 cases**, 3.3 minutes); subsequent focused catalogue rerun passed. A mobile test run was stopped after identifying duplicate test-only menu handling; its corrected rerun is the 1/1 result above. No stock/security assertions were skipped or weakened.
- Earlier implementation-report results remain historical evidence, not reruns claimed here. Final integration/typecheck/build results follow below.

## Browser evidence

Desktop and mobile count-history captures reviewed at 1440 and 390 pixels; overflow checks also cover 320, 768 and 1024. Synthetic fixture screenshots only.

- [Desktop count history](images/consolidated-dashboard/count-history-1440.png)
- [Mobile count history](images/consolidated-dashboard/count-history-390.png)
- [Grouped inventory](images/consolidated-dashboard/grouped-inventory-1440.png)
- [Mobile product drawer](images/consolidated-dashboard/product-drawer-320.png)
- [Desktop receipt drawer](images/consolidated-dashboard/receipt-drawer-1440.png)

## Publication, files and remaining work

Verified source publication, final checks and staging publication are recorded below. Existing unrelated working-tree notes (including closing design/progress/decision and local-upgrade documents), generated next-env output and an independently modified docs ignore rule are preserved, not bundled into the implementation commit.

See the application audit for unfinished PRD work: strict O4 closing, cloud approval execution/transport and certified local deployment, physical printer/scanner trials, historical enrollment and production go-live hardening. This task makes no new business-policy decision and does not deploy operational migrations.


## Changed files

- `apps/web/app/page.tsx`
- `apps/web/components/authorization-requests-workspace.tsx`
- `apps/web/components/catalogue/catalogue-workspace.tsx`
- `apps/web/components/completion-workspace.tsx`
- `apps/web/components/counts-workspace.tsx`
- `apps/web/components/dashboard.tsx`
- `apps/web/components/inventory-workspace.tsx`
- `apps/web/components/invitations-panel.tsx`
- `apps/web/components/labels/unit-printing-workspace.tsx`
- `apps/web/components/production-workspace.tsx`
- `apps/web/components/receiving/receipts-workspace.tsx`
- `apps/web/components/reconciliation-workspace.tsx`
- `apps/web/components/shell/app-shell.tsx`
- `apps/web/components/shell/destinations.ts`
- `apps/web/components/shell/top-bar.tsx`
- `apps/web/components/suppliers-workspace.tsx`
- `apps/web/components/ui/details-drawer.tsx`
- `apps/web/components/ui/select.tsx`
- `apps/web/components/ui/task-modal.tsx`
- `apps/web/components/users-workspace.tsx`
- `apps/web/components/workspace-router.tsx`
- `docs/IMPLEMENTATION_BRICKS.md`
- `docs/architecture.md`
- `docs/consolidated-dashboard-implementation-report.md`
- `docs/consolidated-dashboard-workflow-proposal.md`
- `docs/current-application-audit.md`
- `docs/images/consolidated-dashboard/ (five synthetic captures)`
- `docs/requirements-traceability.md`
- `tests/e2e/access.spec.ts`
- `tests/e2e/accounts.spec.ts`
- `tests/e2e/admin-journeys.spec.ts`
- `tests/e2e/admin.spec.ts`
- `tests/e2e/application-visual.spec.ts`
- `tests/e2e/authorization-requests.spec.ts`
- `tests/e2e/checkouts.spec.ts`
- `tests/e2e/compact-navigation.spec.ts`
- `tests/e2e/completions.spec.ts`
- `tests/e2e/consolidated-dashboard.spec.ts`
- `tests/e2e/counts.spec.ts`
- `tests/e2e/damage.spec.ts`
- `tests/e2e/inventory-sheet.spec.ts`
- `tests/e2e/invitations.spec.ts`
- `tests/e2e/labels.spec.ts`
- `tests/e2e/manager.spec.ts`
- `tests/e2e/production.spec.ts`
- `tests/e2e/progressive.spec.ts`
- `tests/e2e/public-identities.spec.ts`
- `tests/e2e/receiving-registration.spec.ts`
- `tests/e2e/receiving.spec.ts`
- `tests/e2e/reconciliation.spec.ts`
- `tests/e2e/reports.spec.ts`
- `tests/e2e/shared.spec.ts`
- `tests/e2e/stock-summary-loading.spec.ts`
- `tests/e2e/ui.ts`
- `tests/e2e/unit-labels.spec.ts`
- `tests/e2e/unit-tracking.spec.ts`
- `tests/unit/consolidated-navigation.test.ts`


## Final database verification

`npm run test:integration`: **172/172 passed**, 23 files, 192.22 seconds. Includes catalogue/variant identity, receiving/ledger, serialization/cutover, QR/printing, staff/auth/invitations/RBAC, checkout, BAD/disposition, reconciliation, pending requests, completion, counts, reports and isolated migration/preservation regressions. Synthetic audit/outbox failures deliberately logged exceptions and passed rollback assertions. No operational database was used. The pg concurrent-query deprecation warning remains an existing maintenance issue; this UI task does not claim to resolve it.


## Typecheck/build and final draft check

`npm run typecheck` passed. `DAYARI_E2E=1 npm run build` passed contracts, Prisma client generation, Nest API compilation and optimized Next production compilation/static route generation in the isolated build directory. Client generation does not apply database migrations. Final review added a same-count history reopen guard: reopening an already selected count retains its unsaved fields instead of resetting them. The focused count journey passed **1/1 in 56.6 seconds**, including the history-row reopen assertion. The subsequent final `DAYARI_E2E=1 npm run build:web` passed optimized compilation, TypeScript and static route generation. Overview retains its existing `aria-busy` loading signal and never substitutes unavailable quantities with zero.


Historical report images regenerated by browser tests were preserved under ignored `.local/consolidated-ui-evidence` before restoring prior Git versions. One locked generated count capture (`docs/images/completion/milestone-8b/count-768.png`) could not be restored and remains unstaged; it is excluded from publication. Five selected current synthetic screenshots are included as this milestone's evidence. Existing unrelated notes/ignore changes and generated next-env output remain outside the commits.


## Verified source publication

Implementation commit: [`b9f9c6df83a34748bd80e13fb5fd5286e6d5e019`](https://github.com/mcjohnsontech/inventori/commit/b9f9c6df83a34748bd80e13fb5fd5286e6d5e019) — `feat(ux): consolidate inventory workflows and navigation`, branch `feat/complete-application-systems`. Push succeeded. Staged scope contained 50 frontend/test files, with no schema, migration, dependency, environment or private-data files.

The final Overview regression passed **1/1 in 40.2 seconds**, proving held reads show Loading, failed reads show Unavailable and retry returns real quantities. Across this task, 19 distinct targeted browser cases reached successful completion after the recorded corrections. The entire Playwright suite was not run as a single green suite; remaining untouched/selector-adapted legacy cases are not claimed as newly executed successes.


## Staging publication and live smoke checks

Frontend only: Vercel deployment `dpl_7b9WDYwp7Gair6tAyq8nN1kKShA9` reached **READY** and the existing alias [dayari-inventory-staging.vercel.app](https://dayari-inventory-staging.vercel.app/) points to it. Vercel calls the stable alias its production target; the project remains the separately authorized **isolated staging environment**, not shop production go-live.

Read-only live checks: homepage **200**, unauthenticated `/api/me` **401**, 12 local script assets inspected; deployed bundle includes `Staff & invitations`, `Count history`, `Checkout & lookup` and `Users & settings`. No live account/stock mutation or real invitation was used. Backend deployment, SMTP configuration, database migrations and data were unchanged. No new infrastructure or subscription was provisioned.
