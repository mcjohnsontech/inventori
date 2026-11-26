import { describe, expect, it } from 'vitest';
import { authorizationDecisionSchema, can, decisionOutcomeLabels } from '@dayari/contracts';

const unit = '11111111-1111-4111-8111-111111111111';
describe('Admin decision input (owner decisions 24 Nov 2026)', () => {
  it('accepts the three outcomes with a meaningful note and defaults to no items', () => {
    for (const outcome of ['APPROVED', 'REJECTED', 'RECEIVE_AS_DELIVERY'] as const)
      expect(authorizationDecisionSchema.parse({ outcome, note: 'Checked on the shelf today' })).toEqual({ outcome, note: 'Checked on the shelf today', unitIds: [] });
  });
  it('rejects short or meaningless notes, unknown outcomes, duplicates and extra fields', () => {
    expect(authorizationDecisionSchema.safeParse({ outcome: 'APPROVED', note: 'ok' }).success).toBe(false);
    expect(authorizationDecisionSchema.safeParse({ outcome: 'APPROVED', note: '1234567890123' }).success).toBe(false);
    expect(authorizationDecisionSchema.safeParse({ outcome: 'MAYBE', note: 'Checked on the shelf today' }).success).toBe(false);
    expect(authorizationDecisionSchema.safeParse({ outcome: 'APPROVED', note: 'Checked on the shelf today', unitIds: [unit, unit] }).success).toBe(false);
    expect(authorizationDecisionSchema.safeParse({ outcome: 'APPROVED', note: 'Checked on the shelf today', force: true }).success).toBe(false);
  });
  it('has a plain label for every outcome', () => {
    expect(decisionOutcomeLabels).toEqual({ APPROVED: 'Approved', REJECTED: 'Rejected', RECEIVE_AS_DELIVERY: 'Receive extra items as a new delivery' });
  });
  it('Admin and Manager may submit requests and review damage; Production may not', () => {
    for (const role of ['ADMIN', 'MANAGER', 'PRODUCTION'] as const) {
      expect(can(role, 'REQUEST_STOCK_AUTHORIZATION')).toBe(role !== 'PRODUCTION');
      expect(can(role, 'REVIEW_DAMAGE')).toBe(role !== 'PRODUCTION');
    }
  });
  it('money is Admin-only: only Admins read financial data, set selling prices or enter purchase costs (owner decision 26 Nov 2026)', () => {
    for (const role of ['ADMIN', 'MANAGER', 'PRODUCTION'] as const)
      for (const capability of ['FINANCIAL_READ', 'SELLING_PRICE_WRITE', 'PURCHASE_COST_WRITE'] as const)
        expect(can(role, capability)).toBe(role === 'ADMIN');
    expect(can('MANAGER', 'RECEIVE')).toBe(true);
  });
});
