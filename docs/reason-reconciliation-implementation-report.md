# Manager reason reconciliation — milestone 6

Status: implementation and software verification complete, 8 November 2026. Operational migration and deployment are not authorized.

## Implemented workflow

Admin and Inventory Manager can review a paginated, origin-scoped missing-reason queue and history. Filters use original checkout dates in Africa/Lagos, original employee, exact reusable Order ID, exact six-character Unit Code and resolution status. Managers select exact exceptions across pages, inspect original checkout/unit evidence, classify with the approved reason choices, optionally add remarks, review and explicitly confirm. Other requires a meaningful explanation. Admin is read-only; Production has no reconciliation administration.

Drafts survive Back and reload in actor/origin-scoped session storage. The pending payload and idempotency key survive an uncertain response. Discard is confirmed. Accepted results receive keyboard focus. Production can see its own exception status without Manager remarks. Operational unit timelines show appended classification evidence.

## Schema and transaction

Additive migration `202611080022_reason_reconciliation` adds immutable ReasonReconciliation and CheckoutReasonResolution tables plus a queue index. Each original exception has at most one resolution. Deferred completeness checks bind exact exception/checkout/line/unit/origin, current Manager, hashed manifest, audit, outbox and command evidence. Accepted records cannot be edited, deleted or supplemented. A metadata classification command cannot own stock transactions or unit events.

The service locks origin, validates current actor/session/membership, locks selected exceptions in sorted order, checks every target and commits the complete metadata group atomically. Same canonical selection/key replays; changed input conflicts. Competing commands cannot classify an exception twice. One invalid target rejects all selected targets. No stock movement, state, balance, receipt, unit or print record changes. Classification remains historical evidence even if a unit later leaves In Production.

Original checkout acceptance responses, reasons, timestamps, Order IDs and exceptions remain frozen. Live outstanding status is separately labelled with its own as-of timestamp. Pre-022 reads remain compatible; reconciliation readiness returns an explicit unavailable response rather than migrating the shop automatically. Receiving return typing was clarified without runtime JSON changes.

## API

Authenticated `/v1` endpoints:

- `GET /reason-reconciliation-config`: scoped employee filter options, configured origin, selection limit and Manager write capability.
- `GET /checkout-reasons?page=1&status=UNRESOLVED`: 20-row queue; optional `from`, `to`, `employeeId`, `orderReference`, `unitCode`.
- `POST /checkout-reasons/preview`: read-only exact selection; returns original evidence and current resolution status.
- `POST /reason-reconciliations`: Manager only; mandatory `Idempotency-Key`.
- `GET /reason-reconciliations/:id`: Admin/Manager accepted evidence in this origin.

Example write (UUID placeholders represent actual saved exceptions):

```json
{"exceptionIds":["<saved-exception-uuid>"],"reason":{"code":"SAMPLE","note":""},"remarks":"Manager confirmed sample purpose"}
```

The response contains reconciliation UUID, origin, server recorded time, origin sequence string, Manager identity, reason/remarks, manifest hash and exact saved resolution links. It does not claim any stock transition. Original acceptance replay remains unchanged; GET checkout detail can additionally provide current reconciliation statuses.

## Tests actually executed

- Prisma schema validation passed; migration 022 applied only to isolated test/rehearsal databases.
- Full unit suite: **69/69 passed, 21 files**. Initial restricted-network run had one loopback SMTP TLS failure (68 passed); rerun with local network permission passed all 69 without sending real email.
- Full PostgreSQL integration suite: **123/123 passed, 17 files**. Expected forced audit/outbox failures test rollback and appear in logs. Prisma adapter emits an existing concurrent-query deprecation warning.
- Eight reconciliation integration cases cover role denial, all queue filters, canonical concurrent replay/conflict, competing commands, immutability/orphans, forced rollback, stock fingerprints, 500 exceptions and foreign-origin collisions with identical initially allocated short Unit Codes. No code is renumbered.
- Isolated populated migration rehearsal preserved **all 52 existing table fingerprints**, created zero artificial classifications, then accepted one real synthetic Manager classification without changing stock/history fingerprints. Pre-upgrade checkout reads remained available.
- Latest 500-exception development sample: **1,054.669 ms**, one sample; stock unchanged. This is not production hardware certification.
- Targeted reconciliation browser journey passed: Admin review-only, Production denial, cross-page selection, draft/Back/discard/reload, five viewport widths, lost-response retry, focused acceptance, unchanged stock and original missing-reason evidence.
- Typecheck passed after fixing a strict fixture array-access check. Final browser results are appended below; production build passed.

## Browser evidence and visual review

Screenshots in `docs/images/completion/milestone-6/` cover 320, 390, 768, 1024 and 1440 px review plus accepted evidence. Mobile/desktop review and accepted screens were inspected: readable stacked evidence, reachable confirmation, no horizontal overflow, consistent emerald/cream styling. Browser tests assert all five widths. Queue is paginated; original-detail and unit drawers preserve browsing context.

## Preservation and boundaries

Synthetic fixtures only. No operational migration, account change, stock mutation, historical enrollment, live email, cloud approval delivery or deployment. O5 recovery/correction execution remains deferred. O6 BAD scope is approved for the next milestone: Production own-checkout units only, Admin/Manager issued or pre-issue stock. This report does not claim BAD, completion or closing is implemented.

Known limits: at most 500 explicitly selected exceptions per atomic classification and 30,000 normalized UTF-8 request bytes; larger work requires separate explicit commands. Classification amendments/reopening are not enabled. Remote CI and physical hardware are not certified by local tests. Next milestone is BAD reporting, Manager disposition and pending recovery/correction evidence.


### Broader browser run — initial result

The first six-case regression run passed reconciliation, receiving, legacy labels and exact-unit labels (4/6). Checkout asserted a restored row before its preview request finished; the test now explicitly waits for that response before retaining the same visibility assertions. Tracking encountered read-transaction expiration during the development run (5-second timeout, reported elapsed 6.3–7.3 seconds); no timeout was raised. Both cases are being rerun. An earlier attempt failed in global setup due transient PostgreSQL connectivity before any browser case ran; a later read-only probe confirmed the existing server and test database were available. A restart attempt did not replace or reset the already-running cluster. These failed attempts are not counted as passes.


## Changed files

- `apps/api/src/app.ts`
- `apps/api/src/checkouts.service.ts`
- `apps/api/src/receiving.service.ts`
- `apps/api/src/reconciliation.service.ts`
- `apps/api/src/unit-tracking.service.ts`
- `apps/web/app/api/[...path]/route.ts`
- `apps/web/components/checkout-workspace.tsx`
- `apps/web/components/reason-field.tsx`
- `apps/web/components/reconciliation-workspace.tsx`
- `apps/web/components/shell/destinations.ts`
- `apps/web/components/unit-tracking-drawer.tsx`
- `apps/web/components/workspace-router.tsx`
- `apps/web/lib/reconciliation-draft.ts`
- `docs/IMPLEMENTATION_BRICKS.md`
- `docs/architecture.md`
- `docs/dayari-completion-progress.md`
- `docs/decisions.md`
- `docs/evidence/completion/milestone-6/reconciliation-500-capacity.json`
- `docs/evidence/completion/milestone-6/reconciliation-preservation.json`
- `docs/images/completion/milestone-6/reconciliation-accepted-1440.png`
- `docs/images/completion/milestone-6/reconciliation-review-1024.png`
- `docs/images/completion/milestone-6/reconciliation-review-1440.png`
- `docs/images/completion/milestone-6/reconciliation-review-320.png`
- `docs/images/completion/milestone-6/reconciliation-review-390.png`
- `docs/images/completion/milestone-6/reconciliation-review-768.png`
- `docs/ledger-invariants.md`
- `docs/reason-reconciliation-implementation-design.md`
- `docs/reason-reconciliation-implementation-report.md`
- `docs/requirements-traceability.md`
- `packages/contracts/src/checkouts.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/permissions.ts`
- `packages/contracts/src/reconciliation.ts`
- `packages/contracts/src/unit-tracking.ts`
- `prisma/migrations/202611080022_reason_reconciliation/migration.sql`
- `prisma/schema.prisma`
- `scripts/rehearse-reconciliation.ts`
- `tests/e2e/checkouts.spec.ts`
- `tests/e2e/reconciliation.spec.ts`
- `tests/integration/reconciliation.test.ts`
- `tests/unit/reconciliation.test.ts`


### Final browser regression repeat

Checkout and tracking both passed together on rerun (2/2, 2.9 minutes). Together with the four passing cases from the broader run, all six selected regression cases have successful results across runs. No application timeout or security assertion was weakened. Earlier regenerated milestone screenshots were restored byte-for-byte from HEAD so historical evidence is not overwritten; new milestone-6 screenshots are retained.


Production build (`npm run build`) passed, including contracts, Prisma generation, Nest compilation and optimized Next.js build. No deployment was performed. Final Git publication is recorded in the progress register after remote SHA verification.
