import { z } from 'zod';
import { checkoutDraftSchema, checkoutReasonSchema, type CheckoutItemIdentity, type CheckoutReason } from './checkouts.js';

const date = z.iso.date().refine(value => value >= '0001-01-01' && value <= '9999-12-31', 'Use a valid business date');
const id = z.uuid().transform(value => value.toLowerCase());
const selection = z.array(id).min(1).max(500).refine(values => new Set(values).size === values.length, 'Select each exception once')
  .transform(values => [...values].sort());
export const reasonSelectionSchema = z.object({ exceptionIds: selection }).strict();
export const reasonReconciliationDraftSchema = z.object({
  exceptionIds: z.array(id).max(500).refine(values => new Set(values).size === values.length),
  reason: checkoutDraftSchema.shape.reason,
  remarks: z.string().max(2000),
}).strict();
export type ReasonReconciliationDraft = z.infer<typeof reasonReconciliationDraftSchema>;
export const reconcileReasonsSchema = z.object({
  exceptionIds: selection,
  reason: checkoutReasonSchema,
  remarks: z.string().trim().max(2000).default(''),
}).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 30000, 'Select a smaller explicit reconciliation group. No partial classification is accepted.');
export const reasonQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  status: z.enum(['UNRESOLVED', 'RESOLVED', 'ALL']).default('UNRESOLVED'),
  from: date.optional(), to: date.optional(),
  employeeId: id.optional(), orderReference: z.string().trim().min(1).max(120).optional(),
  unitCode: z.string().trim().toUpperCase().regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/).optional(),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, 'Checkout date range is reversed');
export type ReasonReconciliationInput = z.infer<typeof reconcileReasonsSchema>;
export type ReasonResolutionView = {
  id: string; originId: string; recordedAt: string; originSequence: string;
  manager: { id: string; name: string }; reason: CheckoutReason; remarks: string;
  manifestHash: string;
  lines: { id: string; exceptionId: string; checkoutId: string; checkoutLineId: string; unitId: string }[];
};
export type ReasonQueueRow = {
  exceptionId: string; checkoutId: string; checkoutLineId: string; acceptedAt: string;
  employee: { id: string; name: string }; orderReference: string | null; unit: CheckoutItemIdentity;
  status: 'UNRESOLVED' | 'RESOLVED'; resolution: Omit<ReasonResolutionView, 'lines'> | null;
};
export type ReasonQueue = { page: number; pageSize: number; total: number; rows: ReasonQueueRow[] };
