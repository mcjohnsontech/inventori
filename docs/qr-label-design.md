# Brick 5B — QR identity and label design

## Approved local-development implementation — 3 November 2026

Owner approved Q01–Q08 and superseded design-only instructions. Implement DYI:1 deterministic 71-byte origin/lot payload; strict authenticated local lookup; Admin/Manager label administration and Production minimal read-only availability lookup with exact manual fallback. No stock mutation from labels/lookup.

Approved software trial profile A4 210×297 mm, cells70×35 mm, 3×7, horizontal margins/gutters zero; vertical margins26 mm each, no vertical gaps. Essential content inset within each cell to protect ordinary non-borderless printers. This is ordinary-paper cut-and-attach trial geometry, not certification of an adhesive sheet or printer. Full origin remains in manifest/QR, not forced onto label. Actual-size PDF printing only; no thermal/native/silent adapters.

Label every delivered unit: usable and visibly marked DAMAGED INTAKE — NOT FOR PRODUCTION, same lot QR. One initial full-receipt manifest; PDF chunks at most500 labels, stable offsets. Explicit selected-purpose reprints require original job, positive bounded count and meaningful reason. Append-only jobs/lines/events use existing origin/command/audit/outbox transactions; rendering/physical print outside locks. Unknown output never automatically reprints. Camera HID/manual lookup are identification only; camera LAN HTTPS/trust and actual device/printer testing remain physical acceptance gates. Retention duration and production physical sign-off remain deployment decisions, not local implementation blockers.


Historical design/review record below; conflicting proposals are superseded by the approval above.

**Phase 1: DESIGN ONLY, 2 November 2026.** CONFIRMED means PRD/user requirements; PROPOSED means engineering recommendation; OPEN requires owner/hardware review. No implementation, migration, dependency installation, printer connection, label generation or stock change is authorized by this document.

Sources reviewed: AGENTS.md; root `Dayari_Inventory_PRD_v1_2_Comprehensive.docx` (the older docs/ path is absent); implementation bricks; receiving implementation report; current Prisma schema and receiving lookup/audit conventions; existing QR/permission/hardware decisions. PRD §§3–5, 7, 10 and 15 control. Brick 4 + 5A is provisionally accepted based on its report; its reported checks were not rerun here.

## 1. Existing identities and protected boundary

CONFIRMED: StockLot.id already identifies an exact supplier-specific SKU plus delivery batch, uniquely constrained by (skuId,batchId), with origin/source provenance. A shared parent/variant can have different supplier SKUs. DeliveryBatch retains UUID, originId, sourceId and an origin-scoped readable code. ReceiptLine retains lotId, accepted usable/damaged quantities, generated total and historical identity snapshots. Usable and damaged arrivals on the same line share one lot.

Every physical item must receive a label. Identical units in one SKU/batch share their QR in V1; there is no unique-unit serialization. Another supplier SKU or delivery batch resolves differently. A label identifies a lot; it does not prove authenticity, physical affixing or an individual item's usable state.

Lookup, printing, cancellation and reprinting must never create a receipt, lot, stock transaction, movement or balance change, nor rewrite existing identities. New print metadata belongs in separate tables, not supplementary lines in accepted batches. Existing receiving immutability and creation-transaction guards remain intact. No QR models/endpoints currently exist.

## 2. Proposed versioned opaque payload

Canonical text proposal:

```text
DYI:1:<ORIGIN_UUID_32_UPPER_HEX>:<STOCK_LOT_UUID_32_UPPER_HEX>
```

V1 is exactly 71 ASCII characters. Each existing UUID becomes 32 uppercase hexadecimal digits without hyphens; the resolver reconstructs UUID formatting. `1` is the application payload version, distinct from QR symbol version, API version and template version.

This opaque business identity carries no names, readable SKU/batch, quantity, state, order, credentials, hostname or expiry. It is not encryption or a secret. No extra stock identity/token mapping is needed: encode the existing immutable origin/lot pair deterministically. Verify origin agrees with the persisted lot and batch, and validate SKU/source provenance. Never parse supplier/product identity from readable codes.

All copies and reprints for one lot use byte-identical V1 content across templates/printers. For Red30 usable/2 damaged, all 32 copies share Red's lot payload; Brown and Pen use theirs. Another Red delivery or supplier has a different lot. Printer cell positions/chunk offsets are output positions, never unit IDs.

PROPOSED: custom text rather than a URL avoids coupling permanent labels to a local hostname, cloud redirect or certificate. A generic phone camera may show text rather than open Dayari; scanning happens inside authenticated Dayari. Owner must approve that interaction (Q01). Tap-to-open URLs need a separate stable local addressing design, without changing lot identity.

## 3. Backend lookup and authorization proposal

`POST /v1/qr/resolve` accepts only `{ "payload": "<scanned text>" }`. This POST is a read: no stock effect, print job or command-result write. Use current authenticated same-origin proxy, session validation, Zod, bounded input and per-actor/device rate limiting. No public QR redirect or anonymous lookup.

Authenticate → authorize → strict object/payload length → envelope/version validation → UUID decoding → local exact origin/lot tuple lookup → persisted SKU/batch/source provenance checks → allowlisted response at a consistent read snapshot. Proposed current payload cap: 128 ASCII characters. V1 accepts its canonical 71-byte representation only; reject controls, spaces, lowercase aliases, Unicode lookalikes, trailing text, arbitrary URLs and substring matches. Scanner framing is handled separately (§9).

| Case | Proposed result |
| --- | --- |
| Missing/expired/deactivated session | 401, no identity disclosure |
| Role denied | 403 before lot lookup |
| Malformed/oversized text or invalid UUID encoding | 400 INVALID_QR |
| Recognizable bounded DYI envelope, unsupported application version | 422 UNSUPPORTED_QR_VERSION; never interpret as V1 |
| Unknown tuple, wrong origin for a known lot, or not available locally | 404 LOT_NOT_AVAILABLE; no remote existence disclosure or cloud request |
| Broken persisted provenance | Reject and flag an operational integrity error; no substitute variant/lot |
| Known lot with usable zero | 200 identity and authorized actual quantities, not “unknown code” |
| Local API/LAN unavailable | Explicit unavailable/retry state, no fabricated or cached live availability |

Proposed response: payloadVersion, originId, lotId, skuId/fullSku, batchId/publicBatchCode, supplier/source IDs and names, product/variant IDs/names/attributes, permitted usable/damaged quantities as decimal strings, local dataAsOf. Include origin because readable batch codes can repeat across origins. Distinguish historical receipt display snapshots from current names. Exclude invoice, damage explanations, valuation, unrestricted audit/movement history and other staff data.

**Permission proposal, not approval:** Admin/Manager manage labels and perform read-only resolution. Production stays denied label administration and initially denied lookup until an explicit minimal read-only contract is approved. Future Production lookup could expose only scanned identity and necessary usable availability; it does not grant issue authority. Existing receiving/catalogue permissions remain unchanged.

Authorized manual fallback should select source + saved SKU + origin-qualified batch, then review the exact lot. It must not guess another colour or create a replacement identity. Its role/surface requires Q04 approval.

## 4. Rectangular white label layout

CONFIRMED visual structure: black QR at left, SKU and batch at right, product/variant/supplier descriptor. Wireframe only; the bracketed area is not a scannable code:

```text
+----------------------------------------------------------+
|  [ genuine square QR ]   SKU                             |
|  [ including blank   ]   CHILG03849-RED                   |
|  [ quiet zone       ]   BATCH                           |
|                         B-20261102-0001                   |
|  A5 Maple Leatherbound Notebook • Red • Chioma             |
|  Origin: <full UUID>       [DAMAGED INTAKE, if applicable] |
+----------------------------------------------------------+
```

PROPOSED: initial labels and historical reprints use immutable receipt-line/batch display snapshots. Renaming a current product does not silently change historical label content; QR identity remains unchanged. Any future corrected-display reprint needs explicit versioned evidence, not receipt edits.

Keep complete saved SKU, batch and origin qualifier readable. Critical codes must not be silently shortened; measure actual glyph fit and allow reviewed wrapping. Descriptors may wrap or use a clearly shortened display with full lookup details. Long legacy SKUs, multilingual text and daily ordinals beyond four digits must fit or the profile is rejected. Never shrink modules indefinitely to fit text.

OPEN: dimensions and media. A 70×40 mm landscape profile with approximately 24 mm QR area including quiet zone is a trial candidate only. Pens, curved bottles, notebooks and boxes may need different approved profiles/placement, including per-item flag/sleeve labels. An outer carton label alone does not meet individual-item labelling. Full origin UUID in a footer is proposed; no invented short-origin registry.

## 5. Genuine QR and print-ready generation

PROPOSED: review and pin a maintained local encoder such as `qrcode` (node-qrcode), including license/dependency checks. Generate actual symbol matrices/SVG/PNG, never AI artwork, screenshots or decorative QR-like patterns. Its documented outputs and correction settings support this approach. [Encoder documentation](https://github.com/soldair/node-qrcode).

Use standard square QR modules, black on white, without logos/overlays. Retain at least four blank modules on every side, as DENSO specifies. Candidate correction level M, with Q evaluated for wear/density; no level or minimum physical size is hardware-approved yet. [DENSO margins and sizing](https://www.qrcode.com/en/howto/code.html/index.html).

Store payload bytes/version, encoder version, correction level, symbol module count and template/profile version in artifact metadata. Let the encoder choose a sufficient symbol version rather than assume one. For DPI d, N symbol modules and integer k printer dots per module, full QR area including quiet zone is `(N+8)×k` dots; one module is `k×25.4/d` mm. Candidate minimum k=4 is a trial criterion, not a universal scan guarantee. Avoid fractional-dot scaling or stretching.

Print-ready paths: vector SVG in an explicit-mm print document, or PNG at exact integer module scale for the approved DPI. Bundle fonts/assets locally, safely escape dynamic text, and wait for image/font readiness. Versioned print CSS controls page/media dimensions, gutters and breaks; A4 sheets and rolls need separate profiles. Calibrate actual-size driver scaling and disable browser headers/footers. A deterministic PDF artifact is an alternative after selecting a local renderer; no cloud rendering service.

Use an independent decoder on generated symbols and rasterized final print/PDF pages. Compare decoded bytes to canonical payload, and verify margins, dimensions, clipping and code/text fit. Archive manifest/template hash and artifact digest. Digital decoding does not replace actual printed-media trials. No QR artifact or PDF is produced in this design phase.

## 6. Receipt-derived quantities and damaged arrivals

CONFIRMED: counts come from accepted immutable ReceiptLines, not pending forms, an editable total or current stock after later movements. Printing starts after receipt commit. Resolve line/lot/receipt links server-side and use BIGINT-safe decimal-string counts.

**PROPOSED, Q03 approval required:** label all delivered physical units. Usable-purpose copies = usableQuantity; damaged-intake copies = damagedQuantity; total = generated totalQuantity. Damaged copies show conspicuous black-on-white “DAMAGED INTAKE — NOT FOR PRODUCTION” and are physically segregated. Do not rely on colour printing. Both display purposes encode the same lot QR: the badge is handling evidence, not a separate stock identity/state.

| Receipt line | Usable copies | Damaged copies | Total / QR identities |
| --- | --- | --- | --- |
| Red notebook 30 U /2 D | 30 | 2 | 32 copies, one lot QR |
| Brown notebook 20 U /0 D | 20 | 0 | 20 copies, one lot QR |
| Pen 12 U /1 D | 12 | 1 | 13 copies, one lot QR |
| Delivery | 62 | 3 | 65 copies, three QR identities |

A shared QR cannot establish an individual item's current state; a usable-looking label may be copied or become stale. Lookup returns lot quantities, not a serialized unit status. Future issue/recovery eligibility must come from its own approved workflow. A future authorized recovery may require display-label replacement without changing the lot, but recovery is excluded here.

Zero counts create no copies. Damaged-only lines still need labels under this proposal. Silently printing only usable units would leave damaged physical items unidentified; any alternative requires an explicit owner-approved per-item quarantine identification process.

Accepted quantities can be huge. Store compact per-lot/purpose counts, not one database row per unit; render bounded ranges, proposed 500 labels per artifact chunk, with stable offsets/hashes. Show paper consumption before handoff. Chunk offsets are not unit serials. Per-job limits and partial initial printing remain Q05 decisions. Labels printed/wasted/cancelled never reduce stock.

## 7. Reprints, idempotency and separate print evidence

PROPOSED additive models only; do not modify receiving tables or applied migrations:

| Object | Proposed immutable content |
| --- | --- |
| LabelPrintJob | UUID, receipt/origin, actor/role, INITIAL or REPRINT, original-job link, reason, template/profile/encoder/payload versions, manifest/hash and time. Partial unique index: one initial manifest per receipt. Existing CommandResult binds write idempotency |
| LabelPrintJobLine | Job/receipt-line/lot FKs, usable or damaged-intake display purpose, positive BIGINT copy count, snapshot and canonical payload/hash; unique job/line/purpose, checked receipt provenance |
| LabelPrintEvent | Append-only job/attempt correlation, chunk/range, actor/device/time, artifact or transport evidence and event kind; outcomes do not overwrite earlier attempts |

Initially, templates can be reviewed versioned repository configuration, snapshotted into jobs. New configuration creates a new version; old reprints retain original content/profile. A database template administration UI is not implied. No QR mapping table is needed for the existing origin/lot payload.

Proposed endpoints: GET `/v1/receipts/:id/label-plan`; POST `/v1/label-print-jobs`; GET job detail/artifact chunks; POST job attempt/outcome events. Plans are reads; job/event writes require approved role, same-origin protection, validation and idempotency. No arbitrary QR text, HTML template or raw printer-command endpoint.

Job creation: authenticate/recheck role and SHOP authority → origin lock → deterministic receipt/job lock → validate accepted evidence/counts → atomically insert print job/lines, audit, metadata outbox and CommandResult. Overall origin event sequence may advance for metadata; **inventory does not**. Rendering and printer/network handoff happen outside the database transaction after commit. Outbox persistence is not cloud transport.

Proposed first implementation: one initial full-receipt manifest, printable in chunks. A concurrent second initial command cannot reserve another full initial set; direct the user to the existing job or explicit reprint. Same key/body returns the same job; changed body conflicts. Reprints specify original job/line, purpose, positive bounded count and reason, retaining payload and original content/template unless an approved alternative is selected. Reprint copy limits/roles are OPEN; cumulative reprints do not represent added stock.

Distinguish REQUESTED, ARTIFACT_READY, HANDOFF_REQUESTED, DIALOG_OPENED, USER_REPORTED_PRINTED, CANCELLED_BEFORE_HANDOFF, FAILED and OUTCOME_UNKNOWN events. Device acknowledgement means only what that driver actually reports. Browser `print()` opens a print dialog; its return is not proof of physical output. [Browser print API](https://developer.mozilla.org/en-US/docs/Web/API/Window/print).

Cancellation, jam, restart after spool and lost acknowledgement must not automatically resend physical copies. Require operator verification and an explicit new attempt/reprint after uncertain output. OS copy settings and reprinting a downloaded artifact cannot be fully controlled. Record requested, submitted and operator-reported counts separately; never call them verified affixed units. Stock stays unchanged on every failure path.

## 8. Browser printing and thermal hardware review

| Path | Advantages | Limits requiring review |
| --- | --- | --- |
| Browser/OS driver | Smallest initial integration, local preview/document, potentially ordinary or thermal printers | Dialog/scaling/margins/media calibration; no guaranteed silent control or physical completion; sheet pitch/start position if using A4 adhesive stock |
| Vendor bridge/native thermal adapter | Device-specific roll geometry, dot placement and some device status | Exact model/firmware/DPI/language, OS/browser, connection, helper installation/trust and security; no universal thermal protocol |

PROPOSED: browser/OS printing first only if the identified equipment passes physical trials; a native thermal adapter is separately scoped after hardware selection. Zebra offers Browser Print for supported configurations, which does not establish shop compatibility or select a printer. [Vendor support](https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html).

OPEN inventory: make/model, firmware, resolution, printable width, USB/network/Bluetooth route, workstation/OS/browser, label dimensions/gap/black-mark or sheet pitch, adhesive, direct thermal versus transfer/ribbon, goods/surfaces and durability. No brand/purchase, DPI, dimensions, ZPL/TSPL/ESC-POS, silent printing or local helper is assumed approved. Test darkness/speed/media, curvature, glare, rubbing, moisture and adhesion on actual goods.

## 9. USB/Bluetooth and browser camera compatibility

Actual scanners must decode **2D QR**, not only 1D barcodes. Proposed USB/Bluetooth HID keyboard-wedge input uses a visible focused scan field and a configured Enter/CR/LF terminator. Verify model capability, pairing/mode, keyboard punctuation/case and prefixes/suffixes. Bluetooth HID is OS pairing; serial/SPP/vendor modes require a separately reviewed bridge, not an assumption of universal browser Bluetooth access.

A reviewed device framing profile may remove a known AIM prefix or terminator; otherwise preserve canonical bytes. Reject truncated/overlong/mixed input; do not globally strip punctuation, case-fold arbitrary scans or capture all background typing. Repeated scans only repeat lookup. Debounce is not inventory idempotency and never becomes scan-to-deduct behavior in this milestone.

Camera proposal: feature-detect native decoding and use a reviewed locally bundled fallback decoder where needed. Start camera after user action, offer supported rear-camera preference/manual fallback, handle denied permission, and stop tracks on close. No browser/device compatibility claim before trials. `getUserMedia` needs a secure context; plain HTTP shop-LAN IP on a phone is not a camera deployment plan, even if desktop localhost works. Approve LAN HTTPS/trust and actual phones/browsers. [Camera security requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

This is lookup compatibility design only: no production issue, order reference, damage recovery or stock deduction.

## 10. Security, future versions and local offline lookup

- A QR is a public reference, not permission or proof of genuine goods. Copied valid labels remain copies of the same lot, not new stock. Signing alone would not prevent copy/replay; HMAC/signing/key rotation needs a separate threat-model decision and is not silently introduced.
- Bound/validate input, parameterize queries, recheck write roles, rate-limit reads and escape text for HTML/SVG/native printer output. Do not expose arbitrary network printer addresses, remote asset loading or raw commands through user input. Artifacts require authenticated access, not public guessable URLs.
- Scan lookup does not navigate to URLs or execute URI schemes. Bundle QR/font/decoder/render assets locally. Approved bridge devices/hosts must be allowlisted if that route is selected.
- Keep application payload, symbol, API and template versions separate. Retain V1 decoding/deterministic reconstruction after upgrades; changed names or label dimensions do not change a lot QR. Unknown versions fail explicitly. Replacement policies preserve historical mappings and never silently invalidate old labels.
- Zero-balance lots remain identifiable. Current catalogue has no retirement model; do not invent automatic invalidation. Compromised-label warnings/revocation require append-only policy review because all lot units share the payload.
- Offline means local LAN/server/database remain available while internet is absent. Resolve accepted local IDs and print with local assets/drivers. Unknown remote-origin IDs remain unavailable locally; do not query cloud or manufacture mappings. LAN/server/power loss means unavailable, not cached live stock. Future replication preserves origin/lot IDs; transport is excluded.
- Retain immutable manifests/attempts/content hashes with audit/outbox foundations. Artifact retention/backup is Q08; deleting a temporary render must not erase print history or the reconstruction path.

## 11. Planned acceptance tests

**None executed in this design-only phase.** Prior receiving report results are historical evidence, not new QR verification.

| Layer | Planned acceptance evidence |
| --- | --- |
| Unit | Canonical 71-byte encode/decode; UUID/version/error cases; control/oversized input; stable reprint and distinct supplier/batch identities; no business data in payload; independent actual QR decode; integer-dot/quiet-zone/layout calculations; long codes/multilingual fit; BIGINT/chunk arithmetic and damaged-only/zero-purpose counts |
| Integration | Exact origin/lot/SKU/source/batch validation; unknown/wrong-origin tuples; session/role/allowlist checks; zero-U known lot; immutable print records; concurrent initial uniqueness; same-key replay/changed-body conflict; explicit reprint rules; rendering/handoff failures |
| Stock isolation | Snapshot all receipt/lot/stock-transaction/movement/balance rows before/after lookup, plan, job, render, download, print, cancel, reprint, failures and retries; require exact equality and unchanged stock command results. Print metadata/outbox/overall event sequence may advance, inventory cannot. Run all receiving/catalogue regressions |
| Browser | Derived plan and exact identities/counts; responsive review; permission denial; long text and asset load failure; chunk boundaries; blocked popup/cancel/unknown output; required reprint reason; no automatic second handoff after timeout; keyboard framing; camera permission/fallback/track cleanup; no production controls |
| Digital print | Decode actual SVG/PNG and rasterized final PDF/print pages independently; compare canonical bytes; measure profile dimensions/modules/margins/clipping/page breaks/fonts; exact cell/chunk counts and full critical codes/origin; safe rendering of malicious text |
| Physical | Approved printer/media/driver, ruler-measured actual size, real USB/Bluetooth 2D scanners and staff phones; orientation/light/distance, curved/glossy/small surfaces, wear/adhesion, damaged-intake marking. Record make/model/firmware/DPI/media/settings/OS/browser and measured success/failure; no untested device claims |
| Operational | Internet disconnected but LAN up: local render/resolve/print works. LAN down: unavailable, no invented data. Offline printer/jam/paper out/cancel/restart/lost acknowledgement: explicit uncertain outcome, no automatic duplicate print or stock effect. Backup/restore retains IDs and V1 decoding |

Mandatory scenario: Red30 U/2 D, Brown20 U, Pen12 U/1 D → proposed 65 copies, three distinct QR payloads, 62 usable-purpose and three marked damaged-intake copies; decoded lots correct, original U62/D3 untouched. Another Red batch and supplier resolve separately. Reprint a Red subset with reason → same identity and new print evidence only. Printing an old receipt after later stock changes never recreates its received stock.

Agree physical sample size, success/latency thresholds, working distance, wear tests and sign-off owner before implementation. PRD scan-time suggestions are not measured guarantees. Preserve physical trial matrix, digital decode evidence and actual automated commands/results in the future implementation report.

## 12. Owner decisions before implementation

| ID | Decision / required hardware input |
| --- | --- |
| Q01 | Approve opaque DYI:1 origin/lot text and authenticated in-app scan interaction, or request a reviewed tap-to-open URL alternative |
| Q02 | Supply printer/DPI/connection/media and goods/surfaces; approve dimensions/placement, full-code fit, origin footer and physical profiles; 70×40 mm remains trial-only |
| Q03 | Approve all-delivered-unit counts, same lot QR with marked damaged-intake copies, physical quarantine/affixing process and responsible operator |
| Q04 | Approve Admin/Manager print/reprint/read-only lookup and confirm Production denial for this phase, or explicitly grant a narrowly scoped resolver/manual fallback contract |
| Q05 | Approve initial full-receipt manifest versus partial initial printing, bounded chunk size (candidate 500), reprint reason/copy limits and uncertain-output verification process |
| Q06 | Select browser/OS printing initially or name exact thermal hardware/helper for a scoped adapter review; approve supported workstation/browser combinations |
| Q07 | Identify actual 2D USB/Bluetooth readers/modes and camera phones/browsers; approve framing profiles and local HTTPS/trust plan |
| Q08 | Agree physical QA sample/thresholds/sign-off, print-outcome reporting and artifact retention/backup policy |

Deliverables: this design and decision-register cross-reference only. No code/dependency/schema/stock changes; no build, automated QR test, label artifact, print or physical scan run. Hardware was not inventoried or connected. Stop for owner review of Q01–Q08; the explicit design-only instruction remains the implementation gate.

Technical references checked on 2 November 2026: DENSO margins/sizing, node-qrcode official repository, MDN print/camera APIs and Zebra Browser Print support, linked at the relevant claims above. These support technical constraints, not owner approval or hardware selection. Zebra's support listing was accessible through search; direct fetch returned 406, so exact device/OS compatibility remains to be verified against its current vendor matrix and actual hardware.
