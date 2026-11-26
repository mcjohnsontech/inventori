# Local Admin approval of recovery and correction requests — design

Status: CONFIRMED by the owner and implemented in development, 24 November 2026 (OPEN items answered; see decisions.md). Implements owner decision 2 in `docs/decisions.md` (Admin may approve on the shop server without the cloud). Migration 035 is applied to the isolated test database only; applying it to the shop database needs a backup and the owner's go-ahead.

## What changes for staff

Today a request is recorded and then waits forever ("Approval arrives with cloud sync"). After this slice, an Admin signed in at the shop sees **Approve** and **Reject** on each pending request that someone else submitted.

- **Approve a recovery request:** the exact damaged items go back to usable stock. One new stock transaction (damaged → usable) is recorded and linked to the request and to the original damage report. Nothing is edited or deleted.
- **Reject a request:** the request is closed with the Admin's reason. Stock does not change.
- **Approve a correction request:** see OPEN 1 and 2.

## Rules (CONFIRMED by the owner's decisions)

- Only an Admin may approve or reject. An Admin may never approve or reject a request they submitted themselves. A Manager may never approve.
- Approval happens on the shop server only (shop authority). The cloud copy, when sync exists, receives the approval as an ordinary append-only event.
- Approval re-checks everything at the moment of approval: the request is still pending, the items are still in the state the request described, and the lot quantities still match what the request recorded. If anything changed, approval is refused with a plain message and nothing is saved.
- Every approval is one database transaction with an idempotency key, audit event, outbox event and database guards, like every other stock command.
- Approval after a day was closed appears on that day's report as a post-close entry; the closed report is not changed.

## Answered by the owner (24 November 2026) — each recommended option was chosen

1. **Correction where fewer items are on the shelf than the records say.** Items have their own codes, so the system must know *which* items are missing. Proposed: on approval the Admin ticks the missing item codes (pre-filled from the count when one exists), and those items move to *Removed – missing*. Total removed must equal the shortfall.
2. **Correction where more items are on the shelf than the records say.** Extra items have no code and no delivery record. Proposed: approval cannot create items; the Admin closes the request as "Receive the extra items as a new delivery" and the extra items are received and labelled normally.
3. **Single-Admin shops.** If the only Admin submits a request, nobody can approve it. Proposed: keep it that way. An Admin should normally not submit requests; a Manager does, and the Admin approves. Alternative: allow a second Admin, or allow self-approval with a written reason (not recommended).
4. **Closing.** A pending correction blocks closing today, as now. Proposed: a rejected correction stops blocking only once the underlying count difference is explained or recounted, so rejecting cannot be used to skip a real discrepancy.

## Implementation outline (after answers)

Migration 035: request status (PENDING / APPROVED / REJECTED) as append-only decision records; new stock transaction type `RECOVERY` (D → U, exact units, Admin only) and, if OPEN 1 is approved, `CORRECTION_REMOVAL` (U → X, exact units); guards mirroring the completion and disposition triggers; self-approval guard in the database. Service, API (`POST /v1/authorization-requests/:id/decision`), UI (Approve/Reject with review step), and unit, integration, concurrency and browser tests tied to PRD FR-08 and scenario "Mark one issued Red unit damaged … recovery".

## As built

- Migration `202611240035_local_admin_approval`: `AuthorizationDecision` + `AuthorizationDecisionLine` (append-only), `decisionLineId` on `StockMovement`/`UnitEvent`, transaction types `RECOVERY` (D→U) and `CORRECTION` (U/P/D→X), unit kinds `RECOVERED`/`CORRECTION_REMOVED`, removed-missing units keep condition USABLE, and guards: Admin-only, never own request, outcome must fit the request, exact unchanged recovery units, exact shortfall count, unit census = balances. Closing: a correction stops blocking once approved, or once a matching recount follows a rejection or receive-as-delivery.
- API: `GET /v1/authorization-requests/:id/decision` (options, pre-ticked missing items from the latest count) and `POST /v1/authorization-requests/:id/decision` (idempotent, one transaction, audit + outbox).
- UI: Correction requests → open a request → "Admin decision" panel with Approve / Reject / Receive extras as a new delivery, a tick list for missing items, and a required reason.
- Tests: `tests/integration/authorization-decisions.test.ts` (recovery, self-approval refused by API and database, rejection, shortfall, surplus + recount, stale request, three Admins at once), `tests/unit/authorization-decisions.test.ts`.
