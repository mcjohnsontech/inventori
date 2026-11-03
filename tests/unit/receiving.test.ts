import { describe, expect, it } from 'vitest';
import { batchCode, lagosDate, receiptSchema } from '@dayari/contracts';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const body = { sourceId: id, deliveredOn: '2026-11-02', lines: [{ skuId: id, usableQuantity: 30, damagedQuantity: 2, damageReason: 'Covers damaged in transit' }] };
describe('receiving boundaries and Lagos allocation', () => {
 it('separates UTC timestamps from Lagos business dates and expands daily batch numbers', () => {
  expect(lagosDate(new Date('2026-11-01T23:30:00Z'))).toBe('2026-11-02');
  expect(lagosDate(new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-01');
  expect(batchCode('2026-11-02', 1)).toBe('B-20261102-0001');
  expect(batchCode('2026-11-02', 10000)).toBe('B-20261102-10000');
 });
 it('validates real calendar dates, nonnegative integer parts and meaningful damage evidence', () => {
  expect(receiptSchema.safeParse(body).success).toBe(true);
  for (const date of ['2026-02-30', '2025-02-29', '0000-01-01', '2026-1-1', 'x']) expect(receiptSchema.safeParse({ ...body, deliveredOn: date }).success).toBe(false);
  expect(receiptSchema.safeParse({ ...body, deliveredOn: '2024-02-29' }).success).toBe(true);
  for (const quantity of [-1, 0.5, '2', Number.MAX_SAFE_INTEGER]) expect(receiptSchema.safeParse({ ...body, lines: [{ ...body.lines[0], usableQuantity: quantity }] }).success).toBe(false);
  for (const reason of ['', 'broken', '123456789012345']) expect(receiptSchema.safeParse({ ...body, lines: [{ ...body.lines[0], damageReason: reason }] }).success).toBe(false);
  expect(receiptSchema.safeParse({ ...body, lines: [{ skuId: id, usableQuantity: 0, damagedQuantity: 0 }] }).success).toBe(false);
  expect(receiptSchema.safeParse({ ...body, lines: [{ skuId: id, usableQuantity: 0, damagedQuantity: 2, damageReason: 'All items arrived broken' }] }).success).toBe(true);
 });
 it('rejects duplicates, trusted totals and unauthorized input fields', () => {
  expect(receiptSchema.safeParse({ ...body, lines: [body.lines[0], body.lines[0]] }).success).toBe(false);
  expect(receiptSchema.safeParse({ ...body, totalQuantity: 99 }).success).toBe(false);
  expect(receiptSchema.safeParse({ ...body, actorId: id }).success).toBe(false);
  expect(receiptSchema.safeParse({ ...body, lines: [{ ...body.lines[0], totalQuantity: 32 }] }).success).toBe(false);
 });
});
