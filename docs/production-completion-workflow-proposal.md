# Production completion workflow — proposal for owner review

Status: APPROVED with owner amendment, 12 November 2026: Admin and Inventory Manager may use the selection, review and confirmation flow. Production remains excluded. Operational migration/deployment remains separately gated.

## Existing behavior
Previously Inventory Managers alone could confirm selected eligible In Production units; Admin saw Review only. The latest owner amendment now permits both Admin and Inventory Manager. Production cannot confirm completion. The existing command already records an atomic, idempotent, audited P → C transition without another usable-stock deduction.

## Recommended workflow
1. Open Production → Completion. Show open work grouped by checkout session, with Order ID when provided and employee, checkout date and item count. Keep sessions without an Order ID visible.
2. Expand a session or filter by reusable Order ID, employee or Unit Code. Display exact units with their product and variant. An Order ID is a filter/grouping reference, never an automatic completion boundary.
3. An Admin or Inventory Manager selects the exact finished units. Provide individual selection controls in this session, with explicit selection count and ability to remove individual units. Do not silently select other sessions using the same Order ID.
4. Review a completion drawer: selected Unit Codes, variants, SKU, lot, original checkout, employee and Order ID. Explain that usable stock was deducted at checkout and will not be deducted again.
5. The authorized operator clicks Confirm completion. Revalidate eligibility inside the existing atomic transaction. If any unit is no longer eligible, reject the entire selection and refresh; preserve the intended selection for correction. Retry a lost response with the same idempotency key.
6. Show the immutable completion reference, responsible operator and timestamp. Keep remaining units In Production. Subsequent checkouts under the same Order ID remain independent.

Damaged, removed and unresolved disposition units are excluded and remain in their authorized resolution workflows. Completion is an operational attestation, not externally verified order fulfilment.

## Role presentation
- Admin and Inventory Manager: select, review and confirm.
- Production: no completion administration.

## Approved amendment and remaining rollout gate
The owner approved “Admin and manager only selection flow.” Implemented as Admin/Manager-only session selection, exact-unit selection, review and confirmation. Existing O8 accounting semantics remain unchanged. Apply migration 032 operationally only after separate upgrade authorization.

## Acceptance checks
Admin/Manager-only backend enforcement; explicit exact-unit selection; partial session completion; reused Order IDs across sessions; damaged-unit rejection; competing completion requests; replay; immutable history; no additional usable deduction; mobile and keyboard review flow.
