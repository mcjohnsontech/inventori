# Application permission matrix

CONFIRMED existing policies plus Phase B authorization, 2026-11-03. Backend enforcement is mandatory; navigation is not a security boundary.

| Capability | Admin | Inventory Manager | Production |
| --- | --- | --- | --- |
| Own account/session/password change | Own only | Own only | Own only |
| Staff directory/provision/profile/role/status/revoke | Same shop | Denied | Denied |
| Shop configuration | Read | Denied | Denied |
| General catalogue/attributes/variants/sourcing creation | Yes | Denied | Denied |
| Receiving-specific product/variant registration | Yes | Yes, existing scoped receiving command | Denied |
| Operational catalogue | Yes | Yes | Minimal discovery DTO |
| Receiving/options/receipt history | Yes | Yes | Denied |
| Stock/provenance/damaged quantities | Yes | Yes | Usable identity/availability only |
| Exact Product/Lot Codes and DYI:1 QR | Yes | Yes | Minimal operational DTO |
| Print jobs/native/PDF/reprint/handoff history | Yes | Yes | Denied |
| Operational reporting administration | Yes | Yes | Denied |
| Usable availability discovery | Yes | Yes | Minimal scoped DTO |
| Unrestricted audit/security metadata/valuation endpoint | Unavailable | Unavailable | Unavailable |
| Exact-unit checkout | Yes | Yes | Yes, own records |
| Missing-reason reconciliation | Confirm classifications (12 November approval) | Confirm classifications | Denied |
| BAD reporting | Eligible operational units | Eligible operational units | Own checkout units only |
| Damage disposition | Review | Held/Reworked or terminal removal | Denied |
| Recovery/correction requests | Review pending evidence | Submit/review pending evidence | Denied |
| Local approval or recovery/correction execution | Unavailable | Unavailable | Unavailable |
| Selected-unit Production completion | Review | Confirm | Denied |
| Targeted physical counts (8B verified checkpoint) | Review | Record/recount/resolve mistaken evidence | Denied |
| Daily closing (isolated implementation, rollout gated) | Review only | Confirm with all blockers cleared | Denied |
| Cloud stock writes/approval transport | Deferred | Deferred | Deferred |

Active mapped membership, current origin and valid session are required. Compulsory-change sessions may access only own identity/password-change/logout until completed. No public registration/reset delivery. Sensitive mutations revoke sessions and recheck roles under origin-first locks; historical actor UUIDs and role snapshots remain. Block self-demotion/deactivation and last active Admin removal. No extra roles/configurable permission editor.

Production allowlists exclude invoices, damaged quantities/reasons/history, audit/command evidence, print administration, supplier contacts/financial fields. Product/variant/SKU/lot/batch identities, nonsensitive source labels and usable availability are permitted. Counts/filters/direct IDs obey the same origin/role scope. Unknown/foreign identities receive indistinguishable unavailable responses. Authenticated output is no-store; hashes/tokens/passwords never enter public DTOs.

9 November update: table reflects current complete-application milestones and confirmed B05/O4/O5/O6/O8 policies. Tested development capabilities do not imply operational schema rollout. Physical counts are metadata only; resolving mistaken count evidence is not permission to correct stock. No compulsory print-success report is required.
