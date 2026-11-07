import { z } from 'zod';

export const unitAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const serializedReceiptLimit = 10_000;
export const unitCodeSchema = z.string().trim().toUpperCase().regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, 'Enter exactly six readable Unit Code characters');
export const receiptUnitsQuery = z.object({ page: z.coerce.number().int().min(1).max(1_000_000).default(1), lotId: z.uuid().optional() }).strict();
export type ReceivedUnit = { id: string; unitCode: string; lotId: string; receiptLineId: string; initialState: 'U' | 'D'; state: string; fullSku: string; productName: string; variantName: string; recordedAt: string };
export type ReceiptUnitsPage = { units: ReceivedUnit[]; total: number; page: number; pageSize: number; historicalUnassigned: boolean };
