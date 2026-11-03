# PRD v1.2 addendum — Phase 1 human identities

Owner explicitly authorized Phase1 on3 November2026. This dated addendum records the approved extension without rewriting the original PRD document.

ProductPublicIdentity adds immutable origin-scoped P+5 codes for shared parent products; LotPublicIdentity adds immutable origin-scoped L+5 codes for exact supplier-SKU/batch lots. Approved random-body alphabet is23456789ABCDEFGHJKMNPQRSTUVWXYZ. Database uniqueness/collision retry/no recycling apply. UUIDs, supplier/location prefixes, base/SKU allocation, variants, receipt/stock provenance and historical label evidence remain authoritative/unchanged. Equal short strings from disconnected origins retain their codes and need origin-qualified resolution; no global bare-code uniqueness is promised.

Production may perform authenticated minimal exact Product/Lot identity and usable-availability reads. No sensitive supplier/invoice/damage-history/audit/print administration exposure. Admin-only catalogue creation and Admin/Manager receiving/printing remain.

Phase1 does **not** enable per-unit serialization: PRD's existing V1 shared-lot labels still apply to the current implementation. The separately accepted direction for StockUnit/U+7/DYI:2, native printing/cart and verification is gated by subsequent phase authorization, migrations, cutover proof and hardware review. No new production issue restriction, receiving quantity cap, historical unit history or stock change is implied by assigning readable codes.

Operational migration/backfill/deployment remain separately unauthorized. See phase-1-implementation-report.md for actual isolated verification.
