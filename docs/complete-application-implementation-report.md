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
