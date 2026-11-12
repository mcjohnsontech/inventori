import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { can, reasonQueueQuerySchema, reasonReconciliationDraftSchema, reconcileReasonsSchema } from '@dayari/contracts';

it('limits classification to Admin and Managers and keeps review operational', () => {
  for (const role of ['ADMIN', 'MANAGER', 'PRODUCTION'] as const) {
    expect(can(role, 'RECONCILE_REASON')).toBe(role !== 'PRODUCTION');
    expect(can(role, 'RECONCILIATION_READ')).toBe(role !== 'PRODUCTION');
  }
});
it('requires an explicit approved classification and canonicalizes exact exception sets', () => {
  const ids = [randomUUID(), randomUUID()].sort();
  expect(reconcileReasonsSchema.parse({ exceptionIds: [...ids].reverse(), reason: { code: 'SAMPLE' } }))
    .toEqual({ exceptionIds: ids, reason: { code: 'SAMPLE', note: '' }, remarks: '' });
  for (const reason of [null, { code: 'OTHER', note: '' }, { code: 'OTHER', note: '1234567890' }, { code: 'SALE' }])
    expect(reconcileReasonsSchema.safeParse({ exceptionIds: ids, reason }).success).toBe(false);
  expect(reconcileReasonsSchema.safeParse({ exceptionIds: ids, reason: { code: 'OTHER', note: 'Approved sample use' }, remarks: 'Checked the original session' }).success).toBe(true);
});
it('rejects partial/duplicate selection, overrides and stock mutation input', () => {
  const id = randomUUID(), valid = { exceptionIds: [id], reason: { code: 'PRODUCTION_USE' } };
  for (const exceptionIds of [[], [id, id.toUpperCase()], Array.from({ length: 501 }, () => randomUUID())])
    expect(reconcileReasonsSchema.safeParse({ ...valid, exceptionIds }).success).toBe(false);
  for (const extra of [{ originId: randomUUID() }, { actorId: randomUUID() }, { quantity: 1 }, { toState: 'U' }, { orderReference: 'Rewrite' }, { approved: true }])
    expect(reconcileReasonsSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
});
it('validates Lagos date-filter semantics and rejects injected read scopes', () => {
  expect(reasonQueueQuerySchema.parse({})).toEqual({ page: 1, status: 'UNRESOLVED' });
  expect(reasonQueueQuerySchema.parse({ page: '2', from: '2024-02-29', to: '2024-03-01', unitCode: ' a7k2m9 ' }))
    .toMatchObject({ page: 2, unitCode: 'A7K2M9' });
  for (const query of [{ from: '2023-02-29' }, { from: '0000-01-01' }, { from: '2026-02-02', to: '2026-02-01' }, { unitCode: 'A0L1OI' }, { page: 0 }, { originId: randomUUID() }, { includeAudit: true }])
    expect(reasonQueueQuerySchema.safeParse(query).success).toBe(false);
});
it('preserves incomplete Manager drafts without treating them as accepted classifications', () => {
  const draft = { exceptionIds: [], reason: { code: 'OTHER', note: '' }, remarks: 'In progress ' };
  expect(reasonReconciliationDraftSchema.parse(draft)).toEqual(draft);
  expect(reconcileReasonsSchema.safeParse(draft).success).toBe(false);
});
