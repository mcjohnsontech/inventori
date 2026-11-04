# Labels & printing redesign — implementation report

4 November 2026. Scope: existing lot-label printing and layout only. No StockUnit, DYI:2, receiving changes, ledger mutations, schema migrations, operational backfills or deployment.

## Findings and implemented decisions

The existing system already had immutable full-receipt manifests, explicit reprints, 500-copy PDF parts, role enforcement and append-only output reports. Its PDF preview was an embedded browser viewer; profiles lacked gaps, start slots and purpose-separated sheets. The supplied image was used as a layout guide; no separate brief file was supplied.

The screen now has a compact purpose-grouped queue and first-free-slot picker on the left, a sticky PDF sheet preview and label inspector on the right, and print actions below. The accepted delivery selector collapses after a job is opened. Receipts retain their supported inline printing entry point. Initial counts remain authoritative receipt counts; quantity edits still belong to explicit, reasoned reprints.

Each purpose has an independent start slot. Slots are zero-based in the API and displayed as human label numbers. Skipped positions remain blank only on the first sheet of that purpose in the current PDF part. New pages start at position one. The picker supports keyboard arrows and roving focus. New v2 manifests group usable before damaged and never mix their labels on a sheet.

Draft PDF generation is read-only. Users can change positions without creating print events. Preparing or printing saves the exact layout in immutable ARTIFACT_READY evidence; later changes conflict and require an explicit reprint. Settings belong to a PDF part, not a mutable global printer preference. This preserves existing historical profile/renderer provenance guards without a migration.

## PDF and profile implementation

PDF.js 6.5.438 and its module worker are bundled locally. The canvas renders the authenticated generated PDF; the actual-size inspector crops pixels from that same rendered PDF page. No HTML imitation, QR regeneration, CDN or external preview/font service was added. A sheet pager and labelled clickable regions select labels. Fetches and rendering cancel on changes/unmount; errors expose a retry. Print is enabled only after a sheet renders successfully.

New profile IDs: a4-70x35-v2 and a4-90x45-v2. They retain the existing A4 trial label dimensions and introduce explicit gap data and versioned layout behavior. Profile geometry includes margins, gaps and optional printable insets. Invalid rectangles are reported and rejected before output; nothing is silently clipped. The physical printer's printable area is not known: absent configured insets means page-bound checks, not hardware certification. Edge-touching cells are flagged. Physical alignment and scan trials remain necessary.

New PDFs put the saved SKU in the largest type (12pt/14pt depending on profile), next to a genuine QR. Full SKU/batch overflow rejects output. Descriptions may be shortened visibly; full details remain in the inspector. Damaged intake uses a heavy border and black warning band with white text, so the distinction survives monochrome printing. QR payloads remain DYI:1 origin + immutable lot UUID, unchanged for usable/damaged copies of the same lot.

Screen millimetres use CSS's 96-DPI layout convention; physical monitor calibration varies. Device printing uses the original PDF at 100%, not a screenshot or the inspector canvas.

## Historical compatibility and timestamp repair

The v1 renderer was retained unchanged as label-pdf-v1.ts. Historical jobs/reprints retain their original fixed positions, sheet order and renderer; they gain the in-page preview. New offsets and automatic purpose separation apply to v2 jobs. Existing constraints requiring reprints to retain their original profile/renderer were not weakened.

Read-only operational verification initially found that the recently pulled UTC connection fix changed reconstruction metadata for old PDFs. All four retained artifacts reproduced exactly when using their original immutable accepted-manifest timestamp. Rendering now takes that timestamp from the original CommandResult response, while canonical database records stay unchanged. Hash validation remains strict. All four existing historical PDF hashes then verified through the finalized service. A regression simulates changed timestamp reads and asserts identical retained bytes. The isolated migration-rehearsal adapter now follows the existing UTC connection convention.

## API and evidence

- POST /v1/label-print-jobs/:id/preview, authenticated Admin/Manager: {chunk:"0",layout:{startSlot:5,damagedStartSlot:3}}. Returns PDF + X-Artifact-SHA256; no command, audit, outbox or print event is created.
- POST /v1/label-print-jobs/:id/artifacts/:chunk: optional {startSlot,damagedStartSlot}, with existing idempotency key. Returns layout, pages, edge-label count, copies, retained hash and authenticated PDF URL. Empty-body reopen reuses saved layout. A different layout after acceptance conflicts.
- Existing PDF GET and print-event endpoints retain their permissions and immutable evidence. No new database tables, columns or migrations.

Native handoff uses the same prepared PDF, opens a device-print window and requests printing once, with native PDF controls/download as fallback. Browser capabilities vary, so no DIALOG_OPENED or physical success is fabricated. Operator reports remain explicit. Another handoff requires acknowledgement of previous output. Partial/uncertain outcomes and selective reprints retain their existing audit/idempotency behavior.

Alignment trial opens the same PDF and instructs the operator to select page one on plain paper in the native dialog. It does not silently generate a different label document or claim a hardware trial succeeded. Physical dialog/printer behavior cannot be certified by headless tests.

## Verification status

Executed checks:

- Unit tests: 35 passed, 13 files. Includes placements, separate purposes, BIGINT part counts, gap/printable-area rejection, deterministic PDF bytes, largest SKU text and independent decoding of final PDF QR pixels.
- Full PostgreSQL integration tests: 78 passed, 11 files. Includes legacy and v2 artifacts, preview/save byte equality, frozen layout conflicts, original quantities, metadata-only preview, role denial, idempotency, unchanged stock, historical reconstruction and migration rehearsal.
- Initial targeted browser workflow passed with internet requests blocked. It exercises independent start picks, five-sheet paging, canvas inspector, prepared artifact, download, native handoff, uncertain outcome, explicit reprint, draft warning and Production denial.
- Full browser run: 18 passed, 1 failed because the shared report deep-link test expected the removed “Initial label manifest” heading. Updated it to assert the new print queue and exact batch identity; `npm run test:e2e -- tests/e2e/shared.spec.ts` then passed 1/1. All 19 browser cases have passed across those runs; this is not a claim of a fresh 19/19 full run after that test-only correction. The earlier admin-journey heading assertion was updated in the same way. No workflow assertion was removed. Chrome was selected with `PLAYWRIGHT_CHANNEL=chrome`.
- Five-viewport label evidence captured at 320, 390, 768, 1024 and 1440px, with no document overflow. Desktop and mobile images were visually reviewed.
- `npm run typecheck`: passed. `npm run build`: passed, including Prisma client generation, API compilation, production webpack compilation, TypeScript, static pages and build traces. No database migration command was run.

Earlier failures: cold Next startup exceeded 120 seconds before tests executed; browser-server startup allowance is now 240 seconds, without relaxing workflow assertions. A new read-only preview initially returned Nest's default 201; corrected to 200. Historical hash/migration-rehearsal failures were corrected using accepted rendering timestamps and the UTC rehearsal convention. Existing expected forced-failure tests and PostgreSQL adapter deprecation warnings are not hidden.

## Remaining limits

No physical printer, adhesive stock, monitor calibration or real device dialog has been certified. Historical fixed-layout jobs cannot be silently reformatted. Existing latest-100 receipt/job lists and 500-copy PDF parts remain. This work adds no unit serialization or inventory transitions.

## Browser evidence and visual review

Screenshots use isolated synthetic catalogue/receipt data. Desktop and mobile screenshots were inspected, then queue density, collapsible paper settings, picker size and preview wrapping were refined. All requested widths assert no document horizontal overflow. The 100% inspector retains physical layout dimensions inside a scrollable container when necessary; it never rescales the print PDF.

- [Desktop, 1440px](images/labels-redesign/workspace-1440.png)
- [Laptop, 1024px](images/labels-redesign/workspace-1024.png)
- [Tablet, 768px](images/labels-redesign/workspace-768.png)
- [Mobile, 390px](images/labels-redesign/workspace-390.png)
- [Small mobile, 320px](images/labels-redesign/workspace-320.png)
- [Second sheet](images/labels-redesign/second-sheet.png)

The bottom action bar stays reachable while scrolling; full-page screenshots capture its current viewport position. The main screen contains canvas previews, not an embedded browser PDF viewer. The separate native print window retains PDF controls as a browser-dependent fallback.

## Changed files and preservation

- API: `apps/api/src/app.ts`, `labels.service.ts`, `label-pdf.ts`, new `label-pdf-v1.ts`.
- Contracts: `packages/contracts/src/labels.ts`, `index.ts`, new `label-layout.ts`.
- Web: `apps/web/app/api/[...path]/route.ts`, `components/labels/label-workspace.tsx`, new `pdf-sheet-preview.tsx` and `sheet-start-picker.tsx`, `components/receiving/receipt-details.tsx`, `apps/web/package.json`.
- Lockfile: `package-lock.json`; promotes the already-pinned PDF.js version to the web runtime, with corresponding optional dependency flags. No unrelated dependency upgrade.
- Tests: new `tests/unit/label-layout.test.ts`; `tests/integration/labels.test.ts`, `public-identities.test.ts`; `tests/e2e/labels.spec.ts`, `admin-journeys.spec.ts`, `shared.spec.ts`; `playwright.config.ts` startup allowance.
- Documentation: this report, `labels-printing-redesign-plan.md`, `architecture.md`, `decisions.md`, `requirements-traceability.md`, `IMPLEMENTATION_BRICKS.md`, and the six screenshots above.

No Prisma schema, migration, catalogue, receiving command, account service, public-code allocation or QR codec changes. The legacy renderer was checked against its original source. Historical artifact verification was read-only. Test mutations used isolated test fixtures. Unrelated invitation screenshots regenerated by the full browser suite are excluded from this change. No operational migrations, backfills, live email or deployment were performed.

## Publication and next review

Publication will be recorded after final checks. Review the software changes, then perform an alignment and physical QR scan trial on the intended printer/media. No next inventory phase is started automatically.
