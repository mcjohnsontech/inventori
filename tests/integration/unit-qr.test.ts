import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,expect,it } from 'vitest';
import request from 'supertest';
import { encodeQr,encodeUnitQr } from '@dayari/contracts';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { ReceivingService } from '../../apps/api/src/receiving.service.js';
import { shopToken } from './shop-fixture.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Isolated local test database required');
const db=database(url),originId=randomUUID();
let app:Awaited<ReturnType<typeof createApp>>,other:Awaited<ReturnType<typeof createApp>>,admin:string,manager:string,production:string,otherToken:string,receipt:any,units:any[],foreignUnit:any,foreignOrigin:string;
const get=(path:string,token=admin)=>request(app.getHttpServer()).get('/v1/'+path).set('Authorization','Bearer '+token);
const post=(path:string,body:object,token=admin)=>request(app.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+token).set('Idempotency-Key',randomUUID()).send(body);
beforeAll(async()=>{
 await db.originNode.create({data:{id:originId,mode:'SHOP'}});app=await createApp(db,originId,'SHOP');
 admin=await shopToken(db,app,originId);manager=await shopToken(db,app,originId,'MANAGER');production=await shopToken(db,app,originId,'PRODUCTION');
 const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});
 const source=(await post('catalogue/supplier-setups',{supplier:{name:'Unit lookup '+originId},location:{registryId:registry.id}}).expect(201)).body.source;
 const product=(await post('catalogue/product-setups',{sourceId:source.id,product:{name:'Unit lookup notebook'},variants:[]}).expect(201)).body;
 receipt=(await post('receipts',{sourceId:source.id,deliveredOn:'2020-01-01',lines:[{skuId:product.skus[0].id,usableQuantity:2,damagedQuantity:1,damageReason:'Synthetic damaged cover'}]}).expect(201)).body;
 units=await db.stockUnit.findMany({where:{lotId:receipt.lines[0].lotId},orderBy:{initialState:'asc'}});
 foreignOrigin=randomUUID();await db.originNode.create({data:{id:foreignOrigin,mode:'SHOP'}});other=await createApp(db,foreignOrigin,'SHOP');otherToken=await shopToken(db,other,foreignOrigin);
 const createOther=(path:string,body:object)=>request(other.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+otherToken).set('Idempotency-Key',randomUUID()).send(body);
 const source2=(await createOther('catalogue/supplier-setups',{supplier:{name:'Other shop'},location:{registryId:registry.id}}).expect(201)).body.source;
 const product2=(await createOther('catalogue/product-setups',{sourceId:source2.id,product:{name:'Other shop item'},variants:[]}).expect(201)).body;
 const actor=await db.user.findFirstOrThrow({where:{membership:{originId:foreignOrigin},role:'ADMIN'}});
 const saved=await new ReceivingService(db,foreignOrigin,'SHOP',()=>units[0].unitCode).create(actor,randomUUID(),{sourceId:source2.id,deliveredOn:'2020-01-01',lines:[{skuId:product2.skus[0].id,usableQuantity:1,damagedQuantity:0}]}) as any;
 foreignUnit=await db.stockUnit.findFirstOrThrow({where:{lotId:saved.lines[0].lotId}});
});
afterAll(async()=>{await app?.close();await other?.close();await db.$disconnect();});
it('resolves exact saved unit code and QR with role-specific allowlists and no write effects',async()=>{
 const tables=['DeliveryBatch','Receipt','ReceiptLine','StockLot','StockTransaction','StockMovement','StockBalance','StockUnit','UnitEvent','UnitState','UnitCommandManifestPage','AuditEvent','OutboxEvent','CommandResult'];
 const snapshot=async()=>{
  const result:Record<string,string>={};
  for(const table of tables){
   const scope=table==='StockBalance'?`t."lotId" IN (SELECT id FROM "StockLot" WHERE "originId"=$1::uuid)`:['Receipt','ReceiptLine','StockMovement'].includes(table)?`t."batchId" IN (SELECT id FROM "DeliveryBatch" WHERE "originId"=$1::uuid)`:`t."originId"=$1::uuid`;
   const [row]=await db.$queryRawUnsafe<{value:string}[]>(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''),'UTF8')),'hex') AS value FROM "${table}" t WHERE ${scope}`,originId);
   result[table]=row!.value;
  }
  return result;
 };
 const before=await snapshot(),sequence=(await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence;
 for(const unit of units)for(const token of [admin,manager,production]){
  const byCode=(await get('inventory/units/by-code/'+unit.unitCode.toLowerCase(),token).expect(200)).body;
  const scanned=(await post('qr/resolve',{payload:encodeUnitQr(originId,unit.id)},token).expect(200)).body;
  expect(scanned).toMatchObject({payloadVersion:2,unitId:unit.id,unitCode:unit.unitCode,lotId:unit.lotId,fullSku:receipt.lines[0].fullCode,productId:receipt.lines[0].productId,publicBatchCode:receipt.batch.publicCode});
  expect(byCode.unitId).toBe(unit.id);expect(scanned.availability).toBe(unit.initialState==='U'?'USABLE':'UNAVAILABLE');
  if(token===production){expect(Object.keys(scanned).sort()).toEqual(['payloadVersion','originId','unitId','unitCode','lotId','lotCode','productId','productCode','productName','variantId','variantName','skuId','fullSku','batchId','publicBatchCode','availability','dataAsOf'].sort());expect(JSON.stringify(scanned)).not.toMatch(/invoice|supplierName|sourceName|damaged|actorId|password|audit/i);}
  else expect(scanned).toMatchObject({state:unit.initialState,condition:unit.initialState==='U'?'USABLE':'DAMAGED'});
 }
 expect((await post('qr/resolve',{payload:encodeQr(originId,receipt.lines[0].lotId)},production).expect(200)).body.payloadVersion).toBe(1);
 expect(await snapshot()).toEqual(before);expect((await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence).toBe(sequence);
});
it('rejects malformed, unknown, foreign and unsupported identities and preserves origin-scoped code collisions',async()=>{
 await request(app.getHttpServer()).get('/v1/inventory/units/by-code/'+units[0].unitCode).expect(401);
 await get('inventory/units/by-code/AB0CD1').expect(400);await get('units/'+randomUUID()).expect(404);
 await get(`inventory/units/by-code/${units[0].unitCode}?originId=${foreignOrigin}`).expect(404);
 await get('units/'+foreignUnit.id).expect(404);await post('qr/resolve',{payload:encodeUnitQr(foreignOrigin,foreignUnit.id)}).expect(404);
 await post('qr/resolve',{payload:encodeUnitQr(originId,randomUUID())}).expect(404);
 await post('qr/resolve',{payload:encodeUnitQr(originId,units[0].id).replace('DYI:2:','DYI:3:')}).expect(422);
 await post('qr/resolve',{payload:encodeUnitQr(originId,units[0].id)+' '}).expect(400);
 const otherResult=await request(other.getHttpServer()).get('/v1/inventory/units/by-code/'+units[0].unitCode).set('Authorization','Bearer '+otherToken).expect(200);
 expect(otherResult.body.unitId).toBe(foreignUnit.id);expect(foreignUnit.unitCode).toBe(units[0].unitCode);expect(foreignUnit.id).not.toBe(units[0].id);
});
