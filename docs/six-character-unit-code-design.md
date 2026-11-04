# Six-character Unit Codes — authoritative design correction

Owner-confirmed 3 November 2026. Design only: no StockUnit schema, allocator, DYI:2, cutover, operational migration or enrollment is implemented/authorized here. This correction supersedes every earlier eight-character/U+7 unit proposal, including historical design examples. Existing Product/Lot code policies are unchanged.

## Identity and generator

Each physical unit has an immutable UUID plus exactly six uppercase characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. There is **no fixed U prefix**. Examples: A7K2M9, B8Q4R2, C9M7T3. Excludes 0/O/1/I/L. Display/input normalization trims outer whitespace and uppercases; embedded spaces, excluded/lookalike substitutions and wrong lengths reject. Never silently extend the code or reuse a retired one.

Proposed generator uses six independent crypto.randomInt(31) draws (unbiased CSPRNG). Allocate inside the accepted unit-creation transaction using INSERT ON CONFLICT DO NOTHING and database uniqueness, with at most 32 attempts per identity. Retries occur only on the intended code constraint; unrelated integrity errors fail. Exhaustion returns a stable allocation-busy conflict and rolls back the whole receiving/enrollment command, preserving its retry key. No partial stock, recycling or fallback length. The bounded retry count is an engineering proposal retained from the existing identity allocator, to be tested in Phase 2.

Capacity is 31^6 = **887,503,681 permanent codes per origin**. With n uniformly sampled candidates, expected pre-retry colliding pairs are approximately n(n−1)/(2N): 50 → 0.00000138; 10,000 → 0.05633; 1,000,000 → 563.38. At one million allocated codes, the next draw collision probability is about 0.1127%. These are candidate retries, not committed duplicates. At occupancy f, probability of exhausting 32 independent attempts is f^32 (assuming a healthy uniform generator); database uniqueness still decides correctness. Measure retry distribution in benchmarks; alert on unusual retry rates and namespace occupancy. Namespace exhaustion requires a reviewed new policy/migration, not automatic widening. Secure randomness does not replace uniqueness or make short codes access secrets.

## Future database and contracts

StockUnit: UUID PK, originId, lotId, unitCode, initial condition, registration provenance/time; `UNIQUE(originId,unitCode)` and `CHECK(char_length(unitCode)=6 AND unitCode ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$')`. Immutable update/delete guards and retained identities prevent reassignment after consumption/retirement. Composite lot/origin/provenance FKs and deferred receipt-unit count checks remain required. UnitState is only a rebuildable event projection. No separate stock is created by code allocation or printing.

Future shared Zod unitCode contract mirrors the exact grammar. Dedicated `GET /v1/inventory/units/by-code/:code` resolves one authorized unit at the configured origin (optional origin only if permitted). Return typed UNIT discriminator, code/UUID and allowed Product, Variant, exact supplier SKU, Lot, Batch and current state. Unknown/foreign returns consistent 404; malformed 400; unauthenticated 401. Production omits damaged history/totals, supplier-private information, invoice, audit and print administration. Known unauthorized records do not leak status through search counts or errors.

Inventory search checks normalized six-character input as an exact unit lookup before name matching, and offers explicit Unit Code mode. Do not dispatch solely by P/L/U prefix: a valid Unit Code can begin P and equal a Product Code. A generic search returns separately labelled authorized PRODUCT and UNIT hits when both exist; the Unit match is prominent and unambiguous, never discarded or arbitrarily reinterpreted. Dedicated unit lookup remains exact. Existing Product/Lot endpoints and code constraints are unchanged. Independent shops may allocate the same code: lookup is origin-qualified and must not silently choose across shops or renumber.

## QR, labels and history

DYI:2 continues to encode origin UUID + StockUnit UUID, not the short code as authority. All 50 received physical units have distinct UUIDs, codes and V2 payloads. DYI:1 still resolves only the saved lot; never choose a guessed unit. P+5/L+5 mappings, old QR strings, accepted receipt/ledger and print history remain unchanged.

Individual preview/print labels prominently show the six-character Unit Code beside a genuine QR, with product/variant, exact SKU, lot/batch context. Print/reprint manifests enumerate saved unit UUIDs; reprint reuses the same code, creates no unit and changes no balance. Label renderer/version changes are additive; historical templates remain reproducible. Physical dimensions/scannability remain subject to hardware trials.

## Future acceptance proof

Test length/alphabet/normalization and rejection, exact known/unknown/foreign lookup, same string at different origins, P-prefix Product/Unit ambiguity, immutability/no-reuse and database direct-write rejection. Force consecutive collisions and all-32 exhaustion; prove safe retries, concurrency, same-key replay and complete rollback. Receive 50 mixed usable/damaged units and prove 50 distinct codes/UUID/QR payloads with exact ledger membership. Benchmark at realistic occupancy with deterministic injected collisions, not claims based on a small random sample. Verify decoding of actual QR output, prominent code readability and manual search. Reprint preserves membership/stock; V1/P/L and historical record regressions remain mandatory. None of these serialization tests is claimed executed in Slices 1–3.
