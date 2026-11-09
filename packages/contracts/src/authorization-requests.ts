import { z } from 'zod';
import type { DamageCandidate } from './damage.js';

const id = z.uuid().transform(value => value.toLowerCase());
const units = z.array(id).min(1).max(500).refine(values => new Set(values).size === values.length, 'Select each unit once').transform(values => [...values].sort());
const text = (maximum: number) => z.string().trim().min(10, 'Provide at least ten meaningful characters for the explanation and evidence').max(maximum).refine(value => /\p{L}/u.test(value), 'Describe meaningful supporting evidence');
const state = z.enum(['U', 'P', 'D']);
export const observedQuantitySchema = z.string().trim().regex(/^(0|[1-9][0-9]{0,18})$/, 'Enter a nonnegative whole quantity')
  .refine(value => !/^(0|[1-9][0-9]{0,18})$/.test(value) || BigInt(value) <= 9223372036854775807n, 'Quantity exceeds supported range');
export const authorizationSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('RECOVERY'), unitIds: units }).strict(),
  z.object({ kind: z.literal('CORRECTION'), lotId: id, state }).strict(),
]);
export const authorizationRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('RECOVERY'), unitIds: units, reason: text(2000), evidence: text(4000) }).strict(),
  z.object({ kind: z.literal('CORRECTION'), lotId: id, state, observedQuantity: observedQuantitySchema,
    reviewedLedgerQuantity: observedQuantitySchema, reviewedProjectionQuantity: observedQuantitySchema, reason: text(2000), evidence: text(4000) }).strict(),
]).refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 30000, 'Use a smaller explicit request; no partial acceptance');
export const authorizationHistoryQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(1_000_000).default(1), kind: z.enum(['RECOVERY', 'CORRECTION']).optional() }).strict();
export const authorizationDraftSchema = z.object({ kind: z.enum(['RECOVERY', 'CORRECTION']), unitIds: z.array(id).max(500).refine(values => new Set(values).size === values.length),
  lotId: id.nullable(), state, observedQuantity: z.string().max(32), reason: z.string().max(2000), evidence: z.string().max(4000) }).strict();
export type AuthorizationDraft = z.infer<typeof authorizationDraftSchema>;
export type AuthorizationRequestInput = z.infer<typeof authorizationRequestSchema>;
export type CorrectionTarget = { lotId: string; lotCode: string | null; productCode: string | null; productId: string; productName: string;
  variantName: string; skuId: string; fullSku: string; batchId: string; publicBatchCode: string; state: 'U' | 'P' | 'D'; ledgerQuantity: string; projectionQuantity: string };
export type RecoveryRequestTarget = DamageCandidate & { recordedVersion: string; previousEventId: string };
export type AuthorizationPreview = { kind: 'RECOVERY'; units: RecoveryRequestTarget[] } | { kind: 'CORRECTION'; target: CorrectionTarget };
export type AuthorizationRequestView = { id: string; originId: string; recordedAt: string; originSequence: string;
  status: 'PENDING_CLOUD_AUTHORIZATION'; kind: 'RECOVERY' | 'CORRECTION'; manager: { id: string; name: string };
  reason: string; evidence: string; evidenceHash: string; requestedDelta: string | null; observedQuantity: string | null; preview: AuthorizationPreview;
  stockChanged: false; approvalDelivery: 'DEFERRED' };
