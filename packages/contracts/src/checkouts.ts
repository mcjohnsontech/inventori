import { z } from 'zod';
import type { AppRole } from './permissions.js';

export const checkoutLimit = 500;
export const checkoutReasonCodes = ['PRODUCTION_USE', 'SAMPLE', 'INTERNAL_USE', 'OTHER'] as const;
export const checkoutReasonLabels: Record<typeof checkoutReasonCodes[number], string> = {
  PRODUCTION_USE: 'Production use', SAMPLE: 'Sample', INTERNAL_USE: 'Internal use', OTHER: 'Other',
};
export const checkoutReasonSchema = z.object({
  code: z.enum(checkoutReasonCodes), note: z.string().trim().max(2000).default(''),
}).strict().refine(reason => reason.code !== 'OTHER' || (reason.note.length >= 10 && /\p{L}/u.test(reason.note)), 'Explain Other in at least ten meaningful characters');
export type CheckoutReason = z.infer<typeof checkoutReasonSchema>;
const orderReference = z.string().trim().min(1).max(120).nullable();
const uuid = z.uuid().transform(value => value.toLowerCase());
// Drafts may contain an unfinished Other explanation or an empty cart. Never use this for acceptance.
const draftReason = z.object({ code: z.enum(checkoutReasonCodes), note: z.string().max(2000) }).strict().nullable();
export const checkoutDraftSchema = z.object({
  reason: draftReason, orderReference: z.string().max(120).nullable(),
  lines: z.array(z.object({ unitId: uuid, reason: draftReason.optional(), orderReference: z.string().max(120).nullable().optional() }).strict())
    .max(checkoutLimit).refine(lines => new Set(lines.map(line => line.unitId)).size === lines.length),
}).strict();
export const checkoutSelectionSchema = z.object({ unitIds: z.array(uuid).min(1).max(checkoutLimit).refine(ids => new Set(ids).size === ids.length, 'Select each physical unit once') }).strict();
export const checkoutSchema = z.object({
  reason: checkoutReasonSchema.nullable(), orderReference,
  lines: z.array(z.object({ unitId: uuid, reason: checkoutReasonSchema.nullable().optional(), orderReference: orderReference.optional() }).strict())
    .min(1).max(checkoutLimit).refine(lines => new Set(lines.map(line => line.unitId)).size === lines.length, 'Select each physical unit once'),
}).strict().refine(body => new TextEncoder().encode(JSON.stringify(body)).length <= 30000,
  'Checkout details are too large. Use smaller explicit groups; no partial checkout is accepted.');
export const checkoutHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  orderReference: z.string().trim().min(1).max(120).optional(),
}).strict();
export type CheckoutInput = z.infer<typeof checkoutSchema>;
/** Resolve omitted overrides without treating an explicit missing reason as inheritance. */
export function resolveCheckoutLines(body: CheckoutInput) {
  return body.lines.map((line, index) => ({
    unitId: line.unitId,
    ordinal: index + 1,
    reason: line.reason === undefined ? body.reason : line.reason,
    orderReference: line.orderReference === undefined ? body.orderReference : line.orderReference,
    reasonInherited: line.reason === undefined,
    orderInherited: line.orderReference === undefined,
  }));
}
export type CheckoutItemIdentity = {
  unitId: string; unitCode: string; lotId: string; lotCode: string | null; productId: string;
  productCode: string | null; productName: string; variantId: string; variantName: string;
  skuId: string; fullSku: string; batchId: string; publicBatchCode: string;
};
export type CheckoutCandidate = CheckoutItemIdentity & { eligible: boolean; dataAsOf: string };
export type CheckoutView = {
  id: string; originId: string; transactionId: string; acceptedAt: string; originSequence: string;
  actor: { id: string; name: string; role: AppRole };
  defaults: { reason: CheckoutReason | null; orderReference: string | null };
  exceptionStatusAsOf?: string;
  totalUnits: number; initialMissingReasonCount: number; outstandingReasonCount: number;
  lines: { id: string; ordinal: number; unit: CheckoutItemIdentity; reason: CheckoutReason | null;
    orderReference: string | null; reasonInherited: boolean; orderInherited: boolean;
    reconciliationStatus?: 'PENDING' | 'RESOLVED' | null;
    initiallyMissingReason: boolean; exceptionId: string | null; movementId: string; eventId: string }[];
  balances: { lotId: string; usable: string }[];
  unitManifest: { id: string; ordinal: number; hash: string }[];
};
