# Incremental implementation and review plan

Brick 0 review draft, 2 November 2026. PROPOSED slices and verification below implement CONFIRMED PRD scope; no timeline, price, procurement or deployment commitment. No application code, migrations, seeds or automated tests have been generated or run in Brick 0.

## Brick 0 deliverables and evidence

Current progress: the user subsequently authorized catalogue-only Brick 1 and approved its permission, manual-allocation and local-authority decisions. The slice is implemented; actual files, migration, checks, failures and remaining gates are in `brick-1-report.md`. The sequence below remains the incremental MVP plan. Brick 2 has not started.

Initial inventory: root `AGENTS.md` (3,865 bytes), `START_HERE.md` (1,800 bytes), `Dayari_Inventory_PRD_v1_2_Comprehensive.docx` (52,840 bytes). No hidden project files or Git metadata were present. Read both instruction files and all body paragraphs/table content in the PRD using read-only ZIP/OOXML extraction in document order. Section references use the root original; expected `docs/` path was absent. No older TDD/owner story available or needed to override the PRD.

Created six Markdown review artifacts:

1. `requirements-traceability.md`: FR-01–24, goals, operational/security/scope requirements, mandatory scenarios and additional planned tests.
2. `decisions.md`: confirmed baseline, O1–O8, §15.9, further ambiguities, proposals and approval gates.
3. `architecture.md`: modules, local/cloud authority, transaction/sync protocol, API boundaries and recovery.
4. `data-model.md`: initial Mermaid ERD, proposed tables/constraints, indexes and phased migration plan.
5. `ledger-invariants.md`: state transfers, conservation, compensation, concurrency and closing boundaries.
6. `build-plan.md`: this incremental plan, review gates and validation record.

## Proposed vertical slices

Each implementation brick delivers only its approved vertical slice: migration/schema, service, API, necessary UI, meaningful tests and operating notes. Infrastructure is introduced within the first usable feature rather than building the whole backend first. PRD milestones A–D remain scope groupings, not a requirement to postpone sync identity design until D.

| Brick / PRD milestone | Deliverable and boundaries | Planned verification / gate |
| --- | --- | --- |
| 1 / A | Authenticated, authorized catalogue registration and lookup: supplier/location, shared parent, attributes/default variant, sourcing, approved SKU allocation. Include monorepo/Compose dev setup, first migration with node/authority, audit, idempotency and outbox foundations; minimal catalogue UI | V01/V02/V03/B01, O5/O6/B08/B09 and required kickoff approvals first. Vitest canonicalization; Supertest role denial and duplicate/source constraints against PostgreSQL; Playwright shared-parent/two-supplier workflow; development-only fixtures |
| 2 / A | Atomic multi-variant receipt, batch/lot and ledger/balance; review UI, exact QR identity and printable label jobs/reprints | O2/O3/O7/B02/B06 gate. AT01/02/06/20/22; invalid-line rollback, integer bounds, response-lost retry; physical printer scan trial when hardware ready |
| 3 / B | Reviewed multi-variant production issue, retained unverified reference and No order, correct stock view/manual lookup | O6/B07 gate; AT03/04/09/17/22: intentional repeat scan versus retry, exact source, concurrency last unit, all-line rollback; no Sheets claim |
| 4 / B | Exact issue/intake damage and dispositions, BAD history, approval-based recovery/correction | O3/O5/B04/B06 gate; AT05/10/11/15/22, dependency-safe reversal, competing damage/recovery, no self-approval and no usable double deduction |
| 5 / B–C | Unlinked reconciliation and audited reference correction; Manager completion over approved issue scope | O8/B03/B07 gate; AT12/13/17; no duplicate stock effect, no automatic fulfilment/dispatch; race completion/damage |
| 6 / C | Targeted counts/discrepancies, readiness, immutable day close and late-entry views | O4/B05 gate; AT14/15/21/22: blockers, boundary race, independent counts, report reproducibility and offline pending-sync close |
| 7 / C–D | Remote Admin reporting and bidirectional sync delivery, cloud approval lifecycle and freshness, authority enforcement | B08/B09 authority sign-off; AT08/11/16/17/21: retries, conflict quarantine, gaps, dependencies, crash and stale approvals; sync schemas/outbox existed since Brick 1 |
| 8 / D | Security/backup/restore/restart, upgrade rehearsal, representative performance/printing and real physical pilot; remediation and owner sign-off | O2/O7/B09/B10 plus opening-stock policy. AT18/19 and all Must acceptance scenarios end to end; proposed 8-hour outage and scan/variance targets only after approval |

Brick 1 is recommended only after explicit review authorization. If the owner defers a later decision, record its scope and stop the affected slice until resolved; never convert its proposed default into implemented policy. PRD §14 requires agreement of open decisions and commercial scope before implementation, so deferrals themselves need sign-off.

## Definition of done for each authorized slice

- Trace implemented behavior to PRD IDs and approved decision entries, recording approver/date for new policy.
- Include reviewed versioned migrations, database-level constraints and development-only seed guard; no secrets or real customer/stock data in fixtures.
- Stock writes enforce authentication, authorization, validation, idempotency, atomic database transaction, original actor audit, immutable history and transactional outbox.
- Test negative paths and real PostgreSQL concurrency; Vitest for pure rules, Supertest for HTTP/database contracts, Playwright for PRD acceptance workflows. A UI-only happy path or mocked database does not prove inventory safety.
- Verify role-limited responses server-side; ledger/projection totals and exact source attribution; offline local path and eventual replay behavior appropriate to the slice.
- Run appropriate typecheck/build/lint and relevant tests using chosen monorepo commands once tooling exists. Document actual commands/results; never report planned tests as passing.
- Review affected API/sync compatibility, migration/recovery notes and meaningful risks; update traceability/decision documents. No production deployment without explicit permission.
- End-of-slice report: changed files, migration names, actual commands/tests and failures, open decisions, next recommended slice.

## Brick 0 validation record

Executed read-only `rg --files` (excluding generated folders), `Get-ChildItem -Force`, `Get-Content AGENTS.md`, `Get-Content START_HERE.md`, and complete PRD extraction through .NET ZIP/XML APIs. `git status --short` failed: directory is not a Git repository. No repository history or clean-working-tree claim is possible. The source DOCX was read, not edited; visual DOCX formatting review is outside these Markdown design deliverables. Final document consistency checks are recorded below after execution.

Executed Markdown inventory/coverage checks: six documents present; all FR-01–FR-24 rows and O1–O8/V01–V04 decision rows present; all fenced code blocks paired. Reviewed proposal/status wording, cross-document approval gates, ledger example arithmetic and initial ERD source optionality. Mermaid blocks are source diagrams; no diagram renderer was available/run, so graphical rendering is not verified. Source PRD SHA-256 recorded for this review: `176D1BBEA585E82CF14AB7570C2C6871C3DF336BC3F615E9AA8FB7AF63B23FD3` (no pre-task hash comparison is claimed).

Application tests: NOT RUN; no application/test harness exists. Migrations: NONE. Deployments: NONE. Brick 0 is complete as a review draft, not approval of engineering or business choices.

## Review request

Review the six files together. Approve/amend stock identity and variant normalization, SKU allocation/registry, field-level permissions, closing blockers/calendar, offline Admin and cloud/shop authority, and hardware assumptions as required by AGENTS.md rule 3. Resolve or explicitly defer the other decisions with slice-specific gates; agree commercial scope per PRD §14. Then explicitly authorize Brick 1. The completion/disposition ambiguities and negative-stock exception must be settled before affected ledger behavior is implemented.
