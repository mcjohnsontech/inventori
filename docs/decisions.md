# Decisions and approval register

## Approved Slices1–3 and six-character unit correction — 3 November2026

Owner authorizes implementation/verification and separate commit/push for compact navigation, inventory sheet/details drawer and stock-focused overview only. No operational migration/stock mutation, serialization, DYI:2, print redesign or invitation implementation. Existing roles, UUIDs, SKU/P/L codes, ledger, receipts and DYI:1 remain unchanged.

Owner corrects individual Unit Codes to exactly six readable alphanumeric characters, origin-scoped immutable uniqueness, no fixed U prefix, UUID primary authority. This supersedes previous U+7/eight-character proposals; see six-character-unit-code-design.md for constraints/capacity/collisions/contracts/search/label tests. Unit implementation/activation and historical enrollment remain gated.

Secure email invitations with employee-set password are approved future direction, not authorized implementation. Single-use token, expiry/revocation, private delivery, origin scoping/audit/security requirements are recorded in staff-invitation-design.md; provider/URL, expiry/reissue/existing-account policies remain open. No password minimum is changed in this task.


## Inventory-sheet and exact-unit UX review — 3 November 2026

**CONFIRMED requested direction, documentation-only assignment:** owner requests compact navigation without ordinary sidebar scrolling, rectangular inventory rows with modal/drawer details, product/variant quantity overview and stock attention, inline individual QR-label/cart previews with native printing, email after staff creation, a six-character password minimum instead of 16, and an independent identity for each physical item. Supplier-specific SKU provenance remains required. No implementation is authorized by this review request.

Implementation proposal and targeted gates R01–R07: [inventory-sheet-and-unit-tracking-implementation-plan.md](inventory-sheet-and-unit-tracking-implementation-plan.md). Existing A01–A08 unit architecture is reused, not reported implemented. StockUnit/DYI:2, serialized cutover, new print evidence, email activation/delivery, threshold configuration and operational onboarding remain gated. Email mechanism/provider/reachable URL, password-policy role/temporary scope, reorder threshold semantics, capacity/oversized deliveries and legacy/native print eligibility require concrete review. No stock issuing, damage recovery, closing or cloud transport is authorized.

**Subsequent local account upgrade already separately approved/executed:** owner authorized migrations009/010 and enrollment of existing active Admin admin@dayari.test at origin11111111-1111-4111-8111-111111111111. Private consistent data/schema backup captured before upgrade; all32 original data-table datasets compared unchanged afterward (migration metadata excepted), approved membership inserted and API health/auth proxy verified. Password hash preserved. This supersedes the isolated-only restriction for those specific local changes only; no general account enrollment, historical identity/unit backfill or production deployment approval. Private evidence remains under ignored .local/phase-b-upgrade.

## Phase B account policies — approved 3 November 2026

Owner explicitly approved the three targeted account questions: SHOP Admin manages staff assigned to that shop, existing three roles only, transactional/audited commands, no cloud account writes; block self-demotion/self-deactivation and removal of last active Admin. Supervised Admin-supplied strong initial password requires first-login change; password/role/status changes revoke all sessions. Admin reset/email/SMS recovery remains deferred. Explicit membership isolates accounts; unmapped accounts gain no automatic access. Additive migration and enrollment exercised only on isolated fixtures; operational account mapping/migration remains separately gated. This resolves O5/B09 only for the local account-management scope; stock approvals, cloud revocation/sync and recovery authority remain open. See complete-application-implementation-plan.md and application-permissions.md.

## Local schema upgrade authorization —3 November2026

Owner explicitly approved migrations007/008 to resolve the running local app/database mismatch. Applied together with the API paused, verified all30 existing tables unchanged, empty identity sidecars/no backfill and consistent ledger, then restarted API and verified authenticated local routes200. This supersedes the prior operational-migration restriction for this local schema upgrade only. No production deployment/backfill/Phase2 authorization. See local-phase-1-upgrade.md.


## Phase1 implementation authorization and isolated delivery —3 November2026

Owner explicitly authorized finalized section17. ProductPublicIdentity/LotPublicIdentity sidecars, P+5/L+5 secure origin-scoped allocation, new-subject database mapping guards, exact minimal lookup/UI and isolated-only backfill rehearsal are implemented. Migrations007/008 were applied only to dayari_test; no operational migration/backfill/deployment. No U+7, StockUnit, DYI:2 or serialized cutover enabled. Existing receiving limits remain unchanged. See phase-1-implementation-report.md for actual verification and known failure corrections. This supersedes earlier A09 pending wording for Phase1 only; later phases remain gated.


## Owner clarification revision — human identities, units and label UX

Owner accepts the architectural direction and retains P+5/L+5/U+7 immutable origin-scoped codes, additive unit identity/serialized receiving and DYI:2 alongside unchanged DYI:1. A03 role allowlists, controlled historical onboarding design (no real-data execution), exact-unit/native printing/PDF fallback, optional Admin/Manager verification and individual React-label checkout previews are approved design directions. Do not treat sensitive supplier/invoice/damage-history/audit/print-admin fields as Production search data.

A04 quantities/lines/chunks are provisional benchmark candidates, not tested performance. The revised design sections6.1/6.2 require database-enforced anti-bypass proof before serialization cutover, atomicity and explicit escalation for oversized deliveries. Section7 retains physical discrepancy evidence independently of unassigned coverage; section9.1 handles exact partial/unknown output and duplicate stickers without creating units. Hardware, invalid-baseline resolution and operational recovery remain later gates.

**A09: Phase1 implementation remains NOT AUTHORIZED.** The finalized scope is [design section17](unit-traceability-and-label-ux-design.md#17-finalized-phase-1-scope--explicitly-authorized-for-isolated-implementation): Product/Lot mappings/all-path allocation, exact origin-qualified lookup/display, isolated backfill tooling/rehearsal and regression evidence only. No StockUnit/cutover/search-engine/print redesign in Phase1; no real-data backfill/deployment. Earlier unchecked Phase0 proposals below are historical; the revised checklist controls. This revision is documentation-only.


## Unit traceability and label UX — Phase 0 review, 3 November 2026

The owner requested individual-unit identities, short Product/Lot/Unit codes, intelligent discovery and a checkout-style native printing experience. **Only audit/design/migration planning is authorized.** This reopens O1/C03 and requires a PRD amendment before implementing serialization; prior V1 lot QR semantics and evidence remain protected.

PROPOSED choices and approval checklist A01–A09 are in [unit-traceability-and-label-ux-design.md](unit-traceability-and-label-ux-design.md): origin-scoped six/eight-character codes; additive identity/unit/event model and deterministic DYI:2; authoritative quantity-ledger reconciliation; controlled historical onboarding without artificial stock; explicit receiving limits; Production discovery allowlists; exact-unit manifests/cart/native HTML printing with PDF fallback; optional attachment verification; incremental phase gates. These are **not approved allocations, permissions, migration policies or hardware commitments**. No application/schema/dependency/migration/data changes were made. Stop for design review; real-data migration and deployment require separate approval.

## Approved local-development implementation — 3 November 2026

Owner approved Q01–Q08 and superseded design-only instructions. Implement DYI:1 deterministic 71-byte origin/lot payload; strict authenticated local lookup; Admin/Manager label administration and Production minimal read-only availability lookup with exact manual fallback. No stock mutation from labels/lookup.

Approved software trial profile A4 210×297 mm, cells70×35 mm, 3×7, horizontal margins/gutters zero; vertical margins26 mm each, no vertical gaps. Essential content inset within each cell to protect ordinary non-borderless printers. This is ordinary-paper cut-and-attach trial geometry, not certification of an adhesive sheet or printer. Full origin remains in manifest/QR, not forced onto label. Actual-size PDF printing only; no thermal/native/silent adapters.

Label every delivered unit: usable and visibly marked DAMAGED INTAKE — NOT FOR PRODUCTION, same lot QR. One initial full-receipt manifest; PDF chunks at most500 labels, stable offsets. Explicit selected-purpose reprints require original job, positive bounded count and meaningful reason. Append-only jobs/lines/events use existing origin/command/audit/outbox transactions; rendering/physical print outside locks. Unknown output never automatically reprints. Camera HID/manual lookup are identification only; camera LAN HTTPS/trust and actual device/printer testing remain physical acceptance gates. Retention duration and production physical sign-off remain deployment decisions, not local implementation blockers.


Historical design/review record below; conflicting proposals are superseded by the approval above.

## Brick 5B Phase 1 — QR/label review, 2 November 2026

CONFIRMED authorization is design/hardware review only. Brick 4 + 5A is provisionally accepted based on its report, not physically reverified by this task. No QR implementation, migration, printing or stock change is authorized yet.

`qr-label-design.md` proposes a deterministic DYI:1 origin/StockLot reference, receipt-derived per-item label counts, separate immutable print evidence and authenticated read-only lookup. These are PROPOSED choices; existing stock identities and ledger remain unchanged.

OPEN Q01–Q08 in that design require review: opaque text versus tap-to-open interaction; printer/media dimensions and placement; damaged-intake counts/marking/quarantine; print/reprint/lookup permissions including Production and manual fallback; initial manifest/chunk/reprint/uncertain-output process; browser versus specific thermal adapter; actual 2D scanners/camera HTTPS; physical QA thresholds and retention. O2/O7 remain open. No proposal is an approved identity, permission or hardware policy. Stop for owner review before implementation.

## Approved receiving authorization — 2 November 2026

Owner authorized Brick 4 ledger + Brick 5A receiving. This section supersedes conflicting proposals below. One immutable batch per delivery, exactly one supplier/source, multiple products/variants permitted; no batch reopening/supplementation. Each distinct SKU line has nonnegative usable/damaged integers, positive derived total and a meaningful damaged-arrival explanation. Positive parts create E→U / E→D in the same lot, with no zero movement. Admin/Manager may receive and view operational U/D quantities; Production denied; catalogue permissions unchanged. All internal states nonnegative for every role, no E projection or Admin override. Africa/Lagos is the business timezone; deliveredOn is factual DATE, recordedAt server acceptance time, originSequence acceptance order. QR, production, corrections, closing and sync transport remain excluded.

Engineering allocation: number batches per origin and Lagos **acceptance** date, under the existing OriginNode lock. Count the last immutable dailyOrdinal +1; failed transactions consume no number. Public code B-YYYYMMDD-NNNN pads to at least four digits and expands after 9999 (10000). Unique (originId,numberedOn,dailyOrdinal) and (originId,publicCode). Public codes are intentionally origin-scoped; global display identity is (origin UUID, publicCode), returned together. Independent origins may share readable codes; UUID batch IDs are globally immutable identity. No parsing for relationships. No eighth counter table is needed.

Validation: Gregorian deliveredOn 0001-01-01 through current Lagos date, no historical closing cutoff; future delivery dates rejected as not-yet-delivered. 1..100 distinct lines; each quantity 0..2147483647 with sum >0; damage reason trimmed 10..2000 characters with at least one letter. Totals derived server-side; client total rejected. Accepted timestamps and code date assigned after origin lock. Existing catalogue has no inactive flags, so foreign/missing identities are rejected without inventing catalogue deactivation semantics.

Implementation adjustment: ReceiptLine has usableQuantity, damagedQuantity, generated database totalQuantity; movements unique per (receiptLineId,toState), exact E→U/D reconciliation, deferred full-group and projection checks. Seven tables only. Database provenance uses explicit foreign keys plus deferred joins to immutable SKU/sourcing/source relationships. Supplement inserts into accepted batches are prohibited by same-database-transaction creation guards. Reversals/corrections remain disabled until future domain migrations.


Brick 0 review draft, 2 November 2026. CONFIRMED means supplied requirements; PROPOSED means engineering recommendation with no approval implied; OPEN means a business or operational answer is required. No implementation authorization is inferred from this document.

## Source precedence and repository findings

Read completely: `../AGENTS.md`, `../START_HERE.md`, and `../Dayari_Inventory_PRD_v1_2_Comprehensive.docx` (PRD v1.2, 2 November 2026). The three files were the entire initial repository inventory, including hidden-file inspection. No application, tests, package manifests, migrations, owner story, older TDD or Git repository exists. `git status --short` failed because this directory is not a Git repository.

The instructions reference a PRD under `docs/`, but the supplied document is at root. Use the root original without moving or duplicating it; all section references below refer to that file. PRD §15 supersedes earlier product/SKU examples. AGENTS.md supplies engineering controls. This is a design review, not a commercial commitment.

## Confirmed baseline

| ID | CONFIRMED decision | Source |
| --- | --- | --- |
| C01 | Shared parent product, normalized configurable variants, default variant for products without options; distinct supplier, source location, sourcing, SKU and batch identities | §15.1–15.3 |
| C02 | Immutable IDs are keys; readable base SKU plus suffix, e.g. CHILG03849-RED; no assumed base parser; no historical identity rewrite | §15.2 |
| C03 | Every physical unit labelled; identical SKU/batch units share QR in V1; versioned opaque lookup; no serialization | §15.1, §15.4; user confirmation |
| C04 | Atomic multi-variant receiving; positive integer unit quantities; exact SKU/batch issues, multi-variant reference review | §15.3, §15.5 |
| C05 | Append-only ledger; no double deduction; exact issue-linked production damage; Manager requests and Admin approves recovery/correction | §2, §4–5 |
| C06 | Manual unverified references, unlinked path, Manager completion without dispatch; immutable close and distinguished late entries | §5–6 |
| C07 | Local server and PostgreSQL; ordinary shop workflows independent of internet; replay-safe sync; cloud freshness and pending approvals | §7 |
| C08 | Three server-enforced roles; Manager cannot approve own correction/recovery; Production cannot receive, complete or close | §2 |
| C09 | Approved TypeScript monorepo stack: Next.js, NestJS, PostgreSQL, Prisma, Zod, Tailwind/shadcn, QR library, Docker Compose, Vitest, Playwright, Supertest | AGENTS.md; user |
| C10 | No V1 Sheets validation, payments, reservations, customer records, dispatch, social integrations, CSV, multi-branch or native mobile | §1.2, FR-16 |

## Original O1–O8 and §15.9

| ID | Status and exact decision needed | Proposed default or resolution | Approval gate |
| --- | --- | --- | --- |
| O1 | CONFIRMED by §15 and user: batch identity versus unit serial | Batch-only, each unit labelled. Earlier O1 and §3.1 “proposed” wording superseded; no remaining serialization blocker | Reopen only by scope change |
| O2 | OPEN: dimensions, surfaces, printer, durability and replacement process | Category-adjustable layout matching §15.4; trial on actual goods; log all print/reprint requests. No assumed printer protocol | Before label implementation/hardware purchase |
| O3 | OPEN: intake damage actor/path | Manager reports intake damage against accepted receipt line; Production reports issue damage. Receipt acceptance and damage can be one atomic workflow; confirm whether received quantity includes damaged units | Before receipt/damage semantics |
| O4 | OPEN: exact closing blockers | Unclassified issues, unresolved quantity anomalies, invalid required fields and approvals needed to certify quantities block; sync outage alone does not. Define handling of open production, held damage and pending approvals unrelated to today's quantities | Before close; approve baseline before Brick 1 |
| O5 | OPEN: offline Admin workflow and authority | Remote approvals wait for delivery to shop; permit local Admin only after explicit approval of local login, credentials and scope. No delegated Manager override | Before auth/approval implementation |
| O6 | OPEN: exact Manager/Production visibility, including batch balances, damage and valuation | Field-level allowlists for task-relevant quantities; show §15.5 scan availability. Hide valuation unless approved. Owner must define permitted stock scope and cross-worker issue lookup | Before auth and stock views |
| O7 | OPEN: server, phones, Wi-Fi, UPS, printer, support and costs | Survey existing equipment, local HTTPS/trust and backup connectivity; no hardware procurement or availability assumptions | Before deployment/label verification; architecture assumptions reviewed before Brick 1 |
| O8 | OPEN: completion without imported expected quantities | Manager attestation over recorded issues only; no claim of customer fulfilment. Define completion scope and later issues/reopening | Before completion |
| V01 | OPEN §15.9(a): suffix policy including default/non-colour/multi-attribute cases | Registry-backed deterministic suffix using stable value codes in approved attribute order; collision rejection; no invented production codes | Before catalogue/SKU migration |
| V02 | OPEN §15.9(b): supplier/location/base-code allocation and collisions | Controlled registry, globally unique full SKU; immutable allocation, no reuse; validate case, alphabet, length, legacy codes and who allocates. Store base as opaque text | Before catalogue/SKU migration |
| V03 | OPEN §15.9(c): Manager creates attributes/values freely or with review | Manager selects existing values; new values require configured approval, proposed only. Confirm Admin/Manager catalogue rights and authorization for manual lookup | Before catalogue permissions |
| V04 | OPEN §15.9(d) | Same decision as O2, not a separate assumed hardware approval | As O2 |

## Additional unresolved business semantics

| ID | OPEN question | PROPOSED recommendation | Needed before |
| --- | --- | --- | --- |
| B01 | Are quantities ever fractional? What counts as same product/variant; can attributes change after use? | V1 individually counted positive integers; canonical attribute/value IDs; identity changes supersede rather than edit. Approve normalization rules (case, whitespace, aliases, units, scope and retired values) | Identity/schema |
| B02 | Can an accepted delivery batch receive more lines? Can one delivery include multiple source locations? | One source per batch, submitted receipts immutable; supplemental receipt references existing batch via new transaction if authorized; never duplicate receiving by editing | Receipt schema |
| B03 | Does completed production move stock out of in-production, and what happens to late damage/partial completion? | Completion transfers selected remaining issue quantities to completed/consumed; no usable deduction. Partial completion and post-completion damage require explicit policy | Ledger completion |
| B04 | Are discarded/returned quantities recoverable; what does reworked mean? | Held/reworked remain damaged unless approved recovery; discarded/returned transfer to terminal external state. Require new approved correction for exceptional return | Damage lifecycle |
| B05 | Business timezone, cutoff/date selection, late entry classification, count tolerance and close scope | One shop business calendar configured after confirmation; immutable event sequence cutoff; late entries linked to original close; no automatic reclose | Close/schema calendar |
| B06 | Can Admin authorize negative stock as §10 permits exceptionally? | No negative balance in V1; use discrepancy and approved, evidenced adjustment before issue. Owner must approve any alternative | Ledger constraints |
| B07 | Reference spelling/grouping, reassignment authority, completion after reference correction | Preserve raw reference; avoid silently merging #2002 and 2002; audited reassignment; explicit grouping rules | Issue/reference schema |
| B08 | Admin master-data ownership and cloud stock writes | Single local stock writer; cloud decisions are commands applied once locally after validation; local catalogue writer initially; remote edits queued for shop acceptance | First migration/authority |
| B09 | Credential/session revocation delay, backup retention, restore owner and recovery targets | Local permitted-user cache, logged stale-auth windows; encrypted off-site backups and restore drills; owner selects tolerable downtime/data loss and offline session lifetime | Auth/operations |
| B10 | Pilot thresholds and commercial scope/sign-off authority | Treat 2-second scans, 8-hour outage and ≤2% sampled variance as proposed §11 targets; agree devices, workload, sample plan and accountable approvers | Implementation authorization/pilot |

## Proposed engineering choices

### Approved progressive catalogue workflow

The user requested a separate **Add supplier** button and progressive supplier-name/location/prefix setup, followed by product entry that selects the saved supplier location and generates the remaining product SKU. The user explicitly approved an Admin-managed location-code registry starting with Lagos = LG, and explicit variant suffixes with STD for products without options. For product numbers the user changed the proposed sequential counter to **random digits**; implementation uses a random five-digit decimal candidate padded with leading zeroes, collision checking and a finite 100,000-code namespace per exact prefix. Namespace expansion remains a future decision if exhausted; numbers are never recycled from accepted identities.

CONFIRMED scope: one supplier-location/product base shared by its variants; a different supplier/location uses its own base; save-time uniqueness and idempotent replay; no supplier setup on ordinary product entry; all new setup records commit atomically. The earlier manual full-base allocation restriction is superseded for this approved generated flow. Existing bases/SKUs and the legacy API remain unchanged. New prefixes combine the saved supplier code and approved registry code without parsing historical strings. An explicitly selected existing source can adopt its recorded prefix, supporting the user's existing CHILG without rewriting its supplier/source code or merging duplicate supplier names. This adoption is a separate saved prefix mapping, not a rename. Catalogue permissions remain Admin-only creation and Manager read access.

The implemented forms are **Supplier → Location → Review prefix** and **Supplier → Product → Variants → Review**. Back/Continue retains component draft state; final save is the sole write. Closing a populated draft requires explicit discard confirmation. An existing product's variants can be selected for a new supplier; new products support explicitly entered multi-attribute rows. Adding more variants to an already saved product is available through the existing validated API; a dedicated progressive editing flow remains future work.

### Catalogue feedback on 2 November 2026

CONFIRMED requested change: the user wants automatic supplier-code generation from entered information and a smoother, progressive Add entry experience. This replaces the manual supplier-code input requirement once its allocation rule is approved; it does not approve automatic full-SKU generation. Proposed flow and acceptance criteria are in `catalogue-workflow-proposal.md`. The user agreed with generation but requested shorter name abbreviations rather than full-name codes. Exact abbreviation alternatives (word initials versus first-three-letter prefix) have been submitted for selection under AGENTS.md rule 3; collision/rename rules are included in that concrete selection. No exact abbreviation algorithm is marked approved, and existing codes must be preserved.

APPROVED subsequent selection by the user: **first three letters of the first word**, e.g. Chioma Ventures → CHI and Lagos Paper Supplies → LAG. The selected question also confirmed duplicate suffixes -02/-03 and keeping allocated codes fixed after saving. This replaces the pending alternatives above for supplier codes only. Implementation uses uppercase Unicode letters of the first whitespace-delimited word, with Unicode compatibility normalization and punctuation/digit removal; names without letters in that word are rejected instead of inventing a fallback. Short words keep their available letters. Existing codes are preserved, final allocation is transactional/server-side, and manual supplier-code override is no longer accepted by the creation API. Full SKU/source code allocation remains unchanged. The progressive wizard remains a proposed next workflow, not an implemented feature.

P01: modular monolith with the same service/schema in shop and cloud authority modes, not independent active stock writers. P02: UUID identifiers, transactional outbox/inbox, ordered origin sequence and payload hash. P03: balanced state transfers plus rebuildable locked balance projections. P04: HTTPS browser UI; PWA optional, no disconnected-device stock commits. P05: database FK/check/unique constraints plus explicit PostgreSQL locking and immutable-table permissions beyond Prisma capabilities. P06: versioned API/sync schemas, additive migrations and restore runbook. Each remains PROPOSED pending architecture review; see companion documents for detail.

## Approval request before Brick 1

### First-slice authorization received on 2 November 2026

APPROVED by the user in this chat after requesting MVP implementation:

- Admin-only catalogue creation; Managers may select/read existing catalogue entries; Production denied catalogue administration. This is a first-slice permission policy, not approval of all later stock-view fields.
- Manual allocation: existing base code stored as opaque text plus Admin-entered suffix; duplicate full SKUs rejected; automatic generation remains disabled until a code allocation policy is supplied. No base parsing, colour-code inference or assumed segment lengths.
- Local shop is the sole catalogue/stock writer; immutable UUIDs and stable attribute/value combinations form the identity foundation. Offline Admin approvals, closing and physical hardware decisions are explicitly deferred to their affected slices.

This supersedes the earlier Brick 0-only authorization for the first catalogue slice. V01/V02 are PARTIALLY RESOLVED for manual allocation only; automatic allocation remains OPEN. V03 is RESOLVED for the first slice. B08 local single-writer foundation is APPROVED; cloud decision transport remains future work. O2/O4/O5/O7 and remaining workflow questions remain OPEN. No production deployment authorized.

Implementation scope: create-only catalogue records (no rename/supersession UI yet), a local authenticated browser session and development-only provisioning. The eight-hour local session expiry is a bounded development security setting; it does not implement or approve cloud-cached offline Admin authority. Display labels/codes are trimmed but not silently case-folded/merged; UUID-based combination keys canonicalize UUID case and order. Vocabulary aliases and automatic SKU normalization remain deferred. One newly registered source creates its own immutable location identity; reuse/merging of historical locations is not implemented.

Owner/project lead: approve or amend C01–C10 interpretation, P01–P06, stock identity/normalization B01–B02, SKU registry V01–V02, role matrix O6/V03, closing principles O4/B05, offline authority O5/B08 and hardware assumptions O2/O7. Record answers, approver, date and scope in this register; unresolved later-workflow questions may be deferred explicitly with affected slices blocked. PRD §14 additionally requires agreed open decisions and commercial scope before implementation. No choices in this draft constitute that sign-off. Brick 1 is not authorized by completing Brick 0.


## Variant extension and receiving review — 2 November 2026

CONFIRMED user authorization: close the populated variant-set extension gap for Admins, retaining existing identities/SKUs and established suffix rules, with validation, atomicity, audit and idempotency. Implemented through explicit extension mode on product-setups. It adds combinations using all existing attributes; it does not rename variants, change the attribute structure or convert allocated STD products to options. Duplicate combinations are rejected; existing variants remain selectable in the ordinary sourcing flow. New SKU allocation affects only the selected supplier location; other suppliers can explicitly source the shared variants later.

PROPOSED only: `receiving-ledger-design.md` describes seven additive tables, origin-lock transaction rules, receipt completeness guards and reconciled projections. No stock schema or receiving application was implemented. Task 3 requires explicit owner approval. B02 (batch/source/product scope), O3 (damaged intake), O6 (task-scoped Manager/Admin receiving visibility), public batch code/date rules and B06 foundation constraints remain gated there. Hardware, closing and offline Admin approval decisions remain deferred; no resolution is inferred from preparing the design.


## Admin experience authorization and implementation — 3 November 2026

**CONFIRMED by owner:** improve all existing Admin workflows, integrate supported read paths, preserve identity/ledger/idempotency/permissions, verify isolated fixtures, and publish seven separate milestone commits. No operational migration/backfill, deployment, new inventory mutation or future traceability phase is authorized.

**Engineering implementation within that scope:** nine responsive workspaces; UUID-context fragment navigation; real counts without interchangeable-stock grand totals; bounded provenance read for existing Admin/Manager operational access; minimal Admin-only shop configuration; origin-filtered catalogue reads; explicit latest-100 receipt/print history limitations. No supplier/product deletion/rename, user/role administration or unrestricted audit capability is inferred.

**OPEN / unchanged gates:** hardware/media physical acceptance, archival pagination/scale benchmarks, new administrative commands and later unit/production/sync phases remain separate decisions/authorizations. This refinement does not approve them.

## Expanded implementation authorization — 3 November 2026

CONFIRMED: owner authorized remaining proposal slices through “implement all”, followed by targeted approvals. Invitations: 24-hour expiration, resend/role edits revoke old links, new emails only, no recovery of existing/disabled accounts; supervised provisioning retained. Password minimum six characters for every existing role. Zero-stock alerts only, no reorder thresholds. Brevo smtp-relay.brevo.com:587 STARTTLS and Dayari Inventory sender are provisional; no-reply@dayari.ng and APP_PUBLIC_URL require owner verification before live sending. Development/testing uses isolated transport only. No operational migrations, real historical unit enrollment or deployment authorized.

Implementation order: secure invitation vertical slice; serialized receiving and exact six-character unit lookup; individual-label cart/native printing and verification; isolated historical-onboarding rehearsal. Each complete slice requires tests and a separate pushed commit. Preserve existing Product/Lot Codes, DYI:1, ledger and role boundaries. Do not add production issuing, damage/recovery, closing or cloud transport.

## Labels & printing redesign — 4 November 2026

CONFIRMED owner request: in-page rendering of the same PDF used for printing, partly-used-sheet start picking, default purpose-separated sheets, SKU prominence, explicit profile geometry/bounds and no QR/external-service changes. Engineering: additive v2 A4 software layout profiles, local PDF.js/worker, read-only draft preview, and immutable per-artifact start settings in existing event evidence. No schema/operational migration or hardware certification is inferred. Historical renderers/profile constraints remain; physical printer margins still require trials. Original accepted manifest timestamps preserve existing PDF hashes across the pulled UTC adapter change, without editing any historical row.

## Printing workflow correction — 4 November 2026

CONFIRMED owner direction supersedes the earlier operator-outcome UI: no printed/failed/uncertain form and no acknowledgement checkbox before another print request. Operators use existing selective reprints for replacements. Print handoff requests continue to be recorded automatically; no physical-success event is fabricated. Existing historical operator reports and backend compatibility remain immutable. Reprint manifest validation, reason, authorization, idempotency and no-stock-effects rules remain unchanged. UI layout corrections require no schema or operational migration.

## Invitation SMTP and local upgrade — 4 November 2026
CONFIRMED: owner approved applying local migrations 011/012 after private backup; applied and preservation verified. A real SMTP adapter is implemented but live delivery remains gated on verified sender, private credentials and employee-accessible HTTPS URL. Isolated transport remains for tests; it never claims real email. Existing accounts cannot be recovered through invitations. See invitation-email-implementation-report.md.

## UI consolidation and production issuing — plan review, 5 November 2026

PROPOSED only, no implementation: `ui-and-production-implementation-plan.md`. Owner requests recorded as CONFIRMED direction: catalogue search by product name or Product Code; remove the standalone Suppliers page (catalogue retains supplier details and setup); product availability expansion renders as an inline sub-row under its product; remove the Receiving page and open the existing receive wizard as a modal from every entry point; production lands on product search, has no exact manual lookup, checks out scanned items with a reason and order reference per scan across multiple products in one session; usable stock stays visible to production as quantities only. Screenshot page mapping is unverified because image input was unavailable.

OPEN gates for the production-issuing slice: reason taxonomy; whether order reference is mandatory or an explicit unlinked path is allowed; duplicate-lot handling within a session; which roles may issue; which fields production may see; and approval of an additive `StockMovement` migration (nullable parent plus `issueLineId`) versus a separate issue-movement table. Manual-lookup restriction requires a new Admin/Manager-only capability and server-side enforcement. No schema, migration, permission, stock mutation or application change is authorized by this entry.

## Complete V1 directive — 6 November 2026
CONFIRMED: owner authorizes sequential implementation milestones 1–13, preserving existing identities/ledger/RBAC and excluding dedicated local-server/LAN/sync/deployment work. New serialized units use immutable UUID plus six readable random characters; atomic receiving; DYI:2 alongside DYI:1. Checkout confirmation is authorized for Admin, Inventory Manager and Production. Order IDs are optional and reusable across sessions/dates/actors; missing reasons create an unresolved obligation without blocking an otherwise authorized issue. No scan-only deduction or quantity-only bypass. Owner approves a maximum 10,000 physical units per serialized receipt and existing 100-line bound subject to benchmark results; oversized deliveries use explicit separate receipts, never partial acceptance. Final reason taxonomy remains OPEN. Operational migrations, real historical enrollment, live stock changes, real invitations and production activation remain separately gated.
