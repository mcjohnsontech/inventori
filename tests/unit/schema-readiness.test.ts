import {expect,it,vi} from 'vitest';
import type {PrismaClient} from '@prisma/client';
import {assertAccountSchema} from '../../apps/api/src/schema-readiness.js';
it('fails closed when account schema is missing without executing a migration',async()=>{
 const query=vi.fn().mockResolvedValue([{ready:false}]);const db={$queryRaw:query} as unknown as PrismaClient;
 await expect(assertAccountSchema(db)).rejects.toThrow('No migration or account enrollment was performed');expect(query).toHaveBeenCalledOnce();
 query.mockResolvedValue([{ready:true}]);await expect(assertAccountSchema(db)).resolves.toBeUndefined();
});
