import { expect, it } from 'vitest';
import { encodeUnitQr, unitObservationSchema, unitTrackingQuerySchema } from '@dayari/contracts';
import { randomUUID } from 'node:crypto';

it('limits QR presentation evidence to payload and declared input method', () => {
  const input = { payload: encodeUnitQr(randomUUID(), randomUUID()), method: 'CAMERA' };
  expect(unitObservationSchema.safeParse(input).success).toBe(true);
  for (const extra of [{ verified: true }, { quantity: 1 }, { actorId: randomUUID() }, { recordedAt: '2020-01-01' }])
    expect(unitObservationSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  expect(unitObservationSchema.safeParse({ ...input, method: 'PHYSICALLY_VERIFIED' }).success).toBe(false);
});
it('keeps tracking pagination bounded and rejects injected authorization scope', () => {
  expect(unitTrackingQuerySchema.parse({})).toEqual({ page: 1 });
  expect(unitTrackingQuerySchema.parse({ page: '2' })).toEqual({ page: 2 });
  for (const input of [{ page: 0 }, { page: 1_000_001 }, { originId: randomUUID() }, { includePrivate: true }])
    expect(unitTrackingQuerySchema.safeParse(input).success).toBe(false);
});
