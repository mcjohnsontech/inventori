# Requirements traceability

## Inventory experience authorization and unit-code correction — 3 November2026

| Requirement | Scope / evidence |
| --- | --- |
| Compact grouped role navigation, preserve all destinations | Slice1; compact-navigation/access browser tests |
| Inventory sheet, Product/Lot identity, exact U/D quantities, modal detail/context | Slice2; inventory-sheet/receiving/public-identities browser tests |
| Stock-first per-variant overview, lot/batch drilldown, no incompatible grand totals | Slice3; stock-overview unit/browser and existing receiving/RBAC regressions |
| Exactly six readable permanent unit characters, secure collision handling, exact origin-safe manual lookup and unique unit QR | Approved design correction only; six-character-unit-code-design.md; no Phase2 implementation |
| Secure single-use email invitation and employee-set password | Approved direction only; staff-invitation-design.md; no endpoints, account policy or schema changes |

Test names describe planned/executed coverage; actual results are recorded only in inventory-experience-slices-1-3-report.md.


## Phase B — current application coverage

| Source | Delivered boundary | Evidence |
| --- | --- | --- |
| PRD2/7/10, FR14 and approved Phase B account policy | Origin-bound active sessions, explicit immutable shop membership, fixed roles, staff administration, compulsory password change, persistent throttles, revoked-session generation fences | accounts/authentication/rbac integration suites; shared permission and schema-readiness unit tests; accounts/access browser scenarios |
| PRD6/15, Phase B operational workspaces | Admin and Manager retain catalogue/stock/receipt/printing workflows; Production receives only minimal usable discovery and exact code/QR identities | availability/receiving/catalogue/public-identities/labels integration suites; manager/production/shared browser scenarios |
| PRD4/15.2–15.4, immutable evidence | No new stock mutation or identity-allocation rule; historical ledger, codes, QR and printing remain | 48 source checks in application-preservation-evidence.json; existing ledger/QR/printing regressions |
| Phase B UX/account/history | Scoped Users & Access, own sessions/security, help, bounded operational reports, missing/forbidden/expired/unavailable states | application-visual and shared/access browser scenarios across320/390/768/1024/1440 |
| Phase B migration exclusion | No operational migration/enrollment;009/010 preserve existing users/sessions in an isolated rehearsal without implicit membership | accounts-migration integration test and implementation report |

These boundaries do not complete production issues, recovery, closing, cloud synchronization, unit serialization, reset delivery or physical hardware acceptance. Final actual test counts are in the Phase B report.

## Phase1 identity implementation status

Owner authorization received: Product/Lot codes, immutable origin-qualified allocation/new-subject guards, exact authenticated role-safe lookup and minimal existing-workspace display/entry implemented. New unit tests cover grammar/random-candidate collision bounds; integration tests cover real collisions, concurrent/idempotent catalogue/receipt writes, rollback/immutability, origin scoping/allowlists, restored-fixture backfill and unchanged legacy stock/QR/PDF/commands. Final actual results in phase-1-implementation-report.md. This does not complete universal discovery, StockUnit/DYI:2, print redesign, verification, physical hardware acceptance or operational migration.


## Owner clarification status — documentation only

A01/A02/A03/A05/A06/A07/A08 are accepted design directions with the owner's clarified boundaries; A04 remains provisional pending benchmarks/oversized-delivery policy; A09 implementation authorization remains pending. See [revised design](unit-traceability-and-label-ux-design.md), section15 checklist and section17 finalized Phase1 scope. No new feature is marked implemented.

Added acceptance specificity: UT08 must prove old receiving binaries/routes/direct runtime SQL cannot bypass post-cutover serialization; UT09 persists physical-count discrepancies separately from unassigned identity coverage; UT13 distinguishes exact partial/unknown print results, duplicate stickers and saved-unit selective reprints. Phase1 covers Product/Lot codes and exact minimal lookup/display only, with no serialization activation or unit creation. No application tests were rerun for this documentation revision.


## Proposed unit-traceability amendment — Phase 0, 3 November 2026

New owner brief is **DESIGN ONLY**; no new requirement is marked implemented. See [unit-traceability-and-label-ux-design.md](unit-traceability-and-label-ux-design.md) for current audit, API/model/UX specifications, tests UT01–UT20 and approval gates A01–A09.

| New brief requirement | Existing baseline affected | Proposed evidence |
| --- | --- | --- |
| Shared Product Code, Lot Code, Unit Code | PRD15.1/15.2, UUID/SKU identity preserved | UT01/02 code collision, origin ambiguity, immutable backfill |
| Individual serialization/atomic receiving | Reopens O1/C03; PRD1.2/3.1/12/14/15.1; FR03/12/23/24 | UT05–09 unit count/ledger equality, rollback, legacy coverage |
| V2 unit QR with V1 compatibility | FR02/20 and PRD15.4 amendment | UT10/12, exact identity and real output decoding |
| Dynamic product/variant/source discovery | FR14/17/19/22 | UT03/04/15/17, zero-stock extension and role-safe paged search |
| Unit cart/native print and exact reprints | FR02/20, old lot evidence retained | UT11–13/16, no stock effects or unit creation through print |
| Optional attachment verification | New metadata requirement; issue gate not approved | UT14/16, distinct confirmations/no stock mutation |
| Migration/hardware readiness | FR15/PRD11 and physical label gate | UT18–20, restored-data rehearsal and owner physical acceptance |

No application, schema, dependency or database migration change in Phase0. Existing milestone results below remain historical, not verification of this new design.

Brick 0 requirements baseline, 2 November 2026, with a first-slice implementation addendum below. Sources: root PRD v1.2 (section references), AGENTS.md and START_HERE.md. CONFIRMED requirements below are distinct from PROPOSED full-MVP test designs. Actual implemented/executed catalogue checks are recorded in `brick-1-report.md`; the full-MVP scenarios remain planned. OPEN qualifiers refer to `decisions.md`. FR-16 is explicitly deferred.

## Functional requirements

| Requirement | Status / source | Implementation area | Proposed acceptance evidence |
| --- | --- | --- | --- |
| FR-01 | CONFIRMED §9, §15.1–3 | Catalogue, sourcing, receipts | AT01–02: distinct delivery batches and supplier SKUs share parent; duplicate mappings rejected |
| FR-02 | CONFIRMED §9, §15.4 | Labels | AT01/06: one label per quantity; readable SKU/batch/descriptor, real QR roundtrip; O2 hardware trial |
| FR-03 | CONFIRMED §5.1, §9 | Receipt ledger/audit | AT01: local balances increase on commit; synced Admin audit retains actor/source |
| FR-04 | CONFIRMED §5.2, §9 | Scanner/reference | AT03: exact SKU/batch, retained manual unverified reference or explicit No order |
| FR-05 | CONFIRMED §5.2, §10 | Scanner/idempotency | AT09: deliberate same-QR confirmations count individually; retry same request counts once; bulk confirmation |
| FR-06 | CONFIRMED §5.3, §9 | Damage | AT05/10: exact eligible prior issue selection, BAD ID, quantity bound, cause/explanation |
| FR-07 | CONFIRMED §5.3, §9 | Disposition/audit | AT10: Manager disposition and Admin trace; forbidden actors rejected; B04 state policy OPEN |
| FR-08 | CONFIRMED §5.3, §9 | Approvals/ledger | AT11: request has no balance effect; Admin approval applies one transfer; self-approval/replay/stale availability fail safely |
| FR-09 | CONFIRMED §5.4, §9 | Reconciliation | AT12: immediate issue deduction; Manager classification event preserves original quantity; required notes for other |
| FR-10 | CONFIRMED §5.5, §9 | Completion | AT13: Manager attestation, timestamp/note, no second usable deduction or dispatch; O8/B03 OPEN |
| FR-11 | CONFIRMED §5.6, §9 | Close/counts | AT14: blocker explains failure; resolved queue permits immutable numbered snapshot; late entries distinct; O4/B05 OPEN |
| FR-12 | CONFIRMED §4, §9–10 | Ledger/corrections/audit | AT15: append-only database, approved compensations, replay/rebuild totals; original retained |
| FR-13 | CONFIRMED §7, §9 | Local operations/sync | AT08/16: outage operation, duplicate/reordered sync, crash recovery, visible lag |
| FR-14 | CONFIRMED §2, §6, §9 | Auth/view permissions | AT17: direct API calls enforce role and field scope, including exports/reports; O6/V03 OPEN |
| FR-15 | CONFIRMED §9–10 | Operations | AT18: encrypted backup restore, restart, reconciliation and no replay duplication before rollout |
| FR-16 | DEFERRED §9, §1.2 | Scope boundary | AT19: no Sheets verification, reservations or CSV flows in V1 |
| FR-17 | CONFIRMED §15.3/7 | Variant receiving | AT01: four attribute rows under one parent, new values subject to approved V03 |
| FR-18 | CONFIRMED §15.2/7 | SKU registry | AT01/20: example accepted as opaque base plus suffix, uniqueness; V01/V02 allocation OPEN |
| FR-19 | CONFIRMED §15.1/7 | Sourcing | AT02: same parent, different source-specific SKU and histories |
| FR-20 | CONFIRMED §15.4/7 | QR resolution/print | AT06/20: versioned opaque identity resolves exact SKU/batch; manual lookup authorized |
| FR-21 | CONFIRMED §15.5/7 | Multi-line issue | AT03: Red 2/Brown 3 under #2002, exact line movements after review |
| FR-22 | CONFIRMED §15.7 | Reports/counts | AT21: parent/variant/supplier/batch filters reconcile ledger, damage, adjustments and close |
| FR-23 | CONFIRMED §15.2/7 | Identity/audit | AT07: rename displays without rewriting historical IDs/attribution |
| FR-24 | CONFIRMED §15.2/3/7 | Validation/concurrency | AT04/20/22: reject duplicate normalized variants, nonpositive/fractional/overflow quantity and insufficient exact stock |

## Mandatory §15.8 scenarios

| Test | CONFIRMED scenario; PROPOSED verification details | Requirements |
| --- | --- | --- |
| AT01 | Receive Red 30, Brown 20, Tan 15, Green 25 in one delivery: four SKUs/lines, balances 30/20/15/25, 90 labels; invalid row rolls entire transaction back | FR-01–03,17–18,24 |
| AT02 | Receive Red 10 from second supplier: reuse parent/variant; distinct source SKU and batch, independent balance 10 | FR-01,19 |
| AT03 | Issue Red 2 and Brown 3 to #2002: two immutable lines; first source balances 28/17/15/25; second supplier Red stays 10 | FR-04,21 |
| AT04 | Attempt Red above available: clear error, zero lines/events/balance changes, no Brown fallback | FR-24 |
| AT05 | Damage one issued Red: in-production Red decreases one, damaged increases one, usable unchanged | FR-06,12,22 |
| AT06 | Reprint Red batch label: print log only; same QR, no receipt or movement | FR-02,20 |
| AT07 | Rename supplier/variant display text: immutable identity/source and historical audit retained | FR-23 |
| AT08 | Internet outage during multi-variant receipt/issue: local completion; unique IDs; reconnect, retry and acknowledge with exactly one replicated effect | FR-13,17,21 |

## Other acceptance and integrity cases

AT09: scan confirmation versus transport retry, mode switch and response-lost-after-commit; two deliberate confirmations with new keys remain two actions. AT10: ambiguous shared label requires issue selection; missing label controlled lookup; over-damage and concurrent damage rejected; intake path awaits O3. AT11: recovery and correction approval scope/hash/actor binding; rejected requests unchanged; delivery while offline remains pending; concurrent approval/recovery only one application. AT12: walk-in, complimentary, sample, internal use, linked reference and other classifications; audited reference typo fix; classification never deducts twice. AT13: role denial for Production completion; manual attestation and later-issue policy approved first. AT14: unresolved unlinked and necessary approval block; targeted count discrepancy; outage-only close; competing close/stock writes; reproducible cutoff; post-close receipt cannot alter original report. AT15: reject direct update/delete and invalid reversal; partial correction and dependent movements; state sums and projection rebuild equal. AT16: duplicate ID with changed payload quarantined, sequence gap/out-of-order dependency waits, poison event alert, disconnect/restart mid-commit, stale cloud decision rejected without false success; stale cloud view labelled. AT17: role matrix at API/service/query level, inactive users, unauthorized manual lookup and stale-auth logging. AT18: restore into isolated environment and compare ledger/outbox/close watermarks; recover local authority before writes resume; power restart has no half-receipts. AT19: confirm excluded scope absent and references explicitly unverified. AT20: canonical variants/default variant, SKU collisions and renames, mismatched SKU/batch FK, malformed/unsupported QR, source mismatch, retired identities. AT21: trace receipt → issue → damage → recovery, workers and counts, grouped/filter totals match ledger. AT22: two transactions competing for last units, opposite row-lock order, multi-line all-or-nothing failure, same idempotency key/same or different content, close races, one-time approval effects.

## Nonfunctional, operational and scope coverage

| ID | Status / source | Design area and evidence |
| --- | --- | --- |
| N01 | CONFIRMED §4, §10; AGENTS rules 5–7 | Every stock command: authentication, authorization, Zod validation, idempotency, atomic transaction, audit; AT15/17/22 |
| N02 | CONFIRMED §7 | Shop authority; cloud approvals not usable until received; cached users/revocations after sync, stale-auth log, server needs internet path; AT11/16/17 |
| N03 | CONFIRMED §7, §10 | Local/cloud HTTPS, secure password storage, encrypted remote backup, recovery guide; AT18; infrastructure O7/B09 |
| N04 | CONFIRMED §6–7 | Authorized health shows last success, queue failures/count, offline banner; remote views explicit data-as-of; AT16/21 |
| N05 | CONFIRMED §5.6, §11 | Targeted independent physical counts, documented discrepancies and resolutions; ledger equality is not physical proof; AT14/21 |
| N06 | PROPOSED targets §11 | Representative label trial, scan ≤2 seconds under agreed load, 8-hour disconnected shift, ≤2% sampled balance variance and zero unexplained sampled movements; B10 approval required |
| N07 | CONFIRMED §12 | Versioned software/API/sync/migrations; cloud-first compatible upgrade and rollback/restore; rehearsal in AT18 |
| N08 | CONFIRMED §1.2, §5.5 | No social/payment/customer/order/dispatch flows; unverified references and no fulfilment proof; AT13/19 |
| N09 | CONFIRMED §14 | Owner signs visibility, approval/identity boundary, hardware, pilot evidence and scope; Manager workflow validation before launch |
| N10 | CONFIRMED AGENTS; START_HERE | Brick 0 only now; vertical slices later include migration, development-only seed, negative/concurrency/acceptance tests; no production deploy without authorization |

G1 maps to FR-01/03/19/22; G2 to FR-06–09/12/23; G3 to FR-04/05/21; G4 to FR-11; G5 to FR-13/N02/N04; G6 to N05/N06. See `build-plan.md` for slice gates. At Brick 0 none of these acceptance cases had been executed; current subset verification is recorded below and in the slice report.

## First-slice implementation status

The table above remains the full-MVP plan, not a completion claim. The user authorized catalogue-only Brick 1 and its permission/manual-allocation decisions after Brick 0. See `brick-1-report.md` for actual executed results.

| Requirement | Implemented subset / remaining work |
| --- | --- |
| FR-01 | Supplier, stable location/source, shared product and SKU registration implemented; receipt/batch portion remains Brick 2 |
| FR-14 | Authenticated server-side catalogue role checks implemented; stock views and later workflow permissions remain pending |
| FR-17 | Attribute/value and variant-combination registration implemented; atomic receiving UI remains Brick 2 |
| FR-18 | Approved prefix registry + random five-digit source/product allocation and explicit variant suffixes implemented; duplicate full-code rejection retained |
| FR-19 | One parent/variant across two suppliers with independent source SKUs implemented and covered by integration/browser scenarios; batch/stock provenance remains Brick 2 |
| FR-23 | Immutable identity guards and create-event snapshots implemented; rename/supersession workflow not implemented yet |
| FR-24 | Invalid catalogue inputs, duplicate combinations and SKU collisions rejected; receipt/issue quantity and insufficient-stock cases remain later slices |

No receipt, stock-changing, label-printing, production, approval, closing, synchronization transport or pilot requirement is marked complete by this slice.


Progressive catalogue acceptance: FR-17/18/19 now include separate supplier setup, retained step drafts, explicit variant rows, atomic source/product allocation and reuse of shared parents across suppliers. Unit (8), PostgreSQL integration (11) and progressive browser acceptance (1) passed; see `progressive-catalogue-report.md`. These checks do not cover receipt/stock requirements.


## Variant extension and receiving design handoff

FR-17/18/19/23/24: Admin can extend an existing populated parent with explicit combinations/suffixes using its existing attributes and saved source base. Database uniqueness, service rejection and transactional rollback protect accepted identities; tests cover same-key concurrent replay, different-key duplicate races, source reuse, suffix collision and unchanged historical IDs. FR-14 permission guards remain unchanged. See `variant-extension-report.md` for executed checks.

FR-01/03/12/13 and §15.3 receiving remain **DESIGN ONLY**, described in `receiving-ledger-design.md`. No receipt, stock movement, balance, QR or synchronization requirement is marked implemented by that proposal. Owner review is required before Task 3.


## Brick 4 + Brick 5A implementation status

FR-01/03/12: immutable batches/receipts, multi-product/variant usable+damaged intake, ledger-derived quantities and atomic audit are implemented. FR-14: Admin/Manager operational receiving access and Production denial enforced server-side. FR-17/18/19: existing shared products/variants and supplier SKUs selected, no catalogue creation inside receiving; distinct supplier/batch provenance preserved. FR-23/24: immutable receiving evidence, positive/nonnegative checks, duplicate SKU/source rejection and transactional completeness implemented. FR-13 is local-only command/outbox foundation; cloud replay transport remains pending. FR-02/20 QR printing/scanning, issues, recovery/disposition, counts and closing remain unimplemented. Verification evidence is recorded in receiving-implementation-report.md.


## Brick 5B software verification scope

FR-02/20: local genuine QR, accepted-quantity per-item PDF labels, exact origin/lot lookup and read-only manual fallback implemented. FR-14: Admin/Manager label administration, minimal Production usable-availability lookup, receiving/print denial enforced server-side. FR-23: immutable snapshots and reprints preserve SKU/batch/lot identity. AT06/20: planned tests include final-PDF independent decoding, reprints, malformed/unknown versions and stock-row isolation; actual executed results are in qr-label-implementation-report.md. Physical printer/scanner/media acceptance remains OPEN; do not mark production QR reliability complete. FR-04/05/21 production issues and cloud synchronization remain unimplemented.


## Admin experience refinement — existing-capability integration

| Owner brief / existing requirement | Implementation | Acceptance evidence |
| --- | --- | --- |
| Coherent Admin navigation / role separation | Shared responsive shell, view/detail fragments, existing server role guards | admin.spec.ts; admin-journeys.spec.ts; catalogue/receiving/label integration denial cases |
| Shared parent / configurable variants / immutable SKU | Catalogue detail, source relationships, existing progressive creation/extension entry points | progressive.spec.ts; admin-journeys.spec.ts; catalogue integration; preservation evidence |
| Receiving, ledger correctness and replay | Focused wizard, shared validation, preserved retry key, accepted history and projections | receiving.spec.ts; receiving integration and SQL invariants |
| Exact public identity and lot provenance | Product/Lot Code display, stock filters and bounded stock/lots/:id read | public-identities.spec.ts; receiving provenance auth/origin tests |
| Existing QR/label semantics | DYI:1 lookup, camera/HID/manual, immutable A4 PDF/reprint evidence | labels.spec.ts; labels integration; unchanged PDF/service fingerprints |
| Errors, responsiveness and accessibility | Retry/cancellation, empty/loading/error states, native dialogs, skip/focus/mobile navigation | admin responsive tests across 320/390/768/1024/1440; screenshots |
| Honest supported administration | Read-only account and Admin-only minimal shop info | catalogue integration admin/shop allowlist; admin.spec.ts |

Actual final results and limitations are recorded in admin-experience-implementation-report.md. This adds no StockUnit, DYI:2, production mutation, closing or cloud transport.

## Staff invitations — owner-confirmed implementation

| Requirement | Implementation boundary | Evidence |
|---|---|---|
| Admin-only, shop-scoped invitations | InvitationsService + existing actor/proof/permission gates | invitations integration / browser tests |
| 24-hour expiry, revoke/resend, fixed approved roles | immutable StaffInvitation + guarded InvitationState + append-only events | expiry/concurrent acceptance/revocation tests |
| New email only, no account recovery | reject existing/disabled emails, unique User.email | takeover/duplicate tests |
| Staff chooses password, six characters all roles | shared accounts/invitation Zod contracts and acceptance page | unit/account/browser tests |
| No real email before verification | injected isolated transport only, encrypted queue | delivery/failure/redaction tests |
| No stock side effects | no ledger/receipt/catalogue mutation in invitation services | existing integration regressions |

## Label layout / preview refinement — 4 November 2026

FR-02/FR-20/PRD 15.4: versioned v2 layout makes SKU largest, separates damaged sheets and marks damage in monochrome; local PDF.js renders actual PDF and crop inspector. FR-12/FR-14: immutable prepared layout/hash, read-only preview, unchanged print roles and no inventory effects. Tests: label-layout unit, labels integration, public-identities UTC rehearsal, labels browser workflow. Hardware/physical scan acceptance remains open; no QR payload change.

## Staff email delivery — 4 November 2026
Approved secure staff onboarding maps to SMTP adapter/configuration, delivery status UI, isolated TLS unit tests, queue/activation integration tests and invitation/account browser checks. No plaintext password email or account recovery. Local invitation migration approved/applied; live SMTP configuration remains gated. See invitation-email-implementation-report.md.

## Milestone 2 - serialized receiving

Owner's complete V1 directive supersedes the earlier V1 shared-unit-only restriction for newly received physical units after an explicitly installed cutover. Six readable characters/UUID authority map to StockUnit, secure allocator and origin uniqueness. Exact receipt/movement membership, immutable initial events, manifest pages and state agreement map to migrations 014-018 and serialized-receiving integration tests. Existing receiving suite retains source/batch/quantity/negative-balance checks. Old quantity-only writer, including restricted-role SQL access, is rejected after cutover. Historical preservation rehearsal verifies unchanged catalogue/SKU/ledger/receipts/command/audit/print records and PDF bytes; dry-run planner creates no historical units or verification. Per-unit QR, lookup and production are subsequent milestones, not complete here.


## Milestone 3 — exact-unit QR and printing

| Approved requirement | Implementation | Verification |
|---|---|---|
| Six-character exact lookup, immutable UUID QR authority | UnitsService, DYI:2 contracts and role DTOs | unit-qr unit/integration tests |
| Retain historical DYI:1 | Version dispatch; unchanged legacy renderers/records | existing labels regressions and 65-copy/three-identity comparison |
| Exact individual label cart and selective replacements | UnitLabelJob/Line/Claim, actor/origin draft, native output and PDF | unit-labels integration/browser cases |
| No inventory effects from printing | Separate immutable metadata, atomic audit/outbox/idempotency | scoped stock/unit/event/projection preservation and rollback assertions |
| Genuine QR, offline output, separate damaged sheets | local QR library, embedded fonts, bounded profile geometry | independent final HTML/PDF raster decoding and bounds tests |
| No compulsory success reporting | explicit handoff evidence only | browser native-dialog spy; no printed/failed form |

Software checks do not certify physical printer/media reliability or authorize operational migration. Milestone report records actual executions separately.


## Milestone 4 — recorded unit history

| Requirement | Implementation | Evidence |
|---|---|---|
| Trace a Unit Code without losing browsing context | ExactUnitMatch and UnitTrackingDrawer in inventory/receipts/QR | five-width browser journey, close/focus/filter restoration |
| Actual chronology and responsible actors | UnitTrackingService union of recorded domain events ordered by accepted origin sequence | tracking integration chronology/actor assertions |
| Who presented a QR, without scan-only deduction | immutable UnitObservation and strict idempotent metadata command | concurrency/replay/conflict/rollback and stock fingerprints |
| Production privacy | server-side own-presentation query plus minimal identity DTO | negative field/event assertions including damaged unit and other actor |
| Backdated delivery versus acceptance | separate deliveredOn and server receivedAt labels | backdated fixture checks |
| No invented historical or physical verification | empty migration, explicit evidence labels and unknown verification | 48-table preservation and browser assertions |

Later checkout/order/damage/count/closing histories are added only with their domain milestones.


## Exact-unit checkout — milestone 5 implementation

FR-04/05/21: explicit checkout binds distinct exact units across products, suppliers and batches, optional opaque reusable Order IDs, approved reasons/defaults/overrides and missing-reason obligations. U-to-P occurs once per selected unit, atomically, with authentication/current shop authorization, idempotency, audit/outbox and origin sequencing. No quantity-only or DYI:1 shared-lot fallback. Production checkout reads are own-record only and omit supplier/invoice/damaged/print administration data.

Implementation: checkouts.ts shared contracts, CheckoutsService, migration 021, CheckoutWorkspace and actor/origin draft hook. Verification: tests/unit/checkouts.test.ts, tests/integration/checkouts.test.ts and tests/e2e/checkouts.spec.ts; actual final results belong in production-checkout-implementation-report.md. Manager missing-reason reconciliation, BAD, selected-unit completion and closing remain subsequent milestones. O4/O5/O8 approved rules are recorded in decisions.md; pending cloud authorization is not an accepted stock recovery/correction.


## Missing-reason reconciliation — milestone 6

| Confirmed requirement | Implementation | Verification |
|---|---|---|
| Manager classifies unexplained issues without another deduction | ReconciliationService, immutable 022 root/exact rows | unchanged stock fingerprints, rollback, concurrency and 500-exception test |
| Preserve original employee, time, Order ID and missing reason | append-only resolution; unchanged Checkout/Line/Exception and acceptance replay | original JSON equality, live outstanding count and original details drawer |
| Scoped history and filterable queue | Admin/Manager date/employee/order/unit/status queue, 20-row pages | origin collision, filters, pagination, role denial |
| Explicit review and resilient drafts | actor/origin draft, exact selection, retry key, review/Back/discard | browser lost-response/reload, cross-page selection, five widths |
| Production privacy | own checkout status only, no reconciliation or Manager remarks | direct API negatives and timeline/DTO tests |

Actual suite results are recorded in reason-reconciliation-implementation-report.md. O6 BAD scope is confirmed for the next milestone, not implemented by reconciliation.


## Exact-unit damage — milestone 7A

| Confirmed requirement | Implementation | Verification |
|---|---|---|
| Damage after issue never deducts usable twice | exact P-to-D BAD movement/event and origin-locked projections | concurrent replay, per-state quantities, original issue preservation |
| Pre-issue damage and O6 authorization | U-to-D; Production own-checkout SQL, Admin/Manager broader scope | direct API negatives, mixed invalid selection rollback, role reduction and foreign origin |
| Manager dispositions and B04 | immutable Held/Reworked metadata; exact D-to-X removal | unchanged stock/state for rework, terminal return rejection, intake and BAD lineage |
| Immutable, replay-safe evidence | DamageReport/Line, DamageReview/Line, migration 023/024 graph/census guards | late/mutable denial, forced audit failure, 500-unit sample and populated migration fingerprints |
| Actual unit lifecycle and privacy | filtered timeline, exact-code/QR draft/review/history workspace | Production note exclusions and five-width lost-response browser journey |

Pending recovery/correction execution remains deferred under O5; requests are implemented separately. Actual verification results belong in bad-reporting-implementation-report.md.


## Milestone 7B — O5 pending requests
| Requirement | Implementation / evidence | Boundary |
|---|---|---|
| Manager recovery/correction requests | AuthorizationRequestsService, immutable migrations 025/026, authorization-requests integration/browser tests | Evidence only; no stock execution |
| Scoped operational review | Admin/Manager history and operational unit timeline; Production negative tests | No unrestricted audit or substitute local approval |
| Atomic, replay-safe evidence | Origin lock, canonical command result, audit/outbox, rollback/concurrency tests | Original stock and unit fingerprints unchanged |
| Preserve historical identities | 58-table populated migration rehearsal | Isolated fixtures only; no operational migration |
| B05 targeted counts | Owner-approved roles/scope/zero tolerance in decisions.md | Separate concurrency/recount policy remains open |


## Milestone 8A — O8 selected production completion
| Requirement | Implementation and evidence | Boundary |
|---|---|---|
| Manager confirms individually selected issued units | CompletionsService, migration 027, completion integration/browser tests | Admin reviews; Production cannot administer |
| Preserve checkout, Unit Codes and reusable Order IDs | Immutable root/lines and original checkout/holder snapshots | No implicit group completion or reopened history |
| No second usable deduction | P-to-C movement/event and P/C projections; U preservation tests | No recovery/correction execution |
| Atomic/replay-safe/concurrent operation | Origin lock, exact manifest, current Manager fence, canonical result, rollback/BAD-race tests | Isolated fixtures only |
| B05 physical counts | Approved baseline in decisions.md | Separate concurrency/recount policy still pending |


## Independent milestone 10 reporting scope
| Requirement | Implementation and evidence | Boundary |
|---|---|---|
| Period movements and stock provenance | ReportsService, paginated movement DTO and source/unit drawers | Read only, exact SKU/state quantities |
| Reusable Order ID investigation | Exact case-preserved lookup across all matching checkout lines/sessions | No unique-order identity or implicit completion |
| Reconciliation and damage evidence | Original/classified reasons, pending exceptions, review outcomes and pending requests | Metadata does not become executed recovery/correction |
| Opening/ending and consumption | Ledger-derived U/P/D/C/X and per-SKU flow totals | Not certified closing; no unlike-product quantity total |
| Security and preservation | Production/origin denial and fingerprint tests | No raw security audit, valuation or mutations |
| Certified closing history | Dependent on B05/O4 slices | Not implemented or fabricated by these reports |
