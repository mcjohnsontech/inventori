# Dayari Inventory — Codex repository instructions

## Source of truth
Read `docs/Dayari_Inventory_PRD_v1_2_Comprehensive.docx` before implementing features. The owner story is context. The older TDD v0.1 is advisory and may conflict with PRD v1.2; PRD v1.2 §15 supersedes older variant/SKU examples. Keep a `docs/decisions.md` log for unresolved choices; do not silently turn proposals into approved business requirements.

## Product invariants
- One shared parent product can be sourced from multiple suppliers. Variants are attribute combinations (color, size, finish, etc.). Supplier/location/product/variant identities remain separately traceable.
- Supplier/location/product base SKU plus variant suffix: e.g. `CHILG03849-RED`. Do not hardcode the interpretation or lengths of the base-code segments until approved. Internal immutable IDs are primary keys, not SKU strings.
- Each physical item receives a label; in V1 identical units of a variant SKU and batch share a QR payload. The QR resolves to immutable SKU and batch identities; no unique-unit serialization unless approved.
- Receipts support multiple variants atomically. Issue lines reference exact SKU, batch, quantity, user, and optional manually entered unverified order reference.
- All stock changes are transactional append-only ledger events, with reversals/compensating events rather than history edits. Prevent normal negative usable stock, double deductions and duplicate processing.
- Damage after production issue transfers stock from in-production to damaged without deducting usable twice; damaged-to-usable recovery requires Admin approval.
- Day close preserves an immutable snapshot, with documented blockers and separately identified post-close transactions.
- Local shop operations must work on shop Wi-Fi during internet outages; sync must be replay-safe and cloud views show freshness timestamps. Plan sync identifiers and authority boundaries from the first schema migration.
- V1 does not validate order references against Google Sheets, process payments, reserve orders, or handle dispatch.

## Proposed stack (approved by project lead)
TypeScript monorepo, Next.js web, NestJS API, PostgreSQL, Prisma, Zod, Tailwind/shadcn/ui, QR library, Vitest/Playwright/Supertest, Docker Compose. Prefer a modular monolith and avoid premature microservices.

## Working rules
1. Start by reading the PRD and inventorying repository files. If the PRD is missing, ask for it instead of inventing requirements.
2. Before coding, produce `docs/requirements-traceability.md`, `docs/decisions.md`, `docs/architecture.md`, `docs/ledger-invariants.md`, and an initial ERD. Explicitly distinguish CONFIRMED, PROPOSED and OPEN.
3. Stop and ask for approval on choices affecting stock identity, SKU code allocation, permissions, closing blockers, offline approval authority, or physical hardware assumptions.
4. Implement one vertical slice at a time: schema + service + API + tests + UI. Do not implement the entire system in one run.
5. Every stock-changing API requires authentication, authorization, input validation, idempotency key, atomic database transaction, audit metadata and tests.
6. Include migrations, seed data for development only, negative-path tests, concurrency tests and acceptance tests tied to PRD scenarios.
7. Never delete or rewrite ledger history, commit secrets, assume cloud data is live, or deploy to production without explicit authorization.
8. At the end of each slice report: changed files, migrations, commands/tests run, failures, open decisions, and the next recommended slice. Do not claim tests passed unless run.

## Initial task
Perform **Brick 0 only**: inspect the PRD, create traceability/decision/architecture/ERD/ledger documents, propose schema and API boundaries, identify blockers, and request review. Do not generate the full application yet.
