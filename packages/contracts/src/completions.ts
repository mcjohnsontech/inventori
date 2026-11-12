import { z } from 'zod';
import type { DamageCandidate } from './damage.js';
const ids = z.array(z.uuid().transform(value => value.toLowerCase())).min(1).max(500).refine(values => new Set(values).size === values.length, 'Select each unit once').transform(values => [...values].sort());
export const completionSchema = z.object({ unitIds: ids }).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 30000, 'Select a smaller explicit group');
export const completionQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), query: z.string().trim().max(120).default('') }).strict();
export const completionOptionsQuerySchema = completionQuerySchema.extend({checkoutId:z.uuid().optional()});
export type CompletionSessions = {page:number;pageSize:number;total:number;rows:{id:string;acceptedAt:string;employeeName:string;remaining:number;orderReferences:string[]}[]};
export type CompletionCandidate = DamageCandidate;
export type CompletionView = {
    id: string;
    originId: string;
    recordedAt: string;
    originSequence: string;
    transactionId: string;
    manager: {
        id: string;
        name: string;
    };
    manifestHash: string;
    lines: {
        id: string;
        unit: DamageCandidate['unit'];
        checkoutId: string;
        checkoutLineId: string;
        orderReference: string | null;
        recordedHolder: {
            id: string;
            name: string;
        };
        movementId: string;
        eventId: string;
    }[];
};
export const completionDraftSchema = z.object({ unitIds: z.array(z.uuid()).max(500).refine(ids => new Set(ids).size === ids.length) }).strict();
