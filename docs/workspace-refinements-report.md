# Catalogue, checkout history and reason follow-up refinements

Date: 12 November 2026. Scope: read-interface refinements, the subsequently approved Admin/Manager completion flow, and read-only hosted invitation diagnostics.

## Implemented
- Removed the redundant Products / Suppliers workspace navigation above Catalogue. Kept Add product, Add supplier, internal catalogue filters and Supplier directory access.
- Checkout history now fetches all authorized checkout sessions immediately, with or without an Order ID, using the existing authenticated GET /v1/checkouts read path. Added explicit exact Order ID filtering, Show all, refresh, pagination and a session details drawer. Production remains restricted to its own history by the existing backend.
- Reason follow-up now prioritizes status, exact Order ID and Unit Code. Employee/date filters are expandable, active advanced filters are indicated, filters can be reset, and the selected count remains visible across pages. Long classification explanations are available in the details drawer rather than filling every table row. Resolve Reason is disabled without a selection or pending retry.
- Existing reconciliation save/review/confirmation, retained drafts, immutable evidence and idempotency remain unchanged.

## Approved completion flow
The owner subsequently approved “Admin and manager only selection flow.” Implemented session-led discovery, exact-unit selection and a review drawer for Admin and Inventory Manager; Production remains denied. Sessions without an Order ID remain discoverable. Search and pagination retain independent checkout identities, including repeated Order IDs.

Selected units must still be currently In Production. Confirmation uses the existing atomic/idempotent/audited P → C command, retaining original checkout/unit/lot identities and making no second usable-stock deduction. Closing review returns to session browsing without discarding the selected draft; errors stay visible inside the active drawer. Selection remains a list of exact UUIDs; neither an Order ID nor a session becomes an implicit bulk completion target. Existing drafts, discard confirmation and same-key lost-response retry remain.

### Database and compatibility
Migration `202611120032_admin_production_completion` adds Admin to the completion root and COMPLETE transaction role constraints and updates two existing graph-validation functions to require matching actor roles across domain, user/membership, event, transaction and audit. DISPOSITION and daily closing remain Manager-only. Historical rows and old applied migration files are unchanged; no new Prisma model is introduced.

Admin confirmation fails closed on databases missing the approved guard upgrade, with a clear notice. Manager completion remains available there. Migration 032 was applied only to the isolated test database, never the shop or hosted database.

Before/after full-row fingerprints in that isolated database matched for 3,518 supplier SKUs, 1,971 receipts, 39,578 stock movements and 87 prior completion records. These counts describe synthetic accumulated fixtures, not operational inventory.

### API changes
- `GET /v1/completion-sessions?page=1&query=...`: authenticated Admin/Manager-only read; paginated current In Production units grouped by checkout, returning checkout UUID, accepted timestamp, employee, matching remaining count and Order IDs. Scope is fixed server-side to this origin.
- `GET /v1/completion-options?checkoutId=<UUID>&page=1&query=...`: optional validated exact checkout filter; returns only eligible unit candidates in this origin. Unknown/foreign sessions reveal no items.
- `GET /v1/completion-config`: adds `adminUpgradeRequired`; `canConfirm` includes Admin only after matching database guards exist.
- Existing `POST /v1/completions` remains `{ "unitIds": ["<exact-unit-UUID>"] }` with required actor-scoped idempotency key. Acceptance records the responsible Admin/Manager's actual role. The legacy `manager`/`managerName` DTO field names remain for compatibility; they identify the confirming operator, not a granted role.

See production-completion-workflow-proposal.md for the approved sequence and amendment.

## Invitation diagnostics
Read-only inspection of the hosted invitation records and filtered application logs found:
- Invitation created 12 November at 04:24:39 Lagos time.
- SMTP handoff accepted on attempt 1 at 04:24:44 Lagos time; mail queue state SENT and DELIVERY_SENT evidence.
- Invitation remains PENDING staff redemption; expiry is 13 November at 04:24:39 Lagos time.
- No failure event for this invitation. Older deployment/SMTP verification failures in the retained logs predate it and do not establish a current send failure.
- SENT means SMTP acceptance, not confirmed mailbox delivery. Dayari does not currently ingest provider delivery/bounce events. Brevo transactional logs are required to establish subsequent delivery, rejection or deferral; provider dashboard access was unavailable through the browser connection during this investigation.
No resend, account change, credential output, invitation-token access or hosted stock mutation was performed.

## Verification
- Unit suite: 30 files, 92/92 tests passed. Initial sandboxed loopback SMTP test failed; rerun with local socket access passed.
- Final root typecheck passed, including all new test types.
- New isolated browser acceptance: passed; creates linked and unlinked synthetic checkouts, verifies default all-session listing, exact filter, details, reset, supplier directory access and compact reason controls. Mobile overflow assertion passed at 390px.
- Existing reconciliation browser regression: initial run timed out during app reopening after reload under concurrent compilation load; independent rerun passed in 2.2 minutes.
- Focused checkout, Orders and reconciliation PostgreSQL integration: 3 files, 22/22 passed.
- Completion PostgreSQL integration: 16/16 passed, including Admin confirmation/replay, Production denial, exact session filtering, direct database role rejection, cross-origin isolation, concurrency, failure rollback, immutable evidence and no second usable deduction.
- Completion/history browser run: 2/2 passed in 1.9 minutes. Final completion-only rerun after refinements: 1/1 passed (44.9-second test, 2.8-minute total including startup). Covers Manager draft/lost-response retry, Admin session-led selected completion, employee search, exact original checkout reference, close/reopen preservation, current quantities, history filtering and retained catalogue access.
- API production build and final frontend production rebuild passed, including the checkout-reference, search, validation-readiness and accepted-response refinements.
- Migration 032: isolated test installation only, with unchanged historical fingerprints as above.

## Files
- apps/api/src/app.ts
- apps/api/src/completions.service.ts
- apps/web/app/api/[...path]/route.ts
- apps/web/components/completion-workspace.tsx
- packages/contracts/src/completions.ts
- packages/contracts/src/permissions.ts
- prisma/migrations/202611120032_admin_production_completion/migration.sql
- tests/unit/completions.test.ts
- tests/integration/completions.test.ts
- tests/e2e/completions.spec.ts
- docs/application-permissions.md
- docs/architecture.md
- docs/ledger-invariants.md
- docs/requirements-traceability.md
- docs/decisions.md (only the newly approved completion amendment is included)
- apps/web/components/workspace-router.tsx
- apps/web/components/orders-workspace.tsx
- apps/web/components/reconciliation-workspace.tsx
- tests/e2e/ui.ts
- tests/e2e/workspace-refinements.spec.ts
- docs/production-completion-workflow-proposal.md
- docs/workspace-refinements-report.md
- docs/images/workspace-refinements/history-1440.png
- docs/images/workspace-refinements/reasons-390.png
- docs/images/workspace-refinements/completion-review-1440.png
- docs/images/workspace-refinements/completion-review-320.png

## Remaining limits
Completion implementation follows the latest owner approval; operational migration 032 and deployment still require separate authorization. Outlook delivery remains unconfirmed until Brevo events are inspected. No deployment is included in this change. Existing unrelated working-tree edits are preserved and excluded from the commit.


## Visual review
Reviewed actual synthetic browser screenshots of desktop history, 390px reason filters, and completion review at 1440px and 320px. Completion review kept its explicit action and selected identity readable at narrow width; no horizontal overflow was found in the browser assertions across 320/390/768/1024/1440 completion widths. The reason screenshot shows the optional expanded employee/date controls; they are collapsed initially.

## Git delivery
Branch: feat/complete-application-systems.

| Commit | SHA | Push |
|---|---|---|
| feat(production): refine history and approved completion workflow | [8c14b394b07f7e24d96c6f0284e8d95e59eda127](https://github.com/mcjohnsontech/inventori/commit/8c14b394b07f7e24d96c6f0284e8d95e59eda127) | Succeeded |

The report is delivered in a subsequent documentation commit on the same branch. No merge or deployment is included.


### Commands and scope
Executed `npm test`; `npm run test:integration -- tests/integration/checkouts.test.ts tests/integration/orders.test.ts tests/integration/reconciliation.test.ts`; `npm run test:integration -- tests/integration/completions.test.ts`; focused Playwright runs for `workspace-refinements.spec.ts`, `reconciliation.spec.ts` and `completions.spec.ts`; `npm run typecheck`; and `npm run build`. Final `npm run build:web` and root `npm run typecheck` also passed after all refinements. Test database installation used an explicit loopback `*_test` URL guard and allowed only pending migration 032.

The initial sandboxed browser startup was denied local database access before tests could run; the rerun used required local access. The initial mixed browser run had one reconciliation reload timeout; the independent regression rerun passed without timeout/assertion changes. Focused tests are reported here; the entire PostgreSQL and Playwright suites were not rerun for this patch. Existing pg concurrent-query deprecation warnings remain; rollback tests intentionally log synthetic database errors before asserting complete rollback.


## Rollout and rollback gate
Before operational use: obtain explicit upgrade/deployment approval, create a private backup, pause relevant writes during migration 032, apply the additive guard migration, release the backend before the frontend, and verify authenticated role/read readiness. No operational backfill or unit enrollment is needed. Migration 032 takes normal constraint/function DDL locks and validates the expanded role checks.

If a release must be rolled back, disable the new UI/API capability while retaining migration 032 and all accepted evidence. After any Admin completion is accepted, restoring a Manager-only database constraint would conflict with preserved history; do not downgrade by deleting or rewriting those records. Use a reviewed forward fix.


### Retry and readiness refinements
A follow-up run exposed waiting for a redundant accepted-receipt read. The UI now displays the actual successful server response immediately, fetching immutable evidence by ID only on restoration/reload. No optimistic success is fabricated. Review waits for selected-unit validation. Tests synchronize with API responses and enabled review actions while retaining visibility, focus, stock and permission assertions and the existing timeout values. Cold-development validation assertions failed during intermediate runs; the final synchronized completion test passed. Session search can use employee names without accidentally applying an employee string as an item-only filter inside the selected checkout.


### Isolated migration preservation fingerprints
Full-row content checksums before and after migration 032 were identical (MD5 comparison for preservation evidence, not a replacement for ledger security hashes). No concurrent fixture writes ran during the comparison.

| Table | Rows before/after | Identical content checksum |
|---|---:|---|
| SupplierVariantSku | 3518 | `af5f7a7c1ca0fdb237c4d25f40cc8d93` |
| Receipt | 1971 | `3af56e04f9c50d60a9028dd0faab35df` |
| StockMovement | 39578 | `3c1f379e3d2f5db4903f9159caa765d0` |
| ProductionCompletion | 87 | `17c9967bd3a355fdd9ecda9a8d356409` |


## Owner-authorized completion workflow deployment — 12 November 2026
Owner instruction: “go ahead deploy.” This authorizes migration 032 and publication of the tested Admin/Manager completion and UI refinements to the existing hosted application; it does not authorize local shop upgrades, cloud synchronization or historical enrollment.

Source: `b93cbd35a1b489eebcf373e2aba2a7392e6788e4`, deployed from a clean Git archive excluding unrelated working-tree edits. Heroku backup **b002** completed before upgrade. Public API access was temporarily placed in maintenance mode during the database release and restored afterward. Backend release **v18** succeeded; additive migration **202611120032_admin_production_completion** applied successfully. Pre/post full-row fingerprints matched for all **3 supplier SKUs, 1 receipt, 7 stock movements and 0 existing completions**. No historical records were rewritten.

Vercel deployment **dpl_CJhW2vs7paY8rXeTUaWEim6fWRLn** reached **READY**, target production. Deployment URL: https://dayari-inventory-staging-9k0u5hc2r-mc-johnsons-projects.vercel.app . Stable alias: https://dayari-inventory-staging.vercel.app/ . Backend: https://dayari-inventory-staging-api-797073a989e1.herokuapp.com/ .

Hosted smoke checks passed: frontend and API health HTTP200; API authority SHOP with cloud synchronization not configured; direct completion-config/completion-sessions/checkouts HTTP401 without authentication; proxy me/completion-config/completion-sessions/checkouts HTTP401; foreign-Origin sign-in HTTP403. All 12 referenced frontend scripts returned successfully and contained the new checkout-history, completion-session and compact-filter workflow markers. A fresh-browser check rendered the Email address field and Sign in action successfully with zero browser runtime errors; no credentials were entered. No hosted receipt, checkout, completion, stock, invitation or account was created by smoke tests. Authenticated stock-changing workflows remain covered by the isolated pre-release tests, not repeated on hosted stock.

The earlier report's no-deployment/isolated-migration statements describe its original review checkpoint; this later owner instruction supersedes them solely for migration 032 and this hosted release. Manager-only daily closing, deferred cloud approvals, local-server infrastructure and other existing gates remain unchanged.
