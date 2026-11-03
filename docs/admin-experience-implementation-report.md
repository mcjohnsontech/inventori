# Admin experience implementation report

Scope: the owner's complete Admin experience authorization, 3 November 2026. Implementation and verification are complete. This report accompanies the seventh completion milestone; its exact publication SHA is recorded after the verified push.

## Audit and delivered application

The original implementation placed catalogue tabs, receiving, stock and printing behind four local buttons. It had no operational overview, product detail view, dedicated supplier/inventory/receipt workspaces or account view. Product Code search did not match codes; several reads could display stale results; small-screen navigation consumed excessive space. The [audit and plan](admin-experience-implementation-plan.md) records capabilities and exclusions.

The application now has nine coherent destinations, with emerald/cream surfaces, compact mobile navigation, active-page indicators, skip navigation, keyboard focus, consistent headers, search, badges, loading/error/retry and empty states:

| Workspace | Actual supported behavior |
| --- | --- |
| Overview | Server-backed catalogue counts, configured variants, supplier SKUs, lots with usable/damaged stock, recent accepted receipts and task shortcuts. No unlike-product quantity grand total. |
| Catalogue | Code/name/variant search, paged products and SKU lists, product detail, configured attributes/values, registered variants, saved supplier sourcing and stock links. Existing progressive creation and extension commands remain authoritative. |
| Suppliers & sources | Saved supplier/source codes and prefixes, sourced products/SKUs, existing supplier registration and location setup. |
| Inventory | Product/source/availability filters, lot and SKU balances, U/D distinction, exact codes, batch provenance, receipt/movement evidence and links back to product/receipt. |
| Receiving | Focused multi-product receipt wizard, searchable product choices, separate U/D and explanations, shared-contract validation, review, explicit confirmation and accepted batch balances. |
| Receipts & activity | Search and delivery-date filter over the explicitly identified latest-100 window, accepted details, exact lots, current batch projections and label entry point. Acceptance order/date remain distinct. |
| QR lookup | Existing DYI:1, focused HID input, camera fallback, exact manual source/SKU/batch and P/L lookup. Input changes cancel stale results. |
| Labels & printing | Filtered receipt selection, immutable initial/reprint manifests, existing A4 PDF preparation/preview/download/handoff, operator reports, uncertain/partial outcome guidance and history. No stock writes. |
| Account & shop | Current name/role and supported permissions; Admin-only minimal shop origin/authority/timezone/sync configuration. No fake user/role editing controls. |

Product and receipt details have UUID-bearing fragment links that survive reload; inventory product filters retain context and provide a direct return to the parent. Fragments select views only: every API still validates identity, role and origin.

## Engineering and API changes

- Reusable `AppShell`, `PageHeader`, `SearchField`, `Badge`, `EmptyState`, `ReadError`, `LoadingState`, shared typed API/read hook and route error boundary. Small-screen receipt lines use cards rather than compressed tables; overflow tables remain keyboard-scrollable. Development indicators are disabled so local controls are not obscured; compile/runtime errors still surface. Existing Button and native dialog conventions retained; no new dependencies.
- Cancelled/stale reads cannot repopulate edited lookup inputs. Camera tracks/decoder timers and source/lookup requests are released on teardown. Writes retain their existing idempotency and retry protocols.
- Wizard submission latches supplement existing server idempotency. Back/discard behavior remains, browser unload and SPA/browser-Back navigation protect populated drafts, and actions stay visible on small screens. Switching product sourcing refreshes saved suffixes; leaving product setup for location setup requires explicit discard confirmation.
- Catalogue reads now filter products, suppliers, SKUs and sourcing records to the configured origin and return only the shared contract, excluding internal sidecar command metadata. The shared location registry remains shared as designed.
- `GET /v1/stock/lots/:id`: authenticated Admin/Manager only, UUID validated, current-origin lot only. Repeatable-read operational DTO returns receipt ID, factual delivery date, acceptance timestamp/sequence and exact movement summaries. No audit/security snapshots, invoice, valuation or actor metadata.
- `GET /v1/admin/shop`: authenticated Admin only. Returns configured origin, authority mode, Africa/Lagos timezone, unconfigured sync status and server observation timestamp. Manager and Production are denied. No administrative mutation.
- Same-origin proxy allowlist includes these two reads; origin validation, HttpOnly sessions, API authentication and binary PDF behavior remain.

Examples (synthetic placeholders):

```http
GET /api/stock/lots/<lot-uuid>
```
```json
{"lotId":"<lot-uuid>","receiptId":"<receipt-uuid>","deliveredOn":"2020-01-01","acceptedAt":"2026-11-03T10:00:00.000Z","originSequence":"42","movements":[{"id":"<movement-uuid>","fromState":"E","toState":"U","quantity":"30"}]}
```

```http
GET /api/admin/shop
```
```json
{"originId":"<shop-uuid>","authority":"SHOP","timeZone":"Africa/Lagos","cloudSync":"not-configured","observedAt":"2026-11-03T10:00:00.000Z"}
```

## Integrity, compatibility and database boundary

**No schema changes or new migrations. No operational migration, backfill, stock demonstration or deployment.** Database writes during verification use explicitly isolated local `*_test` fixtures. Migration regression tests use rollback-isolated schemas.

[Preservation evidence](admin-preservation-evidence.json) compares 20 source regions/files against baseline `cc95abe`: Prisma schema, all eight applied migration files, dependency manifests/lockfile, catalogue setup and allocation, receiving/catalogue mutation implementations, security, public-identity lookup and PDF renderer/label service are unchanged. This is source evidence, not a claim of a new operational database audit.

Stock stays server-derived. Existing immutable UUIDs, P/L codes, supplier prefixes/SKUs, shared parents, receipt/batch/lot identity, ledger reconciliation, origin locks, audit/outbox and command replay remain. Legacy records without public codes still say Code not assigned; viewing does not allocate them. Existing `byProduct` API aggregates remain compatible, while the new interface emphasizes exact lot/SKU quantities instead of presenting unlike variants as interchangeable availability.

## Tests executed

| Gate | Actual result |
| --- | --- |
| Initial audit baseline | 20 unit tests; root typecheck; production build passed |
| Milestone 2 | Typecheck/build; responsive Chrome navigation scenario passed at 320/390/768/1024/1440 |
| Milestone 3 | Typecheck/build; 42 PostgreSQL integration tests; six Chrome scenarios passed |
| Milestone 4 | Typecheck/build; 13 receiving/provenance integration tests; responsive Chrome scenario passed |
| Milestone 5 | Typecheck/build; both catalogue scenarios, public-code scenario and receiving/history/provenance scenario passed |
| Milestone 6 | Typecheck/build; 23 catalogue/labels integration tests; three Chrome scenarios passed |
| Final unit suite | 20 passed |
| Final PostgreSQL integration suite | 44 passed |
| Final root typecheck and production build | Passed |
| Final browser suite and visual review | Eight scenarios passed; supplemental evidence/recovery rerun: two passed; all five viewport contact sheets reviewed |
| Preservation checks | 20 passed |

Commands: `npm run typecheck`, `npm run build`, `node scripts/run-vitest.mjs run`, `node scripts/run-vitest.mjs run --config vitest.integration.config.ts`, and Chrome `npm exec playwright test` (targeted files during milestones, full suite at completion). No lint command is configured; no lint pass is claimed.

Coverage retains creation/first combinations/extension, source reuse, immutable identities, multi-product usable/damaged receiving, failed transaction rollback, concurrency/idempotency/lost-response replay, role denial, origin scoping, database constraints, public identity collision/backfill rehearsals, historical QR and PDF/reprint evidence. Added checks cover bounded provenance/shop disclosure, new navigation/history/detail links, read retries and stale lookup cancellation.

Early runs exposed a cold sign-in assertion timing issue and a locator that became ambiguous after adding the batch-balance heading. Tests now await the real response and select the batch heading specifically; underlying domain assertions remain. Final hash parsing also needed an explicit default under strict indexed access. Expanded coverage also required role-based select locators and scoping alerts away from Next.js’s route announcer; the interrupted first full run was superseded by successful targeted reruns and the final full run. All are corrected. Existing pg concurrent-query deprecation and NO_COLOR/FORCE_COLOR environment warnings remain; they are not test failures.

## Visual evidence

Captured 45 workspace screenshots at 320/390/768/1024/1440px and four product/dialog views. Reviewed all five QA contact sheets and individual critical mobile/detail views. Retained [22 curated images and capture hashes](images/admin/README.md). No body overflow was detected at the tested widths. Visual review led to mobile receipt cards, readable totals, full-width mobile dialogs, nonbreaking sticky actions and collapsed mobile stock filters. The filter test explicitly verifies controls are hidden until requested on phones and remain visible on larger screens. Browser screenshots use synthetic test data only; no credentials, operational stock or private database artifacts are published.

## Git delivery

The local directory initially had no Git metadata; the owner's existing GitHub repository was empty. Existing source was preserved as separate baseline commit `cc95abe`, then each required milestone was committed and pushed to **admin-experience**. No main/production branch, merge, force push or history rewrite.

| Milestone | Completion commit | Checks before push | Publication |
| --- | --- | --- | --- |
| 1 Audit and planning | `773e60c` | Unit/typecheck/build | Verified |
| 2 Design/navigation | `6bb26a2` | Typecheck/build/Chrome | Verified |
| 3 Dashboard/catalogue | `eeeb1bb` | Typecheck/build/integration/Chrome | Verified |
| 4 Suppliers/inventory | `80ad94e` | Typecheck/build/integration/Chrome | Verified |
| 5 Receiving/receipts | `42a28ab` | Typecheck/build/Chrome | Verified |
| 6 QR/labels/administration | `1d0d75e` | Typecheck/build/integration/Chrome | Verified |
| 7 Final verification | Completion commit accompanying this report | 20 unit / 44 integration / eight browser; typecheck/build; visual and preservation checks | Recorded after final push |

Exact messages, full SHAs and GitHub commit links accompany the completion response. The final completion commit cannot contain its own SHA; identify it by `test(admin): finalize end-to-end verification and UX refinements` in branch history.

## Limitations and approval gates

- Lot provenance currently summarizes accepted receiving movements; future transaction types require deliberate read-model/UI evolution and remain disabled.
- Receipt and print-job history retain the existing latest-100 API window, clearly labelled; no claim of archival pagination. Catalogue/stock reads still use existing shop read models and local filtering, not future universal/fuzzy search infrastructure or untested large-scale performance.
- No supported supplier/product rename/delete, user provisioning, password/role editing, valuation, unrestricted audit reader or correction command has been invented. New permissions or mutations require owner approval.
- Physical printer/media alignment, physical scan/device trials and thermal support remain unverified approval gates. Existing A4 PDFs are trial output. Browsers cannot certify printed or affixed labels; reports and duplicate stickers do not create inventory.
- No units/Unit Codes, DYI:2, serialized receiving, future print cart/renderer replacement, verification, production issue/damage/recovery, stock counts, closing, synchronization transport or deployment.
- Recommended next step: owner review of this Admin experience and supervised physical label/scanner acceptance. Further traceability phases require their separate explicit implementation authorization.

## Changed files

Paths below are relative to the repository root. The screenshot folder additionally contains 22 PNGs, its README and hash/dimension manifest; exact image names are listed in that manifest.


- `apps/api/src/app.ts`
- `apps/api/src/catalogue.service.ts`
- `apps/api/src/receiving.service.ts`
- `apps/web/app/api/[...path]/route.ts`
- `apps/web/app/error.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/page.tsx`
- `apps/web/components/app-shell.tsx`
- `apps/web/components/catalogue/catalogue-workspace.tsx`
- `apps/web/components/catalogue/setup-wizards.tsx`
- `apps/web/components/catalogue/wizard-shell.tsx`
- `apps/web/components/dashboard.tsx`
- `apps/web/components/identity-lookup.tsx`
- `apps/web/components/inventory-workspace.tsx`
- `apps/web/components/labels/label-workspace.tsx`
- `apps/web/components/labels/qr-workspace.tsx`
- `apps/web/components/receiving/receipts-workspace.tsx`
- `apps/web/components/receiving/receiving-workspace.tsx`
- `apps/web/components/settings-workspace.tsx`
- `apps/web/components/suppliers-workspace.tsx`
- `apps/web/components/ui/button.tsx`
- `apps/web/components/ui/workspace.tsx`
- `apps/web/lib/api.ts`
- `apps/web/next.config.ts`
- `docs/IMPLEMENTATION_BRICKS.md`
- `docs/admin-experience-implementation-plan.md`
- `docs/admin-experience-implementation-report.md`
- `docs/admin-preservation-evidence.json`
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/requirements-traceability.md`
- `packages/contracts/src/index.ts`
- `tests/e2e/admin-journeys.spec.ts`
- `tests/e2e/admin.spec.ts`
- `tests/e2e/labels.spec.ts`
- `tests/e2e/progressive.spec.ts`
- `tests/e2e/public-identities.spec.ts`
- `tests/e2e/receiving.spec.ts`
- `tests/integration/catalogue.test.ts`
- `tests/integration/receiving.test.ts`

- `docs/images/admin/` — 22 reviewed synthetic screenshots plus README and evidence.json.
