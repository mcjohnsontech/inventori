# Remaining experience implementation plan

Owner authorization: implement remaining proposal slices, with targeted invitation/password decisions confirmed on 3 November 2026. Existing development branch and architecture retained.

1. Invitations: additive isolated-only migration; immutable invitation identity/events, encrypted private delivery queue, Admin commands and public single-use acceptance, six-character password policy, isolated transport, frontend and negative/concurrency tests. Live delivery disabled.
2. Unit traceability: six-character origin-scoped immutable codes, additive StockUnit/event/projection models, atomic serialized receiving and database bypass prevention, safe exact lookup and DYI:2 alongside DYI:1. Benchmark provisional limits; no operational cutover/enrollment.
3. Labels: exact-unit manifests, individual component previews, native print/PDF fallback, explicit uncertain/partial outcomes, selective reprints and optional verification. Printing never changes stock.
4. Historical onboarding: guarded dry-run/rehearsal software only; preserve ledger and explicitly record discrepancies. Real-data execution remains gated.

For every complete slice: isolated fixtures, relevant unit/integration/browser regression, typecheck/build, diff review, commit/push and verified SHA. Do not implement future production movements, recovery, closing or sync transport. No operational database upgrade or deployment is authorized.
