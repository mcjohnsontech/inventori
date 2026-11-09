import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { authorizationHistoryQuerySchema, authorizationRequestSchema, authorizationSelectionSchema, can, observedQuantitySchema } from '@dayari/contracts';

const reason = 'Manager requests evidence-based investigation', evidence = 'Physical observation and original receipt reviewed';
it('permits only Manager submission without creating a local approval capability', () => {
  for (const role of ['ADMIN', 'MANAGER', 'PRODUCTION'] as const) expect(can(role, 'REQUEST_STOCK_AUTHORIZATION')).toBe(role === 'MANAGER');
});
it('validates exact distinct recovery requests and canonicalizes unit sets', () => {
  const ids = [randomUUID(), randomUUID()].sort();
  const parsed = authorizationRequestSchema.parse({ kind: 'RECOVERY', unitIds: [...ids].reverse(), reason, evidence });
  if (parsed.kind !== 'RECOVERY') throw Error('Expected recovery request'); expect(parsed.unitIds).toEqual(ids);
  for (const unitIds of [[], [ids[0], ids[0]!.toUpperCase()], Array.from({ length: 501 }, () => randomUUID())])
    expect(authorizationRequestSchema.safeParse({ kind: 'RECOVERY', unitIds, reason, evidence }).success).toBe(false);
  for (const extra of [{ approved: true }, { actorId: randomUUID() }, { status: 'APPROVED' }, { execute: true }, { quantity: 4 }])
    expect(authorizationRequestSchema.safeParse({ kind: 'RECOVERY', unitIds: ids, reason, evidence, ...extra }).success).toBe(false);
});
it('uses safe decimal strings and independently reviewed quantities for correction requests', () => {
  for (const value of ['0', '500', '9223372036854775807']) expect(observedQuantitySchema.safeParse(value).success).toBe(true);
  for (const value of ['-1', '1.5', '01', 'abc', '1e3', '9223372036854775808', '999999999999999999999999999'])
    expect(observedQuantitySchema.safeParse(value).success).toBe(false);
  const input = { kind: 'CORRECTION', lotId: randomUUID(), state: 'U', observedQuantity: '5', reviewedLedgerQuantity: '8', reviewedProjectionQuantity: '8', reason, evidence };
  expect(authorizationRequestSchema.safeParse(input).success).toBe(true);
  expect(authorizationRequestSchema.safeParse({ ...input, state: 'E' }).success).toBe(false);
  const { reviewedLedgerQuantity, ...unreviewed } = input; expect(authorizationRequestSchema.safeParse(unreviewed).success).toBe(false);
  expect(authorizationRequestSchema.safeParse({ ...input, expectedQuantity: '5' }).success).toBe(false);
});
it('requires supporting evidence and rejects authority injected into previews/history filters', () => {
  const input = { kind: 'RECOVERY', unitIds: [randomUUID()], reason, evidence };
  for (const change of [{ reason: '' }, { evidence: '1234567890123' }, { evidence: '' }]) expect(authorizationRequestSchema.safeParse({ ...input, ...change }).success).toBe(false);
  expect(authorizationSelectionSchema.safeParse({ kind: 'CORRECTION', lotId: randomUUID(), state: 'D' }).success).toBe(true);
  expect(authorizationSelectionSchema.safeParse({ kind: 'CORRECTION', lotId: randomUUID(), state: 'D', approved: true }).success).toBe(false);
  expect(authorizationHistoryQuerySchema.parse({})).toEqual({ page: 1 });
  expect(authorizationHistoryQuerySchema.safeParse({ originId: randomUUID() }).success).toBe(false);
});
