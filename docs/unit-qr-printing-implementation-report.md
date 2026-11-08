# Milestone 3 — exact-unit QR and label printing

Status: software implementation and local verification complete; completion commit/push recorded in the progress register. No operational migration or physical-printer acceptance.

## Implemented

- DYI:2 contains immutable origin/unit UUIDs. Every six-character Unit Code resolves exactly within the configured origin. Existing DYI:1 lot identity and retained PDF renderers remain available.
- Admin/Manager can select exact saved units, inspect genuine individual QR label previews, preserve their cart across navigation, prepare purpose-separated print documents, reuse a partly used sheet, open native device printing, download a PDF fallback and selectively replace saved stickers.
- A job contains one label per selected unit, at most 500 units. No arbitrary copies or new units are created. An initial claim is unique per unit; explicit reasoned reprints preserve original content and identities.
- Lost-response retries retain the same command key/body. Native printing uses an actor-bound one-use popup intent, current-session checks and an idempotent handoff request. Refresh does not automatically print. Physical output/attachment is never asserted; there is no compulsory success/failure form.
- Production can identify a unit and see generic usable/unavailable status. Supplier/source, damaged state/history, invoice, print administration and unrestricted audit fields are excluded.

## Additive migration and transaction rules

Migration `202611070019_unit_label_manifests` adds UnitLabelJob, UnitLabelLine, UnitLabelClaim, UnitLabelArtifact and UnitLabelEvent. Applied only to isolated test fixtures. Existing lot-print and inventory tables are unchanged.

Database checks enforce exact origin/unit/lot/receipt provenance, unique exact membership, initial claims, frozen reprint lineage/content, manifest and artifact hashes, actor/role membership, immutable history and atomic command/audit/outbox evidence. Rendering happens outside the origin lock; accepting job/artifact/handoff metadata uses the existing origin-first transaction protocol. No print operation writes StockUnit, UnitEvent, UnitState, movements or balances.

## API examples

All endpoints require the existing authenticated session; mutations require an `Idempotency-Key` UUID.

```http
GET /v1/inventory/units/by-code/A7K2M9
GET /v1/units/{unitUuid}
POST /v1/qr/resolve
{"payload":"DYI:2:<existing compact origin UUID>:<compact unit UUID>"}

GET /v1/unit-label-config
GET /v1/unit-label-options?receiptId={receiptUuid}&page=1
POST /v1/unit-label-previews
{"unitIds":["<saved-unit-uuid>"]}

POST /v1/unit-label-jobs
{"kind":"INITIAL","unitIds":["<saved-unit-uuid>"],"profileId":"unit-a4-70x35-v2"}
GET /v1/unit-label-jobs?page=1&receiptId={receiptUuid}
GET /v1/unit-label-jobs/{jobUuid}
POST /v1/unit-label-jobs/{jobUuid}/artifact
{"startSlot":5,"damagedStartSlot":0}
GET /v1/unit-label-jobs/{jobUuid}/artifacts/{artifactUuid}.html
GET /v1/unit-label-jobs/{jobUuid}/artifacts/{artifactUuid}.pdf
POST /v1/unit-label-jobs/{jobUuid}/handoffs
{"attemptId":"<stable-attempt-uuid>"}
GET /v1/unit-label-jobs/{jobUuid}/handoffs?page=1

POST /v1/unit-label-jobs
{"kind":"REPRINT","originalJobId":"<saved-job-uuid>","lineIds":["<saved-line-uuid>"],"reason":"Replace a spoiled sticker after inspecting output"}
```

The QR example describes the existing compact grammar; clients use `encodeUnitQr`, not UUID string concatenation. Handoff responses explicitly contain `physicalOutcome: "NOT_CONFIRMED"`. Read DTOs use explicit allowlists; PDF/HTML bytes are authenticated, no-store and hash-addressed within the accepted artifact identity.

## Executed verification so far

- Full unit suite: **55/55 passed**, 18 files.
- Full PostgreSQL integration suite: **98/98 passed**, 14 files, 142.83 seconds. Includes exact-unit QR/print authorization, concurrent same-key replay, duplicate initial selection, immutable/late-insert denial, missing claims at commit, forced audit/outbox/command rollback and stock/unit-state preservation. Legacy receiving/catalogue/ledger/QR/printing assertions remain enabled.
- All 65 final PDF QR symbols decoded independently at 300 dpi; 65 distinct saved unit payloads. Separate legacy fixture still produces 65 copies with three shared lot identities.
- All 65 final HTML QR symbols also decoded independently at 300 dpi in the successful exact-unit browser journey. Native print invocation, lost-response retry, draft restoration, 5-sheet partial-start layout, selective replacement and Production denial passed.
- Full browser run: 21 passed, 2 failed at outdated legacy-tab/read and changed review-button expectations. Corrected focused repeat: 3/3 passed (including the two affected cases and read-error recovery), 5.2 minutes. All 23 distinct browser cases have successful results across runs; this is not a claim of one green full 23-case run. Final typecheck and production build passed.

Failed attempts are retained honestly: first browser retry interceptor also caught a later intentional reprint; it was restricted to the retry scenario. Subsequent browser assertions encountered pending artifact/read responses under development-server load; the test now explicitly waits for accepted artifact responses before checking resulting UI, preserving assertions and application timeouts. First full unit execution without loopback permissions/load isolation failed SMTP TLS and a QR timeout; full appropriately permitted repeat passed. One expanded integration attempt failed because its test helper referenced a Prisma relation not present in the schema; explicit job IDs fixed the helper, and the full suite passed.

## Remaining acceptance gates

Physical printer, label media, alignment and real device scans are unverified. Digital decoding cannot certify adhesive sheets or printer scaling. Native dialog cancellation/partial output cannot be inferred; operators inspect and select existing Unit Codes for replacement. A compromised/duplicate physical sticker can present an existing identity; later checkout must enforce one accepted transition per eligible unit.

Operational migration 014–019, historical enrollment, real invitations, deployment and cloud transport remain separately gated. Production issuing, damage recovery, closing and future domains are not enabled by this milestone. Remote CI execution remains unverified.

Changed paths are recorded in evidence/completion/milestone-3/changed-files.json. Publication is recorded in dayari-completion-progress.md after push. Next milestone: unit tracking and recorded lifecycle history.


## Preservation rehearsal and visual review

`rehearse-unit-print-metadata.ts dayari_cutover_rehearsal3_test` passed on the retained isolated through-018 fixture. Migration 019 preserved all 43 pre-existing table hashes, including stock, unit events/state, immutable receipts/commands/audit/outbox and historical print bytes. New print tables stayed empty. No operational database was upgraded.

Actual loaded 320px and 1440px screenshots inspected. Mobile preview/actions now precede the long manifest; desktop keeps manifest left and sticky individual preview/settings right. Five-width captures are retained under `docs/images/completion/milestone-3/`. The cart begins with selection when empty; review and immutable document preparation are separate so sheet placement can be chosen first.


## Final capacity and regression evidence

The final 500-unit API rehearsal passed: manifest acceptance 1,188.39 ms; artifact preparation/acceptance 3,729.01 ms; 25 sheets; stock fingerprints unchanged. The expanded print integration suite passed 8/8, including this additional case. Combined with the prior full 98-test run, 99 distinct integration cases have successful results across runs.

Final pure renderer rehearsal used one warmup and three measured runs per profile. Measured 500-unit latency ranged 2,370.57–3,296.45 ms; the process RSS peaked near 432 MB across the repeated run. These are local measurements under development load, not production hardware or concurrent-render certification. The earlier diagnostic run was faster and is not substituted for these final retained samples.

Evidence: [renderer samples](evidence/completion/milestone-3/unit-label-render-benchmark.json), [API capacity](evidence/completion/milestone-3/unit-label-api-capacity.json), [migration preservation](evidence/completion/milestone-3/unit-print-migration-preservation.json). Reviewed contact sheets covering all 40 refreshed/new synthetic UI captures, plus direct 320px/1440px individual-label inspection. Screenshots contain synthetic fixtures, not operational stock.

Final typecheck passed after correcting the negative-fixture JsonValue/InputJsonValue type. Final production build passed.


Commands executed: `npm test`; `npm run test:integration`; focused unit-QR/print integration and browser repeats; `npm run test:e2e`; `npm run typecheck`; `npm run build`; `npx tsx scripts/benchmark-unit-labels.ts`; isolated `rehearse-unit-print-metadata.ts`; `git diff --check`. No operational migration, enrollment, real invitation or deployment.
