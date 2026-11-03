import { expect, it } from 'vitest';
import { identityQuerySchema, publicCodeAlphabet, publicCodeSchema } from '@dayari/contracts';
import { drawPublicCode, reservePublicCode } from '../../apps/api/src/public-code.js';
import { isolatedBackfillUrl } from '../../apps/api/src/identity-backfill.js';

it('uses the exact approved alphabet, prefix and six-character namespace',()=>{
 expect(publicCodeAlphabet).toHaveLength(31);expect(new Set(publicCodeAlphabet).size).toBe(31);expect(31**5).toBe(28629151);
 expect(drawPublicCode('PRODUCT',()=>0)).toBe('P22222');expect(drawPublicCode('LOT',()=>30)).toBe('LZZZZZ');
 for(let i=0;i<100;i++){expect(publicCodeSchema('PRODUCT').parse(drawPublicCode('PRODUCT'))).toHaveLength(6);expect(publicCodeSchema('LOT').parse(drawPublicCode('LOT'))).toHaveLength(6);}
});
it('normalizes manual case/edge whitespace without guessing ambiguous glyphs or accepting other kinds',()=>{
 expect(publicCodeSchema('PRODUCT').parse(' p7k2m9 ')).toBe('P7K2M9');
 for(const code of ['P00000','P11111','PILOOI','U7K9M2Q4','L8M4Q2','P222222','P2 222','Ｐ22222'])expect(publicCodeSchema('PRODUCT').safeParse(code).success).toBe(false);
 expect(identityQuerySchema.safeParse({originId:'not-a-uuid'}).success).toBe(false);expect(identityQuerySchema.safeParse({invoice:true}).success).toBe(false);
});
it('retries occupied candidates without accepting duplicates and stops after exactly32 attempts',async()=>{
 const seen:string[]=[];let n=0;
 expect(await reservePublicCode('PRODUCT',async c=>{seen.push(c);return c==='P33333';},()=>++n<=2?'P22222':'P33333')).toBe('P33333');expect(seen).toEqual(['P22222','P22222','P33333']);
 let attempts=0;await expect(reservePublicCode('LOT',async()=>{attempts++;return false;},()=> 'L22222')).rejects.toThrow('CODE_ALLOCATION_BUSY');expect(attempts).toBe(32);
});
it('refuses operational, remote or unspecified backfill targets',()=>{
 for(const u of [undefined,'postgresql://localhost/dayari_dev','postgresql://shop.example/dayari_test','postgresql://localhost/dayari_prod','postgresql://localhost/dayari_test?schema=public']){
  expect(()=>isolatedBackfillUrl(u)).toThrow();
 }
 expect(isolatedBackfillUrl('postgresql://localhost:54329/fixture_test').pathname).toBe('/fixture_test');
});
