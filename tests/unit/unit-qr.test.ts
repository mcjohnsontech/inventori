import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { decodeInventoryQr,decodeQr,encodeQr,encodeUnitQr,QrError,unitLabelJobSchema } from '@dayari/contracts';
it('preserves DYI:1 and resolves exact origin-qualified DYI:2 UUIDs without encoding the short code',()=>{
 const origin=randomUUID(),id=randomUUID();const legacy=encodeQr(origin,id),unit=encodeUnitQr(origin,id);
 expect(legacy).toHaveLength(71);expect(unit).toHaveLength(71);
 expect(decodeQr(legacy)).toEqual({originId:origin,lotId:id});
 expect(decodeInventoryQr(legacy)).toEqual({version:1,originId:origin,lotId:id});
 expect(decodeInventoryQr(unit)).toEqual({version:2,originId:origin,unitId:id});
 expect(()=>decodeInventoryQr(unit.toLowerCase())).toThrow(QrError);
 expect(()=>decodeInventoryQr(unit+' ')).toThrow('INVALID_QR');
 expect(()=>decodeInventoryQr(unit.replace('DYI:2:','DYI:3:'))).toThrow('UNSUPPORTED_QR_VERSION');
});
it('requires explicit distinct saved unit identities and bounded reasoned reprint membership',()=>{
 const id=randomUUID();expect(unitLabelJobSchema.safeParse({kind:'INITIAL',unitIds:[id,id],profileId:'unit-a4-70x35-v2'}).success).toBe(false);
 expect(unitLabelJobSchema.safeParse({kind:'INITIAL',unitIds:Array.from({length:501},()=>randomUUID()),profileId:'unit-a4-70x35-v2'}).success).toBe(false);
 expect(unitLabelJobSchema.safeParse({kind:'INITIAL',unitIds:[id],profileId:'unit-a4-70x35-v2',copies:2}).success).toBe(false);
 expect(unitLabelJobSchema.safeParse({kind:'REPRINT',originalJobId:id,lineIds:[randomUUID()],reason:'Spoiled label during alignment trial'}).success).toBe(true);
});
