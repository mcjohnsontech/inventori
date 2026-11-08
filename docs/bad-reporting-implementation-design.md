# BAD reporting and pending authorization — milestone 7

## Confirmed scope

PRD 5.3 and owner O6: Production may report only an exact currently issued unit from its own checkout. Admin/Manager may report other staff issued units or pre-issue usable stock. Resolve checkout and holder server-side; client-supplied provenance is not trusted. Preserve unit UUID, six-character Unit Code, Product/Lot Codes, SKU, batch, receipt and original checkout/Order ID. Capture reporter/time, meaningful damage cause and description. No post-completion or repeated-damage transition is enabled. Intake damage remains linked to its accepted receipt.

An exact issued unit moves P to D with quantity one; usable stock does not change again. A pre-issue usable unit moves U to D with quantity one. Both transitions atomically append immutable BAD root/line evidence, exact movement and contiguous unit event, update rebuildable state/lot projections, audit/outbox/command result and origin ordering. No generic state setter, quantity-only issue or negative override. The whole explicit selection is accepted or rejected. No external call inside a transaction. Origin-first/current actor fencing and deterministic unit/lot locks remain. Retry replays without another movement; competing checkout/BAD requests cannot both consume one available state.

## Engineering implementation plan

Use a separate immutable damage command/root plus exact damage line for each unit, referencing its original checkout line when P, or original intake when U. Store source state, prior event/version, snapshot, reporter, meaningful cause/description and server acceptance timestamp. BAD record UUID is authoritative; display its full saved UUID rather than inventing an unapproved human-code allocation policy. Database completeness must prove exact command/transaction/event/line/lot/actor linkage, current eligible state and O6 authority. Preserve all existing applied migrations; add new migration(s), isolated fixtures only.

Manager review is append-only evidence linked to the exact BAD/intake unit. B04 mapping is now owner-confirmed: Held/Reworked remain D and unavailable; Discarded/Returned move D to X with immutable exact movement/event. Rework is never implicit recovery. Production cannot access other staff damage administration, supplier/invoice data, damaged-stock history/totals or Manager review remarks. A Production report response contains only its exact saved report and permitted identity/status.

## Pending recovery and correction requests

Per O5, Inventory Manager may submit validated supporting evidence and requested outcome; Admin/Manager can inspect immutable pending history. Submission records no stock movement or unit state update. No approve/execute endpoint, local Admin fallback, manually trusted authorization import or substitute cloud mechanism. UI states pending cloud authorization and stock unchanged. Exact damaged units may be requested for recovery; correction requests preserve discrepancies and factual intended adjustment without fabricating units/history. Cloud delivery/execution is a future dependency. Closing blockers later derive certification necessity from underlying discrepancy/evidence, never an arbitrary client nonblocking flag.

## UI and verification

Role-aware BAD workspace uses six-character entry/DYI:2 scan, exact identity/state preview, saved draft, explicit review/confirm, retry key retention, accepted report and paginated history. Manager review and pending requests are separate from reporting. Reuse camera cleanup, tracking drawer, page headers, tables and accessible confirmation. No mandatory print-outcome step.

Verify all O6 role/origin cases, own versus other checkout, U/P to D and unchanged U after issued damage, intake lineage, no repeated/late/ineligible damage, competing requests, replay/conflict/lost response, complete rollback, database graph/census/immutability/orphan guards, Production DTO exclusions, pending requests with zero stock effects, existing catalogue/receiving/checkout/QR/print regressions, five responsive widths, typecheck and build. Rehearse migration on populated synthetic legacy/native/issued fixtures with prior-field fingerprints. Operational installation and historical enrollment remain unauthorized.
