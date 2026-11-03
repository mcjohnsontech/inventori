# Application permission matrix

CONFIRMED existing policies plus Phase B authorization, 2026-11-03. Backend enforcement is mandatory; navigation is not a security boundary.

| Capability | Admin | Inventory Manager | Production |
| --- | --- | --- | --- |
| Own account/session/password change | Own only | Own only | Own only |
| Staff directory/provision/profile/role/status/revoke | Same shop | Denied | Denied |
| Shop configuration | Read | Denied | Denied |
| Catalogue/attributes/variants/sourcing creation | Yes | Denied | Denied |
| Operational catalogue | Yes | Yes | Minimal discovery DTO |
| Receiving/options/receipt history | Yes | Yes | Denied |
| Stock/provenance/damaged quantities | Yes | Yes | Usable identity/availability only |
| Exact Product/Lot Codes and DYI:1 QR | Yes | Yes | Minimal operational DTO |
| Print jobs/PDF/reprint/outcomes/history | Yes | Yes | Denied |
| Bounded operational reports | Yes | Yes | Permitted usable availability only |
| Unrestricted audit/security metadata/valuation endpoint | Unavailable | Unavailable | Unavailable |
| Issuing/recovery/corrections/closing/cloud writes | Not implemented | Not implemented | Not implemented |

Active mapped membership, current origin and valid session are required. Compulsory-change sessions may access only own identity/password-change/logout until completed. No public registration/reset delivery. Sensitive mutations revoke sessions and recheck roles under origin-first locks; historical actor UUIDs and role snapshots remain. Block self-demotion/deactivation and last active Admin removal. No extra roles/configurable permission editor.

Production allowlists exclude invoices, damaged quantities/reasons/history, audit/command evidence, print administration, supplier contacts/financial fields. Product/variant/SKU/lot/batch identities, nonsensitive source labels and usable availability are permitted. Counts/filters/direct IDs obey the same origin/role scope. Unknown/foreign identities receive indistinguishable unavailable responses. Authenticated output is no-store; hashes/tokens/passwords never enter public DTOs.
