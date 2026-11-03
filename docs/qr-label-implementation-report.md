# Brick 5B — QR identity, A4 PDF labels and lookup

Authorization: owner Q01–Q08 approval, 3 November 2026. Local-development implementation only. **Not production-ready: actual printer/media/device physical acceptance remains outstanding.** No production stock issues, deductions, reservations, orders, production damage, recovery/disposition, corrections, counts, closing, cloud transport, per-unit serialization or thermal adapters were implemented.

## Implemented workflows

Admin/Manager can open Labels & printing, select a receipt, review server-derived counts, choose a versioned A4 trial profile and create its one initial full-receipt manifest. Accepted receiving detail also has Print labels for this receipt, linking the existing receipt directly to its plan. Every positive usable/damaged part appears in the manifest; no current balance is used to replace accepted receipt quantities.

The operator prepares a bounded PDF part, previews or downloads it, then explicitly opens the PDF viewer to print using the OS controls. A handoff is recorded only for that deliberate action. The app does not silently print. Operator-reported printed copies, failure, cancellation before handoff and uncertain output are separate append-only evidence. After previous handoff, the UI requires acknowledgement of checking prior output before another attempt. PDF files can still be printed outside the app; counts are not verified physical output or affixing.

Explicit reprints select original lot/purpose lines, positive counts and a meaningful reason. QR bytes, receipt-time content, original profile and renderer are retained; another manifest/evidence record is created, no stock. Partial initial output is through deterministic chunks of the full initial manifest, not multiple initial manifests. Initial layout/font preflight runs outside write locks before reserving the initial manifest, so a rejected profile can be corrected without an unprintable accepted job blocking the receipt.

QR lookup is available to all three roles. A focused keyboard-wedge field handles one terminal CR/LF and optionally the explicitly selected AIM ]Q3 framing profile; case/punctuation are never globally changed. Exact manual fallback selects a local source and matches exact saved SKU plus origin-qualified batch. Camera access is user initiated with secure-context/permission checks, rear-camera preference, native QR detection where available and bundled ZXing fallback. Closing/unmounting or pending-start cancellation stops owned media tracks. No scan creates an issue or stock change.

## Payload and resolver

Canonical application V1: `DYI:1:<ORIGIN_UUID_32_UPPER_HEX>:<STOCK_LOT_UUID_32_UPPER_HEX>`, exactly 71 ASCII characters. No random mapping table or unit serial. One existing immutable StockLot produces one payload; all usable/damaged copies for that lot share it. Different lots/origins differ. There are no business names, URLs, credentials, quantities or state inside the QR.

POST /v1/qr/resolve accepts only payload. Strict bounded parsing rejects malformed/lowercase/trailing/control/oversized input with 400, recognizes unsupported envelope versions with 422, returns 401/403 for authentication/authorization failures and 404 for an unavailable local origin/lot. It validates the persisted lot/batch/SKU/product/source joins locally; never queries cloud. Zero usable lots remain resolvable. Resolution and manual lookup create no print jobs, commands, audit/outbox or inventory effects. Lookup is rate-limited to 120 operations per actor per minute in this local process.

Manual endpoints: GET /v1/qr/manual-sources and POST /v1/qr/manual with sourceId, originId, fullSku and publicBatchCode. No approximate match or new identity creation. The source list exposes only operational source identity fields for locally accepted lots, without balances or administrative data.

| Role | Resolver / manual lookup | Print plan/jobs/artifacts/events |
| --- | --- | --- |
| Admin | Identity, usable/damaged lot quantity, supplier/source names | Allowed |
| Manager | Same operational fields | Allowed; no new catalogue/correction/approval rights |
| Production | Product/variant/SKU/batch/lot/origin, usable availability and local as-of only | Denied server-side |

Production receives no damaged arrival explanations, invoice, valuation, supplier/source detail fields, print history or unrestricted audit. Existing receiving/stock/catalogue restrictions remain. Shared QR availability is a lot quantity, not proof of an individual physical unit's state.

## Additive schema and transactions

Added LabelPrintJob, LabelPrintJobLine and LabelPrintEvent with scalar Prisma identities and migration-owned FKs/guards:

- 202611030005_qr_labels: immutable print job/line/event tables, one initial manifest per receipt, canonical origin/lot payload and line provenance, complete accepted initial counts, unique line/purpose/ordinal, positive counts, closed-manifest insertion guard and deferred command linkage.
- 202611030006_label_evidence_guards: deferred active Admin/Manager actor, SHOP/origin, command/audit/outbox and receipt evidence; reprint original receipt/profile/renderer/content/payload provenance and per-line copy bound. This separate migration strengthened metadata after 005 had been applied; no prior migration was rewritten.

Both migrations applied to local development and isolated test PostgreSQL. No inventory table or historical identity was changed. LabelPrintJob holds profile snapshot, renderer version, manifest hash, total copies, original-job reference and reason. Lines hold receipt-line/lot/purpose/count/content/payload. Events distinguish REQUESTED, ARTIFACT_READY, HANDOFF_REQUESTED, DIALOG_OPENED when observable, OPERATOR_REPORTED_PRINTED, CANCELLED_BEFORE_HANDOFF, FAILED and OUTCOME_UNKNOWN. The browser PDF viewer's actual dialog is not observable, so the UI does not fabricate DIALOG_OPENED events.

Metadata writes reuse OriginNode FOR UPDATE → active User FOR SHARE → command key/hash replay/conflict → metadata rows → immutable audit/outbox → CommandResult → deferred checks → commit. They advance general origin event sequence, never StockTransaction or stock quantities. Deadlock/serialization conflicts retry twice with the same key. Same-key/body retries replay accepted results; changed bodies conflict. Concurrent separate initial requests conflict rather than creating another initial manifest. Event attempts are bound to one chunk; final reports cannot be overwritten. An unknown outcome can later receive an explicit operator report without deleting the earlier uncertainty.

PDF rendering and profile preflight are outside database locks. At most two renders per API instance run concurrently; busy callers receive a retryable conflict. Failures do not start printers or mutate stock. Profile preflight failure saves no initial manifest, leaving a reviewed larger profile selectable.

## A4 rendering, profiles and counts

Local pinned generator: qrcode 1.5.4, PDFKit 0.20.2. Local Noto Sans Regular/Bold files are embedded and distributed with their SIL Open Font License. No fonts, QR images or documents are fetched remotely at runtime. Camera fallback @zxing/browser 0.2.1 is bundled locally. Independent test decoder jsQR 1.4.0 and PDF.js 6.5.438/@napi-rs/canvas 1.1.0 are development dependencies. Installation audit reported zero vulnerabilities.

| Profile | Page | Cells | Placement / capacity |
| --- | --- | --- | --- |
| a4-70x35-v1 | 210×297 mm | 70×35 mm, 3 columns ×7 rows | X margins/gutters 0; Y margins26 mm each, gaps0; 21 per sheet |
| a4-90x45-v1 | 210×297 mm | Larger trial, 90×45 mm, 2×5 | X margins15 mm, Y margins36 mm; gaps0; 10 per sheet |

These are software/ordinary-paper cut-and-attach trial profiles, not certified adhesive-sheet pitches or printer compatibility. Essential content is inset4 mm horizontally; some real printers may still require the larger profile or another reviewed layout. No page scaling is performed to force the three-column geometry inside an imaginary printer margin.

QRs are actual vector square matrices, alphanumeric mode, correction level M, four-module quiet zone, no logos/overlays. The 71-character payload gives 33 symbol modules; including margins, 41 modules. The first profile uses a logical203-DPI geometry with four dots/module: module≈0.5005 mm, total QR≈20.52 mm. This is a physical sizing grid, not a claim that the A4 printer is203 DPI. The larger profile uses five logical dots/module (≈25.65 mm total). All modules share one fixed vector scale; no stretching or resampling is used. Physical scan reliability still requires the actual printer trial.

SKU and batch are complete, bold, measured text. A non-fitting critical code is rejected rather than clipped or reduced indefinitely. Supported multilingual descriptors are wrapped/explicitly abbreviated with ellipsis; full identity remains in the manifest/lookup. Missing embedded-font glyphs are rejected explicitly, not rendered as silent replacement boxes. Noto Sans covers tested Yoruba/French/Greek examples, not every language/script; unsupported text needs a reviewed font version. Full origin remains in manifest and QR, not forced into the label.

Damaged copies visibly say **DAMAGED INTAKE — NOT FOR PRODUCTION** in black. Same QR as usable copies of that lot. Staff are responsible for attachment/segregation; the software certifies neither. The sample65 has62 usable-purpose and3 damaged-intake copies, three distinct payloads, four A4 sheets at21 capacity.

Each artifact has at most500 labels. Offsets use BIGINT-safe arithmetic; chunk boundaries and order are stable (receipt line, usable then damaged). PDFs start fresh sheets per chunk: a501-copy reprint at21 per sheet uses24 sheets for the500-copy part plus1 sheet for the remaining copy, total25. Sheet counts derive from the actual profile and chunk boundaries, not just ceil(total/21).

Per-request limits: initial manifest follows the receiving limit of100 distinct SKU lines, stored as compact counts, not one row per physical unit. Reprint has1–100 distinct existing lot/purpose selections,1–10000 decimal-string copies each, meaningful10–1000-character reason. The existing32,000-byte proxy/API body cap also applies. Huge manifests do not become a huge in-memory document: only a selected≤500-copy part is rendered.

## API and artifact lifecycle

| Endpoint | Behavior |
| --- | --- |
| GET /v1/receipts/:id/label-plan | Authorized accepted counts, profiles, existing initial job reference |
| GET /v1/label-print-jobs | Latest100 local operational job summaries |
| POST /v1/label-print-jobs | Initial receipt/profile or explicit original-job/reason/selected-purpose reprint; idempotency key |
| GET /v1/label-print-jobs/:id | Manifest, exact counts/content/payload/version/hash, append-only attempts |
| POST /v1/label-print-jobs/:id/artifacts/:chunk | Render outside locks, record ARTIFACT_READY/hash with idempotent metadata command; zero-based chunk |
| GET /v1/label-print-jobs/:id/artifacts/:chunk.pdf | Authenticated binary PDF, previously prepared chunk, verify deterministic SHA256 against retained event |
| POST /v1/label-print-jobs/:id/events | Idempotent bounded explicit attempt/outcome event |

Initial request example: `{ "kind":"INITIAL", "receiptId":"<UUID>", "profileId":"a4-70x35-v1" }`.
Reprint: `{ "kind":"REPRINT", "originalJobId":"<UUID>", "reason":"Labels spoiled during printer jam", "lines":[{"lotId":"<UUID>","purpose":"USABLE","copies":"2"}] }`.
Handoff: `{ "kind":"HANDOFF_REQUESTED", "chunk":"0", "attemptId":"<UUID>", "note":"Operator explicitly opened PDF" }`.
Reported output: same chunk/attemptId, kind OPERATOR_REPORTED_PRINTED, copies decimal string no greater than that artifact. This is an operator report, not machine/physical certification.

Same-origin Next proxy forwards the authenticated binary PDF and hash without treating it as JSON. No-store responses and bounded artifact-specific timeout are used. Preview/download do not automatically hand off or print. UI opens the PDF viewer on explicit action; user operates its Print control. Popup blocking does not trigger an automatic retry.

## Verification and evidence

Executed results are recorded here only after successful completion:

- Dependency installation and Prisma generation: passed; installation audit0 vulnerabilities.
- Migration deployment005/006: passed on local development and isolated test databases.
- Unit suite:16 passed across5 files, including canonical payload, malformed/version errors, real PNG independent decode, module/quiet-zone calculation, exact profile geometry, bounded reprints and BIGINT chunks.
- Full integration suite before final preflight additions:32 passed (all25 previous tests +7 QR/label tests).
- Targeted final QR/label integration:9 passed, including layout preflight and injected late audit rollback.
- Full integration run including PDF chunk evidence:34 passed across4 files (25 existing regression/migration tests +9 QR/label tests). Final full rerun after input normalization also passed34/34 across4 files (36.01s).
- Final browser suite:4 passed (2.6 minutes): labels42.9s, progressive catalogue25.5s, first existing-product variant22.8s, receiving12.6s. All existing browser regressions passed.
- Final workspace typecheck (`npm run typecheck`): passed, including test sources. Production build (`npm run build`): passed, contracts + Prisma generation + API + optimized Next.js web.
- Local running application smoke: web3000 HTTP200; authenticated label-print-jobs and qr/manual-sources HTTP200; logout HTTP200. An initial smoke used an incorrect /auth/login path (404); corrected to the existing /sessions route, with no application changes.

The PDF test independently decodes **every one of65 QR copies from rasterized final PDF pages at300 DPI**, checks A4 dimensions, four pages, three distinct identities and three damaged markings. Deterministic regeneration produced byte-identical PDF bytes and matching stored SHA256. Tests compare complete rows for all seven inventory tables and receiving CommandResults before/after resolution/manual reads, initial jobs, plans, PDF artifacts, handoff/outcomes, reprints, failures and immutable metadata checks. Label metadata alone may grow. Explicit zero-usable/damaged-only lot lookup returns usable0 successfully. Late metadata audit failure leaves jobs/lines/events, commands, audit/outbox and origin sequence unchanged; layout failure leaves no initial manifest.

Browser tests exercise accepted receipt → plan → manifest → PDF preview/download → explicit handoff → uncertain output →501-copy reprint/second part → Production minimal QR/manual lookup, print denial, denied/unavailable camera and unavailable server. They block nonlocal browser requests to simulate internet unavailable while LAN remains accessible. This is automated local-dependency evidence, not a physical shop NIC/outage or hardware test.

Development failures corrected: unsafe BIGINT refinement on malformed decimal input was changed to guard grammar before conversion; PDF.js6 cleanup uses the loading-task API; CommonJS jsQR test typing and Prisma JSON typing were corrected. The initial browser label flow timed out at a label-based selector on the manual source dropdown; trace showed an83-second selector wait, not a slow PDF or failed stock operation. Changed it to the actual combobox role/name and reran, without extending the timeout or removing assertions. A later assertion matched both the app alert and Next.js route announcer; its selector was narrowed to the relevant text. One overlapped integration run timed out connecting to PostgreSQL; the sequential full rerun passed34 tests. A long catalogue browser run timed out under resource contention; its full-page screenshots included growing retained fixture tables, so captures were bounded to the viewport and the unchanged assertions rerun sequentially. Final command results supersede these development failures. Non-blocking Node NO_COLOR/FORCE_COLOR warnings may appear.

## Sample artifacts and retention

Evidence is retained in `artifacts/brick-5b/`: `receipt-65-labels.pdf` (65 copies,4 A4 pages), `reprint-501-part-1.pdf` (500-copy part,24 pages), `browser-initial.pdf`, `receipt-first-page.png`, `receipt-damaged-page.png`, `labels-desktop.png`, `labels-mobile.png`, `production-qr-lookup.png`, `sample-manifest.json` and `evidence.json` (file lengths/SHA256). Raster and mobile evidence were visually inspected. The manifest includes the full origin, exact lot identities and profile snapshot. They use isolated test fixtures, not live shop stock. A sample printed QR will not resolve in the development shop database if its origin/lot belongs only to the test database. Use the included PDF for sizing/digital decoding, then generate a matching label for an already accepted real development receipt for an in-app shop trial; do not receive fictitious goods into real inventory just to obtain a label.

No temporary PDF is the sole history. PostgreSQL retains immutable manifest, original receipt content, origin/lot payloads, template/profile snapshot, pinned renderer identifier, copy counts, SHA256 artifact-ready events and attempts. PDFs reconstruct deterministically from these records plus the matching renderer/fonts. Keep versioned renderer source, lockfile and font assets with database backups; a future renderer change must retain the old version/restore path. Unknown historical renderer versions fail explicitly rather than silently generate a different PDF. Retention duration and production archive procedures remain deployment decisions; no automatic metadata deletion exists.

## Physical acceptance instructions — not performed

1. Record actual A4 printer make/model, driver, firmware if known, paper/sticker stock, workstation/OS/browser and settings.
2. Print one trial at A4 actual size/100%, with Fit to page disabled and headers/footers off. Verify a measured70×35 mm cell,210×297 mm page,26 mm vertical edge margins and no horizontal scaling. On plain paper, measure repeated QR-anchor spacing:70 mm horizontally and35 mm vertically; no commercial die-cut boundaries are implied. No commercial adhesive-sheet pitch is assumed.
3. Check essential QR/SKU/batch and damaged warning are not clipped by non-printable printer margins. If they are, stop and use/review a larger-margin profile rather than shrink the page.
4. Measure QR/margins; scan real labels with intended2D USB/Bluetooth readers and staff phones, across working distance, orientation/light and actual notebook/pen/bottle surfaces. Record every success/failure, readability and adhesion/handling durability.
5. Test staff segregation/attachment for damaged goods; do not infer individual state from a shared QR. Ordinary paper does not establish durable identification.
6. Use the matching local app/database for exact lookup and record identity/availability; confirm scans never create stock transactions. Camera phones require trusted LAN HTTPS, not HTTP LAN IP; localhost development is not proof of phone readiness.
7. Record outcome and named owner sign-off. Until completed, Brick5B is software-verified local development only, not production-certified.

Local HTTPS plan: allocate a stable shop LAN hostname, terminate TLS at the local reverse proxy, install/trust its locally managed CA on approved devices, preserve same-origin session/proxy controls and allow camera only from that trusted shop origin. Certificates/keys stay outside source control and need renewal/backup ownership. No certificate/network/hardware installation was performed by this milestone. Supported scanner models and camera combinations remain physically unverified; HID implementation does not claim every scanner or Bluetooth serial mode works.

## Changed files and scope

Application/schema:
- packages/contracts/src/labels.ts (new), index.ts export.
- prisma/schema.prisma; new migrations202611030005_qr_labels and202611030006_label_evidence_guards.
- apps/api/src/label-pdf.ts and labels.service.ts (new), app.ts routes/providers.
- apps/api/assets/fonts/NotoSans-Regular.ttf, NotoSans-Bold.ttf, OFL.txt (new local licensed assets).
- apps/web/components/labels/label-workspace.tsx and qr-workspace.tsx (new); app/page.tsx; app/api/[...path]/route.ts; receiving/receiving-workspace.tsx accepted-receipt link.
- Root/API/web package manifests and package-lock.json: pinned encoder/PDF/camera and independent decoding test dependencies.

Tests/docs:
- tests/unit/labels.test.ts; tests/integration/labels.test.ts; tests/e2e/labels.spec.ts (new); tests/e2e/progressive.spec.ts bounds screenshots to the viewport.
- docs/qr-label-design.md, decisions.md, architecture.md, data-model.md, ledger-invariants.md, requirements-traceability.md, IMPLEMENTATION_BRICKS.md, README.md; this report and sample artifact directory.

No stock models/migrations001–004, supplier/location prefixes, products, variants, sourcing or SKU allocation rules were rewritten. Production receives only new approved lookup rights, never receiving/catalogue/print administration. Larger Unicode coverage, printer-specific sheet profiles, physical certification and retention duration are explicit limitations/deployment reviews, not silently approved hardware claims. No thermal helper, direct device commands, cloud sync or future inventory operation exists.

Next milestone: owner physical A4/scanner acceptance and software review first. Production issuing would be a separately authorized vertical slice after its permission/reference and eligibility review. Stop for review here.


Technical implementation references reviewed: [node-qrcode](https://github.com/soldair/node-qrcode), [PDFKit local font embedding](https://pdfkit.org/docs/text.html), [ZXing browser scanner lifecycle](https://github.com/zxing-js/browser), [PDF.js rendering examples](https://mozilla.github.io/pdf.js/getting_started/). All rendering/decoding is local; these references are documentation, not runtime services.

Final verification commands: `node scripts/run-vitest.mjs run`; `node scripts/run-vitest.mjs run --config vitest.integration.config.ts`; `$env:PLAYWRIGHT_CHANNEL="chrome"; npm run test:e2e`; `npm run typecheck`; `npm run build`. Migration deployment and Prisma generation used the existing configured local development and guarded isolated test databases. No production deployment or physical print/scan was performed.
