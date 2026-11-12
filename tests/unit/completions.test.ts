import type {PrismaClient,User} from '@prisma/client';
import {CompletionsService} from '../../apps/api/src/completions.service.js';
import { expect, it } from 'vitest';
import { completionSchema, can } from '@dayari/contracts';
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
it('completion manifest is explicit, distinct and canonical', () => { expect(completionSchema.parse({ unitIds: [b, a] }).unitIds).toEqual([a, b]); for (const value of [{ unitIds: [] }, { unitIds: [a, a] }, { unitIds: [a], orderReference: 'ALL' }, { unitIds: ['unknown'] }])
    expect(completionSchema.safeParse(value).success).toBe(false); });
it('Admin and Manager confirm completion; Production is denied', () => { expect(can('MANAGER', 'COMPLETE_PRODUCTION')).toBe(true); expect(can('ADMIN', 'COMPLETE_PRODUCTION')).toBe(true); expect(can('PRODUCTION', 'COMPLETE_PRODUCTION')).toBe(false); });

it('fails closed for Admin completion before the separately authorized database upgrade',async()=>{
 let calls=0;const db={$queryRaw:async()=>[{ready:++calls%2===1}]} as unknown as PrismaClient;
 const service=new CompletionsService(db,a,'SHOP');const actor={id:b,role:'ADMIN',active:true,mustChangePassword:false} as User;
 expect(await service.configuration(actor)).toMatchObject({canConfirm:false,adminUpgradeRequired:true});
 await expect(service.create(actor,a,{unitIds:[b]})).rejects.toThrow('separately approved shop database upgrade');
});
