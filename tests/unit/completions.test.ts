import { expect, it } from 'vitest';
import { completionSchema, can } from '@dayari/contracts';
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
it('completion manifest is explicit, distinct and canonical', () => { expect(completionSchema.parse({ unitIds: [b, a] }).unitIds).toEqual([a, b]); for (const value of [{ unitIds: [] }, { unitIds: [a, a] }, { unitIds: [a], orderReference: 'ALL' }, { unitIds: ['unknown'] }])
    expect(completionSchema.safeParse(value).success).toBe(false); });
it('only Manager confirms completion; operational roles review', () => { expect(can('MANAGER', 'COMPLETE_PRODUCTION')).toBe(true); expect(can('ADMIN', 'COMPLETE_PRODUCTION')).toBe(false); expect(can('PRODUCTION', 'COMPLETE_PRODUCTION')).toBe(false); });
