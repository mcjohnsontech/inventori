# Receiving setup empty-state fix

The fresh staging catalogue has no suppliers. Receiving previously displayed an unconditional “Ask Admin” instruction and disabled setup even for an authenticated Admin.

Admin receiving shortcuts now open the existing supplier/location setup wizard when no receiving suppliers exist. Saving refreshes catalogue data and resumes receiving; cancelling clears that continuation. The Receiving workspace shows an Add supplier action with Admin-specific guidance. Managers retain existing supplier-registration restrictions. No backend, schema, ledger, SKU, QR, or permission changes are included.

Changed application files: apps/web/app/page.tsx, apps/web/components/workspace-router.tsx, apps/web/components/receiving/receiving-workspace.tsx. Browser regression: tests/e2e/receiving-empty.spec.ts.

Validation: typecheck and production frontend build passed. Initial browser startup failed because local PostgreSQL was stopped; after starting it, the first browser run exposed an incorrect test navigation selector (Receiving is not in the current sidebar). The test was corrected to use the existing #receiving route. Final browser results and staging publication are recorded below.

Final isolated Playwright run: 2/2 passed (Admin and Manager), 1.2 minutes. Typecheck and production frontend build passed. No operational records were used for tests.
