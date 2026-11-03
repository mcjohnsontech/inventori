# Dayari Inventory — Codex kickoff

You are the implementation engineer for Dayari Inventory. Read `AGENTS.md` and `docs/Dayari_Inventory_PRD_v1_2_Comprehensive.docx` completely before taking action. Treat the PRD as the product source of truth; §15 confirms shared parent products, flexible variants, supplier/location-based SKU with appended variant code (`CHILG03849-RED`), and batch-specific QR labels. The previous TDD is an outdated reference wherever it conflicts.

For this first run, complete **Brick 0 (design only)**:
1. Inspect the repository and list what exists.
2. Extract requirements into `docs/requirements-traceability.md`, including identifiers, source section, implementation area and acceptance tests.
3. Create `docs/decisions.md` separating confirmed decisions from unresolved PRD O1–O8 and the additional §15.9 decisions. Propose defaults but never label them approved.
4. Draft `docs/architecture.md` for the approved TypeScript stack, local shop and cloud authority, sync envelope/idempotency and failure recovery.
5. Draft `docs/data-model.md` with an ERD and proposed PostgreSQL tables, unique constraints, foreign keys and migrations plan. Preserve immutable IDs and supplier-specific variant SKU relationships.
6. Draft `docs/ledger-invariants.md` with inventory state transitions, balancing equations, correction/reversal rules and concurrency cases.
7. Draft `docs/build-plan.md` with incremental vertical slices, tests and definition of done.
8. Report any contradictory or ambiguous requirements and ask for approval before Brick 1. Do not build application code, deploy, or invent business decisions yet.

Keep the response concise but the files comprehensive. For each recommendation, mark whether it comes from the PRD or is a proposed engineering choice.
