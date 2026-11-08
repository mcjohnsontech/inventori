import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { can, checkoutDraftSchema, checkoutHistoryQuerySchema, checkoutLimit, checkoutSchema, checkoutSelectionSchema, resolveCheckoutLines } from '@dayari/contracts';

const draft = () => ({ reason: null, orderReference: null, lines: [{ unitId: randomUUID() }] });

describe('explicit exact-unit checkout contract', () => {
  it('permits approved roles and explicit missing reason without inventing a default', () => {
    for (const role of ['ADMIN', 'MANAGER', 'PRODUCTION'] as const) expect(can(role, 'CHECKOUT')).toBe(true);
    expect(checkoutSchema.parse(draft()).reason).toBeNull();
    const { reason: _reason, ...missing } = draft();
    expect(checkoutSchema.safeParse(missing).success).toBe(false);
  });

  it('preserves opaque reusable order references and distinguishes inheritance from explicit blank', () => {
    const body = draft();
    const parsed = checkoutSchema.parse({ ...body, reason: { code: 'SAMPLE' }, orderReference: '  Order-a/27  ',
      lines: [body.lines[0], { unitId: randomUUID(), reason: null, orderReference: null }] });
    expect(parsed.orderReference).toBe('Order-a/27');
    expect(parsed.reason).toEqual({ code: 'SAMPLE', note: '' });
    expect(parsed.lines[0]).not.toHaveProperty('reason');
    expect(parsed.lines[0]).not.toHaveProperty('orderReference');
    expect(parsed.lines[1]).toMatchObject({ reason: null, orderReference: null });
    expect(resolveCheckoutLines(parsed)).toEqual([
      { unitId: body.lines[0]!.unitId, ordinal: 1, reason: { code: 'SAMPLE', note: '' }, orderReference: 'Order-a/27', reasonInherited: true, orderInherited: true },
      { unitId: parsed.lines[1]!.unitId, ordinal: 2, reason: null, orderReference: null, reasonInherited: false, orderInherited: false },
    ]);
    expect(checkoutSchema.safeParse({ ...body, orderReference: 'Order-a/27' }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...draft(), orderReference: 'Order-a/27' }).success).toBe(true);
  });

  it('requires meaningful Other explanation and rejects unknown reasons', () => {
    for (const note of ['', 'short', '123456789012', '          '])
      expect(checkoutSchema.safeParse({ ...draft(), reason: { code: 'OTHER', note } }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...draft(), reason: { code: 'OTHER', note: 'Display sample for shop' } }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...draft(), reason: { code: 'SALE' } }).success).toBe(false);
  });

  it('rejects duplicate UUIDs after normalization and forbids quantity, actor or origin injection', () => {
    const unitId = randomUUID();
    expect(checkoutSchema.safeParse({ ...draft(), lines: [{ unitId }, { unitId: unitId.toUpperCase() }] }).success).toBe(false);
    expect(checkoutSelectionSchema.safeParse({ unitIds: [unitId, unitId.toUpperCase()] }).success).toBe(false);
    for (const extra of [{ actorId: randomUUID() }, { originId: randomUUID() }, { acceptedAt: new Date().toISOString() }])
      expect(checkoutSchema.safeParse({ ...draft(), ...extra }).success).toBe(false);
    for (const extra of [{ quantity: 2 }, { state: 'U' }, { skuId: randomUUID() }, { unitCode: 'A7K2M9' }])
      expect(checkoutSchema.safeParse({ ...draft(), lines: [{ unitId, ...extra }] }).success).toBe(false);
  });

  it('bounds whole confirmations without silently truncating units or UTF-8 notes', () => {
    expect(checkoutSchema.safeParse({ ...draft(), lines: [] }).success).toBe(false);
    const lines = Array.from({ length: checkoutLimit }, () => ({ unitId: randomUUID() }));
    expect(checkoutSchema.parse({ ...draft(), lines }).lines).toHaveLength(checkoutLimit);
    expect(checkoutSchema.safeParse({ ...draft(), lines: [...lines, { unitId: randomUUID() }] }).success).toBe(false);
    const notes = Array.from({ length: 20 }, () => ({ unitId: randomUUID(), reason: { code: 'OTHER', note: '物'.repeat(1000) } }));
    expect(checkoutSchema.safeParse({ ...draft(), lines: notes }).success).toBe(false);
  });

  it('bounds history queries and disallows caller-supplied access scopes', () => {
    expect(checkoutHistoryQuerySchema.parse({})).toEqual({ page: 1 });
    expect(checkoutHistoryQuerySchema.parse({ page: '2', orderReference: ' Mixed-CASE ' })).toEqual({ page: 2, orderReference: 'Mixed-CASE' });
    for (const input of [{ page: 0 }, { page: 1_000_001 }, { actorId: randomUUID() }, { originId: randomUUID() }, { includeAll: true }])
      expect(checkoutHistoryQuerySchema.safeParse(input).success).toBe(false);
  });

  it('preserves unfinished drafts without accepting them as stock-changing commands', () => {
    const empty = { reason: { code: 'OTHER', note: 'In progress' }, orderReference: 'Order ', lines: [] };
    expect(checkoutDraftSchema.parse(empty)).toEqual(empty);
    expect(checkoutSchema.safeParse(empty).success).toBe(false);
    const unfinished = { ...draft(), reason: { code: 'OTHER', note: '' } };
    expect(checkoutDraftSchema.parse(unfinished)).toEqual(unfinished);
    expect(checkoutSchema.safeParse(unfinished).success).toBe(false);
  });
});
