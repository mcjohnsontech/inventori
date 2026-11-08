# Milestone 4 — recorded unit tracking

Confirmed scope: give each saved Unit Code an authorized details/timeline drawer, reachable from receipt units, inventory exact search and QR results. Show current recorded identity/state and actual evidence only. Later checkout, Order IDs, BAD/recovery, counts and closing will add their own domain records in their milestones; empty history does not imply those operations happened.

## Evidence and privacy

Admin/Manager see operational receiving events, exact-unit label request/preparation/device-dialog events and QR presentations, with recorded actor, acceptance time and origin sequence. A device-dialog request is never called a successful print or physical attachment. Custody `SHOP_STORAGE` means recorded shop custody, not a verified shelf or physical count. No historical unit or event is fabricated.

Production keeps the existing minimal identity/usable-availability allowlist and may see its own QR presentations. It receives no damaged intake/history, supplier/invoice details, print administration, other staff history or raw audit/security metadata. All filtering occurs server-side. Existing GET identity and POST `/qr/resolve` remain read-only.

## QR presentations

Add immutable `UnitObservation` metadata through migration 020. It records one explicit client QR presentation (camera or keyboard/scanner input), exact unit/origin/lot, authenticated actor, command and server acceptance timestamp. It does not prove who physically holds the item, scanner hardware authenticity, label attachment or inventory movement. Manual short-code lookup does not create an observation.

The scanner first resolves the identity through the existing read contract, then separately records a presentation. A failed history request preserves the resolved identity and offers an explicit same-key retry; it must not claim the observation was saved. Repeated intentional scans are separate presentations. No automatic retry creates another command key for the same attempt.

Use existing SHOP origin locking, current actor/auth-version fencing, command hashing/idempotency, audit/outbox and atomic metadata acceptance. All three existing IDENTIFY roles may record their own presentation. Database guards enforce exact origin/unit/lot and actor membership/evidence, immutable rows, and no orphan commands. No stock, receipt, label or unit-state row is changed. Cloud writes stay disabled.

## Read contract and ordering

`GET /v1/units/:id/tracking?page=1`: explicit role DTO, current permitted identity and a 20-event chronological page. Order by authoritative accepted origin sequence then stable event ID; label events use their actual metadata commands, receiving uses its original command. `POST /v1/unit-observations` requires an idempotency UUID and strict DYI:2 payload/method. Unknown, malformed, foreign and DYI:1 presentations are rejected; legacy lookup remains supported separately.

Product and Unit Codes may share the same six-character text across identity namespaces. Inventory search presents an explicit individual-item match alongside its existing product/lot results; it must not silently choose or renumber one. Back/close preserves inventory filters, receipt pagination and the QR result.

## Verification

Unit contracts; API role/field allowlists; actual event chronology; origin isolation; same-key replay/conflict/concurrency; immutable observation and complete evidence guards; failed audit/outbox rollback; unchanged ledger/unit-state/receipt/print fingerprints; no write from lookup; explicit QR-history retry without double recording. Browser checks cover all entry points, focus/escape/close restoration, pagination, unavailable history, Production privacy and 320/390/768/1024/1440 layouts. Isolated migration only; operational activation, physical verification and future transitions remain gated.
