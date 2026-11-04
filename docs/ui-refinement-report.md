# UI review and printing simplification

4 November 2026. Owner requested a UI review and removal of print-outcome reporting. Scope is presentation and existing frontend workflows; no backend, schema, migrations, stock, permissions or QR identity changes.

## Findings and changes

- The labels action bar overlapped the first-free-label picker and left its original space blank farther down the page. It now sits in normal document flow after the preview. The right preview remains sticky on wide screens.
- Removed printed/failed/uncertain report forms, reported-copy fields and repeat-print acknowledgement gates. A user can print or use selective reprints without reporting an outcome. Print requests are still automatically recorded with unique attempt IDs; no physical success is inferred. Historical records and backend compatibility remain intact.
- Fixed singular/plural sheet counts and small-screen pager wrapping. Reduced repetitive operator instructions and updated Help to match the workflow.
- Account security was a two-column grid nested inside half of another two-column grid. It now spans the outer grid, giving Profile/Sessions and Password their own full columns on desktop and stacked panels on mobile.
- Staff/account/invitation/report screens had unclassed native fields that lost their original styling during the design-system transition. Scoped compatibility styles give those controls matching dimensions, borders, labels, focus and disabled states; classed design-system controls, checkboxes, radios and hidden fields are excluded.
- Long shared button labels can grow vertically instead of clipping inside fixed heights. Page-header actions wrap when space is insufficient. Legacy pages have consistent separation between headings and their first panel.
- Expandable sections now show a chevron that follows their own open state. Removed stale Account text claiming password changes and user administration were unavailable.
- Mobile inventory previously showed only the first table column; stock quantities and Details were outside the viewport. Inventory tables now opt into labelled stacked rows below 640px, retaining the full desktop sheet and existing drawer/filter behavior.
- The keyboard skip link changed the URL hash to `workspace-content`, which the hash router interpreted as an unknown workspace. It now focuses/scrolls to the main content without altering the URL. The browser test now proves the route and heading stay unchanged as well as focus moving correctly; previously it could capture a not-found page and pass.
- Mobile navigation and the workspace bar both used sticky top zero and overlapped after scrolling. Their offsets now stack, with matching skip-target scroll margins.
- Invitation history expanded every record above the staff directory/account form. It is now an expandable, bounded history, preserving all existing invitation actions while keeping staff tasks reachable.
- Search wrappers stretched to the height of neighbouring labelled filters, leaving magnifying-glass/clear icons below the input centre. The shared wrapper now has the control's height and aligns to the row's bottom; the visual test checks actual icon/input centre alignment.

## Verification

- `npm test`: 35 passed across 13 files.
- Final targeted browser run: 3/3 passed — application visuals/accessibility, invitation creation/redemption and report-free label printing/reprinting. Separately passed: inventory sheet/drawer and shared reports/help (2 cases), account provisioning and both admin journeys (3 cases). Eight distinct browser cases passed across these runs; this is not a claim of one full-suite run. The last shared-header/history adjustments were covered by the final visual/invitation run. Browser mutations used isolated fixtures only.
- After the final search-alignment adjustment, `npm run test:e2e -- tests/e2e/application-visual.spec.ts` passed again (1/1), including icon/input centre checks at all five widths. Updated screenshots show actual workspaces, not the earlier skip-link not-found state.
- `npm run build`: passed after the final search fix (contracts, Prisma generation, API, production webpack, TypeScript, static pages and traces). Final `npm run typecheck`: passed. Backend integration tests were not rerun for this frontend-only change; API/contracts/schema have no diff.
- Initial browser audit was interrupted after a Next development compiler reported an empty manifest. Only the verified `.next-e2e` cache was removed after its servers stopped; that interrupted attempt is not counted as a passing run.
- In the next run, account provisioning and both admin-journey cases passed. The strengthened account visual assertion exposed the skip-link route bug and timed out; it was fixed, then verified successfully. Screenshots from that failed attempt were replaced by successful actual-workspace captures.
- After the routing fix, application visual checks, mobile inventory/drawer checks and shared reports/help checks passed. The labels test still expected the deliberately removed OUTCOME_UNKNOWN report; it was corrected to assert two distinct automatic HANDOFF_REQUESTED attempts and zero fabricated outcome records, then passed. Final targeted results are recorded above.

## Changed files

`apps/web/app/globals.css`; `components/account-security.tsx`, `settings-workspace.tsx`, `help-workspace.tsx`, `inventory-workspace.tsx`, `invitations-panel.tsx`, `shell/app-shell.tsx`, `shell/top-bar.tsx`; `components/labels/label-workspace.tsx`, `pdf-sheet-preview.tsx`; shared `ui/button.tsx`, `disclosure.tsx`, `page-header.tsx`, `data-table.tsx`, `search-input.tsx`; `tests/e2e/labels.spec.ts`, `application-visual.spec.ts`, `inventory-sheet.spec.ts`; this report, `ui-refinement-plan.md`, `decisions.md` and the final browser evidence.

No migration. No operational stock/account testing, new inventory commands or deployment. The generated `next-env.d.ts` change predates this task and is excluded.

## Remaining limits

Native print dialogs and physical output depend on the browser/printer. Physical alignment and scan trials remain pending. Reprinting retains existing lot QR identities and never creates inventory. Reprint reasons remain part of the established backend contract. This review does not claim every future or unsupported workspace is implemented.

## Browser evidence

Synthetic fixtures only. All five widths (320, 390, 768, 1024 and 1440px) are captured for Users, Account, Help and Reports. Checks include unchanged skip-link routes, accessible field names, account column widths, draft preservation and no document horizontal overflow. Inventory additionally checks that every mobile cell is inside the viewport and that the drawer still restores focus and filters.

- [Account desktop](images/ui-refinement/account-1440.png)
- [Staff directory mobile](images/ui-refinement/users-320.png)
- [Staff form mobile](images/ui-refinement/user-form-320.png)
- [Inventory mobile](images/ui-refinement/inventory-320.png)
- [Labels desktop](images/labels-redesign/workspace-1440.png)
- [Labels mobile](images/labels-redesign/workspace-320.png)

Screenshots were inspected as part of the review. The label workflow blocks nonlocal browser requests and verifies the real PDF/canvas, sheet picker, paging, repeated handoff, selective reprint, draft warning, original quantities and Production denial. No success, failure or uncertain-output report is submitted by that workflow.

## Publication and local service

| Milestone | Commit | Branch | Verification | Push |
|---|---|---|---|---|
| UI review and printing simplification | [`6ab117f9aa1fc0192a2a0e9d2b08aee1c2f6432f`](https://github.com/mcjohnsontech/inventori/commit/6ab117f9aa1fc0192a2a0e9d2b08aee1c2f6432f) — `fix(ui): simplify printing and correct workspace layouts` | `feat/complete-application-systems` | 35 unit tests; eight distinct browser cases across the documented runs; final visual rerun; typecheck and production build | Successful; remote SHA verified |

Local web server restored on port 3000. Separate Chrome verification returned web HTTP 200, API health HTTP 200 and a visible hydrated sign-in form. No operational login, stock mutation, migration or deployment was performed. A documentation-only follow-up records this publication evidence.
