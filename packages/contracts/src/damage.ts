import { z } from 'zod';
import type { CheckoutItemIdentity } from './checkouts.js';

const id = z.uuid().transform(value => value.toLowerCase());
const meaningful = (minimum: number) => z.string().trim().min(minimum).max(2000).refine(value => /\p{L}/u.test(value), 'Describe the factual evidence');
const selection = z.array(id).min(1).max(500).refine(values => new Set(values).size === values.length, 'Select each unit once').transform(values => [...values].sort());
export const damageSelectionSchema = z.object({ unitIds: selection }).strict();
export const damageReportSchema = z.object({ unitIds: selection, cause: meaningful(3), description: meaningful(10) }).strict()
  .refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 30000, 'Use a smaller explicit report; no partial acceptance');
export const damageOutcomes = ['HELD', 'REWORKED', 'DISCARDED', 'RETURNED_TO_VENDOR'] as const;
export const damageDraftSchema = z.object({ unitIds: z.array(id).max(500).refine(values => new Set(values).size === values.length),
  cause: z.string().max(2000), description: z.string().max(2000), outcome: z.enum(damageOutcomes), note: z.string().max(2000) }).strict();
export type DamageDraft = z.infer<typeof damageDraftSchema>;
export const damageReviewSchema = z.object({ unitIds: selection, outcome: z.enum(damageOutcomes), note: meaningful(10) }).strict()
  .refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 30000, 'Use a smaller explicit review; no partial acceptance');
export const damageQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  unitCode: z.string().trim().toUpperCase().regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/).optional() }).strict();
export type DamageCandidate = { unit: CheckoutItemIdentity; state: 'U' | 'P' | 'D' | 'C' | 'X';
  checkoutId: string | null; checkoutLineId: string | null; orderReference: string | null;
  holder: { id: string; name: string } | null; receiptId: string; damageLineId: string | null; eligible: boolean };
export type DamageReportInput = z.infer<typeof damageReportSchema>;
export type DamageReviewInput = z.infer<typeof damageReviewSchema>;
export type DamageView = {
  id: string; originId: string; recordedAt: string; originSequence: string; transactionId: string | null;
  actor: { id: string; name: string; role: 'ADMIN' | 'MANAGER' | 'PRODUCTION' };
  kind: 'BAD' | 'REVIEW'; cause: string; description: string; outcome: typeof damageOutcomes[number] | null;
  manifestHash: string;
  lines: { id: string; unit: CheckoutItemIdentity; fromState: string; toState: string;
    recordedHolder: { id: string; name: string } | null;
    checkoutId: string | null; checkoutLineId: string | null; orderReference: string | null;
    receiptId: string; damageLineId: string | null; movementId: string | null; eventId: string | null }[];
};
