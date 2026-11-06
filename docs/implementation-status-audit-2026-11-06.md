# Dayari Inventory: implementation status audit

Date: 6 November 2026, Africa/Lagos.

Audited branch: `feat/complete-application-systems`. Application baseline: `811e4bb1648551222abe0a270d75da5387924197`. Working tree was clean before this documentation audit.

## Current position

Dayari has an implemented local catalogue, receiving, usable/damaged-intake ledger, batch inventory browser, lot QR/label printing and shop-scoped staff/account system. It is beyond a dashboard prototype, but it is **not the complete PRD MVP or a verified production deployment**.

The current supported stock-changing workflow is receiving. There are no production issues, post-receipt damage transfers, recoveries, corrections, physical counts or day closes. Consequently the application cannot yet account for stock that employees take into production. Scanning a QR identifies stock; it does not deduct it.

Individual units are not serialized. Product Codes and Lot Codes exist; six-character Unit Codes and DYI:2 remain design work. Printing fifty labels for one lot currently repeats that lot's identity rather than creating fifty independently traceable identities.

## Audit method and evidence limits

Read the actual root `Dayari_Inventory_PRD_v1_2_Comprehensive.docx`, including section 15, implementation bricks, decisions, architecture/design/implementation reports, current Prisma schema and migrations, API routes/services/contracts, frontend workspaces and test sources. Compared newer commits with older milestone claims. No application implementation, migration, backfill, stock write, account change, email send or deployment was performed by this audit.

Fresh checks on this checkout:

- `npm test`: **50 passed across 15 files**.
- `npm run typecheck`: **passed** for contracts, API, web and root/test TypeScript.
- Read-only operational migration query: all **13 migrations, 001 through 013**, are recorded as successfully applied. This is local database state, not evidence of production rollout.
- Read-only mail configuration inspection: SMTP mode, live-enable and sender-verification flags are set; credentials and public invitation URL are present. No secrets or actual values were printed.
- Operational `InvitationMail` grouped-status query returned **no rows**. This database therefore provides no persisted invitation-delivery evidence. Configuration is not proof of SMTP authentication, domain verification, link reachability or inbox delivery.

Integration/browser suites and production build were **not rerun for this audit**. Their existing tests and historical reports provide coverage evidence, not a fresh all-green release certification for this HEAD. Earlier reports record successful builds, isolated PostgreSQL checks, browser workflows and preservation rehearsals at their respective milestones. No real-device scanner, printer, outage shift or physical count was performed here.

## Implemented capabilities

| Area | What exists in code and UI | Boundary / remaining work |
|---|---|---|
| Foundation | TypeScript workspaces; Next/React/Tailwind web; Nest API; Prisma/PostgreSQL; shared Zod contracts; versioned `/v1` routes; development setup and health endpoint | Compose currently provisions PostgreSQL only. Web/API run separately. No tracked GitHub Actions workflow or lint script was found. Full reproducible deployment and CI gate remain incomplete. |
| Authentication | Scrypt passwords, hashed server session tokens, eight-hour sessions, login throttling, same-origin browser proxy, HttpOnly/SameSite cookie handling, logout, expiry/deactivation denial, compulsory first password change | HTTPS/LAN deployment and full security rollout need operational verification. No approved password-recovery/reset implementation. Six-character password minimum follows the later owner decision. |
| Staff administration | Shop membership; searchable/paginated directory; create staff; edit supported name/role/status; deactivate/reactivate; inspect recent sessions; revoke sessions; own password change | Admin-only. Prevents self-deactivation/demotion and last-active-Admin removal. No public staff self-registration, configurable roles or password-reset delivery. |
| Invitations | Admin creation/resend/revoke; 24-hour single-use link; employee chooses password; encrypted delivery queue; token hashes; expiration/revocation/rate limits; origin checks; SMTP STARTTLS adapter and isolated test transport | Configured locally, but no persisted operational delivery/acceptance evidence in the inspected queue. Existing/disabled accounts cannot be recovered through invitations. Controlled end-to-end real email validation remains. |
| Catalogue | Shared parent products, attributes/values, variant combinations, extension of an existing variant set, supplier sourcing, preserved SKU identities, explicit duplicate handling | General catalogue writes remain Admin-only. Admin and Manager may register products/variants through the dedicated receiving endpoint. Full edit/archive/supersession/category lifecycle is not implemented. |
| Suppliers and SKUs | Supplier registration; first-word abbreviation; collision suffixes; location-code registry; saved source prefixes; random five-digit product base allocation; explicit variant suffixes/STD | Managers do not have general supplier-registration permission. Legacy multiple sources remain; a supplier's sole receiving source is automatic. No supplier finance/purchasing subsystem. |
| Human-readable identities | Immutable P+5 Product Codes and L+5 Lot Codes; UUID authority; origin-scoped uniqueness; secure random allocation with bounded retries; exact authorized lookup; additive identity guards | Historical records can legitimately remain without codes. Backfill utility is dry-run-first and restricted to isolated fixtures; an operational backfill is not implied by migration installation. No Unit Codes. |
| Receiving | Multiple products/variants from one source, separate usable/damaged quantities, meaningful damage reason, delivery date/invoice reference, review, atomic acceptance, fresh batch/lot identities | Accepted batches cannot be amended. Additional deliveries require a new receipt. No operational correction workflow. Inline product registration is a separate catalogue transaction; cancelling the receipt does not undo registration or add stock. |
| Receipt correctness | Origin locking; actor rechecks; same-key replay; changed-body conflict; batch allocator; Lagos business date distinct from acceptance timestamp; audit/outbox/command result in the receipt transaction | Current contract permits at most 100 lines and each usable/damaged quantity up to 2,147,483,647. Proposed 10,000 serialized-unit limits are not activated or benchmark-certified. |
| Ledger | Immutable receipt/batch/line/lot/transaction/movement evidence; E-to-U and E-to-D intake; positive movement quantities; nonnegative internal balances; completeness/provenance checks; reconciled projection | Receipt-only implementation. Reserved P/C/X balance states are not working production/consumption/removal workflows. Reversals, outgoing transfers and compensating corrections are absent. |
| Inventory and overview | Authoritative stock projections; variant/SKU/lot/batch drilldown; usable vs damaged quantities; sheet/list browsing; details drawer; filters; pagination; code lookup; per-product variant availability and zero-stock indicators | Full stock counts are not independently verified. No approved low-stock thresholds/reorder policy. Catalogue and operational stock APIs still load broad collections; frontend paging does not replace server-side scaling. |
| QR resolution | DYI:1 origin/lot identity; exact SKU/batch resolution; malformed/unknown rejection; authenticated minimal role-specific DTOs; scanner input; camera/native detector/local decoder; manual fallback | Identification only. Camera needs a secure context and physical devices still need acceptance. No scan checkout or DYI:2 unit QR. |
| Labels and printing | Real generated QR/PDF; immutable manifests/artifact hashes; local in-page PDF rendering, sheet pager and label inspector; first-free-slot selection; profile margins/gaps/bounds; separate usable/damaged sheets; prominent SKU; reprints and automatic handoff evidence | No mandatory physical-success reporting. Print handoff is not proof of output. Labels still identify lots. Physical printer/media alignment, durability/scanning, thermal adapters and unit-label cart remain incomplete. |
| Role workspaces | Admin and Manager operational pages, restricted Production usable discovery, account/help/error states, responsive grouped navigation | Production has no stock-changing workbench. The existing manual lookup remains available under current IDENTIFY permission; its removal is proposed in the newer production plan, not implemented. |
| Operational history | Receipt details, lot provenance and intake movement evidence, recent receipt and print-job history, SKU quantities | No unrestricted audit browser, staff issue history, order trace, BAD record trace, closing reports or cloud owner reporting. Receipt/print histories are bounded to the latest 100 records; frontend pagination/search cannot retrieve older records outside that window. |
| Local-first foundation | Local app/database, bundled assets, origin IDs/sequences, transactional outbox, inbox schema, shop authority restrictions, explicit cloud-not-configured messaging | No sync upload/download worker, remote replica, event acknowledgement protocol execution, conflict resolution or outage/reconnect proof. Inbox/outbox tables alone are not synchronization. |

Key code evidence: `apps/api/src/app.ts`, `catalogue.service.ts`, `catalogue-setup.ts`, `receiving.service.ts`, `labels.service.ts`, `accounts.service.ts`, `invitations.service.ts`, `smtp-invitation-transport.ts`, `availability.service.ts`, `public-identities.service.ts`; `prisma/schema.prisma` and migration SQL; `packages/contracts/src`; `apps/web/app/page.tsx` and `apps/web/components`.

## Implementation-brick reconciliation

| Brick | Audited status | What prevents treating it as fully finished |
|---|---|---|
| 0: Requirements/design | Substantially delivered | Later approvals and status entries conflict with older sections; current baseline and remaining decisions need consolidation. |
| 1: Repository/environment | Implemented development foundation; partial release gate | No tracked CI workflow/lint command; database-only Compose; fresh-clone/production operations not freshly proven by this audit. |
| 2: Authentication/RBAC | Implemented for current capabilities | Future workflow permissions, recovery policy and operational hardening remain separate. Staff management goes beyond the original early brick. |
| 3: Catalogue/SKU | Implemented core and extensions | General lifecycle editing/archiving and broader Manager supplier setup are not delivered; current approved role boundaries differ from the original generic brick wording. |
| 4: Ledger/stock engine | Implemented receipt foundation; partial full brick | Original brick includes reversals and concurrent outgoing-stock protection. No outgoing issue transaction exists to exercise these requirements. |
| 5A: Receiving | Implemented | Physical/operational verification and later corrections are separate; immutable new-batch semantics supersede PRD wording about selecting an existing batch. |
| 5B: QR/labels | Software implemented; physical gate open | Real printer/media/scanner acceptance and thermal support are not completed. Lot labels do not provide unique-unit tracking. |
| 6: Production issues | Not implemented | No issue tables/contracts/endpoints, order-reference checkout or U-to-P movements. A proposed design exists. |
| 7: Damage/corrections/approvals | Not implemented, apart from damaged intake | No BAD lifecycle, production damage, disposition, recovery approval or compensating correction. |
| 8: Counts/reconciliation/day close | Not implemented | No physical-count/variance, exception reconciliation, completion or immutable close snapshot subsystem. |
| 9: Offline/cloud sync | Foundation only | No transport/conflict/acknowledgement implementation or real outage/reconnect/restore acceptance. |
| 10: Owner reporting | Partial local operational UI | No full downstream traceability, close reports, approval queues or synchronized remote owner view. |
| 11: Pilot/hardening/deployment | Not completed | No demonstrated opening-count pilot, complete restore drill, hardware/UPS/network acceptance, training or production go-live evidence. |

## PRD functional-requirement trace

“Partial” means some relevant capability exists, not that the whole acceptance requirement has passed.

| Requirement | Status | Evidence / missing acceptance |
|---|---|---|
| FR-01 vendor/item/SKU registration and distinct batches | Partial | Batch/SKU/product registration exists; general vendor registration is Admin-only under subsequent policy. |
| FR-02 physical-item labels | Software implemented; acceptance partial | Receipt-derived lot labels and real QR/PDF; physical affixing/scan acceptance remains. |
| FR-03 receipt increases stock and Admin-visible audit | Partial end-to-end | Local atomic receipt/audit exists; synchronized remote Admin visibility does not. |
| FR-04 Production QR issue with reference/unlinked path | Not implemented | QR identification exists without issuing. |
| FR-05 single/bulk issue without double count | Not implemented | No issue command or scan checkout. |
| FR-06 damage linked to original issue/BAD ID | Not implemented | Intake damage reason is not a production-damage record. |
| FR-07 damaged disposition/history | Not implemented | No disposition domain/workflow. |
| FR-08 Manager request/Admin-approved recovery | Not implemented | No approval/stock recovery command. |
| FR-09 unlinked-issue reconciliation | Not implemented | No unlinked issue or resolution queue. |
| FR-10 Manager production completion | Not implemented | No reference-level completion records. |
| FR-11 exceptions and immutable day closing | Not implemented | No close command/snapshot/post-close classification. |
| FR-12 movements/audit-safe edits/full logs | Partial | Strong receipt ledger and audit foundation; full lifecycle, corrections and unrestricted owner trace absent. |
| FR-13 offline work and safe synchronization | Partial | Internet-independent local foundation; sync/reconnection acceptance absent. |
| FR-14 server-side role restrictions | Implemented for existing endpoints | Sessions, membership/origin checks, capability enforcement and filtered Production DTOs; future commands need their own tests. |
| FR-15 backup/restore/restart proof | Partial preparation | Private local upgrade backups/preservation reports exist; no complete production backup/restore/restart release proof. |
| FR-16 Sheets/reservations/CSV | Intentionally deferred | Not an accidental gap in the authorized V1 scope. |
| FR-17 variant creation/selection during receiving | Implemented core | Admin/Manager receiving-specific product setup and variant workflow; general catalogue administration remains restricted. |
| FR-18 unique supplier/location variant SKU | Implemented | Saved prefixes/base allocation/explicit suffixes and DB uniqueness. |
| FR-19 shared parent across suppliers | Implemented | ProductSourcing and distinct supplier-specific variant SKUs. |
| FR-20 exact QR SKU/batch and readable labels | Implemented software | Real lot QR resolution/labels; physical scan acceptance still open. |
| FR-21 multiple production variants under one reference | Not implemented | No Production issue lines/reference grouping. |
| FR-22 variant-aware damage/count/close/audit reconciliation | Partial | Intake/stock filters exist; required downstream domains absent. |
| FR-23 immutable historical attribution | Implemented foundation | Immutable identities, snapshots and history guards for supported catalogue/receipts/printing; later domains do not exist yet. |
| FR-24 duplicate/quantity/insufficient-stock rejection | Partial | Receipt/variant validations exist; no insufficient-stock/concurrent-issue acceptance until issuing is implemented. |

## Later owner requirements versus the original PRD

The PRD deliberately starts with shared lot QR identities. The later six-character Unit Code requirement changes that direction for future work; it is not evidence that serialization has been built.

Missing unit-specific implementation includes StockUnit and permanent Unit Codes, per-item status/event history, atomic unit creation during receiving, database proof against old writers bypassing serialization, exact unit lookup, DYI:2, unique physical labels/manifests, selective unit reprints, optional verification/invalidation and controlled historical onboarding. Existing StockLot UUIDs and P/L identities are not substitutes for these records.

The six-character design uses the readable alphabet and origin-scoped uniqueness, but capacity, benchmark limits and cutover/oversized-delivery behavior need the planned implementation evidence. Historical stock must not be silently serialized or treated as physically verified.

## Documentation drift and operational qualifications

1. `IMPLEMENTATION_BRICKS.md` contains both “Phase 1 implemented” and older “no Phase 1 implementation authorized” sections. Similar older notes say invitation implementation is future or QR is incomplete despite later software delivery. These are historical checkpoints, not a reliable single current status.
2. Older reports say migrations 007/008 or 009/010 are isolated-only and invitations 011/012 are not installed. The inspected local database now records 001–013 applied. Production migration/deployment remains a different claim.
3. `application-permissions.md` says Manager catalogue creation is denied without recording the receiving-specific exception now present in `CatalogueService.createReceivingProduct` and migration 013.
4. The SMTP report says live sending is disabled/unconfigured. Current local flags/settings differ, but an empty queue supplies no evidence of a successful invitation email. Do not infer inbox delivery from code or configuration.
5. The 5 November UI/production plan is marked proposed. Subsequent commits implement its UI portions: ranked catalogue search, sidebar supplier consolidation, inline overview lot expansion and global receive modal. The same document's production checkout and permission proposals remain unimplemented/open.
6. Removing Suppliers/Receiving from the sidebar does not delete those capabilities: catalogue links and a global receipt modal replace the main entry points; compatibility routes/components remain.
7. The original PRD negative-stock exception wording has been superseded by the owner's later prohibition for all roles. Current nonnegative constraints match the later rule; do not reintroduce an Admin override.

## Remaining implementation sequence

1. Establish a coherent reviewed baseline: consolidate current status/permission notes, retain the history of approvals, and perform a fresh full regression/build before the next release. Add CI and a reproducible operations runbook.
2. Validate staff invitation rollout with one authorized controlled email journey: transport, verified sender, reachable HTTPS URL, account setup, expiry/revoke/failure/retry. Do not email reusable passwords or treat existing accounts as invitation recovery.
3. Decide the sequencing of serialized units and production issuing explicitly. Because exact physical-item tracking is now an owner objective, resolve its receiving cutover/historical policy before implementing an issue workflow that could require rework.
4. Implement the approved/scoped unit vertical slice when its gates are met: six-character identity, atomic serialized receiving, exact lookup and DYI:2 compatibility, then unit printing/verification. Preserve DYI:1 and all existing ledger/SKU/Product/Lot identities.
5. Implement Brick 6 issue checkout: exact SKU/lot (and units if enabled), multi-line review, references/unlinked policy, U-to-P transfers, idempotency, concurrent insufficient-stock rejection and per-worker history. The production plan still lists reason, reference, duplicate-scan, role/visibility and additive-ledger-model decisions as open.
6. Implement Brick 7 production/pre-issue damage, BAD records, dispositions, Admin-approved recoveries and compensating corrections; never deduct usable twice.
7. Implement reconciliation/production completion, physical counts/variance and immutable day close with explicit blockers/post-close evidence.
8. Complete cloud replication/freshness/conflict handling and end-to-end outage/restart/replay tests. Harden backups, restore, local HTTPS and deployment/monitoring.
9. Conduct physical label/scanner trials and a real inventory pilot with independently counted opening/sample/end balances, staff training and explicit go-live review.

Google Sheets, payments, customer orders, reservations, dispatch, purchase orders, financial valuation, multi-branch, social/chat integrations and native mobile apps are not prerequisites to finishing this authorized PRD V1. They remain excluded or later scope.

## Practical interpretation

The application can register goods, accept deliveries, show recorded usable/damaged intake by supplier SKU and batch, and produce/resolve lot labels. It cannot yet explain which physical unit was used, which order consumed it, subsequent production damage/recovery, a reconciled day close or a synchronized remote stock position. Those are the principal remaining product milestones.
