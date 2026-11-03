import { z } from 'zod';
const uuid = z.uuid().transform(value => value.toLowerCase());
export class QrError extends Error { constructor(readonly kind: 'INVALID_QR' | 'UNSUPPORTED_QR_VERSION') { super(kind); } }
const restore = (value: string) => `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`.toLowerCase();
export function encodeQr(originId: string, lotId: string): string {
 return `DYI:1:${uuid.parse(originId).replaceAll('-','').toUpperCase()}:${uuid.parse(lotId).replaceAll('-','').toUpperCase()}`;
}
export function decodeQr(payload: unknown): { originId: string; lotId: string } {
 if (typeof payload !== 'string' || payload.length > 128) throw new QrError('INVALID_QR');
 const match = /^DYI:([1-9][0-9]{0,2}):([0-9A-F]{32}):([0-9A-F]{32})$/.exec(payload);
 if (!match) throw new QrError('INVALID_QR');
 const originId = restore(match[2]!); const lotId = restore(match[3]!);
 if (!uuid.safeParse(originId).success || !uuid.safeParse(lotId).success) throw new QrError('INVALID_QR');
 if (match[1] !== '1') throw new QrError('UNSUPPORTED_QR_VERSION');
 return { originId, lotId };
}
export const qrRequestSchema = z.object({ payload: z.string().max(128) }).strict();
const purpose = z.enum(['USABLE','DAMAGED_INTAKE']);
export const printJobSchema = z.discriminatedUnion('kind', [
 z.object({ kind: z.literal('INITIAL'), receiptId: uuid, profileId: z.enum(['a4-70x35-v1','a4-90x45-v1']) }).strict(),
 z.object({ kind: z.literal('REPRINT'), originalJobId: uuid, reason: z.string().trim().min(10).max(1000).refine(value => /\p{L}/u.test(value)), lines: z.array(z.object({ lotId: uuid, purpose, copies: z.string().regex(/^[1-9][0-9]{0,4}$/).refine(value => /^[1-9][0-9]{0,4}$/.test(value) && BigInt(value)<=10000n) }).strict()).min(1).max(100) }).strict(),
]);
export const printEventSchema = z.object({ kind: z.enum(['HANDOFF_REQUESTED','DIALOG_OPENED','OPERATOR_REPORTED_PRINTED','CANCELLED_BEFORE_HANDOFF','FAILED','OUTCOME_UNKNOWN']), chunk: z.string().regex(/^(0|[1-9][0-9]{0,11})$/), attemptId: uuid, copies: z.string().regex(/^(0|[1-9][0-9]{0,2})$/).refine(value=>/^[0-9]+$/.test(value) && BigInt(value)<=500n).optional(), note: z.string().trim().max(1000).default('') }).strict();
export function chunkRange(total: string, index: string) {
 if (!/^[1-9][0-9]*$/.test(total) || !/^(0|[1-9][0-9]{0,11})$/.test(index)) throw new Error('Invalid chunk');
 const offset = BigInt(index)*500n; const remaining=BigInt(total)-offset;
 if (remaining<=0n) throw new Error('Chunk outside manifest');
 return { offset: offset.toString(), copies: Number(remaining>500n?500n:remaining), chunks: ((BigInt(total)+499n)/500n).toString() };
}
export type LabelLine = { id: string; receiptLineId: string; lotId: string; purpose: 'USABLE'|'DAMAGED_INTAKE'; copies: string; payload: string; content: { fullCode: string; publicCode: string; productName: string; variantName: string; supplierName: string; sourceName: string } };
export type LabelJob = { id: string; receiptId: string; originId: string; kind: string; originalJobId: string|null; reason: string; profile: LabelProfile; rendererVersion: string; createdAt: string; manifestHash: string; totalCopies: string; chunks: string; labelsPerSheet: number; totalSheets: string; lines: LabelLine[]; events: { id: string; kind: string; chunk: string; attemptId: string; copies: string; artifactHash: string|null; note: string; createdAt: string }[] };
export type LabelProfile = { id: string; pageWidthMm: number; pageHeightMm: number; labelWidthMm: number; labelHeightMm: number; columns: number; rows: number; marginXmm: number; marginYmm: number; qrDotsPerModule: number; designDpi: number; fontSize: number };
export const labelProfiles: readonly LabelProfile[] = [
 { id:'a4-70x35-v1', pageWidthMm:210,pageHeightMm:297,labelWidthMm:70,labelHeightMm:35,columns:3,rows:7,marginXmm:0,marginYmm:26,qrDotsPerModule:4,designDpi:203,fontSize:8 },
 { id:'a4-90x45-v1', pageWidthMm:210,pageHeightMm:297,labelWidthMm:90,labelHeightMm:45,columns:2,rows:5,marginXmm:15,marginYmm:36,qrDotsPerModule:5,designDpi:203,fontSize:9 },
];
export type QrLookup = { productCode?: string | null; lotCode?: string | null; payloadVersion: 1; originId: string; lotId: string; skuId: string; fullSku: string; batchId: string; publicBatchCode: string; productId: string; productName: string; variantId: string; variantName: string; usable: string; dataAsOf: string; supplierName?: string; sourceName?: string; damaged?: string };
