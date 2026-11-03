# Phase B implementation report

Status: implementation verified; final publication is recorded below. No operational migrations, enrollment, deployment or operational stock mutations performed.

## Milestone 1 — audit

Prerequisite verified: Admin branch remote HEAD `b7172d351650374108380be1d3d29714c7e5d232`, seven published milestone commits. Phase B branch `feat/complete-application-systems` starts there. Capability audit and execution plan: [complete-application-implementation-plan.md](complete-application-implementation-plan.md). Approved role matrix: [application-permissions.md](application-permissions.md). Owner's three account-policy approvals recorded in decisions.md. No application/schema/dependency changes in milestone 1.

Newly executed checks and publication evidence are recorded below as completed. Prior Admin checks are documented separately; they are not claimed as Phase B executions.

M1 checks executed successfully: `npm test` (6 files, 20 tests); `npm run typecheck` (contracts/API/web/root). Working tree was clean before Phase B; only four documentation files changed. Owner approved the three account policies before account implementation. No migration in M1.

## Milestone 2 — Users & Access

Implemented paginated/searchable role/status-filtered shop directory, account details/latest 20 safe session summaries, supervised creation, name/role/status updates and session revocation. Admin password confirmation, self-demotion/deactivation protection, origin isolation, compulsory-change account restriction and audited/idempotent origin-locked commands. Passwords/proofs are excluded from public evidence. Initial-password command fingerprint is HMAC-keyed by the administrator password hash; an administrator password change ends the prior retry context (sign in and inspect accepted account before a new intentional command).

Migration `202611030009_shop_accounts`: adds immutable explicit membership, nullable origin binding for preserved historical sessions and compulsory-change flag. Applied only using guarded `scripts/migrate-test-db.ts` to local `dayari_test`. Existing users receive no membership; historical origin-null sessions cannot authenticate. No operational migration/enrollment. Existing test fixtures now explicitly enroll synthetic users per shop; foreign identity tests retain original domain isolation assertions using separate scoped actors and add foreign-session rejection.

Executed: typecheck passed; full production build passed; unit suite 22/22; new account integration 5/5; full integration initially 47 passed/2 fixture errors, corrected and reran affected catalogue/accounts 19/19. Forced outbox rollback deliberately logs an expected server error. Browser account creation/detail/filter flow passed 1/1 after correcting initial-password accessible labeling. Existing pg query deprecation and NO_COLOR warnings remain. All milestone diffs reviewed; no ledger/receiving quantities/QR/PDF renderer changes. Authentication completion follows in M3; newly provisioned staff are restricted until first-change support is completed there.

Published M1: `1845436d37864b6bdd4e227859cb19ecad508f2e` on `feat/complete-application-systems`; remote SHA verified.

## Milestone 3 — authentication and account security

Compulsory first-login change is now functional end to end. Added own safe profile/session summaries, current-password change with confirmation and strong passphrase validation, generic credential denial, persistent concurrent login/proof rate limits, forced session revocation and expiry UI. Origin/user locks serialize acceptance; a new authentication generation fences already-authenticated commands waiting behind revocation in catalogue, receiving, printing and account services. Password changes are audited atomically without credentials in evidence. A successful change ends all sessions; a lost-response operator must sign in with the new password and inspect the account rather than replay a revoked credential. Reused accepted password-change keys conflict safely. No reset delivery/recovery trust mechanism added.

Additive migration `202611030010_account_generation` applied only to `dayari_test`; adds nonnegative authVersion, with no operational migration or membership enrollment. Existing 001–009 SQL remains unchanged.

Executed: account/auth integration 9/9; unit 22/22; final typecheck and production build passed; extended browser provisioning → mandatory change → sign-in 1/1. Initial advisory-lock result failed Prisma void deserialization and was corrected with text casting; initial build caught a Windows encoding error, corrected before final successful build. Test-only concurrent Supertest requests emit listener warnings; existing pg/NO_COLOR warnings persist. No stock schema or ledger quantity changes.

Published M2: `54a01295937ebfc93c687ef0b9b1a11e6edf7d3c`; remote SHA verified.

## Milestone 4 — RBAC

Added shared fixed role/capability allowlists and server requireCapability checks for account, catalogue, receiving, label and identity services. Navigation uses the same map; forbidden deep links show an explicit return path without loading sensitive workspaces. Production receives no catalogue/receiving/damage/print administration through these paths. No new role or permission editor. Architecture and permission matrix document the approved boundaries.

Executed: final typecheck; unit 23/23; full PostgreSQL suite 56/56 (8 files, including catalogue/receiving/QR/printing/public identities/account/auth/RBAC); role/cookie/CSRF browser 1/1; production build passed. Direct negative tests cover sensitive GET/POST routes, guessed IDs/filters, Admin-only commands, inactive accounts and exact own-profile keys. No migration in M4.

Published M3: `d50e73bfecc889ba19ea3c1db87123b60861ae1d`; remote SHA verified.

## Milestone 5 — Inventory Manager workspace

Manager landing now prioritizes receiving, accepted deliveries, lot availability, QR identification and label preparation, with a three-step receiving routine. Catalogue/supplier empty states direct Managers to Admin for missing entries rather than suggesting inaccessible registration. Existing receiving, stock, receipt, code lookup and label interfaces remain shared with their enforced operational permissions. No new API or migration. A real browser regression exposed a footer below the viewport after adding navigation; desktop navigation now scrolls independently and keeps account controls reachable.

Published M4: `26608360da98b972140726daa2b3346ac0e3ca33`; remote SHA verified. M5 final test results follow after rerun.

M5 final checks passed: typecheck and production build; Manager+receiving browser 2/2 after navigation fix, then final Manager viewport browser 1/1 after collapsible-guide refinement. Five widths assert no horizontal overflow. Desktop and final 320px screenshots visually reviewed and retained at `docs/images/application/manager-{1440,320}.png`. Existing receiving browser proves multi-product/damage quantities, draft Back/discard, lost-response same-key retry, receipt history and exact lot provenance. No new backend mutation or permissions.

## Milestone 6 — Production workspace

Added authenticated `GET /v1/availability?q=Green&page=1&productId=<optional UUID>&lotId=<optional UUID>`. Strict bounded filters, 20-row pages, stable order, repeatable-read row/count snapshot; literal substring matching rather than fuzzy/universal Phase 3 search. Reads only positive U projections and explicit identity joins at the current origin. DTO fields: product/variant/SKU/lot/batch IDs and labels, decimal-string usable quantity, pagination/origin/dataAsOf. No damaged-state/invoice/audit/print/supplier-private query or response. Exact codes and old DYI:1 remain supported; no stock changes or migration.

Production lands on usable discovery, sees only its permitted navigation, and can open a lot's saved code in the existing exact QR/code lookup surface. No issuing/reservation button or simulated mutation. Historical missing codes are stated without fabrication/backfill. Existing Production browser expectations updated to the authorized new landing page, preserving QR/print-denial assertions.

Executed: new PostgreSQL read-model tests 2/2; unit 24/24; typecheck and production build passed; discovery/QR-label/code browser regressions 3/3. Desktop/mobile reviewed; shortened the operational guidance and made mobile search full-width. Final browser recheck follows before publication.

Published M5: `1c8a09d48738ad570368102a52d1765b40d4743a`; remote SHA verified.

M6 final mobile recheck passed 1/1, with all five overflow assertions; final typecheck passed after correcting a test-helper body type. Reviewed final 320px search and retained `docs/images/application/production-{320,1440}.png`. New read model tests prove no movement changes and damage-only exclusion. No Phase 3 hierarchy, fuzzy discovery, unit serialization or issuing activated.

## Milestone 7 — shared pages and operational reporting

Added role-aware Help & guide, Reports & history (exact SKU availability, latest 100 receipt/print records), explicit workspace-not-found/forbidden return paths and branded HTTP404 page. Existing own profile/session/password UI is linked from guidance. Reports use existing authorized stock/receipt/label read contracts; no new financial/audit endpoint, exported report or closing snapshot. SKU quantities come from server projections; no unlike-product stock grand total. Print-history deep links open the exact immutable manifest without printing. Account/help/QR/receipt pages no longer depend on successful catalogue loading. Refactored root workspace rendering into an explicit switch and corrected skip-link routing.

Executed: typecheck and production build passed; full shared browser scenario 1/1 (report quantities, receipt/print links, profile, help, missing hash and real HTTP404). Five report viewport overflow checks passed. Initial browser check raced a still-pending cold sign-in; explicit response/status verification fixed the test. Report desktop/320px evidence retained in `docs/images/application/reports-{1440,320}.png`. No backend contract or schema change in M7.

Published M6: `8224593316f2e0e9397ac9c1ab3189a554cece20`; remote SHA verified.

## Final application systems

| Area | Delivered scope |
| --- | --- |
| Admin | Existing complete catalogue/sourcing/receiving/stock/QR/print interfaces, shop-scoped Users & Access, reports, account/security/help |
| Manager | Operational landing, existing read-only catalogue/source exploration, atomic receiving, receipt history, U/D stock, lot evidence, labels/reprints, reports and own account |
| Production | Usable-only paginated discovery, exact Product/Lot identity and DYI:1 scanning, account and role-specific help; no issuing/receiving/printing administration |
| Accounts | Admin staff create/name/role/status/revoke, safe directory/detail/session summaries; own profile/password change; no public registration or reset delivery |
| Sessions | Opaque hashed origin-bound eight-hour sessions; active membership/expiry/revocation checks; compulsory onboarding; generation fences for stale writes; persistent login/proof failure limits |
| Shared UX | Emerald/cream shell, role-aware navigation and missing/forbidden states, responsive cards/forms, retry/loading states and no simulated operations |

The permission matrix is in `docs/application-permissions.md`; capability code is `packages/contracts/src/permissions.ts`. Domain services enforce authorization independently of navigation. Production's usable read model does not query damaged-state/invoice/print/audit rows. All account mutation paths require validated inputs, current-password proof, SHOP authority, actor revalidation, origin-first locks, atomic audit/outbox/command evidence and appropriate session revocation.

### API examples

All browser calls use `/api/…`; Nest versioned routes use `/v1/…`. Browser mutations require the configured same Origin; account mutations require a UUID Idempotency-Key. Password fields below are descriptions, never example credentials.

- `GET /v1/admin/users?q=staff&role=MANAGER&active=true&page=1` returns `{users:[{id,name,email,role,active,mustChangePassword,createdAt}],total,page,pageSize:20}` for this shop only.
- `GET /v1/admin/users/<UUID>` adds at most 20 session summaries `{id,createdAt,expiresAt,revokedAt}`. No hashes/tokens.
- `POST /v1/admin/users`: `{name,email,role,initialPassword:<private supervised 16+ character passphrase>,currentPassword:<Admin proof>}` returns the safe staff summary and `mustChangePassword:true`.
- `POST /v1/admin/users/<UUID>/update`: `{name,role,active,currentPassword}`; `POST /v1/admin/users/<UUID>/revoke`: `{currentPassword}`. Unknown/foreign target404; self-demotion/deactivation409; invalid proof403; role denial403.
- `GET /v1/account` returns only own safe profile, origin and latest20 session summaries. `POST /v1/account/password`: `{currentPassword,newPassword}` returns `{ok:true,signInRequired:true}` and revokes every session. A compulsory-change session can only read minimal `/me`, change password or log out.
- `GET /v1/availability?q=Green&page=1` returns `{lots:[{lotId,lotCode,productId,productCode,productName,variantId,variantName,skuId,fullSku,batchId,publicBatchCode,usable:"8"}],total,page,pageSize:20,originId,dataAsOf}`. Invalid/private filters400, absent/foreign usable lot yields an empty page; foreign-origin session401.

### Migration and rollout gates

009 adds immutable one-shop membership, compulsory-change state and session origin binding. 010 adds nonnegative authentication generation. Both were exercised exclusively on isolated `dayari_test`. No old migration was rewritten; no operational migration or account enrollment/backfill was executed. Existing user UUIDs, historical sessions and audit actors remain; unmapped accounts and null-origin sessions cannot authenticate. No automatic legacy-auth fallback is permitted.

Operational rollout requires owner-approved database upgrade, explicit mapping/bootstrap of the existing shop Admin/staff, account handover and restart verification. New API startup checks schema compatibility and stops with an actionable upgrade message instead of implicitly migrating. Do not roll back to global legacy authentication as a recovery bypass after activating shop accounts. Production deployment, TLS/network/hardware approval and recovery procedures remain separate gates.

### Preservation and limitations

`docs/application-preservation-evidence.json` records 48 successful comparisons against the completed Admin HEAD: original migrations001–008, original non-account models, dependency manifests, allocation helpers, catalogue setup, identity/backfill and QR/PDF sources. It is source preservation evidence, not a claim of operational database comparison. Isolated database/browser regression scenarios separately verify existing behavior.

No StockUnit, DYI:2, serialized receiving, issuing, recovery/disposition, corrections, daily closing, cloud transport or operational backfill. No financial metrics, raw audit endpoint, CSV export or physical print/scan certification. Receipt/print history remains latest100; account pages20 and session summaries latest20. Shop membership initially permits one shop per account and retains existing globally unique email. Admin can edit approved names/role/status, not historical identities or email ownership. Password recovery/Admin reset delivery, cloud revocation propagation, retention, deployment abuse defenses and hardware acceptance remain future decisions. Current login/proof throttles are persistent account-based controls, not a claim of certified perimeter protection.

Published M7: `55e711f3737cb80dd4f967d436d08026afba0ea6`; remote SHA verified. Final QA execution/publication evidence follows below.

## Milestone 8 — final QA and refinements

Added a historical account migration rehearsal, concurrent Admin demotion/foreign-account tests, startup-schema fail-closed unit coverage, same-origin/cookie/session recovery tests and loaded-state responsive/keyboard/form-label browser checks. Shared session-expiry notification now covers existing catalogue, receiving, label, QR and exact identity fetches. Catalogue replay revalidates the active actor/generation before returning accepted command evidence. Label drafts and unfinished outcome notes now require discard confirmation; sensitive account access changes require confirmation; sign-out respects draft guards. Account security layout removes duplicate large panels and collapses older sessions.

Actual final database run passed **61 tests across10 files**, including all original catalogue/receiving/QR/printing/identity/ledger regressions and the new migration rehearsal. The rehearsal preserved original account/session values, retained old null-origin sessions as evidence and inserted zero memberships. Final unit run passed **25 tests across10 files**; final root typecheck passed. Final browser/build status is recorded after completion below. No lint command exists in this repository; no lint pass is claimed.

The earlier complete browser run had14 passes and1 logout timing failure. The test now waits for successful logout before asserting the unchanged401 denial, rather than racing a pending request. No security assertion was removed or weakened. Expected forced-outbox rollback produces a server error log; pg query deprecation and NO_COLOR warnings remain. A temporary approval-review capacity failure interrupted one command before execution; work resumed through the normal approval process after the owner requested continuation.

## Recommended next step

Review this implementation, approve a separate operational migration/enrollment and supervised account handover plan if ready, then validate that rollout in its own authorized milestone. No operational upgrade, password recovery delivery, cloud synchronization, new inventory workflow or deployment is started automatically.

### Final hardening details

Sign-in now acquires an origin key-share lock before locking User, including the implicit Session foreign-key lock order; concurrent deactivation cannot leave a usable session. Catalogue reads use a repeatable-read snapshot with bounded15-second transactions instead of the cold five-second batch timeout observed during QA. Account commands and confirmation checks use the same bounded transaction budget. This changes no DTO, permissions, allocation policy or stock write. Browser tests explicitly await successful sign-in, account creation and logout responses before asserting subsequent state; 401/403 and exact retained draft assertions remain in place. The reprint-reason textarea has a stable explicit accessible name after its value changes. Browser fixture setup also independently rejects missing/nonlocal/non-test database URLs.

Two later browser attempts exposed cold request timing, a catalogue transaction timeout and the filled-textarea label lookup. These were investigated and corrected rather than disabling tests or loosening quantity/access assertions. Final result totals below supersede earlier attempts.

## Final verification results

| Check | Actual result |
| --- | --- |
| Unit tests (`npm test`) | 25 passed /10 files |
| PostgreSQL integration (`npm run test:integration`) | 62 passed /10 files, final full run after account/login/read hardening |
| Browser (`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`) | 15 passed, final complete run |
| Root typecheck (`npm run typecheck`) | Passed |
| Source preservation | 48 checks passed |
| Responsive/accessibility evidence | All five requested widths; skip-link focus, labeled controls, draft cancellation and authoritative rendered quantities |
| Production build (`npm run build`) | Passed |

Final browser checks include all prior Admin journeys, progressive catalogue/extension, multi-product receiving/lost-response retry, SKU/lot balances, DYI:1/code lookup, PDF/handoff/uncertain output/reprint, all-role authorization, staff onboarding/mandatory password change, service/session recovery and shared reports/help/404. Thirteen reviewed screenshots plus dimension/hash evidence are retained under `docs/images/application/`; all are synthetic isolated fixtures. Trace files, test credentials, generated PDFs and private diagnostics remain ignored and are not committed.

### Final QA closure

Final complete browser run: **15/15 passed**. Final production build: **passed**. Final PostgreSQL run: **62/62 passed**, including the origin-first sign-in/deactivation race. The final private browser diagnostic log contained no unexpected server ERROR/P2028 entries. Final source-preservation recheck: **48/48 passed**. Account/current-password proof budgets are bounded; no inventory constraint, permission assertion or test quantity was relaxed. Reviewed all retained mobile/desktop screens and kept13 synthetic screenshots, with five-width automated checks. No operational account/stock changes, deployment or future inventory phase was executed.

## GitHub milestone publication

All milestones use branch `feat/complete-application-systems`. M1–M7 pushes were verified at completion; M8 publication is filled after its completion commit is pushed.

<!-- BEGIN APPLICATION MILESTONES -->
| Milestone | Commit message | SHA | Branch | GitHub commit | Checks | Push |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Full application audit | `docs(app): audit application systems and permissions` | `1845436` | `feat/complete-application-systems` | [View](https://github.com/mcjohnsontech/inventori/commit/1845436d37864b6bdd4e227859cb19ecad508f2e) | 20 unit; typecheck | Verified |
| 2. Users & Access | `feat(users): implement user administration` | `54a0129` | `feat/complete-application-systems` | [View](https://github.com/mcjohnsontech/inventori/commit/54a01295937ebfc93c687ef0b9b1a11e6edf7d3c) | 22 unit;19 affected integration;1 browser; typecheck/build | Verified |
| 3. Authentication | `feat(auth): complete authentication and account security` | `d50e73b` | `feat/complete-application-systems` | [View](https://github.com/mcjohnsontech/inventori/commit/d50e73bfecc889ba19ea3c1db87123b60861ae1d) | 22 unit;9 integration;1 browser; typecheck/build | Verified |
| 4. RBAC | `feat(rbac): enforce permissions across application` | `2660836` | `feat/complete-application-systems` | [View](https://github.com/mcjohnsontech/inventori/commit/26608360da98b972140726daa2b3346ac0e3ca33) | 23 unit;56 integration;1 browser; typecheck/build | Verified |
| 5. Inventory Manager | `feat(manager): complete manager workspace` | `1c8a09d` | `feat/complete-application-systems` | [View](https://github.com/mcjohnsontech/inventori/commit/1c8a09d48738ad570368102a52d1765b40d4743a) | Manager/receiving2 browser; final viewport1; typecheck/build | Verified |
| 6. Production | `feat(production): complete production workspace` | `8224593` | `feat/complete-application-systems` | [View](https://github.com/mcjohnsontech/inventori/commit/8224593316f2e0e9397ac9c1ab3189a554cece20) | 24 unit;2 integration;3 browser + final1; typecheck/build | Verified |
| 7. Shared pages/reporting | `feat(app): complete shared pages and reporting` | `55e711f` | `feat/complete-application-systems` | [View](https://github.com/mcjohnsontech/inventori/commit/55e711f3737cb80dd4f967d436d08026afba0ea6) | Shared browser1; typecheck/build | Verified |
| 8. Final QA | `test(app): verify complete application and security` | `Pending` | `feat/complete-application-systems` | Pending | 25 unit;62 integration;15 browser; typecheck/build;48 preservation | Publication pending |
<!-- END APPLICATION MILESTONES -->

## Files changed

Repository-relative paths for the complete Phase B change set (generated Next environment file excluded):

- `apps/api/src/account-proof.ts`
- `apps/api/src/accounts.service.ts`
- `apps/api/src/app.ts`
- `apps/api/src/availability.service.ts`
- `apps/api/src/catalogue.service.ts`
- `apps/api/src/labels.service.ts`
- `apps/api/src/main.ts`
- `apps/api/src/permissions.ts`
- `apps/api/src/public-identities.service.ts`
- `apps/api/src/receiving.service.ts`
- `apps/api/src/schema-readiness.ts`
- `apps/web/app/api/[...path]/route.ts`
- `apps/web/app/globals.css`
- `apps/web/app/not-found.tsx`
- `apps/web/app/page.tsx`
- `apps/web/components/account-security.tsx`
- `apps/web/components/app-shell.tsx`
- `apps/web/components/catalogue/catalogue-workspace.tsx`
- `apps/web/components/catalogue/setup-wizards.tsx`
- `apps/web/components/dashboard.tsx`
- `apps/web/components/help-workspace.tsx`
- `apps/web/components/identity-lookup.tsx`
- `apps/web/components/labels/label-workspace.tsx`
- `apps/web/components/labels/qr-workspace.tsx`
- `apps/web/components/production-workspace.tsx`
- `apps/web/components/receiving/receiving-workspace.tsx`
- `apps/web/components/reports-workspace.tsx`
- `apps/web/components/settings-workspace.tsx`
- `apps/web/components/suppliers-workspace.tsx`
- `apps/web/components/users-workspace.tsx`
- `apps/web/lib/api.ts`
- `docs/IMPLEMENTATION_BRICKS.md`
- `docs/application-permissions.md`
- `docs/application-preservation-evidence.json`
- `docs/architecture.md`
- `docs/complete-application-implementation-plan.md`
- `docs/complete-application-implementation-report.md`
- `docs/decisions.md`
- `docs/images/application/README.md`
- `docs/images/application/account-1440.png`
- `docs/images/application/account-320.png`
- `docs/images/application/evidence.json`
- `docs/images/application/help-1440.png`
- `docs/images/application/help-320.png`
- `docs/images/application/manager-1440.png`
- `docs/images/application/manager-320.png`
- `docs/images/application/production-1440.png`
- `docs/images/application/production-320.png`
- `docs/images/application/reports-1440.png`
- `docs/images/application/reports-320.png`
- `docs/images/application/user-form-320.png`
- `docs/images/application/users-1440.png`
- `docs/images/application/users-320.png`
- `docs/requirements-traceability.md`
- `packages/contracts/src/accounts.ts`
- `packages/contracts/src/availability.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/permissions.ts`
- `prisma/migrations/202611030009_shop_accounts/migration.sql`
- `prisma/migrations/202611030010_account_generation/migration.sql`
- `prisma/schema.prisma`
- `scripts/seed.ts`
- `tests/e2e/access.spec.ts`
- `tests/e2e/accounts.spec.ts`
- `tests/e2e/admin-journeys.spec.ts`
- `tests/e2e/application-visual.spec.ts`
- `tests/e2e/labels.spec.ts`
- `tests/e2e/manager.spec.ts`
- `tests/e2e/production.spec.ts`
- `tests/e2e/receiving.spec.ts`
- `tests/e2e/setup.ts`
- `tests/e2e/shared.spec.ts`
- `tests/integration/accounts-migration.test.ts`
- `tests/integration/accounts.test.ts`
- `tests/integration/authentication.test.ts`
- `tests/integration/availability.test.ts`
- `tests/integration/catalogue.test.ts`
- `tests/integration/labels.test.ts`
- `tests/integration/public-identities.test.ts`
- `tests/integration/rbac.test.ts`
- `tests/integration/receiving.test.ts`
- `tests/integration/shop-fixture.ts`
- `tests/unit/accounts.test.ts`
- `tests/unit/availability.test.ts`
- `tests/unit/permissions.test.ts`
- `tests/unit/schema-readiness.test.ts`
