# Exact-unit BAD reporting and Manager disposition — milestone 7A

Status: software implementation and verification complete; publication pending. This is the first vertical slice within milestone 7; pending recovery/correction requests follow separately and are not claimed complete here.

## Implemented

Production reports only exact currently In Production units from its own checkout. Admin/Manager may report issued units belonging to other staff and pre-issue usable units. The backend resolves the exact saved UUID, origin, SKU, lot, batch, receipt, original checkout/Order ID and recorded holder. The report captures meaningful cause/description, reporter, server timestamp and immutable snapshots.

A pre-issue report moves U to D. Issued damage moves P to D, without a second usable deduction. Duplicate, removed, already damaged, foreign and otherwise unavailable units cannot be reported again. One invalid unit rejects the entire command. Checkout may commit before a competing BAD command; in that valid order, the BAD command transfers P to D rather than deducting U twice. If BAD commits first, checkout is rejected.

Only Inventory Manager records disposition. Held/Reworked append review evidence without stock movements or unit-state changes. Discarded/Returned to vendor transfer D to terminal X (Removed). Removed cannot return through this workflow. Admin reviews evidence only. Recovery is not implicit in rework; future cloud-delivered authorization remains required.

The role-aware page provides Unit Code/DYI:2 entry, camera fallback, exact-unit preview, original provenance, cause/evidence, Back/review/confirmation, actor/origin drafts, discard confirmation, saved retry key, accepted evidence and paginated report/review history. QR presentation metadata is separate from stock confirmation. Original receipts/checkouts remain immutable. Operational timelines include BAD, metadata-only review and removal; Production sees only its own permitted BAD events and never Manager review remarks.

## Additive database work

- `202611080023_unit_damage`: immutable DamageReport/Line and DamageReview/Line; exact DAMAGE/DISPOSITION movements/events; rebuildable D/X projections; role/provenance/completeness/census guards; immutable and late-child rejection.
- `202611080024_damage_snapshot_evidence`: strengthens exact receipt/SKU/product/variant and original holder snapshot validation. Migration 023 was already exercised in isolation and was not rewritten.

Both were applied only to isolated test fixtures. No operational installation or historical stock enrollment. No existing UUID, Unit/Product/Lot Code, SKU, receipt, QR payload or print identity is reassigned.

Every stock-changing command uses origin-first locking, current actor/auth-version/membership fencing, deterministic unit/state/lot locks, strict validation, canonical idempotency and one atomic domain/ledger/projection/audit/outbox/result group. No external calls occur in the transaction. All affected native-unit census and net ledger balances must agree; negative internal balances remain prohibited. No generic transition endpoint is introduced.

## API

Authenticated `/v1` endpoints:

- `GET /damage-config` returns role-appropriate capabilities and technical selection limit.
- `POST /damage-reports/preview` and `POST /damage-reviews/preview` resolve exact saved unit UUID selections.
- `POST /damage-reports` accepts `{unitIds, cause, description}` and mandatory Idempotency-Key.
- `POST /damage-reviews` accepts `{unitIds, outcome, note}`; Manager only, mandatory Idempotency-Key.
- `GET /damage-reports` and `GET /damage-reviews` provide 20-row history pages, optional exact Unit Code filter. Production sees only its own originally Production-authored reports and no review administration.
- `GET /damage-reports/:id` and `GET /damage-reviews/:id` return immutable accepted evidence under role/origin checks.

Selections are distinct and bounded to 500 exact saved units and 30,000 normalized UTF-8 bytes. Large selections require explicitly separate commands, never partial acceptance. There is no new short BAD-code allocation policy: the saved record UUID remains the damage identity.

## Verification so far

- Prisma generation and isolated migrations 023/024 passed.
- Full unit suite passed **73/73**, 22 files.
- First damage integration setup failed because a synthetic checkout omitted its required optional-reference field; corrected fixture.
- A subsequent run exposed missing new columns in the Prisma model, causing six failures/one pass; corrected model and regenerated client. No failed run is counted as a pass.
- Targeted damage integration suite then passed **7/7**. After strengthening immutable snapshot evidence, damage plus reconciliation suites passed **15/15** together, including forced-audit rollback and reason classification after damage.
- Latest 500-unit development sample in the retained artifact: **3,108.226 ms**, one loopback sample, not hardware certification.
- First browser attempt failed because Production's separate route allowlist lacked BAD navigation; fixed and rerunning.
- Final security, browser, migration preservation, full regression/type/build results remain to be recorded.

## Boundaries

No real stock/accounts modified; no operational migrations, historical enrollment, live email, deployment or cloud transport. Recovery/correction requests are not yet implemented by this sub-slice and cannot execute locally. Production completion, physical counts and closing remain subsequent milestones under O8/O4.


### Verification checkpoint

The BAD browser journey passed (1/1, 2.9-minute run), including Production scope, Back/discard/reload, five-width screenshots, lost-response same-key retry, focused acceptance, Manager Reworked review, unchanged balances and Production exclusion of Manager review history. A cold Manager POST initially outlasted a UI assertion; the test now waits for the actual 201 response before asserting focus, without raising application timeouts. Mobile/desktop screenshots were inspected. The final confirmation layout removes unrelated empty history and uses singular item wording; final regression follows.

Migration rehearsal preserved **all 54 prior-table fingerprints** (excluding only newly added nullable field names from comparison), fabricated no damage records, and verified current receiving/checkout on schema 022 before applying 023/024. Post-upgrade exact damage, metadata-only rework and original checkout preservation passed. No operational migration. See damage-preservation.json.


Full PostgreSQL regression: **131/131 passed, 18 files**. This includes all existing catalogue, receiving, identity, ledger, QR, printing, accounts and reconciliation integration suites plus eight damage cases. The additional origin-isolation and privileged-history replay tests passed. Final terminal retry assertions are being repeated before publication. Expected synthetic audit/outbox failures in rollback tests are not unexpected application failures.


The final eight-case damage integration repeat passed, including terminal-removal same-key replay after the unit is already X, different-body conflict and all-or-nothing rejection of a mixed removed/eligible review. Role/origin-scoped drafts also isolate Production-only selections from earlier operational drafts; unavailable selected identities can be removed without discarding other draft evidence. Final confirmation hides unrelated history, spells out states and distinguishes metadata-only review from a stock movement.

Existing print evidence remains frozen. Initial label purpose describes intake condition, not current availability; QR/Unit lookup remains authoritative. This slice does not regenerate historical labels, change payloads or infer that printing/scan proves a physical outcome.


Final browser regression: **6/6 passed together (8.7 minutes)** after refinements: BAD/disposition, checkout, receiving, tracking, legacy labels and exact-unit labels. The six new milestone-7 screenshots cover five review widths and accepted Manager evidence. Final mobile and desktop screenshots were visually inspected. Earlier regenerated screenshots were restored byte-for-byte from HEAD, preserving prior milestone evidence.


Final damage integration repeat: **9/9 passed**. The added multi-source scenario receives the same parent/variant from two suppliers into separate batches, reports one U and one P unit together, then removes both without merging SKUs/lots or changing the original SKU. Full regression was 131 cases before that additional test; 132 distinct integration cases have successful results across the full and targeted runs, not a claim of a single 132-case run. Accepted evidence text now explicitly describes the acceptance-time outcome rather than pretending historical records are current stock.


Known capacity limit: the 500-unit timing sample uses a development lot; worst-case 500-distinct-lot throughput and shop hardware still require later capacity validation. The 15-second transaction bound remains unchanged and failures roll back atomically. No untested production throughput is claimed. Physical printer/camera/scanner certification and operational rollout remain gated.


Production build passed (contracts, Prisma generation, Nest and optimized Next.js). Final typecheck passed against the built route types. No deployment.


## Changed files

- `apps/api/src/app.ts`
- `apps/api/src/damage.service.ts`
- `apps/api/src/unit-tracking.service.ts`
- `apps/web/app/api/[...path]/route.ts`
- `apps/web/app/page.tsx`
- `apps/web/components/damage-workspace.tsx`
- `apps/web/components/labels/unit-identity-result.tsx`
- `apps/web/components/receiving/received-units.tsx`
- `apps/web/components/shell/destinations.ts`
- `apps/web/components/unit-tracking-drawer.tsx`
- `apps/web/components/workspace-router.tsx`
- `apps/web/lib/damage-draft.ts`
- `docs/IMPLEMENTATION_BRICKS.md`
- `docs/architecture.md`
- `docs/bad-reporting-implementation-design.md`
- `docs/bad-reporting-implementation-report.md`
- `docs/dayari-completion-progress.md`
- `docs/evidence/completion/milestone-7/damage-500-capacity.json`
- `docs/evidence/completion/milestone-7/damage-preservation.json`
- `docs/images/completion/milestone-7/bad-review-1024.png`
- `docs/images/completion/milestone-7/bad-review-1440.png`
- `docs/images/completion/milestone-7/bad-review-320.png`
- `docs/images/completion/milestone-7/bad-review-390.png`
- `docs/images/completion/milestone-7/bad-review-768.png`
- `docs/images/completion/milestone-7/damage-review-accepted-1440.png`
- `docs/ledger-invariants.md`
- `docs/recovery-correction-request-design.md`
- `docs/requirements-traceability.md`
- `packages/contracts/src/damage.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/permissions.ts`
- `packages/contracts/src/unit-tracking.ts`
- `prisma/migrations/202611080023_unit_damage/migration.sql`
- `prisma/migrations/202611080024_damage_snapshot_evidence/migration.sql`
- `prisma/schema.prisma`
- `scripts/rehearse-damage.ts`
- `tests/e2e/damage.spec.ts`
- `tests/integration/damage.test.ts`
- `tests/unit/damage.test.ts`
