# Owner-approved local Phase1 schema upgrade

3 November2026. Owner explicitly approved local migrations007 and008 after catalogue/stock returned500 because the running Phase1 app queried missing sidecars. No production deployment or backfill authorized/performed.

Procedure completed:

1. Identified/stopped only local API tsx watcher and worker; web and PostgreSQL remained running. API4000 confirmed stopped before snapshot.
2. Recorded counts and deterministic row fingerprints for all30 pre-existing public tables (excluding migration journal) in .local/phase-1-upgrade/before.json. This is preservation evidence, not a database backup.
3. Ran npm run db:migrate against the approved loopback dayari_dev target;007/008 both applied. Previous migrations were not modified.
4. Compared every existing table fingerprint/count before resuming API: all unchanged. ProductPublicIdentity rows0, LotPublicIdentity rows0; ledger/projection mismatches0. Recorded .local/phase-1-upgrade/verification.json.
5. Restarted npm run dev:api; health200. Authenticated same-origin browser proxy sign-in200, catalogue200, stock200, qr/manual-sources200, label-print-jobs200, web page200, logout200. Exact code not allocated in this shop returned expected404, not500.

Authentication smoke creates/revokes its own normal session/login-attempt evidence after the preserved-row comparison; it does not change inventory. No dummy receipt or identity was created to test writes. Historical records remain readable with Code not assigned until separately approved backfill. Existing DYI:1/print identities unchanged. No Unit Codes/StockUnit/DYI:2/cutover/Phase2 work.

The local server is running at http://127.0.0.1:3000 with API4000. Refresh the page to clear the prior error. Any other operational migration, real-data backfill or production deployment still needs separate approval.
