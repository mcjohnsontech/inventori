# Progressive catalogue setup proposal

Review proposal following the user's feedback on 2 November 2026. This document proposes the next catalogue slice; it does not mark business rules approved or stock workflows implemented.

Current implementation addendum: the user subsequently authorized the progressive forms and allocation rules recorded in `decisions.md`. The seven-type entry drawer has been replaced by separate supplier and product actions. Supplier setup commits supplier/source/registry/prefix together; product setup selects the saved prefix, creates or reuses a shared product/variants and allocates a random five-digit base once per source/product. Explicit suffixes and STD are approved. Existing prefixes can be adopted explicitly; all historical identities remain unchanged. The earlier proposal below is retained as design context; the current workflow and actual validation are in `progressive-catalogue-report.md`.

## Current friction found in the implementation

The Add entry drawer exposes seven separate record types. Saving closes the drawer, and opening another type resets the selected product and variant values. A user must infer the dependency order, repeatedly select the same product and separately create attributes, values, variants, suppliers, locations and SKUs. Native required dropdowns can be empty without a useful path to create the missing prerequisite. Successful individual records do not tell the user what to do next. Supplier and source codes are currently mandatory manual fields.

## Proposed task flow

Replace the entry-type dropdown with task actions: **Set up product**, **Add supplier**, and **Connect supplier to product**. Products, Suppliers and Supplier SKUs tabs select the relevant default action. Keep individual record administration as a secondary advanced action if needed.

The primary product setup uses four visible steps:

1. **Product** — search existing shared parent products first; select one or create a name/description. Explain that the same product from another supplier reuses this parent.
2. **Variants** — ask whether the product has options. Allow Colour, Size, Material, Finish or a custom attribute; enter several values in one view and display explicit combinations for selection. Show a table such as Red / A5 and Brown / A5. Preserve the existing default-variant identity rule for products without options. Warn before creating many combinations and require explicit selection; no silent Cartesian expansion into stock identities.
3. **Supplier and source** — select existing supplier or create one inline; select/add its location without losing product/variant context. Show generated supplier-code preview under the proposed policy. Supplier identity and location identity remain separate.
4. **Review and save** — show parent product, variant rows, supplier/source and resolved or manually allocated SKUs. Reuse an existing source/product base code when present. Until a complete SKU-generation policy is approved, new base code and suffix allocation remain explicit Admin inputs. Commit the new catalogue setup together, preserve existing IDs, and display **View product** or **Set up another product** afterward.

The standalone supplier action is shorter: supplier name → generated-code preview → source location if supplied → review/save. Adding a supplier must not require creating a product or inventing a location. Connecting an existing supplier to a product skips already completed steps.

## Interaction behavior

PROPOSED engineering choices:

- Retain draft/context when moving Back/Continue; show progress and a summary of completed choices. Confirm discarding an unsaved draft rather than losing it through backdrop dismissal.
- Create missing prerequisites inline and preselect them on return. Explain empty dropdowns with an Add action.
- Validate fields in the current step, put errors beside the field and focus the first invalid field. Preserve input after server/network errors.
- Suggest existing products, suppliers and values before creation; similar names are suggestions, not an automatic merge of identities.
- Save the complete new setup in one authenticated, authorized, idempotent database transaction with audit/outbox metadata. Back/Continue does not create accepted records. Existing records are referenced, not edited. A failed final row rolls back the new setup.
- Retry an uncertain submission with the same idempotency key. Show success only after durable acceptance. Do not add stock quantities, receipts or labels in this catalogue slice.
- Use an accessible dialog with focus management, keyboard navigation and a full-screen step layout on small screens. Keep Admin-only creation and Manager read access as already approved.

## Supplier code generation

CONFIRMED user request: supplier code should be generated automatically from the information entered, rather than requiring manual typing.

APPROVED supplier allocation policy after the user's explicit selection under AGENTS.md rule 3:

- Use the first three uppercase letters of the first word: Chioma Ventures → CHI, Lagos Paper Supplies → LAG. Full-name codes and word-initial codes were alternatives, not the selected rule.
- A separate supplier with the same candidate receives CHI-02, then CHI-03, etc. Collision suffix is not a count of delivery batches or products. Final uniqueness is enforced by server transaction and database constraint.
- Allocate the final unique code on the server inside the creation transaction. A client preview is tentative until save; concurrent creation and retries cannot duplicate or advance allocation twice.
- Persist the allocated code. Later display-name changes do not recalculate it. Existing supplier codes and all historical references remain unchanged.
- Implementation detail: take Unicode letters from the first whitespace-delimited word after compatibility normalization/uppercasing; discard punctuation/digits, keep up to three letters (short words are not padded). No ASCII transliteration or invented fallback. A first word without letters is rejected with validation. The generated seed fits the existing code field; the existing 160-character supplier-name limit remains unchanged.

Supplier code is distinct from the source-location code and full supplier/location/product base SKU. Approving supplier-name generation does not establish a parser or segment lengths for CHILG03849, or approve automatic base/suffix generation. Source codes, variant suffix governance and full-SKU allocation remain separately controlled decisions.

## Acceptance criteria for the proposed slice

- Admin can set up one parent, Colour values Red/Brown, selected variants and one supplier/source without closing/reopening multiple forms.
- Back navigation preserves values; cancelling/discarding creates no accepted partial setup; failing final validation produces no partial new catalogue records or outbox effects.
- Reusing an existing parent for a second supplier does not create another parent or variant combination.
- A product without options follows the default-variant path; configured products cannot allocate an unspecified default SKU.
- Supplier code preview and final allocation match the approved policy, with simultaneous collisions, repeated requests and failed submissions covered by PostgreSQL tests.
- Existing supplier codes and historical identifiers remain unchanged; foreign-role/API attempts remain denied.
- Browser tests cover inline creation, Back/Continue, validation recovery, final review, keyboard focus and mobile layout.

The supplier-code subset has now been implemented with a read-only preview, transactional allocation and migration `202611020002_supplier_code_identity`; see `supplier-code-report.md`. The progressive multi-step setup above remains proposed for the next bounded catalogue workflow slice.
