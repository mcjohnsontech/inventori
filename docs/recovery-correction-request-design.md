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
