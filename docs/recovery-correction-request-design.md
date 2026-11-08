# Recovery and correction requests — approved execution boundary

Status: approved owner direction O5, 8 November 2026. Detailed vertical-slice implementation follows checkout and missing-reason reconciliation. This document does not enable stock transitions.

## Request workflow

Inventory Manager submits a shop-scoped request identifying exact existing inventory records, requested outcome, meaningful explanation and supporting evidence. The service validates actor membership, immutable provenance, current recorded state and request consistency. Each accepted submission is idempotent, transactional and audited with immutable request evidence and origin-scoped history. Admin and Manager receive appropriately scoped visibility. Production receives no request administration or sensitive history.

Requests are pending authorization, not accepted stock transactions. Submission, viewing and retry must not create movements, update StockBalance or UnitState, complete a recovery/correction, enroll historical units or supplement accepted receipts. Repeated submissions with the same key return the original request; a changed payload conflicts. Any later request amendment must preserve original evidence rather than overwrite it.

The interface must state: “Pending cloud authorization. Stock has not changed. Approval delivery is not available in this phase.” There is no Approve button, local approval endpoint, automatic acceptance timer, downloadable bearer authorization, or manually trusted authorization import. Admin visibility does not imply execution authority.

## Deferred execution dependency

Cloud-delivered Admin authorization, delivery authentication, replay/revocation handling, remote approval transport and local-server infrastructure require a separately approved future design. No substitute trust mechanism is introduced. Before future execution the service must revalidate exact selected identities, current state and evidence; approval cannot authorize an unrelated or stale transition. This is a future requirement, not an implemented capability.

Positive physical-count discrepancies must remain explicitly unresolved. This request workflow does not fabricate received events, create replacement historical units, invent historical verification or change authoritative ledger balances. A correction involving new physical units needs its own approved provenance/identity design before execution.

## Closing interaction — O4

A pending request blocks a period only where valid authorization is necessary to certify its quantities or resolve a recorded discrepancy. Fully accounted, internally consistent held damaged inventory can carry forward when no blocking approval is needed. Never classify a discrepancy as certified merely because a request exists. Derive blockers from backend evidence; do not trust a client-provided “nonblocking” checkbox.

Close Day must show separate blocking issues, accounted carry-forward items and daily movements, with links to the underlying request/evidence. Manager-only confirmation, Admin review-only, no override, immutable snapshot and concurrency fencing remain required. Internet unavailability alone is not a blocker.

## Required verification at implementation

Test permitted roles and direct API denial; origin isolation; exact-unit/state validation; meaningful evidence; same-key replay/conflict/concurrency; atomic request/audit/outbox rollback; immutable evidence; absence of stock effects on submit/retry/read; lack of approval/execution paths; truthful pending UI and history; and both blocking-discrepancy and certified-held-damage closing cases. Use isolated fixtures only. No claim of these workflow tests passing is made by this design document.


## Milestone 7 implementation contract

Recovery requests identify distinct exact currently damaged native units, their current event/version and BAD or intake provenance. Capture meaningful explanation and supporting evidence text. Request outcome is return to usable, not execution. Store immutable request root and exact unit children with a canonical hashed manifest.

Correction requests identify one existing lot and internal state (U/P/D), a factual observed nonnegative integer quantity, supporting explanation and evidence. Resolve authoritative projected quantity server-side and preserve it alongside the observation and derived signed discrepancy. Reject an equal observation because it requests no correction. Do not create missing/extra physical units, assign codes or change any ledger quantity. This is a request to investigate/authorize a discrepancy, not a certified physical count or automatic adjustment. Physical-count records are a later independent milestone.

All requests are PENDING_CLOUD_AUTHORIZATION with no approval/execution route. Manager submits; Admin/Manager review; Production has no administration. Origin/current actor/idempotency/transaction/audit/outbox rules apply. Bounded 500-unit recovery groups and strict 30 KB normalized input prevent silent partial processing. Supporting evidence in this slice is factual text/references; file upload infrastructure is not invented. Future execution must revalidate quantities, unit eligibility and provenance, and obtain approved cloud-delivered authorization.

A pending correction remains an unresolved certification blocker. A recovery request alone does not change already-certified D accounting or prevent fully accounted held D from carrying forward; any underlying discrepancy/evidence blocker still applies. No client flag can declare a discrepancy nonblocking.
