import {expect,it} from 'vitest';
import {availabilityQuery} from '@dayari/contracts';
it('bounds usable discovery and rejects authority/private-state filters',()=>{
 expect(availabilityQuery.parse({q:'  green  ',page:'2'})).toEqual({q:'green',page:2});
 for(const input of [{originId:'foreign'},{damaged:true},{invoice:'private'},{page:'0'},{page:'1.5'},{page:'100001'},{q:'x'.repeat(161)},{lotId:'not-uuid'}])expect(availabilityQuery.safeParse(input).success).toBe(false);
});
