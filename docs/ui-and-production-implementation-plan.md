# PRD v1.2 audit + UI/production implementation plan

Status: **PROPOSED plan for owner review.** No application, schema, migration or data change is included in this document. Nothing here overrides PRD v1.2; items marked OPEN must be approved before implementation (see AGENTS.md working rules 2–4).

Date: 5 November 2026
Sources: `docs/Dayari_Inventory_PRD_v1_2_Comprehensive.docx` (v1.2, 2 Nov 2026), repository code at `feat/complete-application-systems`, and the four written page descriptions supplied by the owner.

> Caveat: the four attached screenshots could not be opened in this session (no image input). Page mapping below is inferred from the written description plus the code:
> Image 1 → Catalogue (products tab), Image 2 → Overview "Product availability", Image 3 → Receiving, Image 4 → Production/Usable stock.
> Please confirm that mapping before UI slices start.

---

## Part A — What is done and what is left

### A.1 Implemented today (working, tested)

| Area | Evidence |
| --- | --- |
| Authentication, sessions, password change, must-change-password gate | `accounts.service.ts`, `page.tsx`, unit + integration tests |
| Role-based access (Admin / Manager / Production) enforced server-side | `packages/contracts/src/permissions.ts`, `apps/api/src/permissions.ts`, `docs/application-permissions.md` |
| Catalogue: parent products, attributes/values, variants, supplier/source, sourced SKUs, supplier-location prefixes, product codes | `catalogue.service.ts`, `catalogue-workspace.tsx`, `setup-wizards.tsx` |
| Atomic multi-variant receiving, one batch per delivery, immutable receipt snapshot, idempotency | `receiving.service.ts`, `receive-wizard.tsx`, `receiving-ledger-design.md` |
| Usable + damaged intake split, mandatory damage reason | receipt lines + `StockMovement` E→U / E→D |
| QR payload generation, per-unit labels, PDF preview/print, reprint audit, immutable print events | `labels.service.ts`, `label-pdf*.ts`, `label-workspace.tsx` |
| Public identity lookup (Product Code / Lot Code), QR resolve, exact manual lookup | `public-identities.service.ts`, `labels.service.ts`, `qr-workspace.tsx` |
| Inventory sheet, lot drill-down, per-variant stock overview, reports, receipts history | `inventory-workspace.tsx`, `dashboard.tsx`, `reports-workspace.tsx`, `receipts-workspace.tsx` |
| Staff invitations (SMTP adapter, revoke/resend), user administration | `invitations.service.ts`, `users-workspace.tsx` |
| Shop account/settings, help, responsive shell/navigation | `settings-workspace.tsx`, `app-shell.tsx` |

Last verified baseline (see `docs/complete-application-implementation-report.md`): typecheck clean, build passes, 42 unit + 81 integration tests, targeted receiving E2E passing.

### A.2 PRD requirement matrix

Legend: **DONE** = implemented and tested; **PARTIAL** = some of the requirement exists; **NOT STARTED** = no implementation; **DEFERRED** = explicitly later release.

| ID | Requirement (abridged) | Status | Note |
| --- | --- | --- | --- |
| FR-01 | Register vendor, item, vendor-specific SKU; receipts create distinct batch IDs | **DONE** | Catalogue + receiving |
| FR-02 | Every product gets a printable QR with readable SKU and batch | **DONE** | Unit labels per receipt line |
| FR-03 | Save receipt → stock increases immediately with Admin-visible audit | **DONE** | Receipts history + immutable ledger |
| FR-04 | Production scans QR and chooses order reference or unlinked path | **NOT STARTED** | No production issue endpoint/model; production UI is a dead `return;` |
| FR-05 | Single-scan/unit and scan-once/multi-quantity without double counting | **NOT STARTED** | Depends on FR-04 |
| FR-06 | Damage scan references the original issue; distinct BAD ID | **NOT STARTED** | Only intake damage exists |
| FR-07 | Manager classifies damaged outcome; Admin reviews histories | **PARTIAL** | Intake damage reasons are captured; no classification/review workflow |
| FR-08 | Damaged→usable recovery needs Manager request + Admin approval | **NOT STARTED** | Reserves `D→U` in the design only |
| FR-09 | Manager reconciles all unlinked issues with reason + history | **NOT STARTED** | — |
| FR-10 | Manager marks reference-level production complete; no dispatch | **NOT STARTED** | — |
| FR-11 | Resolve blocking exceptions before day close; late events distinguished | **NOT STARTED** | No close entity or report |
| FR-12 | All quantities/edits derive from audit-safe movements; full Admin log | **PARTIAL** | Receipt ledger is append-only and immutable; no issue/adjustment events, no unified audit view |
| FR-13 | Shop stays operational offline; sync resumes without duplicates | **NOT STARTED** | `/health` reports `cloudSync: not-configured`; identifiers exist, transport does not |
| FR-14 | Role-limited stock views enforced server-side | **PARTIAL** | RBAC is server-side, but Production can currently read lot-level availability and exact manual lookup |
| FR-15 | Backup, restore and power-restart verification before rollout | **NOT STARTED** | No backup/restore procedure or rehearsal evidence |
| FR-16 | Sheets verification, reservations, CSV import/export | **DEFERRED** | V1.1/V1.2 candidates |
| FR-17 | Multiple attribute lines under one parent product in one receiving workflow | **DONE** | Multi-variant receipt; variant-set extension |
| FR-18 | Supplier/location SKU + variant suffix (e.g. `CHILG03849-RED`) | **DONE** | Prefix registry; non-colour/multi-attribute codes remain OPEN (§15.9) |
| FR-19 | Same parent product from two suppliers, distinct sourcing identities | **DONE** | Distinct `SupplierVariantSku` + lot/source history |
| FR-20 | QR resolves exact variant SKU + batch; label shows variant and supplier | **DONE** | QR + label layouts |
| FR-21 | One order reference across multiple variants, correct SKU/batch deduction | **NOT STARTED** | Blocked by FR-04 |
| FR-22 | Damage/adjustment/count/closing/audit filterable by product, variant, supplier, batch | **PARTIAL** | Filters exist for stock/inventory/receipts; no damage, adjustment, count or closing |
| FR-23 | Historical movements immutable across renames | **PARTIAL** | Immutable UUIDs, receipt snapshots; no rename workflows exist to prove it end-to-end |
| FR-24 | Reject duplicate variants, invalid quantities, insufficient variant stock | **PARTIAL** | Receiving side complete; issue side absent |

### A.3 Other PRD sections

| PRD section | Status |
| --- | --- |
| §8 data model (stock, unit, issue, damage, closing, sync tables) | Receipt-side implemented; issue/damage-approval/closing/sync tables absent |
| §10 failure handling (de-bounced scans, negative-stock discrepancy workflow, audited reassignment/reversal, stale-cloud labelling) | Not implemented beyond receiving idempotency/rate limits |
| §11 pilot measures (2-second visibility, 8-hour offline shift, ≤2% count variance, closing discipline) | Not measurable yet |
| §12 milestones A–D | Milestone A complete; B/C/D not started |
| §13 O1–O8, §15.9 (a)–(e) | Still OPEN; several block Part B below |

### A.4 The five biggest gaps

1. **No production issuing at all** — the largest functional gap and the prerequisite for FR-05/06/07/08/09/10/21/24.
2. **No day close / blocking-exception workflow** — FR-11 and the pilot's closing discipline.
3. **No damage classification, recovery approval or reconciliation** — FR-06–FR-09, FR-22.
4. **No offline/cloud sync** — FR-13, the product's central local-first promise.
5. **No backup/restore/hardware acceptance** — FR-15 and pilot sign-off.

Part B addresses only the five UI/workflow items requested, plus the minimum ledger work needed to make production real. Closing, recovery and sync stay out of scope here and should be separate slices.

---

## Part B — Implementation plan for the five requested changes

### Slice 1 — Catalogue search by product name or Product Code

**Goal.** On the Catalogue page, typing in the search box finds a product by its name or its Product Code. No behavioural surprises for the other tabs.

**Current state.** `catalogue-workspace.tsx` lines 75–85 already filter products on `name + productCode + description + variant names`. It is a single box shared by three tabs, so the *placeholder* ("Name, code, variant or SKU") and result ranking do not communicate that name/code is the primary key. Problems to fix:
- no distinction between exact code and fuzzy name matching, so results order by catalogue order;
- code matching is case-insensitive but does not normalise separators/hyphens;
- the Products tab does not match a supplier SKU typed by the user (only the SKUs tab does);
- no "no match for code X" feedback naming what was searched.

**Design.**
1. Keep one box, change the label/placeholder to "Product name or Product Code" on the Products tab; keep the current wording on the other tabs.
2. Score results: exact Product Code match first, then code prefix, then name prefix, then any-field substring. Stable sort by product name afterwards.
3. Normalise the query for code comparison only (`trim`, uppercase, strip spaces/hyphens) and compare against a normalised code — do **not** change stored codes or case-fold identities.
4. On the Products tab, also match a typed supplier SKU and show which saved SKU matched (small secondary line), because the owner's mental model is "find the product".
5. Empty state names the searched term: `No product matches "XYZ". Try a name or Product Code.`

**Files.** `apps/web/components/catalogue/catalogue-workspace.tsx`; small helper `apps/web/lib/catalogue-search.ts` (pure, unit-testable).

**Tests.** Unit tests for ranking/normalisation; Playwright: search by full code, by partial name, by supplier SKU, no-match state. No API or schema change.

**Acceptance.** A user who knows only the Product Code finds the product in one search; a user who knows only the name finds it; results are deterministic.

---

### Slice 2 — Remove the Suppliers page

**Goal.** `Suppliers & sources` disappears from navigation and routing. Everything needed about a supplier lives in the Catalogue page.

**Current state.**
- `components/suppliers-workspace.tsx` duplicates a supplier list that Catalogue already has as a tab (`catalogue-workspace.tsx` lines 278–302, 449–456).
- Supplier/location *setup* is already reachable from Catalogue: `onSupplier()` → `SupplierWizard` in `app/page.tsx` lines 211–216, 310–317.
- Nav/routing references: `shell/destinations.ts` (lines 27, 46, 62), `workspace-router.tsx` (lines 25, 153–161), `app/page.tsx` (`EMPTY_CATALOGUE`, hash restore, `PRODUCTION_WORKSPACES`), `help-workspace.tsx` if it links there.

**Design.**
1. Delete the `suppliers` workspace key from `destinations.ts` (destinations, capability map, nav group) and remove the import/case from `workspace-router.tsx`; delete `suppliers-workspace.tsx`.
2. Catalogue keeps its Suppliers tab (read + "Set up location" + "Register supplier" for Admin). Add the one thing the standalone page did better: a compact supplier card with source prefixes and sourced-SKU counts, so nothing is lost.
3. Deep-link compatibility: `#/suppliers` and `#/suppliers/<id>` resolve to `#/catalogue` with the Suppliers tab preselected, instead of showing "Workspace not found". Implement as an explicit alias in the hash restore in `apps/web/app/page.tsx` (one-line mapping) so old bookmarks and printed links keep working.
4. Fix `help-workspace.tsx` targets that point at `receiving`/`suppliers` (see Slice 4).

**Do not** delete supplier data, the `SupplierWizard`, or any API. This is navigation consolidation only.

**Tests.** Router unit/Playwright: `/suppliers` alias lands on Catalogue → Suppliers; sidebar has no Suppliers entry for any role; supplier creation and location setup still work from Catalogue; existing catalogue/RBAC tests stay green.

---

### Slice 3 — Product accordion as an inline sub-row

**Goal.** On the Overview "Product availability" table, opening a product expands a row **immediately under that product**, visually reading as a sub-row, not a card at the bottom of the table.

**Current state (defect confirmed).** `dashboard.tsx`:
- rows are rendered by `DataTable` (lines 262–269);
- the expanded panel is rendered *after* the whole `DataTable` (lines 272–305), so it always appears below the last visible row;
- it is a `px-5 py-4` section with `card`-like lot buttons — a box, not a row.

**Design.**
1. Extend `components/ui/data-table.tsx` with an optional `subRow?: (row: T) => ReactNode | null` prop (and an optional `subRowKey`/`aria` hook). When it returns content, emit a second `<tr>` directly after that row with `<td colSpan={columns.length}>`, `role="row"`, and a controlled background (`bg-surface-muted/60`), left border accent, and no shadow/rounding. Keep `bare` behaviour intact.
2. In `dashboard.tsx`, replace the bottom section with `subRow={(row) => row.variantId === expanded ? <LotsSubRow .../> : null}`. Move the lot list inside the sub-row as a compact horizontal strip (lot code, usable, damaged, supplier) instead of nested cards.
3. Keep `aria-expanded`/`aria-controls` on the toggle and give the sub-row `id={`lots-${variantId}`}` and `role="row"`. Collapse on search/filter/page change (already done).
4. Since the table is horizontally scrollable, the sub-row must not exceed the table width — use `min-w-0`, wrap lot entries, and keep `mobileStack` behaviour fallback to a block list under 640px.

**Files.** `components/ui/data-table.tsx`, `components/dashboard.tsx` (and `lib/stock-overview.ts` only if lot ordering is adjusted).

**Tests.** Component test that the sub-row is a sibling `<tr>` immediately after its parent row; Playwright: open the 1st and 3rd product, verify both sub-rows sit under their own product; keyboard toggle; mobile viewport. No API change.

---

### Slice 4 — Remove the Receiving page; every "Receive a delivery" opens the modal

**Goal.** There is no Receiving destination. Every entry point opens the existing receive wizard as a modal on top of the current page. Receipts history remains.

**Current state.**
- `receiving-workspace.tsx` is a thin page that fetches `receiving/options` and renders `ReceiveWizard`.
- `ReceiveWizard` is *already* a Radix modal dialog (`wizard-shell.tsx` lines 100–115) and needs only `options` + callbacks. So hoisting is mechanical.
- Entry points today: Dashboard "Receive a delivery" (line 176, navigates to `receiving`), Receiving page itself, and empty-state copy elsewhere. Help links to `receiving`.

**Design.**
1. New `components/receiving/receive-dialog.tsx`: an `open/onClose` wrapper that loads `receiving/options` on first open (with loading/error states inside the dialog), then renders `ReceiveWizard` unchanged. It must call `onCatalogueChanged` and `onSaved` so the catalogue and receipt lists refresh after save.
2. Mount one `ReceiveDialog` at `app/page.tsx` level (next to `SupplierWizard`/`ProductWizard`) with `receiveOpen` state; pass `onReceive={() => setReceiveOpen(true)}` through `AppShell` context or explicit props so **any** button can open it: Overview header, empty state, Receipts page, Catalogue footer hint, Help.
3. Remove `receiving` from `destinations.ts` (key, capability, nav group), `workspace-router.tsx` (NEEDS_CATALOGUE, case), delete `receiving-workspace.tsx`. Keep `receipts` workspace and all receipt detail components.
4. Deep-link compatibility: `#/receiving` → `#/receipts` (history is what remains) and open the modal only when explicitly requested, e.g. `#/receipts?receive=1`. Simpler and safer: `#/receiving` → Overview with the dialog open.
5. `help-workspace.tsx` "Receive safely" target becomes the modal action, not a workspace.

**Risk.** The wizard guards unsaved drafts via the `dayari:before-navigate` event. Removing the page means route changes no longer unmount it. The dialog must register the same before-navigate veto and block closing while `busy`; verify the existing dirty-guard still fires.

**Tests.** Playwright: open the dialog from Overview; open from Receipts; complete a small receipt and confirm stock + catalogue refresh without leaving the page; dirty-close confirmation; `/receiving` alias behaviour; RBAC (Production cannot see the button, and `receiving/options` still returns 403). Existing receiving integration tests unchanged.

---

### Slice 5 — Production: search, quantity-only usable stock, no manual lookup

This is the prerequisite slice for Slice 6. It deliberately adds **no stock mutation**; it fixes the broken page, the read projection and the permission boundary.

**Goal.** On login a Production user lands on a product search page. They can search by product name or Product Code, see how many usable units exist, and scan a QR label. They cannot perform an exact manual lookup. A separate "Usable stock" view shows quantities only.

**Current defects.**
1. `production-workspace.tsx` line 26: `return;` before the JSX — the page renders nothing. The JSX after it is unreachable. It also uses the old `surface`/`text-stone-*` styles rather than the design system.
2. Production landing is `availability`, backed by `GET /v1/availability` which returns **lot-level** data (supplier, batch, lot code, SKU) — more than "the number that is available".
3. `GET /v1/availability` requires only `IDENTIFY`, which includes Production.
4. `qr/manual`, `qr/manual-sources` and `/inventory/{products,lots}/by-code/:code` require only `IDENTIFY`, so Production can do exact manual lookup despite the UI.
5. `workspace-router.tsx` gives Production `ProductionWorkspace` with `onCode` → navigates to QR with a code prefilled, i.e. an exact lookup path.

**Design.**
1. **Server-side projection.** Add `GET /v1/production/stock?q=&page=` requiring `IDENTIFY` (`availability.service.ts` or a new `production.service.ts`). Returns `{ items: [{ productId, productCode, productName, variants: [{ variantId, variantName, usable }], totalUsable }], total, page, pageSize, dataAsOf }`. Group by product+variant from the same `StockBalance`/`StockLot` join already used; **no** lot, batch, supplier or SKU fields. Quantities are strings (BigInt-safe), consistent with existing contracts.
2. **Tighten the lot-level read.** Change `GET /v1/availability` and `GET /v1/stock` to require `OPERATIONAL_STOCK` (Admin/Manager), since they expose lot/supplier/batch detail. Production keeps `/v1/production/stock` only. This is the FR-14 fix and must be server-side.
3. **Manual lookup boundary.** Add capability `IDENTITY_MANUAL_LOOKUP` granted to `ADMIN` and `MANAGER` only. Apply it to `POST /v1/qr/manual`, `GET /v1/qr/manual-sources`, `GET /v1/inventory/products/by-code/:code`, `GET /v1/inventory/lots/by-code/:code`. Keep `POST /v1/qr/resolve` on `IDENTIFY` so QR scanning still works for Production. Update `docs/application-permissions.md` and the permission matrix tests.
4. **Rebuild the production landing** as a new `production` workspace (label "Production"), rebuilt with the design system (`Page`, `PageHeader`, `Panel`, `DataTable`, `SearchInput`, `Badge`), and make it the post-login destination (`page.tsx` line 116/169 and `PRODUCTION_WORKSPACES`). Content:
   - search field "Product name or Product Code" (debounced, server-side `q`);
   - a table of products with columns Product, Code, Variants (collapsed count), Usable;
   - row action "Scan to check out" (Slice 6);
   - primary "Scan QR label" button opening the scanner;
   - fresh timestamp ("As of HH:mm Lagos").
5. **Rebuild "Usable stock"** (`availability` workspace for Production) as a read-only quantity page: product → variant → single usable number. No lot, batch, supplier, SKU or price. No row actions. Keep the existing Admin/Manager inventory page untouched.
6. Remove `onCode`/prefilled exact lookup from the production route; the QR workspace it opens must be scan-only for Production (`IdentityLookup` hidden unless the user has `IDENTITY_MANUAL_LOOKUP`).
7. Next proxy allowlist in `apps/web/app/api/[...path]/route.ts` gains `production/stock`.

**Files.** `apps/api/src/app.ts`, `apps/api/src/availability.service.ts` (or new `production.service.ts`), `apps/api/src/permissions.ts` + `packages/contracts/src/permissions.ts`, `packages/contracts/src/availability.ts` (+ new `production.ts`), `apps/web/components/production-workspace.tsx` (rewrite), `apps/web/components/labels/qr-workspace.tsx`, `apps/web/components/shell/destinations.ts`, `apps/web/components/workspace-router.tsx`, `apps/web/app/page.tsx`, `apps/web/app/api/[...path]/route.ts`, `docs/application-permissions.md`.

**Tests.** API: Production gets 403 on `availability`, `stock`, `qr/manual*`, `*/by-code/*`; Production gets 200 and quantity-only shape from `production/stock`; product-name and product-code search; Admin/Manager unchanged; contract test asserts no lot/batch/supplier keys leak. Playwright: Production login lands on search, finds by name and by code, sees only numbers, never sees a manual-lookup field.

**Acceptance.** Matches the owner request and FR-14 without weakening existing Admin/Manager views.

---

### Slice 6 — Production scan checkout: reason + order reference per scan, multiple items per session

This is the ledger slice and the first true production issuing implementation. **It needs approval** of the OPEN decisions below before migration.

**Goal.** A Production user starts a checkout session, scans QR labels (or searches then picks a product), adds multiple lines/products, gives each scan a reason and an order reference, and commits the whole session atomically. Usable stock decreases and in-production stock increases; history is immutable.

**Proposed data model (PROPOSED — needs approval).**

```prisma
model ProductionIssue {
  id             String   @id @default(uuid()) @db.Uuid
  originId       String   @db.Uuid
  publicCode     String                       // e.g. PI-000123, per-origin ordinal
  status         String                       // RECORDED (V1); corrections are new events
  transactionId  String   @unique @db.Uuid
  issuedBy       String   @db.Uuid
  issuedAt       DateTime @db.Timestamptz(6)
  idempotencyKey String
  snapshot       Json                         // actor/role, client time, device, reason summary
  @@unique([originId, publicCode])
  @@unique([originId, idempotencyKey])
}

model ProductionIssueLine {
  id             String  @id @default(uuid()) @db.Uuid
  issueId        String  @db.Uuid
  lineNumber     Int
  lotId          String  @db.Uuid
  skuId          String  @db.Uuid
  batchId        String  @db.Uuid
  quantity       BigInt
  reason         String                      // taxonomy, see OPEN D1
  reasonNote     String?
  orderReference String?                     // manual, unverified
  snapshot       Json                        // fullSku, product, variant, supplier at issue time
  @@unique([issueId, lotId])                 // one line per lot per issue; merge repeats
  @@unique([issueId, lineNumber])
}
```

**Ledger change (the part that needs care).** `StockMovement.receiptLineId` is currently non-null and `@@unique([receiptLineId, toState])`. Production movements need the same append-only table. Recommended additive migration:

1. Make `receiptLineId` nullable.
2. Add `issueLineId String? @db.Uuid`.
3. Add `CHECK ((receiptLineId IS NULL) <> (issueLineId IS NULL))` so every movement has exactly one parent.
4. Add a partial unique index `(issueLineId, toState) WHERE issueLineId IS NOT NULL`.
5. Keep existing `(receiptLineId, toState)` unique index (Postgres already treats NULLs as distinct, but keep it explicit and re-assert with a partial index so the receipt invariant is unambiguous).
6. Movement is `fromState='U'`, `toState='P'`, positive `quantity`, with `StockBalance` U decremented and P incremented under a per-lot `SELECT … FOR UPDATE` (or the existing origin/sequence lock pattern in `receiving.service.ts`).
7. Guard: `quantity > 0`, `quantity <= usable balance`, no negative balance, no zero movements, lot belongs to origin, SKU/batch consistent with lot.
8. Reversal/correction uses a compensating event (`P→U`) linked to the original issue — never an update. (Reversal UI is out of scope for this slice; the schema must allow it.)

Alternative if the team prefers zero risk to the receipt table: a separate `ProductionMovement` table joined into the audit read model. Rejected as the default because PRD wants one audit-safe movement history; present it as an option in review.

**API (PROPOSED).**

`POST /v1/production/issues` — authentication + `IDENTITY_ISSUE` capability (new; ADMIN/MANAGER/PRODUCTION — see OPEN D4), `Idempotency-Key` required:

```json
{
  "sessionClientId": "uuid-from-client",
  "lines": [
    {
      "qrPayload": "…",
      "lotId": "uuid",
      "quantity": "2",
      "reason": "ORDER_FULFILMENT",
      "reasonNote": "",
      "orderReference": "2002"
    }
  ]
}
```

Rules: 1–100 lines; every line resolves to exactly one lot (QR payload preferred, `lotId` accepted only from an authorised app path); quantities positive integers within usable balance; duplicate lots merged or rejected (OPEN D3); `orderReference` trimmed, ≤64 chars, never validated against Sheets; if absent, `reason` must be an unlinked reason (OPEN D2). Response: `{ issue: { id, publicCode, issuedAt, lines: [...], totalQuantity }, replay: boolean }`. One transaction writes `StockTransaction`, `ProductionIssue`, lines, movements, balance updates and outbox.

Also `GET /v1/production/issues?from=&to=&q=` for history (Production: own issues; Manager/Admin: all) — enough for the reconciliation slice later, no edit rights.

**UI design (`production-checkout.tsx`).**
- Start from product search: "Scan to check out" opens a session drawer/panel.
- Scanner input stays focused and accepts USB/keyboard-wedge scanners; camera path reuses `qr-workspace` logic. Debounce protects against key repeat but **never** swallows intentional rescans (PRD §10): an identical scan increments that line's quantity with a visible +1 and an undo.
- Each line shows product, variant, SKU, lot/batch (production needs to confirm the physical item), quantity stepper, reason select, order-reference input, remove.
- Session header: "Apply to all scans" reason + order reference defaults, overridable per line; running total; "Check out N items" commits atomically.
- Success: receipt-style summary with issue code, timestamp and lines; "Start another checkout".
- Failure: explicit reasons (insufficient usable stock, lot not in origin, duplicate line, expired session); nothing is committed.
- 403 on insufficient stock must show the exact available quantity and never create a movement (PRD §10, FR-24).

**Tests (map to PRD §15.8).**
- Integration: scan Red 2 + Brown 3 into order `#2002` → two lines, only those lots' U decrease, P increases, one transaction, one idempotency key.
- Over-issue Red by available+1 → 4xx, no movement, no balance change.
- Same idempotency key retried → identical response, no second movement.
- Concurrent checkouts on the same lot → one succeeds, the other gets a clear conflict, total never negative.
- Zero/negative/non-integer quantity rejected.
- Duplicate lot in one session behaves per D3.
- Lines with different reasons/order refs in one session persist per line.
- Permission: Manager/Admin allowed per D4; a revoked user gets 403.
- Playwright: multi-line session end-to-end, scan-repeat increment, remove line, failure path, session survives a refresh (draft in sessionStorage).
- Ledger invariant test: `U_before = U_after + issued`, `P_after = P_before + issued`, receipt movements untouched.

---

## Part C — Open decisions that must be approved before Slice 6

These are recorded as OPEN in `docs/decisions.md`. Slice 6 cannot be implemented safely without them.

| ID | Question | Proposed default (not approved) |
| --- | --- | --- |
| D1 | Reason taxonomy for a scan | `ORDER_FULFILMENT`, `SAMPLE`, `INTERNAL_USE`, `REWORK`, `OTHER` (+ mandatory note for OTHER). Final list from the owner. |
| D2 | Is `orderReference` mandatory? | Optional. If omitted, the line must use an **unlinked** reason and becomes a Manager reconciliation item (FR-09). |
| D3 | Duplicate lot in one session | Merge into one line, summing quantity, and show "×N". Reject only if the merged quantity exceeds usable stock. |
| D4 | Who may issue? | Production, Manager and Admin (production does the physical work; Manager/Admin may correct). Confirm, or restrict to Production only. |
| D5 | Can Production see variant names? | Yes — they must identify the physical item; hide supplier and price only. |
| D6 | What may a Production scan reveal? | Product, variant, SKU, lot/batch, usable count. No supplier, invoice, order, price or other lots. |
| D7 | Does the owner accept the `StockMovement` migration (nullable parent + `issueLineId`)? | Yes — one audit history; alternative is a separate issue-movement table. |
| D8 | Screenshot page mapping | Confirm Image 1 = Catalogue, 2 = Overview, 3 = Receiving, 4 = Production. |

Also still OPEN from the PRD and unchanged by this plan: §15.9 (a) non-colour/multi-attribute codes, (b) supplier-location code registry and collisions, (c) variant creation authority, (d) label dimensions/printer, (e) O1–O8 (unit serialization, hardware, closing blockers, offline Admin approval, Manager stock visibility).

---

## Part D — Recommended sequence

| Order | Slice | Schema | Why now |
| --- | --- | --- | --- |
| 1 | Slice 3 — inline accordion | No | Smallest, fixes a visible defect, no dependencies |
| 2 | Slice 2 — remove Suppliers | No | Navigation consolidation, reversible |
| 3 | Slice 4 — remove Receiving page + global modal | No | Independent of production; reuses the existing modal |
| 4 | Slice 1 — catalogue search | No | Pure UI/helper; do after 2 so the search scope is final |
| 5 | Slice 5 — production search + quantity-only + permission tightening | No | Unblocks and de-risks Slice 6; makes the broken page usable immediately |
| 6 | Slice 6 — production scan checkout | **Yes** (additive) | Needs D1–D7 approved; the only stock-mutating change in this plan |

Each slice is a separate commit with schema/service/API/tests/UI where applicable, plus a short report per AGENTS.md working rule 8. Slices 1–5 can ship without touching ledger or stock data. Slice 6 needs a reviewed migration, a backup before applying locally, and concurrency tests before any operational use.

Out of scope here and still required for V1: damage-after-issue with BAD IDs and classification (FR-06/07), recovery approval (FR-08), unlinked reconciliation (FR-09), production completion (FR-10), day close (FR-11), audit log UI (FR-12), offline/cloud sync (FR-13), backup/restore (FR-15), and the pilot/hardware acceptance (§11).

## Part E — Verification commands (run per slice, do not claim results without running)

```
npm run typecheck
npm test
npm run build
npx playwright test <targeted spec>
```

Plus, for Slice 6 only: migration apply against a private local backup, a Postgres concurrency test, and a ledger-invariant check before and after the run.
