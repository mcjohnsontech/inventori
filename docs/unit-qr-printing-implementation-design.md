# Milestone 3: exact-unit QR and printing implementation

7 November 2026. Authorized by the complete V1 directive. Operational migrations, historical enrollment, live stock changes and physical hardware certification remain gated.

## Compatibility and identity

Keep DYI:1 encoding, lot lookup, existing print tables/renderers, retained hashes and reprints unchanged. Add DYI:2 with the same strict origin UUID representation and exact StockUnit UUID. The six-character Unit Code is display/search identity, never the database authority or a guessed lot member. Typed Unit Code entry avoids ambiguity with a Product Code having the same characters. Lookup is authenticated, origin-scoped, rate-limited and read-only; unknown/foreign identities return 404, malformed input 400 and unsupported versions 422.

Admin/Manager lookup can return authorized unit and sourcing context. Production receives an explicit minimal identity/availability DTO, with no supplier-sensitive information, invoice, damaged history/totals, audit or print controls. Existing IDENTIFY and PRINT_ADMIN capabilities remain. No scan or print deducts inventory.

## Additive print evidence

Use separate UnitLabelJob, UnitLabelLine, UnitLabelClaim, UnitLabelArtifact and UnitLabelEvent models. This preserves the existing lot-label manifest grammar and its 65-copy/three-identity regression instead of rewriting historical semantics.

- Job: immutable origin/actor/command, INITIAL or reasoned REPRINT, original job when applicable, profile/renderer snapshot, exact membership hash and creation time.
- Line: one saved unit, exact lot/receipt line, ordinal, initial usable/damaged purpose, unchanged payload and frozen human-readable content. Unique unit membership per job; no arbitrary copy count.
- Initial claim: one immutable initial line per unit across jobs. Concurrent initial selections either replay the same command or conflict; never substitute another unit.
- Artifact: immutable prepared HTML and PDF bytes/hashes from the same frozen exact membership/profile. Rendering occurs outside database locks; artifact acceptance, event, audit/outbox and command result commit atomically afterward. A failed render leaves a requested job without claiming output.
- Event: requested/prepared/handoff evidence with stable attempt IDs. No automatic physical-success or attachment assertion. Existing owner direction requires no printed/failed reporting form; uncertain/partial output is handled by inspection and explicit selection of existing identities for reprint, with duplicate-sticker warnings.

Database safeguards reject late supplementation, history edits, foreign/mismatched unit/lot/receipt/origin relationships, incomplete manifests/claims, invalid reprint lineage and incorrect artifact hashes. Metadata commands use origin-first locking, current actor fencing, sorted unit locks, canonical request hashes, idempotency, audit and outbox. No stock/unit-state mutation is part of these commands.

## Print cart and output

Bound an individual cart/job to 500 exact units, matching the existing render chunk bound. Larger selections use explicit separate jobs, never hidden truncation. Selection is paginated and deduplicated; preserve bounded actor/origin draft IDs/profile/reason across Back and confirm clearing. Restore requires fresh server validation. Initial and reprint groups are explicit; reprints select saved original lines and preserve code/payload/content. No new unit is created by any print path.

Primary preview uses individual React label components with genuine locally generated SVG QR symbols and prominent six-character Unit Codes, product/variant, complete SKU, Lot Code and batch. Page a small number of previews, avoiding 500 live QR elements. Physical page geometry is a separate profile concern. Reuse the approved A4 trial dimensions/margins/gaps and purpose-separated sheets; clearly distinguish damaged-intake labels. Essential identity/QR/warnings must fit or preparation fails, never silently clip.

Prepare self-contained local output with embedded fonts/QR and escaped text. An authenticated same-origin print-only document opens from an explicit user click and offers the device print dialog after assets are ready and idempotent handoff evidence is accepted. Restrictive CSP, no credentials in URLs, no CDN or external service. PDF fallback is downloadable from the same exact frozen job. Browser print return/afterprint does not prove physical output; no mandatory outcome report. Repeated handoff/selective reprint explicitly warns about duplicate stickers. Attachment verification and stock issuing are separate domains.

Existing lot-label tools remain compatible and clearly identify their shared lot semantics; they cannot satisfy individual-unit label coverage or select a unit for checkout. The new native-unit workflow uses DYI:2. Do not silently remove the existing lot-label capability while the earlier proposed legacy-initial restriction remains an unresolved policy.

## Verification

Test grammar/versions, origin and role allowlists; exact six-character lookup; concurrent initial claims and same-key replay/conflict; explicit selective reprint stability; metadata failure rollback; no stock/unit-state changes; immutable membership and artifact hashes; local HTML escaping/CSP; genuine QR decoding from final HTML/PDF rasters; purpose separation, quiet zones, font/geometry fit; cart Back/discard, native print handoff and blocked popup/error recovery. Preserve all existing lot QR/PDF and receiving/ledger tests. Inspect 320/390/768/1024/1440 screenshots. Physical printer/media/scanner trials remain an owner rollout gate, not inferred from digital decoding.


Manual identity fields remain explicitly typed: Product/Lot lookup is separate from Unit Code lookup. A prefix-free six-character Unit Code may start with P and match a Product Code in another identity namespace; no cross-table uniqueness or silent renumbering is invented. QR resolution is unambiguous by version and UUID. Later combined search must present typed exact matches instead of choosing one silently.
