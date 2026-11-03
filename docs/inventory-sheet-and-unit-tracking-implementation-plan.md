# Inventory sheet, stock overview and individual-unit experience

Status: **Slices 1–3 authorized for implementation. Later slices remain gated.** 3 November 2026.

Owner correction: six-character Unit Codes without a fixed U prefix supersede U+7. Secure email invitations are the approved future direction; no invitation implementation or password-policy change is authorized in Slices 1–3. See six-character-unit-code-design.md and staff-invitation-design.md. Original review wording below is historical except where superseded by this authorization.

This document responds to the five supplied screenshots and owner feedback. The owner subsequently authorized implementation of Slices 1–3 only. Security-policy changes, serialization, invitations, migrations and later slices remain gated.

## 1. Product direction and evidence

Dayari's primary surface should be a practical inventory sheet: what products remain, which variants and supplier SKUs they belong to, where they came from, and eventually which exact physical unit is being handled. Catalogue administration and technical explanations should support that work without dominating it.

Reviewed: AGENTS.md, START_HERE.md, the complete root `Dayari_Inventory_PRD_v1_2_Comprehensive.docx` (the docs/ path is stale), implementation bricks, decisions, ledger invariants, Phase 1 and Phase B implementation reports, the existing unit-traceability design, Prisma schema, account contracts, AppShell/CSS, dashboard, inventory and label components. Screenshots show an Inventory Manager session; Manager improvements must remain within operational permissions. This review did not change or test application behavior.

| Finding | Current implementation | Planned correction |
| --- | --- | --- |
| Sidebar requires scrolling | Large shop-context/footer blocks, all destinations at equal prominence, fixed-height navigation scroll region | Compact grouped navigation, secondary destinations in account/more menus; no normal desktop sidebar scroll |
| Stock overview lacks quantities | Catalogue counts and large receiving guidance precede stock information | Product availability sheet first, variant/SKU drilldown, stock attention and recent receipts secondary |
| Inventory cards repeat context | `inventory-workspace.tsx` uses stock-grid cards with product/lot missing-code messages, batch, source and badges repeated | Compact rectangular rows with details in a right drawer/full-screen mobile dialog |
| Print preview is a document viewer | `labels/label-workspace.tsx` embeds PDF, requires PDF-part preparation | Individual label components in the page, a review cart and one explicit Print action |
| Staff provisioning needs handover | Admin supplies initial password; no email delivery system; contract requires 16 characters | Email notification/invitation design plus explicit password-policy revision |
| Unique units are absent | Product/Lot sidecars exist; no StockUnit, U Code, DYI:2 or unit events | Separately gated serialized-receiving slice based on existing approved design direction |

### Requirement status

**CONFIRMED requested direction:** compact non-scrolling navigation; rectangular inventory rows and drawer/modal details; stock-focused overview; individual inline QR label previews/cart and device print dialog; email on staff creation; a six-character password minimum requested instead of 16; each physical item independently identified. Supplier provenance via saved SKU remains essential.

**IMPLEMENTED baseline:** shared parent products, attribute variants, supplier-specific SKUs, immutable accepted receipts/lot ledger, U/D balances, P+5/L+5 identities for new records, DYI:1 lot lookup, lot-level print/reprint evidence, shop-scoped staff administration and sessions.

**APPROVED DESIGN, NOT IMPLEMENTED:** existing A01–A08 direction for six-character Unit Codes codes, serialized receiving, DYI:2, historical onboarding, exact-unit print manifests and native printing. The latest request reiterates the requirement but explicitly asks for this document before work. It does not activate those phases.

**OPEN:** invitation expiry/provider/URL and existing-account details (secure invitation direction is confirmed), password policy for that future slice, low-stock thresholds, serialized capacity/cutover, historical enrollment execution and physical label/printer acceptance. Proposed choices below are not silently approved.

## 2. Navigation and shared layout

Proposed primary navigation: Overview, Inventory, Receiving, Catalogue, Suppliers, Labels, Scan. Put receipt history inside Receiving with a direct tab/deep link; keep Reports as an Overview link. Users & access is Admin-only in an Administration/account menu; account/security/help/sign-out live in the account menu. Existing URLs/deep links remain valid and select the correct area. Production receives only its authorized usable inventory/scan/account navigation.

Remove the tall shop-service card and repeated ledger disclaimer from navigation. Use a compact shop/status line and 40–44px navigation targets. Keep the signed-in account and sign-out available. The connection indicator must reflect actual service state; it must not promise cloud synchronization.

No independent sidebar scrolling at normal desktop sizes. When height, browser zoom or text enlargement cannot fit the menu, switch to the compact menu/drawer rather than hiding links or shrinking targets indefinitely. Mobile navigation opens on demand; long mobile menus may scroll for accessibility. Test all destinations at 200% zoom and short landscape heights. Do not merely set overflow:hidden and clip controls.

Use one page heading, one main action, compact filters and restrained emerald/cream styling. Technical explanations move into contextual help. Keep meaningful status/error wording and retry controls. Search/filter state and scroll position survive drawer open/close and return navigation; populated mutation drafts still require discard confirmation.

## 3. Overview: answer what is left

The first viewport should contain a stock heading, freshness time, search, Receive delivery action and product quantity rows. Receiving instructions become optional help. Catalogue counts move out of the primary summary.

Proposed summary strip: products with usable availability, tracked variants at zero usable, damaged-stock attention and recent accepted deliveries for an explicitly selected acceptance period. These are record counts with defined scope, not a fabricated cross-product quantity total.

Main sheet:

| Product | Variant availability | Usable | Damaged | Attention | Last received |
| --- | --- | --- | --- | --- | --- |
| Notebook · Product Code where assigned | Red, Brown… expandable | Per compatible counting basis | Separate | Out / low / not configured | Accepted timestamp |

Values come from origin-scoped server projections at one consistent read snapshot. Decimal-string BIGINT quantities remain exact. Product summaries can combine supplier SKUs/batches of the same compatible variant while retaining drilldown provenance; supplier-specific availability is never erased. A parent total is shown only if its variants share an explicitly known counting basis. If that compatibility cannot be established from existing data, show variant quantities instead of guessing a common unit. Do not total notebooks, milk and pens into one stock number.

Include configured variants with no receipt, not only existing stock lots. Distinguish **Never received**, **Out of stock (usable=0 after intake)**, **In stock** and **Low stock**. Damaged quantities do not make a variant available. No negative state is permitted.

Low stock is a threshold comparison, not a prediction of order shortage. **PROPOSED:** Admin sets a reorder threshold per variant, compared with usable stock across that variant's supplier SKUs at this shop; equality counts as low. No configured threshold means **Not configured**, not an invented default. Supplier-specific thresholds and purchasing automation are out of scope. Owner must approve scope/comparison/authority before the configuration mutation is implemented. Until then, ship zero-stock attention only and avoid calling arbitrary quantities low.

Current quantities reflect recorded movements; because issuing is not implemented, physical removal is not yet captured. Show this limitation in help/attention without claiming shelf counts are verified. No demand-based shortage or purchase forecast is implied.

Recent receipts show factual delivery date separately from acceptance time. Selecting one opens immutable receipt details. Date-filtered intake quantities must come from receipt evidence, never be inferred from current balances. An all-time view must not be computed from the existing latest-100 history alone.

## 4. Inventory: rectangular list and detail drawer

Default to compact variant/SKU balance rows; offer Products and Delivery lots as explicit grouping options. Each grouping states its quantity scope. Filters: search, product/variant, supplier/source, usable/out/damaged and batch where applicable. Move less-used filters into a compact Filter panel.

Desktop SKU rows: **Product / variant | exact saved SKU | supplier/source | usable | damaged | Details**. Lot rows additionally show **Lot Code (if assigned) / batch**. Product rows expand into variants and supplier SKUs. Quantities are right aligned; zero damage is quiet text rather than a warning badge. Do not repeat missing Product and Lot Code messages in every row; omit absent alternate codes and explain historical mapping status once in details.

Mobile remains a single-column rectangular list, showing name/variant, saved SKU and usable/damaged quantities. Hide secondary provenance in Details, not in inaccessible clipped columns. No multi-column card grid.

Details opens a right drawer on desktop/full-screen dialog on mobile, never an off-screen panel below the entire list. Header identifies exact selected product/variant/SKU/lot. Sections disclose product and optional public codes, source, batch and dates, U/D balances, accepted receipt and permitted movements. Future Units tab is enabled only for implemented serialization and explicitly shows legacy coverage. No edit-stock control.

Use a real Details button, support Enter/Escape, focus trap/return, accessible dialog title and cancellable loading. Switching records cancels stale requests and cannot show the previous lot as current. Close preserves filters/page. Deep links to lot/receipt retain return context. Production uses a separate safe DTO and never gets damaged/invoice/audit/print administration in hidden drawer fields.

### Read model changes

Existing stock reads are unbounded and current filtering/paging is browser-side. Propose bounded server-side list/summary endpoints (for example `GET /v1/stock/summary`, `GET /v1/stock/rows?group=sku&page=1`, exact lot detail using the existing route). Final names follow repository conventions; these endpoints do not exist yet. Strict filter contracts, stable sorting/tie-breaking, origin filtering and role-specific DTOs are mandatory. Registered-variant zero rows require a catalogue LEFT JOIN rather than positive-stock-only availability. Compute page/count/summary at a consistent snapshot; summarize the full authorized filter, not just the visible page. No full future fuzzy-search platform is required.

## 5. Labels: select → review inline → print → record outcome

1. Open Labels directly or from an accepted receipt/selected eligible inventory.
2. Add eligible lines to a draft cart, grouped by product/variant and lot. Keep exact SKU/batch visible.
3. Show actual individual rectangular label components as part of the page: scannable QR on the left, product/variant and human-readable identifiers on the right. Browse previous/next, search or paginate large sets; display position and total. Preview one identity per label, not an A4 sheet or PDF viewer. Repeated legacy lot copies must be explicitly marked shared lot identities.
4. Review selection, quantities and separate damaged-intake labels; remove/correct draft selection before acceptance. A sticky summary contains label count and Print. Do not require selecting a PDF part in the ordinary workflow.
5. Finalize an immutable authorized manifest idempotently, prepare pinned local assets, then trigger the browser's normal device-print dialog from an explicit user action. If asynchronous preparation requires a second click for browser behavior, label it Print now; never silently lose the click.
6. Return to operator-reported printed/partially printed/failed/uncertain outcome. Offer PDF download as fallback, not the main interface. Reprinting uses saved identities and a reason.

The on-page label preview is independent of paper geometry. Print-only HTML uses an approved physical profile and genuine QR encoding/local fonts. Retain the existing A4 trial geometry as a trial profile, not certification of adhesive media/thermal hardware. No silent printing, device selection control or thermal driver integration is assumed. Scan-test representative physical output before production acceptance.

Print dialog return/afterprint cannot certify ink, paper, success or cancellation. A prepared job is not a successful print. On lost response retain manifest/attempt keys and show uncertain; do not automatically hand off another print. Before repeat handoff, review previous output and warn of duplicate stickers. For units, partial outcomes identify exact unit membership; quantity-only partial reports remain uncertain until resolved. Selective reprints never allocate replacement Unit Codes. Destroy/segregate duplicate stickers under an operator process; software cannot prove which physical object received a sticker.

### Compatibility and evidence

Keep historical DYI:1 payloads, lot jobs/lines/events, renderer/profile versions, hashes and downloadable PDFs unchanged. Existing initial-job completeness/reprint rules cannot be bypassed by a new arbitrary cart. A legacy UI-only pass can preview current accepted manifests and simplify navigation; changing selection/native artifact semantics requires an additive, versioned print-evidence slice.

Exact-unit cart follows the already reviewed UnitLabelJob/Line/Event design, with immutable ordered unit membership, original-line reprint references, initial-label claims and HTML representation/assets hashes. PDF bytes have their own hash; do not claim PDF evidence proves browser output. Scope new native jobs to the approved new representation, preserve old renderers and explicit legacy reprints. Proposed policy needing confirmation: no new legacy initial manifests for newly serialized lots; retained old-job reprint stays available with a clear shared-identity warning. Printing creates zero stock movements and zero units.

## 6. Unique physical units: serialization slice

The owner's example is the intended model: Milk is shared Product `P7K2M9`; one exact SKU/batch lot has `L8M4Q2`; each carton has its own `A7K2M9`-style identity. A delivery batch can contain many products/variants and therefore many lots: Lot Code is not an alias for the entire multi-product delivery batch. Fifty cartons of one SKU in one batch create one lot and 50 distinct units, not 50 products or 50 lots.

Retain approved alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, P+5/L+5/six-character Unit Codes, immutable UUID authority and origin-scoped uniqueness. Allocation uses secure randomness, bounded collision retries/database uniqueness; no recycling/renumbering. Same short code at another independent shop is disambiguated by origin, not silently merged.

Reuse the existing design's additive SerializationCutover, LotSerialization, StockUnit, UnitEvent, UnitState and bounded command manifests. Initial usable/damaged condition is immutable provenance; current state is a rebuildable projection. Receiving is the only native unit-creation path in this slice. UUID/lot/source/SKU/batch are resolved server-side. DYI:2 carries origin+unit UUID; unchanged DYI:1 identifies only its lot and must never select a guessed unit.

For 50 cartons with 48 usable and 2 damaged, one accepted transaction creates exactly 50 units: 48 linked to E→U and two to E→D, matching unit events/states and stock balances. QR scans show the exact unit's current permitted details; scan itself changes no inventory. Damaged labels are unmistakable and never count toward usable availability.

### Atomicity and cutover

Under the existing origin-first locking, actor revalidation and command idempotency protocol, receipt/lines/lots/codes, movements/balances, all units/events/states, audit/outbox and saved result commit together. Internal insert chunks share the same transaction. Failure at any stage leaves no accepted stock or partial unit set. Same-key replay returns the original identities; a changed request conflicts. No background unit creation after receipt success.

Database deferred checks require units for every newly accepted receipt after an origin cutover. Old service binaries, compatibility endpoints and direct runtime-role SQL cannot commit quantity-only stock after activation. Guard derives policy from persisted cutover, not client dates/flags. Historical same-key replays return old results unchanged. Runtime roles cannot disable constraints or own migration DDL. Prove the full anti-bypass matrix from design §6.1 before activation.

For native lots and every enabled internal state: `unit count = ledger balance = stock projection`; external E has no units/balance. Ledger remains quantity authority, units provide exact membership, and mismatches fail rather than manufacturing adjustments. No direct UnitState or StockBalance editing endpoint.

10,000 units/receipt, 100 lines and 500-row inserts remain **provisional**, not certified limits. Benchmark 100/1,000/10,000 units, mixed U/D, competing commands, collisions, WAL/memory, lock waits, p50/p95/max and chunk/audit failure rollback on identified hardware. Review measured timeout headroom. Do not lower existing limits or auto-split a legitimate delivery without approved policy. Oversized drafts remain intact and require escalation; split-batch or staged-large-delivery acceptance needs separate approval.

### Existing inventory

Do not create units from historical received quantities: some may no longer physically exist. Preserve all accepted records, unassigned legacy coverage and V1 lookup. Rehearse historical onboarding on isolated restored fixtures. Operational enrollment needs explicit approval, independent physical counts, segregated counted items, immutable baseline assignment evidence and explicit discrepancy records. Stock stays unchanged; no fabricated receipt-time events, verified labels or history.

Missing historical P/L Codes shown in screenshots reflect deferred backfill, not permission to regenerate IDs. Code backfill and physical unit enrollment are different operations with separate approvals. Track traceability coverage separately from physical count discrepancies; complete software coverage is not proof of physical accuracy.

Issuing, production damage and recovery are future separately approved slices. They must eventually transfer exact unit membership with matching immutable quantity movements, never deduct usable twice. This proposal does not add these commands or a compulsory label-verification gate.

## 7. Staff email and password policy

The owner requests email after staff creation and minimum six-character passwords. These change the prior supervised-strong-password/no-mail baseline. Record the requested changes, but choose a concrete delivery/trust policy before implementation.

**Owner selected secure email invitations.** The notification-only alternative below is retained as review history, not the selected implementation. Invitation implementation is expressly excluded from Slices 1–3.

- **Notification only:** Admin still hands over the initial password privately. Email contains staff name, shop, role and safe login guidance; never the password or a reset secret. This does not verify email ownership or recover access.
- **APPROVED future onboarding direction:** Admin creates a pending invitation; email contains a high-entropy single-use, expiring setup link, staff sets their own password, then membership/login activates under approved policy. Token hash only is stored, used atomically; role/status changes revoke outstanding invitations. The direction is approved; implementation authorization and detailed expiry/resend/existing-account policy remain required. It is not an automatic password-reset feature.

Proposed invitation expiry: 24 hours; resending revokes prior tokens. Do not approve this by implication. Do not send passwords in email. Existing accounts/password hashes remain unchanged and no existing user is automatically emailed.

Provide owner-approved SMTP/provider identity, From address, verified sender domain and credential storage outside Git. Do not request credentials in chat. Shop account creation cannot depend on an external mail call inside its transaction. Use an origin-scoped email delivery queue with minimal private payload separate from publicly readable/synchronized inventory evidence. Account/invitation acceptance plus enqueue is atomic; the worker sends after commit and records pending/sent/failed/retry status. Use a stable message/provider key where supported; SMTP retries can still duplicate delivery, so links must remain single-use. Outage means Email pending, not fabricated success or lost staff creation. Admin sees status/resend controls, never tokens or passwords. Staff must reach a configured trusted application URL; a localhost link on their own device will not reach the shop server. Shop-LAN and internet access expectations must be agreed; no cloud hosting is inferred.

Six characters is the owner's requested minimum, not a claim of strong security. Current frontend/backend validation is 16; both need a coordinated policy update if approved. Password hashing, compulsory change for supervised initial passwords, current-password proof, session revocation, origin isolation and persistent login throttling remain. Clarify whether six applies to all roles or staff only, temporary versus permanent passwords, and whether an email invitation replaces initial-password handover. Do not silently weaken Admin passwords or implement an unapproved recovery mechanism. No existing password is truncated or reset.

## 8. Incremental implementation sequence and review gates

| Slice | Deliverables | Completion evidence / gate |
| --- | --- | --- |
| 1. Compact navigation | Shared shell, grouped destinations, account menu, old deep-link compatibility | Desktop no internal nav scroll at normal sizes; short-height/zoom accessible fallback; all role navigation tests |
| 2. Inventory list/detail | Server-paged stock rows, compact list, accessible drawer, exact provenance | Pagination/filter consistency, zero/never-received states, role DTO negative tests, drawer context/keyboard tests |
| 3. Stock overview | Product/variant quantities, zero-stock attention, recent receiving, freshness | Cross-supplier/batch sums reconcile, no incompatible totals; low-stock configuration only after policy approval |
| 4. Staff notification/onboarding | Approved password policy and chosen email mechanism, queue/status/retry UI | Security/activation policy review first; isolated mail transport tests; no operational account mutation for demos |
| 5. Unit serialization | Additive schema, unit allocator/events/state, atomic receiving, DYI:2 and exact lookup | Independent design/capacity review; anti-bypass and rollback proof; isolated migrations only before separate operational approval |
| 6. Inline label cart/native print | Reusable label components, exact-unit manifests/cart, device dialog, fallback/reprint outcomes | Legacy QR/PDF preservation, exact manifest decoding, partial/unknown/retry tests and separate physical trials |
| 7. Optional historical rollout | Approved P/L backfill and physical unit enrollment/discrepancy process | Separate operational authorization, restore rehearsal, counted pilot, no balance edits |

Slices 1–3 can ship without waiting for serialization. A limited inline preview of current lot manifests can ship earlier if expressly included; exact-unit printing depends on slice 5. Each implementation slice gets its own tests, reviewed diff, completion report and traceable commit/push under the established milestone policy. Do not treat approval of UI work as approval of migrations, cutover, email credentials or physical onboarding.

## 9. Acceptance and regression plan — not executed for this document

- At 320/390/768/1024/1440px, short landscape and 200% zoom: no clipped controls, accessible menu and visible primary actions. Normal desktop sidebar has no independent scrolling; fallback preserves every permitted destination.
- Inventory renders rectangular rows; Details opens the correct drawer, traps/returns focus, handles Escape/loading/error and preserves filter/page. Keyboard-only and screen-reader labels work.
- Product/variant/SKU/batch aggregations reconcile across multiple suppliers/lots; BIGINT remains exact; zero/never-received/damage-only and absent-code cases are truthful. Threshold rules tested only once approved.
- Production direct endpoints and responses deny supplier-private/invoice/damaged/audit/print-admin fields. Admin/Manager operational boundaries stay enforced server-side.
- Email tests cover offline queue, post-commit worker, retries, provider rejection, duplicate delivery, resend/deactivation and secret redaction; invite expiry/reuse only if that mechanism is approved. Account failure rolls back queue evidence. Password-policy tests cover UI/API, first login, revocation and abuse throttling.
- 50 cartons yield 50 distinct U Codes and UUIDs, exact U/D event and movement counts; subsequent delivery and second supplier retain independent lots/SKUs. Concurrent retries/collisions/changed-key requests and injected failures preserve atomicity.
- Old writer/direct-SQL bypass after cutover fails; backdating does not bypass; historical replay is unchanged; mismatched/foreign/malformed QR rejected. V1 never resolves a fabricated unique unit.
- Preview QR decodes to saved identity, selected/cart membership equals accepted manifest, assets load before print, repeated click/retry does not create jobs/stock/units twice. Partial/uncertain outcomes and selected reprint preserve original codes.
- Existing catalogue/variant extension, receiving/idempotency, ledger, identity, accounts/auth/RBAC and old QR/PDF/print evidence regressions; unit, PostgreSQL integration, browser, typecheck and production build. Mutation-heavy tests use isolated fixtures.
- Physical printer alignment/readability/scan trials use identified approved media/devices. Browser screenshots and print emulation cannot certify physical success. Benchmark results must name hardware/data/run count and actual timings.

## 10. Owner decisions before relevant implementation

| ID | Decision needed | Proposed path |
| --- | --- | --- |
| R01 | APPROVED: Slices 1–3 implementation | Deliver and stop; explicit later-slice authorization remains required |
| R02 | APPROVED: secure invitation direction; OPEN: reachable URL/provider/expiry/resend/existing-account details | Single-use invitation; 24h/resend invalidation proposed; no implementation in this task |
| R03 | Six-character policy scope and compensating controls | Owner confirms role and temporary/permanent scope; keep existing auth/session safeguards |
| R04 | What means short of stock? | Zero-stock now; optional Admin threshold per variant, usable <= threshold, no order-demand inference |
| R05 | Authorize serialization implementation, benchmark-backed limits and oversized deliveries | Reuse A01–A08 design; no operational cutover until proof and approval |
| R06 | Native/exact-unit label slice and legacy initial-job rule; physical profile acceptance | Inline cart primary; preserve old evidence; serialized lots use unit jobs; actual media/device trial |
| R07 | Existing-stock backfill/enrollment and invalid-baseline resolution | Separate counted rehearsal/pilot approval; preserve discrepancy evidence and ledger |

There is no architectural conflict between a compact inventory sheet, supplier SKU provenance and exact unit traceability. The important incompatibilities are operational: current lot labels cannot identify one unit; existing history cannot be relabelled as serialized receipt history; email activation differs from supervised passwords; and shortage alerts require an explicit threshold or demand definition. These are addressed through additive slices and named gates rather than rewriting accepted records.

## 11. Changes made in this review

The original review was documentation-only. Slices 1–3 are now authorized and tracked in inventory-experience-slices-1-3-report.md with actual code/test/publication evidence. No later-slice implementation or physical performance claim is implied.
