import { z } from 'zod';
const id = z.uuid().transform(v => v.toLowerCase()), text = z.string().trim().min(10).max(2000), quantity = z.string().regex(/^(0|[1-9][0-9]{0,18})$/).refine(v => BigInt(v) <= 9223372036854775807n);
export const countSessionSchema = z.object({ lotId: id, state: z.enum(['U', 'P', 'D', 'C', 'X']), purpose: text.max(1000) }).strict();
export const countAttemptSchema = z.object({ sessionId: id }).strict();
export const countObservationSchema = z.object({ attemptId: id, unitIds: z.array(id).min(1).max(500).refine(v => new Set(v).size === v.length).transform(v => v.sort()) }).strict();
export const countResultSchema = z.object({ attemptId: id, observedQuantity: quantity, unidentifiedExtras: quantity, explanation: text, evidence: text }).strict();
export const countResolutionSchema = z.object({ resultId: id, matchingResultId: id, explanation: text }).strict();
export const countQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), lotId: id.optional() }).strict();
export type CountSnapshot = {
    mode: 'NATIVE' | 'LEGACY';
    ledgerQuantity: string;
    projectionQuantity: string;
    fingerprint: string;
    expected: string[];
};
export type CountView = {
    lotCode:string|null;fullSku:string;productName:string;variantName:string;publicBatchCode:string;
    id: string;
    lotId: string;
    state: string;
    purpose: string;
    recordedAt: string;
    attempts: {
        id: string;
        recordedAt: string;
        snapshot: CountSnapshot;
        observations: {
            id: string;
            unitId: string;
            unitCode: string;
        }[];
        result: null | {
            id: string;
            status: 'MATCHED' | 'MISMATCH' | 'STALE';
            observedQuantity: string;
            unidentifiedExtras: string;
            explanation: string;
            evidence: string;
            recordedAt: string;
            resolution: null | {
                id: string;
                matchingResultId: string;
                explanation: string;
            };
        };
    }[];
};
