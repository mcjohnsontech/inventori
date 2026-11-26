import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import request from 'supertest';
import { FinancialService } from '../../apps/api/src/financial.service.js';
import { ReceivingService } from '../../apps/api/src/receiving.service.js';
import { CatalogueService } from '../../apps/api/src/catalogue.service.js';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { shopToken } from './shop-fixture.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Isolated local *_test database required');
describe('financial evidence and ledger valuation',()=>{
 const originId=randomUUID();let db:ReturnType<typeof database>,app:Awaited<ReturnType<typeof createApp>>,admin:string,manager:string,production:string,sourceId:string,skuId:string,productId:string,variantId:string,receipt:any,priceId:string;
 const send=(path:string,body:object,key=randomUUID(),token=admin)=>request(app.getHttpServer()).post('/v1/'+path).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
 const get=(path='financial/report',token=admin)=>request(app.getHttpServer()).get('/v1/'+path).set('Authorization',`Bearer ${token}`);
 const intake=(cost:unknown,usable=3,damaged=1)=>({sourceId,deliveredOn:'2020-01-01',lines:[{skuId,usableQuantity:usable,damagedQuantity:damaged,damageReason:'Damaged cover during transit',...(cost===undefined?{}:{purchaseCost:cost})}]});
 beforeAll(async()=>{db=database(url);await db.originNode.create({data:{id:originId,mode:'SHOP'}});app=await createApp(db,originId,'SHOP');admin=await shopToken(db,app,originId);manager=await shopToken(db,app,originId,'MANAGER');production=await shopToken(db,app,originId,'PRODUCTION');const registry=await db.locationRegistry.findFirstOrThrow();const vendor=(await send('receiving/supplier-setups',{supplier:{name:`Finance ${randomUUID()}`},location:{registryId:registry.id}},randomUUID(),manager).expect(201)).body;sourceId=vendor.source.id;const product=(await send('receiving/product-setups',{sourceId,product:{name:`Valued ${randomUUID()}`,description:''},variants:[]},randomUUID(),manager).expect(201)).body;skuId=product.skus[0].id;productId=product.product.id;variantId=product.skus[0].variantId;});
 afterAll(async()=>{await app?.close();await db?.$disconnect();});
 it('exposes receiving price actions according to the existing Admin-only write capability',async()=>{
  expect((await get('receiving/options',admin).expect(200)).body.canSetSellingPrice).toBe(true);
  expect((await get('receiving/options',manager).expect(200)).body.canSetSellingPrice).toBe(false);
  await get('receiving/options',production).expect(403);
 });
 it('stores receipt-line cost atomically and replays without duplicating serialized stock',async()=>{const key=randomUUID(),body=intake({amount:'10.10',currency:'NGN'});const [a,b]=await Promise.all([send('receipts',body,key).expect(201),send('receipts',body,key).expect(201)]);expect(a.body).toEqual(b.body);receipt=a.body;expect(receipt.lines[0].purchaseCost.amount).toBe('10.10');expect(await db.stockUnit.count({where:{lotId:receipt.lines[0].lotId}})).toBe(4);expect((await get(`receipts/${receipt.id}`)).body.lines[0].purchaseCost.amount).toBe('10.10');});
 it('requires explicit zero evidence, keeps unknown costs unknown and preserves prior receipts',async()=>{await send('receipts',intake({amount:'0',currency:'NGN'})).expect(400);await send('receipts',intake({amount:5,currency:'NGN'})).expect(400);await send('receipts',intake({amount:'2',currency:'USD'})).expect(400);await send('receipts',intake({amount:'0.00',currency:'NGN',zeroReason:'Genuine supplier donation'},2,0),randomUUID(),admin).expect(201);await send('receipts',intake(undefined,5,2)).expect(201);await send('receipts',intake({amount:'12.00',currency:'NGN'},1,0)).expect(201);expect((await get(`receipts/${receipt.id}`)).body.lines[0].purchaseCost.amount).toBe('10.10');const totals=(await get().expect(200)).body.summary;expect(totals).toMatchObject({usableUnits:'11',damagedUnits:'3',knownCostUnits:'6',unknownCostUnits:'5',usableCostValue:'42.30',damagedCostExposure:'10.10',unknownDamagedCostUnits:'2'});});
 it('enforces Admin-only price writes, optimistic concurrency and complete price history',async()=>{const body={variantId,amount:'20.20',currency:'NGN',reason:'Initial approved selling price',previousPriceId:null,confirmed:true},key=randomUUID();await send('financial/selling-prices',body,key,manager).expect(403);await send('financial/selling-prices',body,key,production).expect(403);const [a,b]=await Promise.all([send('financial/selling-prices',body,key).expect(201),send('financial/selling-prices',body,key).expect(201)]);expect(a.body).toEqual(b.body);priceId=a.body.id;await send('financial/selling-prices',{...body,amount:'21'},key).expect(409);const competing=await Promise.all([send('financial/selling-prices',{...body,amount:'25.00',previousPriceId:priceId}),send('financial/selling-prices',{...body,amount:'30.00',previousPriceId:priceId})]);expect(competing.map(r=>r.status).sort()).toEqual([201,409]);const report=(await get().expect(200)).body;expect(report.priceHistory).toHaveLength(2);expect(report.priceHistory[1].amount).toBe('20.20');expect(report.summary.profitCoveredUnits).toBe('6');expect(report.summary.knownCostUnits).toBe('6');});
 it('reconciles lot quantities with operational balances without double-counting units',async()=>{const finance=(await get().expect(200)).body,stock=(await get('stock').expect(200)).body;for(const lot of finance.lots){const operational=stock.lots.find((r:any)=>r.lotId===lot.lotId);expect(lot.usable).toBe(operational.usable);expect(lot.damaged).toBe(operational.damaged);}expect(finance.summary.usableUnits).toBe('11');expect(finance.purchaseHistory.map((r:any)=>r.unitCost)).toContain(null);expect(finance.purchaseHistory.map((r:any)=>r.unitCost)).toContain('0.00');});
 it('excludes exact issued units from availability and preserves damaged exposure',async()=>{const unit=await db.stockUnit.findFirstOrThrow({where:{lotId:receipt.lines[0].lotId,initialState:'U'}});const result=await send('checkouts',{reason:{code:'PRODUCTION_USE',note:''},orderReference:null,lines:[{unitId:unit.id}]},randomUUID(),production);expect(result.status,result.text).toBe(201);const report=(await get().expect(200)).body;expect(report.summary.usableUnits).toBe('10');expect(report.summary.usableCostValue).toBe('32.20');expect(report.summary.damagedCostExposure).toBe('10.10');});

 it('values issued damage and held stock once, excluding disposals and completed production',async()=>{
  const [issued]=await db.$queryRaw<{id:string}[]>`SELECT u.id FROM "StockUnit" u JOIN "UnitState" s ON s."unitId"=u.id WHERE u."lotId"=${receipt.lines[0].lotId}::uuid AND s.state='P'`;
  await send('damage-reports',{unitIds:[issued!.id],cause:'Production damage',description:'Cover damaged during production handling'},randomUUID(),production).expect(201);
  let value=(await get().expect(200)).body.summary;expect(value.usableCostValue).toBe('32.20');expect(value.damagedCostExposure).toBe('20.20');
  await send('damage-reviews',{unitIds:[issued!.id],outcome:'HELD',note:'Holding damaged item for review'},randomUUID(),manager).expect(201);
  expect((await get().expect(200)).body.summary.damagedCostExposure).toBe('20.20');
  await send('damage-reviews',{unitIds:[issued!.id],outcome:'DISCARDED',note:'Damaged item discarded after review'},randomUUID(),manager).expect(201);
  expect((await get().expect(200)).body.summary.damagedCostExposure).toBe('10.10');
  const [usable]=await db.$queryRaw<{id:string}[]>`SELECT u.id FROM "StockUnit" u JOIN "UnitState" s ON s."unitId"=u.id WHERE u."lotId"=${receipt.lines[0].lotId}::uuid AND s.state='U' LIMIT 1`;
  await send('checkouts',{reason:{code:'PRODUCTION_USE',note:''},orderReference:null,lines:[{unitId:usable!.id}]},randomUUID(),production).expect(201);
  const before=(await get().expect(200)).body.summary;
  await send('completions',{unitIds:[usable!.id]},randomUUID(),manager).expect(201);
  expect((await get().expect(200)).body.summary).toEqual(before);expect(before.usableCostValue).toBe('22.10');
 });
 it('filters true dated evidence, preserves historical values and denies foreign/Production reads',async()=>{const old=(await get('financial/report?from=2020-01-01&to=2020-01-01').expect(200)).body;expect(old.lots).toHaveLength(0);expect(old.priceHistory).toHaveLength(0);expect(old.purchaseHistory).toHaveLength(0);await get('financial/report',production).expect(403);await get(`financial/report?productId=${randomUUID()}`).expect(200).then(r=>expect(r.body.lots).toHaveLength(0));await get('financial/report?from=2026-02-31').expect(400);await get('financial/report?to=2999-01-01').expect(400);const foreign=randomUUID();await db.originNode.create({data:{id:foreign,mode:'SHOP'}});const foreignApp=await createApp(db,foreign,'SHOP');try{const token=await shopToken(db,foreignApp,foreign);await request(foreignApp.getHttpServer()).get(`/v1/financial/report?productId=${productId}`).set('Authorization',`Bearer ${token}`).expect(200).then(r=>expect(r.body.lots).toHaveLength(0));await request(foreignApp.getHttpServer()).post('/v1/financial/selling-prices').set('Authorization',`Bearer ${token}`).set('Idempotency-Key',randomUUID()).send({variantId,amount:'1',currency:'NGN',reason:'Foreign variant price attempt',previousPriceId:null,confirmed:true}).expect(400);}finally{await foreignApp.close();}});
 it('database guards reject cost/price history edits and historical cost enrollment',async()=>{await expect(db.$executeRaw`UPDATE "PurchaseCost" SET amount=0 WHERE "receiptLineId"=${receipt.lines[0].id}::uuid`).rejects.toThrow();await expect(db.$executeRaw`DELETE FROM "SellingPrice" WHERE id=${priceId}::uuid`).rejects.toThrow();const [line]=await db.$queryRaw<any[]>`SELECT rl.id,t."originId",t."commandId",t."actorId",t."recordedAt" FROM "ReceiptLine" rl JOIN "Receipt" r ON r.id=rl."receiptId" JOIN "StockTransaction" t ON t.id=r."transactionId" LEFT JOIN "PurchaseCost" c ON c."receiptLineId"=rl.id WHERE t."originId"=${originId}::uuid AND c."receiptLineId" IS NULL LIMIT 1`;await expect(db.$executeRaw`INSERT INTO "PurchaseCost" ("receiptLineId","originId",amount,currency,"zeroReason","commandId","actorId","recordedAt") VALUES (${line.id}::uuid,${originId}::uuid,1,'NGN','',${line.commandId}::uuid,${line.actorId}::uuid,${line.recordedAt})`).rejects.toThrow();});
 it('rolls back price evidence and receipt costs when audit or outbox persistence fails',async()=>{
  const actor=await new CatalogueService(db,originId,'SHOP').actor(admin);
  async function counts(){return {costs:await db.purchaseCost.count({where:{originId}}),prices:await db.sellingPrice.count({where:{originId}}),units:await db.stockUnit.count({where:{originId}}),lots:await db.stockLot.count({where:{originId}}),commands:await db.commandResult.count({where:{originId}}),audit:await db.auditEvent.count({where:{originId}}),outbox:await db.outboxEvent.count({where:{originId}}),sequence:(await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence.toString()};}
  const last=await db.sellingPrice.findFirstOrThrow({where:{originId,variantId},orderBy:{originSequence:'desc'}});
  for(const target of ['AuditEvent','OutboxEvent']){
   const faulty=db.$extends({query:{$allModels:{async create({model,args,query}){if(model===target)throw new Error('Injected financial evidence failure');return query(args);}}}});
   const before=await counts();
   await expect(new FinancialService(faulty as any,originId,'SHOP').setPrice(actor,randomUUID(),{variantId,amount:'40.00',currency:'NGN',reason:'Rollback pricing evidence check',previousPriceId:last.id,confirmed:true})).rejects.toThrow('Injected financial evidence failure');expect(await counts()).toEqual(before);
   await expect(new ReceivingService(faulty as any,originId,'SHOP').create(actor,randomUUID(),intake({amount:'44.44',currency:'NGN'}))).rejects.toThrow('Injected financial evidence failure');expect(await counts()).toEqual(before);
  }
 });

 // Owner decision 26 Nov 2026: money is Admin-only. Managers receive stock but enter and see no costs or prices.
 it('keeps purchase costs, prices and valuation Admin-only while Managers still receive stock',async()=>{
  await send('receipts',intake({amount:'9.00',currency:'NGN'}),randomUUID(),manager).expect(403);
  const plain=await send('receipts',intake(undefined,1,0),randomUUID(),manager).expect(201);
  expect(plain.body.lines[0]).not.toHaveProperty('purchaseCost');
  const managerView=(await get(`receipts/${receipt.id}`,manager).expect(200)).body;
  expect(managerView.lines[0]).not.toHaveProperty('purchaseCost');
  expect(JSON.stringify(managerView)).not.toContain('10.10');
  expect((await get(`receipts/${receipt.id}`).expect(200)).body.lines[0].purchaseCost.amount).toBe('10.10');
  await get('financial/report',manager).expect(403);
  await get('financial/report',production).expect(403);
 });

 // Owner decision 26 Nov 2026: an Admin adds the cost afterwards for a delivery a Manager received.
 it('lets only an Admin add a missing delivery cost once, idempotently, and values it from then on',async()=>{
  const plain=await send('receipts',intake(undefined,2,0),randomUUID(),manager).expect(201),lineId=plain.body.lines[0].id;
  await get('financial/missing-costs',manager).expect(403);await get('financial/missing-costs',production).expect(403);
  const missing=(await get('financial/missing-costs').expect(200)).body;expect(missing.pageSize).toBe(10);
  const row=missing.rows.find((r:any)=>r.receiptLineId===lineId);expect(row).toMatchObject({receivedQuantity:'2'});expect(row.lastCost).not.toBeNull();
  const body={receiptLineId:lineId,amount:'11.50',currency:'NGN'};
  await send('financial/purchase-costs',body,randomUUID(),manager).expect(403);
  await send('financial/purchase-costs',{...body,amount:'0'}).expect(400);
  await send('financial/purchase-costs',{...body,receiptLineId:randomUUID()}).expect(404);
  const key=randomUUID(),[a,b]=await Promise.all([send('financial/purchase-costs',body,key),send('financial/purchase-costs',body,key)]);
  expect([a.status,b.status]).toEqual([201,201]);expect(a.body).toEqual(b.body);expect(a.body).toMatchObject({receiptLineId:lineId,amount:'11.50'});
  await send('financial/purchase-costs',{...body,amount:'12.00'}).expect(409);
  expect(await db.outboxEvent.count({where:{eventType:'financial.purchase-cost',aggregateId:lineId}})).toBe(1);
  expect(await db.auditEvent.count({where:{action:'financial.purchase-cost',subjectId:lineId}})).toBe(1);
  expect((await get('financial/missing-costs').expect(200)).body.rows.some((r:any)=>r.receiptLineId===lineId)).toBe(false);
  const lot=(await get(`financial/report?lotId=${plain.body.lines[0].lotId}`).expect(200)).body.lots[0];expect(lot).toMatchObject({unitCost:'11.50',costEnteredLater:true});
  // The database itself refuses a later cost from a non-Admin, even bypassing the API.
  const managerUser=await db.user.findFirstOrThrow({where:{role:'MANAGER',membership:{originId}}});
  const other=(await send('receipts',intake(undefined,1,0),randomUUID(),manager).expect(201)).body.lines[0].id;
  await expect(db.$transaction(async tx=>{const id=randomUUID();await tx.$executeRaw`INSERT INTO "PurchaseCost" ("receiptLineId","originId",amount,currency,"zeroReason","commandId","actorId","recordedAt","enteredLater","originSequence") VALUES (${other}::uuid,${originId}::uuid,1,'NGN','',${id}::uuid,${managerUser.id}::uuid,clock_timestamp(),true,1)`;})).rejects.toThrow(/Only a shop Admin/);
 });
 // Owner decisions 26 Nov 2026: one price per product; a variant's own price stays until an Admin removes it.
 it('prices products once, keeps variant overrides through product changes and falls back after removal',async()=>{
  await get(`financial/products/${productId}/prices`,manager).expect(403);
  const first={productId,amount:'15.00',currency:'NGN',reason:'Standard product selling price',previousPriceId:null,confirmed:true};
  await send('financial/product-prices',first,randomUUID(),manager).expect(403);
  const p1=(await send('financial/product-prices',first).expect(201)).body;
  await send('financial/product-prices',{...first,amount:'17.00'}).expect(409);
  let prices=(await get(`financial/products/${productId}/prices`).expect(200)).body;
  const own=prices.variants.find((v:any)=>v.variantId===variantId);expect(own.ownPrice).not.toBeNull();expect(own.effectivePrice).toBe(own.ownPrice);expect(prices.productPrice.amount).toBe('15.00');
  await send('financial/product-prices',{...first,amount:'16.00',previousPriceId:p1.id}).expect(201);
  prices=(await get(`financial/products/${productId}/prices`).expect(200)).body;
  expect(prices.variants.find((v:any)=>v.variantId===variantId).ownPrice).toBe(own.ownPrice);
  const removal={variantId,amount:null,currency:'NGN',reason:'Follow the product price again',previousPriceId:own.latestRowId,confirmed:true};
  await send('financial/selling-prices',removal,randomUUID(),manager).expect(403);
  const removed=(await send('financial/selling-prices',removal).expect(201)).body;expect(removed.amount).toBeNull();
  prices=(await get(`financial/products/${productId}/prices`).expect(200)).body;
  expect(prices.variants.find((v:any)=>v.variantId===variantId)).toMatchObject({ownPrice:null,effectivePrice:'16.00'});
  await send('financial/selling-prices',{...removal,previousPriceId:removed.id}).expect(400);
  const report=(await get(`financial/report?productId=${productId}`).expect(200)).body;
  expect(report.lots.every((l:any)=>l.sellingPrice==='16.00'&&l.priceSource==='PRODUCT')).toBe(true);
  expect(report.priceHistory.filter((h:any)=>h.scope==='PRODUCT').map((h:any)=>h.amount)).toEqual(['16.00','15.00']);
  expect(report.priceHistory.find((h:any)=>h.id===removed.id)).toMatchObject({scope:'VARIANT',amount:null});
 });
});
