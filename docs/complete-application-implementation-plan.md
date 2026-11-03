# Phase B — Application systems audit and implementation plan

2026-11-03. CONFIRMED prerequisite: all seven Admin milestones were committed and pushed. Remote `admin-experience` HEAD verified as `b7172d351650374108380be1d3d29714c7e5d232`. Its report records 20 unit, 44 integration and 8 browser passes, typecheck and production build; these are prior evidence, not newly executed Phase B tests. Work starts on `feat/complete-application-systems` from that commit.

Read AGENTS, START_HERE, comprehensive PRD v1.2 (actual file at repository root), implementation bricks, decisions, architecture, ledger invariants, identity design, Admin report, schema, controllers/services, frontend and tests. Latest authorization supersedes initial Brick 0 scope, not future inventory gates.

## Capability matrix

| System | Assessment | Evidence and next work |
| --- | --- | --- |
| Login/logout | Implemented; hardening needed | CatalogueService scrypt, hashed eight-hour sessions, email failure limiter. Next HttpOnly/SameSite Strict cookie and POST Origin validation. Add membership/session isolation and negative concurrency tests. |
| Provisioning | Missing outside development | seed.ts is explicit localhost development only. Add approved local Admin staff commands; no public registration. |
| User origin isolation | Missing | Users/sessions currently global. Add explicit immutable shop membership and origin-bound sessions; never automatically enroll operational accounts. |
| Directory/profile/roles/status | Missing | Add bounded Admin DTOs and validated, transactional, audited commands; protect against administrative lockout. |
| Session administration | Partial | Expiry/logout/disabled-user checks exist; add safe scoped session summaries/revocation. No token/hash exposure. |
| Password onboarding/change | Missing | Supervised initial password and compulsory first change approved; all sessions revoked on password/role/status changes. Reset delivery remains deferred. |
| RBAC | Implemented but distributed | Service role checks and minimal lookup DTOs exist. Central matrix and direct endpoint/IDOR/disabled/session/filter tests needed. |
| Admin workspaces | Implemented | Preserve all nine workspaces, draft behavior, identities and idempotency. |
| Manager workspace | Partial | Shared operational UI works; tailor landing/navigation/help without Admin catalogue or user rights. |
| Production workspace | Partial | Existing QR/exact identity lookup only. Add bounded usable discovery with minimal server DTO. No issuing. |
| Reports/history | Partial | Latest 100 receipts/jobs, stock projection and lot evidence exist. Add meaningful bounded read-only reports; no valuation/raw audit endpoint. |
| Shared account/help/errors | Partial | Read-only settings/root error boundary exist. Add profile/help/expired/forbidden/not-found states and role-aware routing. |
| Recovery/sync/new stock workflows | Approval-gated/future | No email/SMS/Admin reset, issuing, recovery, closing, corrections, StockUnit, DYI:2 or cloud transport. |

## Confirmed account policy

Owner approved all three targeted questions on 2026-11-03: local SHOP Admin may manage staff assigned to that shop using the three existing roles; block self-demotion/self-deactivation and last active Admin removal; transactional audited changes, cloud writes disabled. Admin supplies a strong initial password through supervised handover; compulsory first change; revoke sessions after password/role/status changes. No Admin reset or email/SMS recovery. Explicit membership denies automatic administrative visibility to unmapped users. Develop/test additive migration exclusively on isolated fixtures; operational mapping/migration needs separate approval.

PROPOSED implementation: initially one immutable shop membership per account, retaining globally unique email; origin-bound sessions checked on every request. Credentials and proofs never enter audit/outbox/command responses. Sensitive Admin operations require current-password confirmation. Use origin-first locks, actor revalidation, deterministic target locks and existing command/audit/outbox patterns. No account deletion or ledger changes. These details require implementation proof, not a claim of existing behavior.

## Execution milestones

1. Audit: capability/permission matrices and decisions; unit/typecheck baseline, diff review, requested M1 commit/push.
2. Users & Access: additive isolated migration, scoped contracts/service/API/UI, role/status/profile/session controls; isolation, lockout, concurrency, idempotency and secret-filtering tests. M2 commit/push.
3. Authentication: compulsory change/current-password change, expiry/revocation, login/cookie/rate-limiter and account UX; direct API/browser tests. M3 commit/push.
4. RBAC: central capabilities, role-aware routing, complete direct-role/foreign-origin/disabled/session negative tests. M4 commit/push.
5. Manager: tailored operational navigation/landing/workspaces; no privilege expansion. M5 commit/push.
6. Production: bounded minimal usable discovery, precise code/lot/QR context; leakage/IDOR tests. M6 commit/push.
7. Shared/reporting: profile/help/errors and existing-projection reports; explicit scope and limits. M7 commit/push.
8. QA: isolated regressions/API security/browser, review 320/390/768/1024/1440 screenshots, accessibility, typecheck/build, final evidence report. M8 commit/push.

Each milestone runs relevant checks and stages only its own files. Record actual commands, results, SHA and verified remote publication. No force push/merge/deployment. No operational migration, account/stock backfill or real-data mutation. Preserve all allocation policies, ledger invariants and historical QR/printing evidence. Stop after Phase B report, without later inventory phases.
