import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect} from 'vitest';
import request from 'supertest';
import {database} from '../../apps/api/src/database.js';
import {createApp} from '../../apps/api/src/app.js';
import {shopToken} from './shop-fixture.js';
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Isolated test database required');
const db=database(url),originId=randomUUID(),foreign=randomUUID();let app:Awaited<ReturnType<typeof createApp>>,other:typeof app,admin:string,production:string,receipt:any,product:any;
const post=(path:string,data:object)=>request(app.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+admin).set('Idempotency-Key',randomUUID()).send(data);
const get=(query='',token=production)=>request(app.getHttpServer()).get('/v1/availability'+query).set('Authorization','Bearer '+token);
beforeAll(async()=>{
 for(const id of [originId,foreign])await db.originNode.create({data:{id,mode:'SHOP'}});app=await createApp(db,originId,'SHOP');other=await createApp(db,foreign,'SHOP');admin=await shopToken(db,app,originId);production=await shopToken(db,app,originId,'PRODUCTION');
 const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});
 const source=(await post('catalogue/supplier-setups',{supplier:{name:`Availability ${originId}`},location:{registryId:registry.id}}).expect(201)).body.source;
 product=(await post('catalogue/product-setups',{sourceId:source.id,product:{name:'Production availability notebook'},variants:[{name:'Green',suffix:'GRN',attributes:[{attribute:'Colour',value:'Green'}]},{name:'Tan',suffix:'TAN',attributes:[{attribute:'Colour',value:'Tan'}]}]}).expect(201)).body;
 receipt=(await post('receipts',{sourceId:source.id,deliveredOn:'2020-01-01',invoiceReference:'PRIVATE-INVOICE',lines:[{skuId:product.skus[0].id,usableQuantity:8,damagedQuantity:2,damageReason:'Private intake damage explanation'},{skuId:product.skus[1].id,usableQuantity:0,damagedQuantity:3,damageReason:'Private damaged-only arrivals'}]}).expect(201)).body;
});
afterAll(async()=>{await app?.close();await other?.close();await db.$disconnect();});
it('returns bounded usable-only identities without sensitive rows or fields for every role',async()=>{
 for(const token of [admin,production,await shopToken(db,app,originId,'MANAGER')]){
  const r=(await get('',token).expect(200)).body;expect(r.total).toBe(1);expect(r.pageSize).toBe(20);expect(r.lots[0].usable).toBe('8');
  expect(Object.keys(r.lots[0]).sort()).toEqual(['lotId','lotCode','productId','productCode','productName','variantId','variantName','skuId','fullSku','batchId','publicBatchCode','usable'].sort());
  expect(JSON.stringify(r)).not.toMatch(/damaged|invoice|PRIVATE|damageReason|supplier|actorId|commandId|password|print/i);
 }
});
it('preserves batch provenance, literal filters and shop isolation without inventory changes',async()=>{
 const before=await db.stockMovement.count({where:{batchId:receipt.batch.id}});
 const first=(await get('?q=Green').expect(200)).body;expect(first.lots).toHaveLength(1);
 expect((await get('?q=%25').expect(200)).body.total).toBe(0);
 expect((await get('?productId='+randomUUID()).expect(200)).body.total).toBe(0);
 await get('?originId='+foreign).expect(400);await get('?damaged=true').expect(400);await get('?page=0').expect(400);
 await request(other.getHttpServer()).get('/v1/availability').set('Authorization','Bearer '+production).expect(401);
 const foreignToken=await shopToken(db,other,foreign,'PRODUCTION');expect((await request(other.getHttpServer()).get('/v1/availability?lotId='+first.lots[0].lotId).set('Authorization','Bearer '+foreignToken).expect(200)).body.total).toBe(0);
 expect(await db.stockMovement.count({where:{batchId:receipt.batch.id}})).toBe(before);
});
it('groups the shared parent once across variants and batches with product-level pagination',async()=>{
 const sourceId=receipt.batch.sourceId ?? (await db.stockLot.findFirstOrThrow({where:{batchId:receipt.batch.id}})).sourceId;
 await post('receipts',{sourceId,deliveredOn:'2020-01-02',lines:[{skuId:product.skus[0].id,usableQuantity:2,damagedQuantity:0},{skuId:product.skus[1].id,usableQuantity:5,damagedQuantity:0}]}).expect(201);
 const grouped=(await get('?view=products').expect(200)).body;
 expect(grouped.total).toBe(1);expect(grouped.lots).toEqual([]);expect(grouped.products).toHaveLength(1);
 expect(grouped.products[0]).toMatchObject({productId:product.product.id,variantCount:2,lotCount:3});
 expect(JSON.stringify(grouped)).not.toMatch(/supplier|invoice|damaged|audit|password/i);
 expect((await get('?view=products&page=2').expect(200)).body.products).toEqual([]);
 const detail=(await get('?productId='+product.product.id).expect(200)).body;expect(detail.total).toBe(3);expect(detail.lots.map((lot:any)=>lot.usable).sort()).toEqual(['2','5','8']);
 await get('?view=invalid').expect(400);
});
