# Phase 1 — Human-readable Product and Lot identities

## Subsequent owner-approved local upgrade

After the local Internal server error was diagnosed, the owner explicitly approved applying007/008 to the local operational database. The API watcher/worker were stopped, both migrations applied to dayari_dev, all30 pre-existing table row/count fingerprints compared unchanged before restart, both sidecars confirmed empty and ledger/projection mismatches confirmed0. API restarted successfully. Authenticated web-proxy sign-in, catalogue, stock, QR source list and label-job list returned200; exact unmapped code returned expected404; web returned200. No identity backfill, stock mutation or production deployment. Local verification is recorded in local-phase-1-upgrade.md and .local/phase-1-upgrade. Earlier isolated-only restrictions/results below describe the original Phase1 delivery and are superseded only for this specifically approved local schema upgrade. Phase2 remains unauthorized.


Authorization: owner's explicit Phase1 implementation authorization,3 November2026. Implemented scope is section17 of unit-traceability-and-label-ux-design.md. **No StockUnit/Unit Code, DYI:2, serialization cutover, receiving-limit change, fuzzy search, hierarchy redesign, print redesign, verification, production issues, recovery, closing, sync transport or deployment.**

## Delivered behavior

New parent products receive P+5 and new exact supplier-SKU/batch lots receive L+5 alternate codes. Alphabet23456789ABCDEFGHJKMNPQRSTUVWXYZ has31 characters; each typed namespace has28,629,151 candidates per origin. Backend crypto.randomInt selects each body character without modulo bias. Database UNIQUE(originId,code) plus subject PK arbitrate allocation; INSERT ON CONFLICT DO NOTHING retries up to32 candidates without aborting the transaction. Exhausted attempts return409 CODE_ALLOCATION_BUSY and roll back; no silent expansion, candidate overwrite, code recycling or renumbering. Retained immutable rows preserve allocated codes forever.

Allocation is integrated into direct catalogue/products and progressive catalogue/product-setups (new parent only), and each receiving-created lot. Reusing/extending a shared parent retains its Product Code and supplier-specific base/SKUs. Existing unmapped historical parents/lots stay valid and readable; they show Code not assigned. Opening a page, scanning or replaying an old command never backfills identities. Accepted receiving U/D parts and numeric limits are unchanged.

Product/Lot Codes are alternate keys, not primary identities. UUID, sourcing, saved SKU, batch and QR payload remain authoritative. Bare codes are shop-scoped. Equal strings at independent origins coexist; exact lookup defaults to configured shop and rejects unavailable explicit origin404. No global bare-code guarantee or cloud/federated chooser is claimed. Typed endpoints disambiguate Product from Lot; future federated search must present origin-qualified choices rather than renumber/guess.

## Database migrations and boundaries

- **202611030007_public_identities:** two sidecars only: ProductPublicIdentity and LotPublicIdentity. Subject UUID PK/FK, origin FK, code, policyVersion1, deferred command FK, server assignedAt, grammar/unique constraints and immutable guards. Origin/evidence checks bind mapping to accepted command/actor/audit/outbox and correct subject/receipt. Mapped Product origin cannot change; lot already immutable.
- **202611030008_public_identity_guard_record:** additive fix for shared-trigger record evaluation discovered by regression tests. Cross-kind predicate extracts lotId through JSON rather than accessing a nonexistent field on a Product identity trigger record. Applied007 was not rewritten.

Both migrations use explicit transactions and were applied **only to local dayari_test**. Apply007 and008 as one reviewed upgrade with writers quiesced;007 alone is not a supported running schema because its shared trigger bug is corrected by008. Do not re-enable application writes between them. A pre-identity synthetic schema was restored/rehearsed and cleaned up inside that test database. No operational/dayari_dev or production migration/backfill was executed. Migration itself does not allocate historical codes or change stock rows. No edits to migrations001–006.

Deferred INSERT triggers on Product and StockLot require a matching sidecar for every subject inserted after migration installation, regardless of endpoint/software version or claimed timestamp. Existing rows are grandfathered by insert-trigger applicability, not a timestamp heuristic. Table DDL locks serialize installation with inserts. New mapped subject and normal catalogue/receipt command evidence commit together. Stale writers/direct inserts without mappings fail; missing identity does not degrade to quantity-only success. This is Phase1 **code-presence** enforcement, not proof of future unit serialization cutover.

Allocation follows existing origin-first lock, active actor checks, command-key/hash semantics and audit/outbox/result transaction. Receiving lot identity shares the existing receipt transaction; failure after allocation/audit preparation removes identity, batch/receipt/ledger/balance, command and origin-sequence effects. Reads do not write command/audit/outbox metadata. Code backfill writes only sidecars plus its own command/audit/outbox and general origin sequence; it never creates stock movements or rewrites receiving commands. Runtime production roles must not own schema/DDL or disable triggers; actual production hardening/deployment remains a separate gate.

## API and DTO examples

All calls authenticated through existing /v1 session API; browser uses same-origin /api proxy. Exact reads accept optional validated originId only, strict six-character manual grammar, trim/uppercase without lookalike substitution, and120 reads/actor/minute per process. No fuzzy fallback, full catalogue load or stock mutation. Counts are decimal strings.

```text
GET /v1/inventory/products/by-code/P22222
GET /v1/inventory/lots/by-code/L8M4Q2?originId=<configured-shop-UUID>
Authorization: Bearer <session>
```

P22222 is a deliberately allocated synthetic collision-test example; L8M4Q2 illustrates format, not a promised existing lot. Actual browser fixture examples: Product PRZSEK and Lot LNMJ83; full allowlisted responses are in artifacts/phase-1/api-examples.json. These belong to isolated fixtures, not operational stock.

```json
{"kind":"PRODUCT","originId":"<UUID>","productId":"<UUID>",
 "productCode":"P22222","productName":"Collision fixture",
 "dataAsOf":"<server timestamp>","originSequence":"42"}
```

Lot response:

```json
{"kind":"LOT","originId":"<UUID>","lotId":"<UUID>","lotCode":"L8M4Q2",
 "productId":"<UUID>","productCode":"P7K2M9","productName":"Notebook",
 "skuId":"<UUID>","fullSku":"CHILG03849-RED","variantId":"<UUID>","variantName":"Red",
 "batchId":"<UUID>","publicBatchCode":"B-20261103-0001","usable":"2",
 "dataAsOf":"<server timestamp>","originSequence":"43"}
```

Admin/Manager lot DTO additionally permits damaged quantity. Production receives only the allowlisted fields shown: no supplier admin/contact data, invoice, damage reason/history/totals, audit, valuation or print records. Product response is identity-only, avoiding misleading combined-variant usable totals. Existing catalogue creation/receiving/print permissions remain unchanged. Unknown/foreign404, malformed/extra filters400, unauthenticated401, inactive403/401 via existing session enforcement, rate429. No mutation endpoint is added for manual code override or backfill. The CLI is an administrative DB-credential tool with a reviewed active Admin actor ID, not an end-user/session API.

Existing catalogue products expose productCode; operational receipt/lot reads and QR lookup expose productCode/lotCode or null. These are derived read fields, not edits to stored receipt snapshots. Old CommandResult replays remain their original response; missing optional code fields are supported. DYI:1 payload bytes/semantics and deterministic legacy print content are unchanged.

## Frontend

Existing catalogue, receiving/stock and QR workspaces share a small exact-code form. Product/Lot Code entry displays local context, product/variant identity and authorized usable/damaged fields, with clear empty/error/session/unavailable behavior. Changing input/failing lookup clears the previous result rather than suggesting stale availability. Catalogue rows show Product Code, lot stock rows show both codes and support filtering those displayed rows. This is minimal identity UX, not universal search or a new hierarchy UI.

Production can use code entry in QR lookup without receiving/print administration. The existing PDF viewer, label plans/templates/attempts and camera/HID behavior remain. Browser evidence includes desktop stock and390px Production lookup, response-field denials and unavailable-service handling. Screenshots live under artifacts/phase-1 after final verification.

## Backfill utility and safety

Command: npm run identity:backfill. It **requires IDENTITY_BACKFILL_DATABASE_URL**, explicitly local localhost/127.0.0.1 with a *_test database, no URL query/fragment. It never defaults to DATABASE_URL and refuses operational *_dev/remote targets. This build enables isolated rehearsal only; production/operational execution would require separate approval and reviewed guard changes. A test name is a guard, not independent proof of data provenance: operator must ensure synthetic/restored isolated fixtures.

Dry-run is default and requires an output file, active Admin UUID, shop origin, kind and optional limit1..500/UUID cursor. It selects missing subjects without reserving codes or creating commands and refuses to overwrite a saved plan. Example (test fixture IDs only):

```text
npm run identity:backfill -- --origin <UUID> --actor <Admin-UUID> --kind PRODUCT --limit 100 --out product-plan.json
npm run identity:backfill -- --apply --plan product-plan.json
```

Saved plan binds target protocol/host/port/database, origin, actor, kind, exact subject IDs, cursor and idempotency UUID. Apply rechecks active Admin/SHOP and each subject's origin under lock, writes mappings/evidence atomically, and returns codes/nextCursor. Replay identical saved plan returns original response; changed plan/key conflicts. Replanning skips already mapped subjects and never renumbers them; restart from beginning safely or use returned cursor for the next page. Existing mappings are retained if another operator wins first. All batches commit independently as explicit metadata commands; stock remains unchanged. No automatic startup/migration backfill.

Rehearsal engine restores legacy catalogue/accepted receipts/ledger/print metadata before007, migrates, plans a one-subject batch with zero write effects, concurrently replays apply, resumes in two-subject batches and finishes all missing Product/Lot mappings. It compares all existing stock/catalogue/SKU/print rows and old commands and reconstructs the same PDF bytes. Final restored fixture rehearsal mapped7 products and3 lots with original rows/commands unchanged and QR/PDF byte identity preserved. The CLI itself was also exercised: saved no-write dry-run on an already-mapped synthetic origin, empty apply/replay and operational *_dev refusal before connection all passed. Nonempty writes were rehearsed through the same engine on the isolated restored schema. There is no historical unit enrollment, physical count or verification claim.

## Executed checks and development failures

- Prisma client generation: passed, no database migration implied.
- Migration007 then008: passed on guarded local dayari_test only.
- Unit suite:20 passed across6 files.
- Full PostgreSQL integration:41 passed across5 files (58.91s), including34 previous regressions and7 new identity/security/rehearsal cases. Final identity-only rerun after adding explicit historical-unmapped QR/read and receipt-replay assertions:7 passed (16.26s).
- Final root/API/web/test typecheck: passed.
- Browser suite:5 passed (2.8 minutes), including4 unchanged catalogue/receiving/printing scenarios and the new identity scenario (14.0s). Desktop/mobile screenshots were visually inspected. Production build: passed (contracts, Prisma generation, API and optimized Next.js web).

Evidence covers secure format/grammar, real database collisions and32-attempt exhaustion, independent origins sharing P22222, concurrent same-key product/setup/receipt replay, distinct intentional receipt lots, changed-body conflicts, immutable/no-recycle guards, missing mappings, forged origin/evidence, full rollback after late receiving failure, response allowlists, throttling, and restored historical preservation. No test is treated as physical printer acceptance.

Development failures corrected: shared trigger field bug required008; a synthetic account used uppercase email although login normalizes lowercase; retry-conflict fixture initially used another actor (keys are intentionally actor-scoped); rehearsal needed enum conversion, generated-column-safe copying and FK insertion ordering. One malformed Supertest fixture URL was removed. These were not passed runs; final results above supersede them. Existing SQL-backed corruption fixtures now allocate valid lot mappings before corrupting the intended ledger edge, and also test missing-lot identity; assertions were not weakened. QR Production exact-key regression explicitly adds only approved public-code fields. Non-blocking pg concurrent-query deprecation warnings appeared from current Prisma adapter internals.

## Changed files

- prisma/schema.prisma; new migrations007/008 listed above.
- packages/contracts/src/public-identities.ts (new), index.ts, labels.ts.
- apps/api/src/public-code.ts, public-identities.service.ts, identity-backfill.ts (new); app.ts, catalogue.service.ts, catalogue-setup.ts, receiving.service.ts, labels.service.ts.
- scripts/backfill-public-identities.ts (new); package.json adds utility script only, no dependency changes.
- apps/web/components/identity-lookup.tsx (new); app/page.tsx, app/api/[...path]/route.ts, components/receiving/receiving-workspace.tsx, components/labels/qr-workspace.tsx.
- tests/unit/public-identities.test.ts, tests/integration/public-identities.test.ts, tests/e2e/public-identities.spec.ts (new); existing receiving/labels integration fixtures/assertions described above.
- This report, PRD identity addendum, design/decision/architecture/data-model/ledger/traceability/bricks and README updates; artifacts/phase-1 evidence directory.

## Remaining gates

Operational database remains unmigrated by instruction. The new application expects007/008; review via isolated test evidence/instances, not an assumption that port3000's operational database has these tables. Obtain separate migration/backfill/deployment authorization before enabling there. No operational-data backfill is included in Phase1 completion.

Phase2 remains unauthorized: StockUnit/events, receiving serialization/cutover, DYI:2 and corresponding bypass proof. Provisional serialization limits/performance/oversized-delivery policy, historical invalid-assignment resolution, physical label/scanner/media/HTTPS acceptance, retention/recovery and future workflow permissions remain later gates. Stop for Phase1 review.

## Retained evidence and final commands

artifacts/phase-1 contains stock-code-desktop.png, production-code-mobile.png, api-examples.json, backfill-rehearsal.json, cli-dry-run-plan.json, cli-rehearsal.json and evidence.json (SHA256/size manifest). All examples are synthetic test data and do not identify operational stock. Rehearsal evidence includes the byte-identical reconstructed PDF SHA256; no new physical printing was performed.

Commands actually executed: npm run db:generate; node scripts/migrate-test-db.ts (007, then008 on *_test); npm run typecheck; node scripts/run-vitest.mjs run; node scripts/run-vitest.mjs run --config vitest.integration.config.ts; targeted identity integration reruns; PLAYWRIGHT_CHANNEL=chrome npm run test:e2e; npm run build; isolated CLI dry-run/empty apply/replay/refusal checks. Documentation UTF-8/fence/local-link validation passed. No operational migrate/seed/backfill, deployment or Phase2 operation was run.
