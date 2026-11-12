import {expect,it} from 'vitest';
import {closeDaySchema,closingHistorySchema,lagosDate} from '@dayari/contracts';
it('accepts real date-only business dates, never actor/origin/override input',()=>{
 expect(closeDaySchema.parse({businessDate:'2024-02-29'})).toEqual({businessDate:'2024-02-29'});
 for(const businessDate of ['2025-02-29','2026-13-01','0000-01-01','2026-01-01T00:00:00Z','1-1-1'])expect(closeDaySchema.safeParse({businessDate}).success).toBe(false);
 for(const extra of [{override:true},{actorId:'any'},{originId:'any'},{snapshot:{}}])expect(closeDaySchema.safeParse({businessDate:'2026-01-01',...extra}).success).toBe(false);
 expect(closingHistorySchema.parse({})).toEqual({page:1});expect(closingHistorySchema.safeParse({page:0}).success).toBe(false);
});
it('uses Lagos midnight independently of UTC date',()=>{
 expect(lagosDate(new Date('2026-11-11T22:59:59Z'))).toBe('2026-11-11');
 expect(lagosDate(new Date('2026-11-11T23:00:00Z'))).toBe('2026-11-12');
});
