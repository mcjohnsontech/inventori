# Architecture and API boundaries

## Phase B — shop account boundary

The owner approved SHOP-local staff administration, supervised initial passwords with compulsory change, and explicit isolated membership. User UUIDs remain global historical actors, but one immutable ShopMembership assigns an account to one origin. Sessions carry that origin and require matching active membership. Existing accounts/sessions are preserved without implicit enrollment; null-origin historical sessions fail authentication. New migrations009/010 are isolated-test only until separate operational authorization.

AccountsService adds bounded Admin directory/detail and idempotent create/update/revoke commands, plus own profile/password change. Existing same-origin Next proxy uses explicit route allowlists and HttpOnly Strict cookies. Capability allowlists are shared in contracts; service guards still enforce active roles. Compulsory-change sessions can only read minimal me/change password/logout. User authentication generation changes fence stale in-flight writes under origin-first locks; password/role/status changes revoke all sessions. Persisted login/proof failure limits use PostgreSQL advisory locks. No credential/proof in audit/outbox/command responses; no reset delivery, account deletion, public registration, cloud user writes or sync authority is introduced.

Phase B operational UI reuses the existing stock/receipt/label read contracts for Admin/Manager reports. AvailabilityService adds bounded positive-U-only identity discovery with repeatable-read pagination and strict current-origin filtering, without reading damage/invoice/audit/printing rows. It is not the future universal fuzzy search/hierarchy. Native account/label draft guards preserve unfinished edits on canceled navigation; ordinary printing retains the original PDF renderer and immutable evidence. API process startup validates the required account columns and stops with a clear upgrade gate when missing; it never migrates or enrolls accounts automatically.

## Phase1 public identity boundary

Two immutable typed sidecars add origin-qualified alternate keys without changing UUID/SKU/lot authority. Backend allocation shares existing catalogue/receiving command transactions; deferred INSERT guards reject new unmapped products/lots. PublicIdentitiesService provides authenticated exact typed reads with role DTOs, no fuzzy search or stock writes. Minimal existing-workspace code form; old PDF/QR infrastructure unchanged. Backfill engine/CLI is isolated *_test-only, dry-run/saved-plan/replay with separate audited metadata. Operational migration/deployment is not performed. See phase-1-implementation-report.md.


Brick 0 review draft, 2 November 2026. CONFIRMED source requirements are cited to the root PRD. Everything under proposed design is PROPOSED engineering, not an approved business rule. Approval gates are in `decisions.md`.

Implementation addendum: the user subsequently authorized the first catalogue slice and approved local single-writer authority, UUID/value-combination identity, Admin-only creation, Manager access to existing entries and manual SKU allocation. `brick-1-report.md` records the implemented subset. The NestJS API uses the supported Fastify adapter to avoid importing an unused file-upload dependency. Local authenticated catalogue only is implemented; cloud sync and all stock workflows below remain the architecture plan. Webpack mode is selected for reliable Next.js development/builds on this Windows host. No production hardware or deployment approval is inferred.

## Confirmed constraints

PRD §7 requires an always-on shop server and PostgreSQL reachable over shop Wi-Fi, local operation during internet failure, a secure cloud Admin API/dashboard, bidirectional event/master-data sync, shop authority for operational events and explicit cloud freshness. Ordinary receiving, issuing, damage, reconciliation, completion and closing cannot require cloud availability. Remote approval is unavailable locally until delivered. Cached permitted users can work offline; cloud deactivation takes effect after sync and stale-auth periods are logged. Local Wi-Fi/server failure is outside the promised internet-outage boundary. §10 requires secure passwords, HTTPS, durable storage and encrypted backups. The approved stack is fixed by AGENTS.md/user; modular-monolith preference is confirmed engineering direction.

## Proposed deployment

```mermaid
flowchart LR
  Staff[Shop browser or phone] -->|Local HTTPS over Wi-Fi| Shop[Next.js and NestJS shop authority]
  Shop --> LocalDB[(Shop PostgreSQL)]
  LocalDB --> Worker[Transactional sync worker]
  Worker <-->|Authenticated TLS event batches and acknowledgements| Cloud[NestJS cloud authority]
  Admin[Remote Admin Next.js] -->|HTTPS| Cloud
  Cloud --> CloudDB[(Cloud PostgreSQL)]
  LocalDB --> Backup[Encrypted backups and restore verification]
```

PROPOSED: TypeScript monorepo with `apps/web`, `apps/api`, `packages/contracts` (Zod API/sync schemas), and `packages/db` (Prisma plus reviewed SQL migrations). NestJS modules: identity/access, catalogue/sourcing, receipts/labels, ledger, production, damage/approvals, reconciliation, closing/counts, reporting and sync/audit. Modules call services, not one another's table internals. Ledger is the only operational stock writer. UI never calculates authoritative stock or authorizes actions. Tailwind/shadcn components expose only approved task fields. No app files are created in Brick 0.

PROPOSED: same versioned API/schema code at shop and cloud with explicit capability configuration. Cloud reads replicated balances and owns remote Admin decision commands; it does not issue against stale stock. Shop accepts commands, validates current state and produces authoritative stock events. Cloud reports approval states separately as requested, decided, delivered, applied or rejected-at-shop; “approved” alone must not imply stock changed. Admin actions taken locally use the same permission/approval checks if O5 permits local Admin authentication. No multi-master balance merging, no last-write-wins quantity updates.

PROPOSED: responsive browser app with optional PWA shell; disconnected phones must reconnect to shop to commit stock. Do not queue independent phone stock mutations in browser storage. Phone cameras require a trusted local HTTPS origin; certificate provisioning, DNS, operating systems, UPS and printer support await O2/O7. Label output starts with a printable browser layout only if printer compatibility is approved. A print failure never rolls back committed stock or creates a second receipt; it generates a retryable print task with logged attempts.

## Authority boundaries

| Record/action | CONFIRMED rule / PROPOSED enforcement |
| --- | --- |
| Receipt, issue, damage, classification, completion, count, close | CONFIRMED shop authority (§7); PROPOSED reject cloud stock writes at service and DB role boundaries |
| Correction/recovery decision | CONFIRMED Admin-only and no unreceived approval (§2/7); PROPOSED immutable command bound to request version/hash; shop applies once after eligibility check |
| Catalogue and code allocation | OPEN B08/V01/V02/V03; PROPOSED local single writer initially; cloud proposals accepted/rejected by owning shop, never silently merged |
| User roles/activation | CONFIRMED cached permitted users, delayed revocation (§7); PROPOSED cloud-controlled monotonic user versions, local stale-auth audit; provisioning/local Admin details OPEN O5/B09 |
| Cloud read models | CONFIRMED as-of display (§6/7); PROPOSED derived from accepted shop sequence, never authoritative for available stock |
| Physical inventory | CONFIRMED independent counts (§11); PROPOSED count sessions and discrepancies, no balance overwrite |

User authorization and sync service authorization are distinct. Replicated audit retains original actor/role/source rather than treating sync worker as stock actor. Source authentication alone cannot authorize an invalid Admin decision. Restoring a node never automatically creates a second active shop authority.

## Proposed transaction and sync protocol

Every stock command uses `Idempotency-Key` scoped to authority and actor/command type, with canonical request hash. In one local PostgreSQL transaction: reserve/lock key; check authorization and input; lock affected stock/issue/approval rows in stable order; recheck current constraints; persist domain records, balanced ledger, projections, audit, outbox, and stored response. Same key/hash returns stored result; same key/different hash conflicts. New intentional scans need new keys; shared QR content is not an idempotency key. Rollback produces no accepted partial operation. HTTP response loss is resolved by retrying original key.

PROPOSED envelope:

```text
eventId: UUID; originNodeId: UUID; authorityId: UUID
originSequence: monotonically committed stream position
eventType; schemaVersion; aggregateId; aggregateVersion
commandId; correlationId; causationId; actorId; actorRoleAtAction
occurredAt; recordedAt; businessDate; payload; payloadHash
```

IDs are generated locally without cloud allocation. `recordedAt` and committed sequence, not device clock, order acceptance. PROPOSED origin sequence uses a transactionally locked stream counter so a higher sequence cannot be acknowledged before a lower in-flight transaction; ordinary database sequence allocation alone is insufficient for a contiguous commit watermark. Stream counter locking is a throughput tradeoff to measure. Hash canonicalization and protocol serialization are versioned. Distinguish trusted operational audit timestamps from untrusted client-reported times. Business timezone/date rules remain OPEN B05.

Sender retries unacknowledged outbox envelopes with bounded exponential backoff. Receiver authenticates origin, validates version/hash/authority, deduplicates by `(originNodeId,eventId)` and `(originNodeId,originSequence)`, and commits inbox plus replicated domain effects atomically before acknowledgement. Same ID with different payload is quarantined. Gaps/dependencies wait in a durable queue; don't skip to a misleading complete watermark. Replicate a multi-line command as one atomic envelope or explicitly staged complete transaction group, not individually visible half-receipts. Forwarded events retain original identity and are not re-originated into echo loops.

Ack means durable acceptance, not network delivery. Lost ack causes harmless replay. Cloud views use highest contiguous accepted shop watermark and its recorded timestamp; show cloud receipt timestamp and shop last-contact separately so “last sync” cannot imply all pending data is current. Failed/blocked events, pending count, oldest pending age and last success are visible to authorized staff. Node heartbeats do not advance the inventory as-of watermark.

Master data dependencies precede movements, or arrive in the same atomic transaction group. Identity records are retained when inactive. A supported additive event/schema version is negotiated; unsupported versions pause that stream, alert and preserve payload for operator recovery. Never drop or edit a poison ledger event to advance sync. An explicit reviewed repair may correct transport/projection data while immutable business history stays intact.

## Proposed API surface

Version prefix `/v1`. Routes below are boundaries, not implemented contracts. Mutations use authentication, server permissions, Zod validation, idempotency, atomic transaction and audit. Every stock-changing route also locks and writes ledger/outbox atomically. GET scope includes row and field filters server-side. No generic movement CRUD, balance setter, delete-history route or unauthenticated QR stock mutation.

| Module / route sketch | Command or query / authority |
| --- | --- |
| `POST /sessions`, `DELETE /sessions/current`; `GET /me` | Local verified sessions; permitted-user cache policy OPEN; rate-limit login, secure cookies and CSRF protection |
| `GET/POST /suppliers`, `/supplier-sources`, `/products`, `/products/:id/variants`, `/sku-allocations` | Approved catalogue roles only; identity-defining changes supersede; registry allocation policy OPEN |
| `POST /receipts` | Manager/Admin where authorized; one reviewed multi-line receipt, source/batch consistency, all-or-nothing stock receipt |
| `GET /receipts/:id`, `POST /label-print-jobs`, `POST /label-print-jobs/:id/reprints` | Scoped reads/authorized prints; quantity and template audit, zero stock effect |
| `GET /labels/resolve?token=...` | Authenticate, validate QR version, return exact SKU/batch and permitted fields; authorized manual lookup has separate audited path |
| `POST /production/issues` | Production; reviewed exact SKU/batch lines, manual reference or unlinked; PROPOSED atomic issue group, PRD requires distinct immutable line movements |
| `GET /production/issues/eligible-for-damage` | Scope approved in O6; prior issue selection, remaining eligible quantities |
| `POST /damage-reports` | Production against issue; Manager intake path pending O3; issue availability locked |
| `POST /damage/:id/dispositions` | Manager; approved lifecycle only; some outcomes transfer state |
| `POST /recovery-requests`, `POST /correction-requests` | Manager; exact quantities, source IDs, reason; no stock effect until applied approval |
| `POST /approval-requests/:id/decisions` | Admin; immutable approve/reject; cloud decision pending delivery; separate apply result, no self-approval |
| `POST /issues/:id/reconciliations`, `/reference-corrections` | Manager classification; quantity change routed to approval; reference reassignment permission OPEN |
| `POST /production-references/:id/completions` | Manager; attestation scope and any in-production state transfer await B03/O8 |
| `POST /counts`, `POST /counts/:id/observations` | Manager/approved role; observation/discrepancy, no direct stock write |
| `GET /day-closes/readiness`, `POST /day-closes` | Manager; readiness is advisory, close rechecks blockers inside serialized transaction |
| `GET /day-closes/:id`, `/stock`, `/history`, `/trace`, `/sync/health` | Role-limited reads; immutable reports and separately identified post-close links; explicit freshness |
| `POST /sync/envelopes`, `/sync/acknowledgements` | Node/service authentication and origin authority validation; not public user mutation endpoints |

PROPOSED API errors: malformed input 400/422; unauthenticated 401; forbidden 403; idempotency/stock/version/close conflict 409 with stable domain code; unknown/inaccessible resource handled consistently to avoid leakage. Return authoritative command/event IDs, current stock only within permission, approval application status and local data watermark. Replayed success returns original response, not a new stock event.

## Recovery, security and delivery

PROPOSED: Postgres WAL-backed durability; least-privilege app roles; immutable ledger grants/triggers; password hashing with a maintained memory-hard algorithm; encrypted secrets outside repository; TLS node credentials rotated and verified; sanitized audit metadata, no passwords/tokens in logs. Restore backups with inbox/outbox/idempotency/close watermarks together. Backup encryption keys require a recovery custodian and separate storage. Operational target/retention OPEN B09.

Crash before commit: nothing accepted. Crash after commit: replay saved response/outbox. Sync interruption: retry with same IDs. Cloud unavailable: local ordinary work continues, approvals stay pending, show banner. Shop power/server failure: no independent browser writes; restart/restore and reconcile committed data before resume. Disk full: reject new stock commands clearly, preserve committed history, alert. Hardware and recovery targets require approval; no claim of zero data loss from unspecified equipment.

Cloud-first additive upgrades preserve old shop protocol compatibility; destructively incompatible changes require migration plan and outage approval. Rollback application only while schema/protocol remains compatible; otherwise restore coordinated backup and replay safely, never delete accepted ledger history. Development seeds must never be production provisioning. No deployment occurs in Brick 0.


## Implemented ledger and receiving boundary

ReceivingService is a separate domain service alongside CatalogueService, reusing its authentication authority through the API controller. Seven new ledger/receipt tables use UUIDs, SQL FKs, append-only guards and deferred group/projection checks. Receiving retains the origin-first transaction lock, atomically commits audit/outbox/CommandResult, and rejects cloud writes. Browser calls use the existing same-origin authenticated proxy. Admin/Manager task endpoints expose U/D lots and derived SKU/product totals with local as-of time, no valuation/audit access. See receiving-ledger-design.md and receiving-implementation-report.md. Sync outbox remains infrastructure only; no transport, QR or production transitions exist.


## Brick 5B local QR/label boundary

LabelsService adds strict origin/StockLot read-only resolution and task-scoped manual lookup. Production receives minimal identity/usable availability only; label administration stays Admin/Manager. Immutable print manifests/lines/events reuse origin-locked command/audit/outbox transactions without any StockTransaction/Movement/Balance writes. PDFKit/qrcode render locally outside locks; versioned profile and renderer/font hashes preserve reconstruction. Next proxy serves authenticated binary PDFs. ZXing/native camera and focused HID input perform lookup only. No thermal, production deduction or cloud transport. See qr-label-implementation-report.md.


## Admin experience refinement — 3 November 2026

The owner-authorized Admin experience composes existing domain commands into nine client workspaces: overview, catalogue/details, suppliers/sources, inventory/lots, receiving, receipt history, QR lookup, lot-label printing and account/shop. A shared shell, view fragments with optional UUID context, UI state components and cancellable read hook preserve the existing Next.js/same-origin architecture. Fragments are view state, never authorization.

Two additive reads expose existing data: stock/lots/:id provides bounded Admin/Manager receipt/movement provenance under repeatable read and current-origin validation; admin/shop provides minimal configuration to Admin only. Catalogue queries are narrowed to the configured origin, with the shared location registry retained. No mutation, schema, ledger, identity or role expansion. Production stays on minimal lookup/account views. Overview avoids unlike-product quantity totals; exact lot/SKU projections remain authoritative. See admin-experience-implementation-report.md and admin-preservation-evidence.json.
