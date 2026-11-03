# Dayari Inventory — Implementation Bricks

## Phase1 human identities — authorized isolated implementation

Finalized section17 explicitly authorized by owner; code/model/API/UI/backfill tests implemented. New migrations007/008 exercised only on isolated test database, no operational migration/backfill/deployment. Read phase-1-implementation-report.md for actual tests/evidence. Phase2 StockUnit/serialized receiving/DYI:2, later search/print-cart/verification and Brick6 issues remain unauthorized. Stop for Phase1 review.


## Owner clarification gate — Phase1 scope finalized, implementation pending

Architectural direction/clarified design A01–A08 recorded in [unit-traceability-and-label-ux-design.md](unit-traceability-and-label-ux-design.md). A04 limits remain provisional; Phase2 cutover requires old-writer/database bypass proof and benchmark evidence. Section17 finalizes Phase1: immutable Product/Lot codes/all creation-path allocation, exact role-safe origin-qualified lookup/display, isolated backfill rehearsal and regressions. StockUnit/serialized receiving activation, intelligent text search, print cart/native printing and verification remain later phases. **No Phase1 implementation, real-data migration or deployment is authorized yet.** Stop after documentation revisions for explicit authorization.


## New identity/search/printing assignment — Phase 0, 3 November 2026

Owner authorized audit/design/migration planning only. [unit-traceability-and-label-ux-design.md](unit-traceability-and-label-ux-design.md) contains the assessed baseline, proposed additive serialization/search/printing model, historical onboarding, API/UX/test plans and A01–A09 approval checklist. No implementation or migration is authorized yet. Proposed phases1–6 have independent review gates; real-data migration/deployment remain separately gated. Existing lot QR and ledger behavior are unchanged. Brick6 production issues, recovery, closing, thermal adapters and cloud transport are not authorized by this new assignment.

**Status:** Engineering execution plan, subject to PRD v1.2 and approved decision register. **Rule:** Complete one brick at a time. No next brick without review. Implement each feature vertically (schema → service → API → tests → UI). Synchronization must be designed in Brick 0 and represented in the first migrations, even though full offline testing is Brick 9.

## Mandatory handoff after EVERY brick
Provide: (1) summary of delivered behavior; (2) changed files and migrations; (3) commands and actual test results; (4) demonstrated acceptance cases; (5) security, correctness, and migration risks; (6) open decisions; (7) recommended next brick. Never claim unrun tests passed. Stop for explicit approval before the next brick.

## Brick 0 — Requirements and design (no application code)
**Depends on:** PRD v1.2. **Deliver:** `docs/requirements-traceability.md`, `docs/decisions.md`, `docs/architecture.md`, `docs/data-model.md` with ERD, `docs/ledger-invariants.md`, `docs/build-plan.md`. Cover PRD open decisions O1–O8 and variant-related unresolved decisions; distinguish CONFIRMED / PROPOSED / OPEN. Define immutable identifiers, supplier-location SKU allocation, flexible variants, inventory states, authority, event IDs and idempotency, daily closing, permissions, failure scenarios. **Gate:** Owner approves blocking business decisions and technical plan before Brick 1.

## Brick 1 — Repository and environment
**Depends on:** Brick 0 gate. **Deliver:** TypeScript monorepo, Next.js web, NestJS API, PostgreSQL/Prisma, Zod contracts, Tailwind/shadcn, Docker Compose, lint/typecheck/test CI, health checks, environment templates, setup guide. **Tests:** Fresh clone can run local stack and first migration; no secrets committed. **Gate:** Reproducible local startup and CI green.

## Brick 2 — Authentication and RBAC
**Depends on:** Brick 1. **Deliver:** Users, roles, sessions, password security, protected API routes, audit of sensitive actions, Admin/Manager/Production permission matrix. **Tests:** Direct API access cannot bypass roles; disabled users denied; sessions expire correctly. **Gate:** Approved permission matrix enforced server-side.

## Brick 3 — Catalogue, supplier locations, variants, SKU engine
**Depends on:** Brick 2. **Deliver:** Suppliers and supplier locations, shared parent products, configurable attribute definitions/combinations, supplier-product sourcing, stable SKU assignments; supplier/location/product base + variant suffix (`CHILG03849-RED`). Avoid parsing mutable business identity from SKU. **Tests:** Same notebook from two suppliers shares parent identity but has separate supplier-specific SKUs; five colours; duplicate variants/SKUs rejected; historical identifiers remain stable. **Gate:** Manager/Admin catalogue workflows match approved permissions.

## Brick 4 — Immutable ledger and stock engine
**Depends on:** Brick 3. **Deliver:** Stock states, append-only movements, batch-level stock projections, transactional validation, idempotency keys, reversals, event identifiers/outbox foundations for later sync. **Tests:** No normal negative usable stock; concurrent issues cannot overspend; replay/duplicate events do not double deduct; failed transaction rolls back. **Gate:** Ledger invariants and accounting test suite pass.

## Brick 5 — Receiving, batches, QR labels
**Depends on:** Brick 4. **Deliver:** Receive multiple variant quantities in one delivery; batches and receipt lines; QR payload resolves immutable supplier-specific SKU + batch; printable owner-approved label layout with human-readable SKU, batch, product and variant; print/reprint history. **Tests:** Receive Red 30/Brown 20; verify balances, labels and scan resolution; reprint does not change stock. **Gate:** Test printed labels with real scanner and agreed label hardware.

## Brick 6 — Production issue and order reference
**Depends on:** Brick 5. **Deliver:** Scan-first workflow, variant and batch auto-resolution, quantity entry, multiple variant lines under one order reference, No Order exception, staff attribution, issue confirmation. Order reference remains manually entered and unverified in V1. **Tests:** Order #2002 uses Red 2/Brown 3; exact balances and traceability; insufficient quantity rejected; repeat scan safely handled. **Gate:** Production staff can complete representative workflow.

## Brick 7 — Damage, corrections and approvals
**Depends on:** Brick 6. **Deliver:** Damage linked to earlier issue where applicable; partial damage, disposition, exception queue, approved recovery and compensating corrections. **Tests:** Damaging issued item does not deduct usable twice; cannot damage more than issued; repair return needs Admin approval; ambiguous issue linkage resolved explicitly. **Gate:** Audit trail remains complete.

## Brick 8 — Reconciliation and day close
**Depends on:** Brick 7. **Deliver:** Physical counts, variance handling, blocking exception checks, close report snapshots, production completion confirmation, late transaction visibility. **Tests:** Close clean day; reject close with blockers; closed snapshot unchanged after late entries. **Gate:** Manager validates sample closing report against physical stock.

## Brick 9 — Offline local-first and cloud sync
**Depends on:** Ledger/outbox architecture from Brick 0/4; working shop workflows through Brick 8. **Deliver:** Local server and PostgreSQL on shop LAN, authenticated event sync with deduplication, authority and conflict handling, freshness status, retries, backups/restore. **Tests:** Internet loss during receive/issue, reconnect, retries, duplicate delivery, server restart, conflicting approvals; no lost or double movements. **Gate:** Offline operations and recovery demonstrated with real shop network.

## Brick 10 — Owner dashboard and reporting
**Depends on:** Bricks 4–9. **Deliver:** Usable/in-production/damaged balances, supplier/variant/batch drilldowns, staff history, exceptions, approvals, daily closing reports, cloud freshness indicators. **Tests:** Report totals reconcile to ledger; stale cloud data is visibly labeled; roles restrict views. **Gate:** Owner can trace sample stock movement end-to-end.

## Brick 11 — Pilot, hardening, deployment
**Depends on:** All earlier gates. **Deliver:** Verified opening balances, printer/scanner tests, local hardware and power/network readiness, training, monitoring, backups, restore drill, security checks, launch and rollback checklist. **Tests:** Pilot with real items, counts and outage; document discrepancies and resolve critical defects. **Gate:** Explicit owner sign-off before production go-live.

## Codex sequencing policy
For every brick: first inspect existing code and decision register; propose a scoped plan; implement only approved work; run automated and manual acceptance tests; update requirements traceability and changelog; stop and ask for review. Do not treat suggested engineering defaults as approved product requirements. If a blocker arises, stop rather than invent a business rule.


## Current status — approved Brick 4 / Brick 5A

Catalogue and variant extension are complete. Owner approved ledger plus receiving on 2 November 2026. This slice implements the RECEIPT-only immutable ledger and multi-product usable/damaged intake with Admin/Manager UI and tests. Later movement types remain disabled pending their own domain records and permission constraints. Brick 5 labels/QR (5B) is NOT complete; physical label gate remains pending. No Brick 6 production scanning, later approvals/closing or Brick 9 sync transport has begun. See receiving-implementation-report.md for actual verification; stop for review before the next milestone.


## Brick 5B status — 3 November 2026

Owner authorized local implementation of QR identity, A4 PDFs, print evidence/reprints and limited Production lookup. Software implementation and automated verification are recorded in qr-label-implementation-report.md. Physical A4 printer/media/device acceptance has NOT been performed; Brick5B is not production-ready. No thermal adapter, production issue/deduction, recovery, closing or cloud transport is included. Stop for review and physical trials before the next inventory workflow.


## Admin experience cross-cutting milestone — 3 November 2026

Owner authorized a complete UX/integration refinement around implemented catalogue, receiving/ledger, lot QR/PDF and Phase1 identities, with seven separately published Git milestones. Implementation adds responsive operational workspaces and safe bounded reads; existing mutation services/schema remain unchanged. See admin-experience-implementation-report.md for exact status, tests, files and publication evidence. This is not Phase2 authorization and does not complete physical printer acceptance, unit serialization, production workflows, closing or sync. Stop for owner review after the seventh completion commit.
