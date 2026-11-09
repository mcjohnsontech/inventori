import { z } from 'zod';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => value >= '0001-01-01' && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value, 'Enter a valid business date');
const page = z.coerce.number().int().min(1).max(1000000).default(1), id = z.uuid().transform(value => value.toLowerCase());
const range = { from: date, to: date, productId: id.optional(), sourceId: id.optional(), skuId: id.optional() };
export const reportQuerySchema = z.object({ ...range, page, type: z.enum(['RECEIPT', 'ISSUE', 'DAMAGE', 'DISPOSITION', 'COMPLETE']).optional() }).strict().refine(value => value.to >= value.from && Date.parse(value.to + 'T00:00:00Z') - Date.parse(value.from + 'T00:00:00Z') <= 365 * 86400000, 'Choose up to 366 business dates in chronological order');
export const orderInvestigationSchema = z.object({ orderReference: z.string().trim().min(1).max(120), page }).strict();
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportFreshness = {
    asOf: string;
    originSequence: string;
    timezone: 'Africa/Lagos';
    certifiedClosing: false;
};
export type MovementReportRow = {
    id: string;
    transactionId: string;
    type: 'RECEIPT' | 'ISSUE' | 'DAMAGE' | 'DISPOSITION' | 'COMPLETE';
    recordedAt: string;
    originSequence: string;
    actorName: string;
    fromState: string;
    toState: string;
    quantity: string;
    lotId: string;
    lotCode: string | null;
    batchId: string;
    publicBatchCode: string;
    skuId: string;
    fullSku: string;
    productId: string;
    productCode: string | null;
    productName: string;
    variantName: string;
    supplierName: string;
    sourceName: string;
    receiptId: string | null;
    checkoutId: string | null;
    damageId: string | null;
    completionId: string | null;
    unitId: string | null;
    unitCode: string | null;
    orderReference: string | null;
};
export type MovementReport = ReportFreshness & {
    page: number;
    pageSize: number;
    total: number;
    rows: MovementReportRow[];
};
export type ReportFlows=Record<'receivedUsable'|'receivedDamaged'|'issued'|'reportedBad'|'completed'|'removed',string>;
export type ReportBalance = {
    flows:ReportFlows;
    skuId: string;
    fullSku: string;
    productId: string;
    productName: string;
    variantName: string;
    states: Record<string, {
        opening: string;
        ending: string;
    }>;
};
export type PeriodReport = ReportFreshness & {
    page: number;
    pageSize: number;
    total: number;
    balances: ReportBalance[];
    days: {
        day: string;
        receipts: string;
        issues: string;
        damage: string;
        completions: string;
        dispositions: string;
    }[];
    reasons: {
        code: string;
        records: string;
        originallyMissing: string;
        classified: string;
        pending: string;
    }[];
    reviews:{outcome:string;records:string;distinctUnits:string}[];
    requests: {
        kind: 'RECOVERY' | 'CORRECTION';
        records: string;
    }[];
    basis: 'ACCEPTED_AT';
    executedRecoveryEnabled: false;
};
export type OrderInvestigation = ReportFreshness & {
    page: number;
    pageSize: number;
    total: number;
    sessions: number;
    orderReference: string;
    rows: {
        checkoutId: string;
        checkoutLineId: string;
        acceptedAt: string;
        actorName: string;
        unitId: string;
        unitCode: string;
        lotId: string;
        lotCode: string | null;
        publicBatchCode: string;
        productName: string;
        variantName: string;
        fullSku: string;
        state: string;
        originalReason: string | null;
        classifiedReason: string | null;
        missingReasonStatus: 'PENDING' | 'RESOLVED' | null;
        completionId: string | null;
    }[];
};
