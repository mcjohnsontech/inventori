import { z } from 'zod';
export * from './units.js';
export * from './unit-labels.js';
export * from './unit-tracking.js';
export * from './checkouts.js';
export * from './accounts.js';
export * from './permissions.js';
export * from './availability.js';

export const roleSchema = z.enum(['ADMIN', 'MANAGER', 'PRODUCTION']);
const name = z.string().trim().min(1).max(160);
const code = z.string().trim().min(1).max(160);
const id = z.uuid().transform(value => value.toLowerCase());
export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(256) }).strict();
export const productSchema = z.object({ name, description: z.string().trim().max(2000).default('') }).strict();
export const supplierSchema = z.object({ name: name.refine(value => supplierCodeSeed(value).length > 0, 'The first word of the supplier name must contain letters') }).strict();
export const sourceSchema = z.object({ supplierId: id, name, code }).strict();
// Stable attribute/value IDs identify combinations. Display text is never the combination key.
export const attributeSchema = z.object({ productId: id, name }).strict();
export const valueSchema = z.object({ attributeId: id, label: name }).strict();
export const variantSchema = z.object({ productId: id, name, valueIds: z.array(id).min(1).max(20) }).strict();
export const skuSchema = z.object({ sourceId: id, variantId: id, baseCode: code, suffix: code }).strict();
export const idempotencyKeySchema = id;
const locationChoice = z.union([
  z.object({ registryId: id }).strict(),
  z.object({ name, code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]+$/).max(32) }).strict(),
]);
export const supplierSetupSchema = z.object({
  supplier: z.union([z.object({ id }).strict(), supplierSchema]),
  location: locationChoice,
  existingSourceId: id.optional(),
  useExistingPrefix: z.boolean().default(false),
  sourceName: name.optional(),
}).strict().refine(value => !value.existingSourceId || 'id' in value.supplier, 'Choose an existing supplier for an existing location');
const suffix = z.string().trim().toUpperCase().min(1).max(64).regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/);
const newVariant = z.object({ name, suffix, attributes: z.array(z.object({ attribute: name, value: name }).strict()).min(1).max(8) }).strict();
export const productSetupSchema = z.object({
  sourceId: id,
  extendVariants: z.boolean().optional(),
  product: z.union([z.object({ id }).strict(), productSchema]),
  variants: z.array(z.union([z.object({ variantId: id, suffix }).strict(), newVariant])).max(30).default([]),
}).strict();
export type SupplierSetupInput = z.infer<typeof supplierSetupSchema>;
export type ProductSetupInput = z.infer<typeof productSetupSchema>;

export function supplierCodeSeed(name: string): string {
  const firstWord = name.trim().split(/\s+/u)[0] ?? '';
  return [...firstWord.normalize('NFKC').toUpperCase()].filter(letter => /\p{L}/u.test(letter)).slice(0, 3).join('');
}

export function nextSupplierCode(name: string, existingCodes: Iterable<string>): string {
  const base = supplierCodeSeed(name);
  if (!base) return '';
  const used = new Set(existingCodes);
  if (!used.has(base)) return base;
  for (let number = 2; ; number++) {
    const candidate = `${base}-${String(number).padStart(2, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function combinationKey(valueIds: string[]): string {
  const ids = valueIds.map(id => id.toLowerCase());
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate attribute values');
  return ids.sort().join('|');
}

export type Role = z.infer<typeof roleSchema>;
export type Catalogue = {
  products: { id: string; productCode?: string | null; name: string; description: string; variants: { id: string; name: string; combinationKey: string }[]; attributes: { id: string; name: string; values: { id: string; label: string }[] }[] }[];
  suppliers: { id: string; name: string; code: string; sources: { id: string; name: string; code: string; skuPrefix?: { id: string; code: string; registryId: string } | null }[] }[];
  locations: { id: string; name: string; code: string }[];
  sourcings: { sourceId: string; productId: string; baseCode: string }[];
  skus: { id: string; fullCode: string; variantId: string; suffix: string; variant: { name: string; product: { name: string } }; sourcing: { source: { id: string; name: string; supplier: { name: string } } } }[];
};


export function lagosDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function batchCode(date: string, ordinal: number): string { return `B-${date.replaceAll('-', '')}-${String(ordinal).padStart(4, '0')}`; }
const intakeQuantity = z.number().int().min(0).max(2147483647);
export const receiptSchema = z.object({
  sourceId: id,
  deliveredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return value >= '0001-01-01' && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid delivery date'),
  invoiceReference: z.string().trim().max(160).default(''),
  lines: z.array(z.object({
    skuId: id, usableQuantity: intakeQuantity, damagedQuantity: intakeQuantity,
    damageReason: z.string().trim().max(2000).default(''),
  }).strict().refine(row => row.usableQuantity + row.damagedQuantity > 0, 'Enter a positive usable or damaged quantity')
    .refine(row => !row.damagedQuantity || (row.damageReason.length >= 10 && /\p{L}/u.test(row.damageReason)), 'Explain damaged arrivals in at least 10 characters')).min(1).max(100),
}).strict().refine(body => new Set(body.lines.map(row => row.skuId)).size === body.lines.length, 'Each SKU can appear only once');
export type ReceiptInput = z.infer<typeof receiptSchema>;
export type ReceivingOptions = { serializationActive?: boolean; unitLimit?: number; suppliers: { id: string; name: string; code: string; sources: { id: string; name: string; code: string }[] }[]; skus: { id: string; fullCode: string; sourceId: string; productId: string; productName: string; variantId: string; variantName: string }[] };
export type AcceptedReceipt = {
 serialization?: { unitCount: string; manifestPages: number };
 id: string; batch: { id: string; originId: string; publicCode: string; deliveredOn: string; acceptedAt: string; numberedOn: string; invoiceReference: string | null; supplierName: string; sourceName: string };
 originSequence: string; lines: { id: string; skuId: string; lotId: string; lotCode?: string | null; productCode?: string | null; fullCode: string; productId: string; productName: string; variantName: string; usableQuantity: string; damagedQuantity: string; totalQuantity: string; damageReason: string }[];
 totals: { usable: string; damaged: string; delivered: string };
};
export type OperationalStock = { asOf: string; lots: { lotId: string; lotCode?: string | null; productCode?: string | null; skuId: string; productId: string; sourceId: string; batchId: string; originId: string; publicCode: string; fullCode: string; productName: string; variantName: string; supplierName: string; sourceName: string; usable: string; damaged: string }[]; bySku: { skuId: string; fullCode: string; usable: string; damaged: string }[]; byProduct: { productId: string; productName: string; usable: string; damaged: string }[] };

export * from './labels.js';

export * from './public-identities.js';

// Bounded operational provenance: no security/audit snapshots or valuation fields.
export type LotEvidence = { lotId: string; receiptId: string; deliveredOn: string; acceptedAt: string; originSequence: string; movements: { id: string; fromState: string; toState: string; quantity: string }[] };
export * from './invitations.js';
export * from './label-layout.js';

export * from './reconciliation.js';
export * from './damage.js';
export * from './authorization-requests.js';

export * from './completions.js';

export * from './reports.js';

export * from './counts.js';
