# Milestone 4 — recorded unit tracking

Status: software implementation and local verification complete; no operational migration or deployment.

## Implemented

Inventory exact Unit Code search, receipt-unit links and QR results open an accessible unit-history drawer. Closing/escaping restores focus and preserves the inventory search or receipt list. Product and Unit Codes remain distinct typed identity namespaces even when their six-character text matches; neither code is renumbered.

Admin/Manager see current recorded identity/condition/custody, the accepted receipt, factual delivery date, server recording time and chronological receiving/label/presentation evidence. Production receives the existing minimal unit identity/availability and only its own QR presentations. Supplier/source, damaged history, invoices, other actors' events and print administration are excluded server-side.

The timeline uses accepted origin sequence. Label requests, document preparation and device-dialog requests are named accurately; no successful print or attachment is invented. Actor UUID and recorded role are immutable; displayed names come from current staff profiles. No checkout, BAD, recovery, completion or physical-count event is invented before its domain milestone.

## Schema and transactions

Additive migration `202611080020_unit_observations` adds immutable UnitObservation metadata with exact origin/unit/lot, authenticated actor/role, command, declared camera or keyboard/scanner input, and server timestamp. Deferred checks require matching command, audit and outbox evidence plus active shop membership. Existing tables/constraints are not rewritten.

Observation commands use SHOP origin-first locking, current actor/auth-version fencing, canonical request hashes and same-key replay/conflict handling. All evidence and origin sequence commit atomically. Cloud writes are denied. Lookup remains read-only; an observation never changes stock, UnitEvent/UnitState, receipt or print records. Declared input method is not cryptographic proof of scanner hardware, physical custody, attachment or a stock movement.

The QR UI resolves identity first, then records a separate presentation. If recording fails, identification remains visible and an explicit retry retains the same key/body. A repeated intentional scan is a new presentation. Closing the scanner does not fabricate an acknowledgement of an uncertain request.

## API

```http
GET /v1/units/{unitUuid}/tracking?page=1
POST /v1/unit-observations
Idempotency-Key: <stable UUID for this presentation attempt>
{"payload":"<saved DYI:2 payload>","method":"QR_INPUT"}
```

Presentation response:

```json
{
  "id": "<observation UUID>",
  "unitId": "<saved immutable unit UUID>",
  "recordedAt": "<server timezone-aware timestamp>",
  "originSequence": "123",
  "evidence": "QR_PRESENTED_ONLY"
}
```

Tracking returns `unit`, a 20-event paginated timeline, explicit `historyScope`, and `physicalVerification: NOT_ESTABLISHED_BY_THIS_VIEW`. Operational-only provenance includes receipt/date/initial condition/custody. Production scope is `OWN_QR_PRESENTATIONS`; strict queries reject injected origin/private-field filters. Unknown/foreign units return 404. Existing DYI:1 lookup remains supported, but an individual presentation request requires DYI:2.

## Verification executed

- Full unit suite: **57/57 passed**, 19 files.
- Full PostgreSQL suite: **106/106 passed**, 15 files, 250.89 seconds. Final delivery-date-specific tracking repeat: **7/7 passed**. Covers actual foreign units, same-text typed identities, role DTOs, chronology, pagination, concurrent replay/conflict, immutable history and complete rollback.
- Tracking browser journey initially passed; final relevant browser regression run: **6/6 passed**, 5.5 minutes. Includes inventory drawer, legacy labels, Product/Lot identities, atomic receiving/lost response, exact-unit native printing and tracking. Tracking covers same-key observation retry, Production history isolation, focus/escape/context preservation and 320/390/768/1024/1440 screenshots.
- Migration 020 rehearsal on retained isolated through-019 fixture: all **48 existing table fingerprints unchanged**, zero fabricated observations. See evidence/completion/milestone-4/unit-observation-migration-preservation.json.
- Final compact drawer screenshots inspected directly at 320px/1440px; remaining widths retained under images/completion/milestone-4. Corrected repeated Lagos suffix and clarified delivery date versus receipt recording time. Individual-label preview now includes the Product Code already present in frozen print content.
- Final typecheck and production build passed. Final tracking/latency repeat passed 7/7; 21 loopback presentation requests measured at most 67.05 ms. This is API acceptance only, not camera/Wi-Fi/hardware certification.

Failed attempts: the first preservation helper hashed all accumulated benchmark fixtures and exceeded test timeouts; it now scopes every fingerprint to the synthetic shop. The successful full suite and focused repeats retain all assertions. A later latency-capture run encountered a roughly 25-minute host pause, expiring a 15-second transaction and consequently leaving dependent expected timeline events absent. That run is not counted as passed; existing timeouts were retained for the repeat.

## Limits and next milestone

No physical printer/scanner/attachment or shop Wi-Fi certification. No operational migration, historical enrollment, real invitation, cloud transport or deployment. Rehearsal tools now refuse later repository migrations rather than silently applying beyond their documented target; use the matching milestone commit for historical rehearsals.

Checkout, missing-reason reconciliation, damage/recovery, completion, counts and closing remain later milestones. Checkout roles/reasons and reusable optional Order IDs are approved. Targeted O4/O5/O8 closing/offline-approval/completion decisions have been requested separately; they do not block the independent authorized checkout implementation.

Changed files: evidence/completion/milestone-4/changed-files.json. Latency samples: evidence/completion/milestone-4/unit-observation-latency.json. Publication is recorded in dayari-completion-progress.md after push. Recommended next slice: explicit exact-unit production checkout with atomic U-to-P movements and no scan-only deduction.


Commands executed: `npm test`; full `npm run test:integration` plus final tracking repeats; focused six-case `npm run test:e2e`; `npm run typecheck`; `npm run build`; isolated `rehearse-unit-observations.ts`; `git diff --check`. No operational migration, backfill, real mail or deployment.
