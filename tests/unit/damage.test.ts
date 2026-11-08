import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { can, damageDraftSchema, damageQuerySchema, damageReportSchema, damageReviewSchema } from '@dayari/contracts';

it('preserves approved BAD and Manager-only disposition permissions', () => {
  for (const role of ['ADMIN', 'MANAGER', 'PRODUCTION'] as const) {
    expect(can(role, 'REPORT_BAD')).toBe(true); expect(can(role, 'REVIEW_DAMAGE')).toBe(role === 'MANAGER');
  }
});
it('requires exact distinct unit identities and meaningful damage evidence without client state authority', () => {
  const ids = [randomUUID(), randomUUID()].sort(), valid = { unitIds: [...ids].reverse(), cause: 'Torn cover', description: 'Cover torn during preparation' };
  expect(damageReportSchema.parse(valid).unitIds).toEqual(ids);
  for (const extra of [{ actorId: randomUUID() }, { fromState: 'P' }, { quantity: 3 }, { checkoutId: randomUUID() }, { approved: true }])
    expect(damageReportSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
  for (const unitIds of [[], [ids[0], ids[0]!.toUpperCase()], Array.from({ length: 501 }, () => randomUUID())])
    expect(damageReportSchema.safeParse({ ...valid, unitIds }).success).toBe(false);
  expect(damageReportSchema.safeParse({ ...valid, description: '1234567890123' }).success).toBe(false);
});
it('enables only the four approved disposition choices and never implicit recovery', () => {
  for (const outcome of ['HELD', 'REWORKED', 'DISCARDED', 'RETURNED_TO_VENDOR'])
    expect(damageReviewSchema.safeParse({ unitIds: [randomUUID()], outcome, note: 'Manager inspected the damaged item' }).success).toBe(true);
  for (const outcome of ['RECOVERED', 'USABLE', 'COMPLETED', 'RETURN_TO_PRODUCTION'])
    expect(damageReviewSchema.safeParse({ unitIds: [randomUUID()], outcome, note: 'Manager inspected the damaged item' }).success).toBe(false);
});
it('keeps incomplete drafts distinct from accepted requests and validates scoped history filters', () => {
  const draft = { unitIds: [], cause: '', description: '', outcome: 'HELD', note: '' };
  expect(damageDraftSchema.parse(draft)).toEqual(draft); expect(damageReportSchema.safeParse(draft).success).toBe(false);
  expect(damageQuerySchema.parse({ page: '2', unitCode: ' a7k2m9 ' })).toEqual({ page: 2, unitCode: 'A7K2M9' });
  expect(damageQuerySchema.safeParse({ originId: randomUUID() }).success).toBe(false);
});
