import { expect, it } from 'vitest';
import { reportQuerySchema, orderInvestigationSchema } from '@dayari/contracts';
it('validates exact dates and bounded read periods without a closing policy', () => { expect(reportQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(true); for (const value of [{ from: '2026-02-30', to: '2026-03-01' }, { from: '2026-12-31', to: '2026-01-01' }, { from: '2025-01-01', to: '2026-12-31' }])
    expect(reportQuerySchema.safeParse(value).success).toBe(false); });
it('Order IDs are trimmed, case-preserved, nonempty and not unique transaction identifiers', () => { expect(orderInvestigationSchema.parse({ orderReference: '  Reusable-A  ' }).orderReference).toBe('Reusable-A'); expect(orderInvestigationSchema.safeParse({ orderReference: ' ' }).success).toBe(false); });
