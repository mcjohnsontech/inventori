# Consolidated Dayari dashboard workflow

Owner authorized implementation of this direction. See [consolidated-dashboard-implementation-report.md](consolidated-dashboard-implementation-report.md) for the delivered consolidation and deliberate retention of established printing/review layouts. This target workflow is not a claim that every illustrative modal/drawer has been rewritten.
Status: PROPOSED UI/navigation design, 10 November 2026. This document does not claim these consolidations have been implemented or authorize new domain commands. Existing approved business rules, backend permissions, immutable identities, ledger behavior and pending cloud-approval restrictions remain authoritative.

## Navigation and page ownership

| Main page | Internal views | Owns |
|---|---|---|
| Overview | Attention, recent activity, shortcuts | Knowing what needs action; no duplicate full stock sheet |
| Inventory | Stock, Count history, Requests; stock filters include damaged | Browsing products/variants/lots/units, physical verification and inventory exceptions |
| Receiving | Receipts and new-delivery action | Accepting deliveries and inspecting immutable receiving evidence |
| Production | Checkout + lookup, In Production, Follow-up, History | Identification, issuing exact units, Manager completion and reason reconciliation |
| Labels | Print cart, Print history; individual/shared-lot modes | Preparing and reprinting supported labels |
| Catalogue | Products, Suppliers | Registering product definitions, variants and sourcing identities |
| Reports | Period summaries, movements, Order ID investigation | Read-only analysis and evidence drilldown |
| Users & settings | Staff, Invitations, My account, Shop information, Help | Existing account administration and shared account/settings information |

Role-aware navigation hides unauthorized views and actions; backend enforcement remains. Production can use the Inventory destination only as a restricted presentation backed by its existing usable-stock/identification reads. It must not gain the operational stock endpoint, full catalogue, supplier, damaged-history, invoice, audit or print-administration access. Old routes remain compatible aliases/deep links during consolidation.

## Shared interaction rules

- Page: repeated work, lists and history. Modal: a bounded task with review/explicit confirmation. Drawer: inspecting one record without losing the underlying list.
- Product is the top-level browsing row. Expand to variant rows; inspect an exact supplier SKU/lot/unit in a drawer. Display quantities at their valid variant/SKU/state scope, not one total across unlike products or variants.
- Search, filters, page number and expanded rows remain when details close. Lists paginate. Drawers return focus to their trigger. Narrow screens use readable stacked rows and full-width drawers/modals.
- Closing an entry form preserves a supported draft. Explicit discard requires confirmation. Back retains inputs. An unresolved submission keeps its original idempotency key and unchanged retry body; it is not silently discarded or reissued under a new key.
- Loading, read failures, failed writes, empty results and unavailable capabilities have distinct states. No successful inventory action is simulated.
- No drawer provides direct balance edits, identity regeneration or accepted-history editing.

## Authentication and landing

Employee invitation email -> accept-invitation page -> choose password -> activate once -> sign in -> role-appropriate landing. Existing staff sign in directly. Mandatory first-password change remains for supervised provisioning. Session expiry preserves supported drafts and requires sign-in; expired/revoked/used invitation links cannot activate accounts. No public staff registration or unapproved reset/recovery mechanism is added.

Admin/Manager land on Overview. Production lands on restricted Inventory/Production work. My account and Help are available to every role.

## 1. Overview

Show actionable zero-usable-stock information, not-yet-received entries where authorized, damaged-stock attention, pending reason reconciliation, unresolved counts, pending requests and recent receipts/checkouts. Match each indicator to an existing permitted read. Do not invent low-stock thresholds, a mixed-product quantity total or a certified closing status.

Attention item -> opens the responsible filtered workspace or reusable record drawer. Recent receipt -> receipt drawer. Recent checkout -> checkout drawer. Shortcuts open Receive delivery, Checkout, Report BAD or Labels as authorized. Overview has no independent stock management form or full repeated inventory list.

## 2. Inventory

Search/filter -> paginated parent-product rows -> expand variants -> inspect exact SKU/lot -> inspect an exact unit if serialized. Authorized staff can filter usable/damaged/zero availability where supported; Production sees only permitted usable/identity data. Legacy stock remains quantity-based and is identified as such without fabricated units.

Drawers:

- Product stock: Product Code, variant-level quantities and drilldowns to sourced SKUs/lots. Catalogue definition changes remain in Catalogue.
- Lot details: Lot Code, saved SKU, batch, authorized state quantities, receipt link and supported unit list. Production receives the restricted identity/provenance DTO only.
- Unit details/tracking: six-character Unit Code, product/variant, SKU, lot/batch, current authorized status and permitted lifecycle evidence.
- Count evidence: scope, snapshots, attempts, observations, results, staleness and explained resolution history.
- Request evidence: recovery/correction request, supporting evidence, pending status and authorization dependency; no local approval button.
- Damage evidence: original BAD report and role-appropriate disposition evidence.

Actions/modals:

- Report damaged/BAD: select eligible exact units -> cause and explanation -> review -> confirm. Production only reports its own issued units; Admin/Manager retain their approved wider reporting scope. After-issue BAD never deducts usable stock again. Close preserves the draft.
- Count stock: Manager selects one exact lot/state and purpose -> records attempt -> scans verified native units and unidentified extras, or legacy quantity evidence -> reviews -> submits evidence. Counts do not change stock. Relevant stock movements make an attempt stale and require recount. Preserve all attempts. Only an explained matching recount can resolve a mistaken finding; genuine discrepancies remain pending correction. Admin reviews; Production has no count administration.
- Damage disposition: Inventory Manager selects damaged units -> Held/Reworked/Discarded/Returned to vendor and evidence -> review -> confirm. Held/Reworked remain damaged; terminal outcomes remove exact units and preserve history. Admin is not granted Manager disposition authority.
- Recovery/correction request: select supported scope -> explain and attach supported evidence fields -> review -> submit pending request. No stock execution or local approval; cloud-delivered authorization remains deferred.

Count history and Requests are internal Inventory views, not additional top-level stock sheets. Production can find its own BAD reports in Production history, without access to the broader damaged-stock administration.

## 3. Receiving

Default page: paginated receipt history with existing supplier/date/reference filters and Receive delivery action. Receipt entry is a progressive modal:

1. Select supplier once; use its single saved source automatically. Where legacy multiple sources exist, select one once for the whole delivery. Never discard or merge saved source identities.
2. Select multiple sourced products and variants; show saved SKUs. Admin and Manager may use the approved inline product-registration workflow without losing the receipt draft. Supplier/source setup remains Admin-only.
3. Enter usable and damaged quantities, meaningful damage explanations, factual delivery date and optional invoice reference. Display a neutral review summary.
4. Review supplier/source, each SKU and quantities, date and evidence.
5. Confirm once. Preserve retry identity after a lost response. One atomic accepted receipt creates its batch, lots, serialized units where applicable, movements and evidence.

No supplier exists: Admin opens supplier setup; after save resume receiving. Manager receives an actionable Admin-setup instruction. Supplier creation does not itself receive stock.

Accepted receipt opens a receipt drawer showing immutable quantities, batch, lot and unit links. Print labels opens Labels prefiltered to the accepted receipt. Registration and receiving remain separate commands: cancelling a receipt does not erase an already saved catalogue product or supplier. Accepted receipts cannot be edited or supplemented.

## 4. Production

Lookup and checkout share one workspace. Scan/type -> identify supported Product/Lot/Unit code or QR -> display a result drawer/card. Lookup alone never reserves, deducts or issues stock. Exact eligible serialized units may be explicitly added to the checkout selection; a product/lot identity is never treated as one physical unit.

Checkout -> scan/add exact units -> inspect selected item details -> enter session/line reason and optional Order ID -> review -> explicit confirm -> accepted checkout drawer/history. Preserve duplicate detection, pending retries and drafts. Missing reasons remain permitted and create Manager follow-up. Reasons: Production use, Sample, Internal use, Other (explanation required). Order IDs are unverified reusable grouping references, not unique transaction identities.

In Production view lists current work with existing holder/Order ID filters. Manager completion modal -> explicitly select eligible In Production units -> review -> confirm -> completion evidence drawer. No second usable deduction; damaged/unresolved disposition units are excluded. Reusing an Order ID later creates independent work and never reopens completed history.

Follow-up view -> reason-reconciliation modal: Manager opens missing-reason lines, records classification/evidence, reviews and confirms. Original checkout evidence remains intact. Admin review follows existing permissions; Production does not inherit Manager reconciliation authority.

History -> accepted checkout, completion and permitted own BAD evidence drawers. Report BAD opens the same scoped report modal used elsewhere. No duplicate QR-only sidebar page remains; old QR links still resolve into this workspace.

## 5. Labels

Open from a receipt, selected inventory scope or print history. Keep Individual items and Shared lot labels distinct to preserve DYI:2 unit and DYI:1 lot compatibility.

Select exact eligible saved units or supported lot-label quantities -> print cart -> individual label preview and pager -> approved print profile/start position -> review -> device print dialog. Keep usable and damaged output visibly distinct with separate sheets by default where supported. Show printable-area/layout errors rather than clipping. PDF fallback remains accessible.

Print settings modal: supported profiles, paper size, margins/gaps, first free position and alignment test. Printer/hardware support must not be invented beyond approved profiles. Printing creates evidence, never new units or stock movements.

Print-job drawer: exact manifest/identity type, prepared artifact and existing handoff evidence. Selective reprint modal: select original identities/copies, explanation and review -> reprint. Partial/uncertain output prompts checking physical labels and selecting only what needs reprinting. Reprinting retains identities; it never substitutes a new Unit Code. Closing the device print dialog is not proof of physical success. Do not require a mandatory “printing went well” report.

## 6. Catalogue

Products tab: paginated/searchable parent products, Product Codes, configured variant counts and sourcing links. Product drawer: attributes, all registered variants, saved supplier SKUs and stock links. Distinguish definition from availability.

Add product modal: select supplier/source -> product details or shared parent selection -> attribute/variant combinations and explicit suffixes -> saved SKU preview -> review -> save. Add variants modal: choose existing parent, add only new combinations/suffixes, review and save; do not rename existing variants, recreate the parent or regenerate assigned SKUs.

Suppliers tab: compact supplier rows with saved location/prefix and sourcing counts. Supplier drawer shows existing sourced products/SKUs. Add supplier modal: name -> saved location/registry selection -> prefix review -> save. Preserve existing extra locations as compatible historical identities. No new allocation policy is introduced.

Catalogue administration remains Admin-only. Manager's approved product creation is available specifically within receiving, not as a general permission expansion.

## 7. Reports

Read-only period summaries, authoritative variant/SKU balances and movements, Order ID investigation, reason/damage/count/request evidence where current reads support them. Every summary shows its date/scope and freshness. No fabricated financial metrics or certified close snapshot is added.

Summary -> movement drawer -> original receipt/checkout drawer -> permitted unit-tracking drawer. Order ID result groups independent sessions and their states without treating the reference as a unique order or completion boundary. Operational tasks link back to their owning workspace rather than duplicating forms in Reports.

## 8. Users & settings

Admin Staff tab: paginated directory, role/status/search -> user drawer with permitted profile, membership, status and session evidence. Invite staff modal: name, new email, approved role, Admin proof -> review -> send invitation. Invitation details drawer: pending/expired/revoked/accepted and queued/provider-accepted/failed delivery states. Resend/revoke confirmation invalidates the previous link as approved. Provider acceptance is not inbox delivery.

Edit staff modal and sensitive-action confirmations cover existing role/status/session commands only. Enforce self-demotion/deactivation and last-active-Admin protections. Supervised account provisioning remains a clearly separate supported fallback without automatic email. Invitations cannot reset an existing account.

My account: permitted profile/session information, password-change form and logout. Shop information: existing origin/authority/freshness information appropriate to role. Help: short operational guides and honest unsupported-feature guidance. Manager/Production cannot access staff administration by switching tabs or directly calling APIs.

## Explicitly deferred

Daily closing remains unimplemented and is not presented as a working button. Its later Manager-only confirmation must enforce O4 blockers; Admin review is not closing authority. Pending recovery/correction execution remains unavailable without approved cloud-delivered authorization. Local-server infrastructure, synchronization, financial functions, purchasing/reservations/dispatch and unapproved hardware are not added by this UI proposal.

## Typical daily paths

- Delivery: Overview/Receiving -> Receive modal -> optional approved catalogue setup -> review/accept -> Receipt drawer -> Labels.
- Production: Inventory/Production scan -> identify exact units -> checkout review/confirm -> In Production -> Manager-selected completion.
- Damaged item: Inventory/Production -> BAD modal -> immutable evidence -> Manager disposition; recovery/correction stays a separate pending request.
- Shelf verification: Inventory lot drawer -> Count modal -> Count evidence/recount -> pending correction if genuinely discrepant; no automatic balance edit.
- New employee: Users & settings -> Invite modal -> email -> accept-invitation page -> password -> sign-in -> role-appropriate workspace.
