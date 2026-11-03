# Inventory ledger specification

## Phase1 code assignment remains metadata

New receiving Lot Code allocation is inside the existing atomic receipt transaction and adds no movement beyond approved E→U/D. Deferred mapping guards fail receipt acceptance if omitted. Historical Product/Lot code assignment appends sidecars and identity.backfill command/audit/outbox only; general origin order may advance while all7 stock tables/old receiving command rows remain unchanged. V1 QR bytes/legacy print snapshots remain unchanged. No unit serialization, new stock states or receiving-limit changes are enabled.


Brick 0 review draft, 2 November 2026. CONFIRMED rules derive from PRD §4–5, §10 and §15 and AGENTS.md. The representation, locking and equations below are PROPOSED engineering. OPEN state policies are explicitly gated; no stock engine is implemented.

## Identity and event contract

CONFIRMED: stock is attributable to immutable supplier/source/product/variant SKU and batch. Each confirmed issue line retains worker, exact lot, quantity and optional manually entered unverified order reference. QR identity is shared by identical SKU/batch units; it proves no unique-unit history. A worker must select the exact prior issue for production damage. Received batches and movements are never silently edited.

PROPOSED: ledger uses immutable positive-quantity transfers per `(sku_id,batch_id)` lot with `from_state`, `to_state` and transaction metadata. Each movement implicitly contains an equal debit and credit; no balance-setting event exists. A transaction groups reviewed lines and audit/outbox writes atomically. Record immutable event/command IDs, origin/authority/committed sequence, actor/role snapshot, recorded and effective business times, reason, source document/line IDs, reference snapshot and reversal/approval links. Client timestamps never decide ordering or approval authority.

## States and transitions

PROPOSED accounting states: U usable, P in-production, D damaged on hand, C completed/consumed, X externally removed, E external boundary. U/P/D are on-site tracked states; C and X are cumulative terminal accounting states, not available stock. E is a balancing boundary, not a shelf balance. PRD requires the corresponding usable/production/damaged/completed/removed accounting categories; the exact completion/disposition mapping is OPEN B03/B04.

| Action | CONFIRMED effect | PROPOSED transfer and guard |
| --- | --- | --- |
| Receipt | Usable increases on accepted submission | E → U, quantity >0, authorized receiver; all variant lines commit together |
| Production issue | Usable decreases and in-production increases | U → P; each exact lot has enough U; issue source projection created |
| Damage after issue | P decreases, D increases; usable unchanged | P → D, exact issue selection and remaining eligible quantity locked; cause and explanation mandatory |
| Intake/storage damage | Usable transfers to damaged with cause and batch | U → D; Manager intake path OPEN O3; receipt quantity inclusion must be approved; no double receipt |
| Held damage | Outcome record retained | Classification event, no balance movement; remaining D stays D |
| Discard/return to supplier | Outcome recorded as state change | D → X proposed, cannot recover X directly; B04 approval required |
| Reworked damage | Outcome recorded | Keep D until approved recovery proposed; B04 unresolved |
| Recovery | Manager requests, Admin approves damaged-to-usable | D → U once per approved request; lock available BAD quantity and reject stale/excess application |
| Production completion | Manager attestation; no second usable deduction | P → C for selected remaining issue quantities proposed; scope/partial completion/late damage OPEN B03/O8 |
| Reconciliation/reference correction | New classification/history, issued quantity unchanged | Zero movement; append metadata event linked to original issue |
| Physical count | Independent accuracy check | Observation/discrepancy only; approved correction needed to alter stock |
| Approved addition/reduction | Original history preserved and specific Admin authorization required | E → approved target state or source state → E; exact plan/request hash; not a generic balance edit |
| Print/reprint or sync replay | No new inventory | No stock movement; audit/print/transport events only |

Routine negative U is prohibited (CONFIRMED). PROPOSED also prohibit negative P/D and over-consuming an issue or BAD record. PRD §10 mentions exceptional Admin-authorized negative stock; OPEN B06 recommends keeping V1 nonnegative and requiring a documented discrepancy adjustment before a later issue. Never implement an exception bypass silently.

## Balancing equations

For each lot L and state s, PROPOSED:

```text
balance(L,s,cutoff) = sum(q for accepted movements to s through cutoff)
                      - sum(q for accepted movements from s through cutoff)
sum(delta over E,U,P,D,C,X for each movement) = 0
R + A = U + P + D + C + X + Z
```

R is net accepted receipts, A authorized external additions and Z authorized external reductions, including applicable compensating transfers consistently. Returns/discards belong in X, not also Z. Reversed receipts reduce net R; reversed completion/disposition reverses the corresponding terminal balance only if approved and eligible. All opening inventory must enter through an explicit approved external movement. There is no unexplained initial balance term.

Example: Red receipt 30; issue 2 yields U28/P2; damage one yields U28/P1/D1; approved recovery one yields U29/P1/D0. Proposed completion of remaining P1 yields U29/C1. Equation remains 30 at every stage; usable never loses a second unit from damage or completion. Brown/supplier-2 Red lots are unaffected.

Projection totals equal accepted ledger sums at the same committed cutoff. Per-issue remaining P must also match its attributed transfers; lot total alone cannot prevent damaging another worker's issue twice. Per-BAD remaining D similarly subtracts disposition/recovery/reversal quantities. Summing several SKU/batches is a report, never permission to deduct one source because another has spare stock.

Internal conservation does not prove physical accuracy (CONFIRMED §11). Compare independent counts against the ledger at a captured cutoff, accounting for movements during counting. Document unexplained shortages/missing labels/unscanned moves; never force the count to equal the ledger.

## Corrections and reversal rules

CONFIRMED: Manager requests and Admin approves a correction/recovery; no self-approval, historical update/delete or silent receipt quantity edits. Wrong order references use audited reassignment; quantity changes use approved stock compensation. Original business identities remain traceable after renames.

PROPOSED: an approval authorizes an immutable exact movement plan, bound to request version/hash, source event IDs and quantities. Changing a request creates a new version requiring new decision. Apply decision and stock plan once in the same local transaction; unique request/decision application IDs prevent replay. Rejection records history with zero stock effect. Stale decision or insufficient eligible source stock records failed application for review, never success or a silent altered quantity. Remote decision alone is not ledger effect.

PROPOSED: a reversal is a new inverse transfer with `reverses_movement_id`; record full or partial quantity and ensure cumulative reversals do not exceed eligible original quantity. Lock original attribution and relevant balance rows. A corrected replacement is a separate linked movement in the same approved transaction where feasible. Inverse effects must obey current eligibility/nonnegative constraints. If later movements depend on the original (issued receipt, damaged issue, consumed production), reject a naive reversal and require an explicitly approved compensating plan over those dependencies. Do not cascade by deleting history or manufacture a fake return to usable.

Metadata corrections retain old and new attribution with actor/reason and link to original event; historical report snapshots retain what was certified. Correcting a reference cannot claim verification by Google Sheets. Superseding identity is a new immutable entity/mapping; stock transfer between incorrectly attributed lots requires approval and matched compensation, not an FK update.

## Atomicity and concurrency

PROPOSED command sequence: authenticate/authorize → validate contract → begin transaction → lock idempotency record/authority stream and affected lots, issue/BAD records and request IDs in deterministic order → recheck eligibility → write domain records, movements, balances, audit and outbox → save response → commit. Use explicit PostgreSQL row locks plus constraints, or a measured serializable strategy with bounded retries. No read-then-write balance operation outside transaction. Nonexistent balance rows need safe upsert/locking before comparison. Deadlocks/serialization retries reuse the original idempotency key; exhausted retries return a retryable conflict without partial mutation.

| Race/failure | Required result and planned evidence |
| --- | --- |
| Two users issue last usable unit | Exactly one accepted; other insufficient-stock conflict; U never negative (AT22) |
| Multi-line receipt/issue has one invalid or insufficient line | No line, movement, balance or accepted outbox fragment persists; agreed atomic issue group is PROPOSED (AT01/22) |
| Same key same request in parallel | One accepted command; both see same result; different hash conflicts (AT09/22) |
| Same QR deliberately scanned twice | Two explicit confirmations/new command IDs count twice; QR debounce never discards intended issue (AT09) |
| Damage and completion compete for same issue quantity | Serialized attribution; total P consumption never exceeds available issue quantity (AT10/13/22) |
| Two damage reports on same issue | Lock source availability; cumulative quantity bounded (AT10/22) |
| Recovery and disposition compete for BAD remainder | Only eligible quantities succeed; no doubled recovery or lost damage (AT11/22) |
| Cloud approval replay/stale request | One applied effect or explicit stale rejection; no unsafe approval rebase (AT11/16) |
| Commit succeeds but response/ack lost | Same response/effect on retry; durable outbox replay; no extra movements (AT09/16) |
| Close versus receipt, classification or approval | Serialized close boundary and blocker recheck; event belongs wholly before cutoff or is distinctly post-close (AT14/22) |
| Restore/duplicate sync/out-of-order envelope | Reconcile original origin IDs/contiguous cursor, dependencies and group atomicity; no duplicate accepted effect (AT16/18) |

## Day closing and immutability

CONFIRMED §5.6: locally known blockers resolved, targeted counts for suspicious differences/samples, Manager certification, uniquely numbered immutable report including balances/movements/resolutions/discrepancies/actor/data-as-of; internet outage alone proposed nonblocking pending O4; local close pending cloud acknowledgement; later entries distinct and original preserved.

PROPOSED: close transaction obtains per-business-day/authority boundary lock shared by relevant stock and exception writes, rechecks readiness and records committed cutoff. Snapshot includes immutable opening/closing state balances per lot, exact included movement IDs, exception resolution/count evidence, relevant identity display snapshots, certification and digest/render version. Opening derives from prior cutoff plus separately identified intervening late entries, not merely previous calendar report totals. A repeated close command returns original report; alternate reclose is disallowed pending approved policy. Replication acknowledgement is appended separately and never mutates certified snapshot content.

PROPOSED: later events carry their actual recorded sequence and business date, and query-linked post-close status derived against immutable cutoff. A new report supplement may reference the original if authorized; never rewrite old balances or silently backdate into its event set. Business calendar, necessary pending-approval blockers, tolerances, completion backlog and authorized correction treatment remain OPEN O4/B05.


## Receiving design review refinement

See `receiving-ledger-design.md` for the current minimal additive schema proposal, database completeness/provenance constraints, transaction and projection reconciliation rules, acceptance matrix and approval gates. The original ledger states and later-workflow semantics above remain proposals unless explicitly confirmed. No ledger schema/movement API exists yet; Task 3 is not authorized by this document.


## Approved receiving ledger implementation

The 2 November 2026 Task 3 authorization supersedes earlier O3/B02/B06 proposals: multi-product one-source immutable batches; distinct usable/damaged intake with E→U and E→D positive parts; generated totals; all internal balances nonnegative including Admin; no E balance. Deferred SQL checks enforce exact receipt/lot/source/movement quantities and projection equality. History edits/deletes and batch supplementation are rejected. Later production, damage lifecycle, recovery, reversals and closing remain disabled, not approved by reserving states. See receiving-ledger-design.md for implemented details.


## Labels do not affect inventory

QR resolution/manual lookup are reads, with no CommandResult/audit/outbox writes. Label job/artifact/attempt writes append separate print metadata with audit/outbox; the general origin stream advances but every receipt/batch/lot/stock-transaction/movement/balance row remains unchanged. Printing, cancellation, reprinting and uncertain physical output never require a compensating stock event. Shared usable/damaged lot QR does not prove an individual unit is usable. See Brick5B isolation evidence in qr-label-implementation-report.md.
