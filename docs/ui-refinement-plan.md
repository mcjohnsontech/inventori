# UI review and printing simplification — 4 November 2026

Owner correction: printing must not require reporting success/failure. Reprinting is the recovery workflow. Preserve existing history, stock rules, QR data, permissions and idempotency.

1. Remove outcome-report inputs and acknowledgement gates from the print screen. Continue automatic print-request logging without claiming physical success. Keep explicit selective reprints and existing backend/history compatibility.
2. Fix action-bar overlap and whitespace in the labels workspace, simplify operator copy and inspect responsive preview/picker sizing.
3. Inspect rendered catalogue, suppliers, inventory, receiving, receipts, QR, overview and account pages with isolated browser fixtures. Correct concrete layout defects through existing shared components where possible; do not change domain permissions or records.
4. Run workflow regressions, responsive checks, typecheck and build. Record findings, screenshots, remaining limitations and pushed commits in the report. No database changes or operational test mutations.
