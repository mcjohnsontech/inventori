# Phase B implementation report

Status: in progress. No operational migrations, enrollment, deployment or stock mutations authorized/performed.

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
