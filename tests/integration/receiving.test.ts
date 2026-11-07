import { receiveUnits } from '../../apps/api/src/unit-receiving.js';
import { shopToken } from './shop-fixture.js';
import { allocatePublicIdentity } from '../../apps/api/src/public-code.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { batchCode, lagosDate } from '@dayari/contracts';
import { createApp } from '../../apps/api/src/app.js';
import { database } from '../../apps/api/src/database.js';
import { passwordHash } from '../../apps/api/src/security.js';
import { ReceivingService } from '../../apps/api/src/receiving.service.js';
const url=process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local *_test database required');
describe('immutable receiving ledger (FR-01/03/12/14/17/19/23/24)', () => {
 const originId=randomUUID(); const password=randomUUID();
 let db: ReturnType<typeof database>; let app: Awaited<ReturnType<typeof createApp>>;
 let admin: string; let manager: string; let production: string; let adminId: string;
 let sourceId: string; let otherSource: string; let red: string; let brown: string; let pen: string; let otherRed: string; let productId: string;
 let accepted: any;
 const post=(path:string,body:object,key=randomUUID(),token=admin)=>request(app.getHttpServer()).post(`/v1/${path}`).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
 const read=(path:string,token=admin)=>request(app.getHttpServer()).get(`/v1/${path}`).set('Authorization',`Bearer ${token}`);
 const receipt=(lines=[{skuId:red,usableQuantity:30,damagedQuantity:2,damageReason:'Covers damaged during delivery'},{skuId:brown,usableQuantity:20,damagedQuantity:0},{skuId:pen,usableQuantity:12,damagedQuantity:1,damageReason:'Pen barrel cracked on arrival'}])=>({sourceId,deliveredOn:'2020-01-01',invoiceReference:'invoice-repeatable',lines});
 beforeAll(async()=>{
  db=database(url); await db.originNode.create({data:{id:originId,mode:'SHOP'}});
  app=await createApp(db,originId,'SHOP');
  for(const role of ['ADMIN','MANAGER','PRODUCTION'] as const){const user=await db.user.create({data:{email:`${role.toLowerCase()}-${originId}@test.local`,name:role,role,passwordHash:passwordHash(password),membership:{create:{originId}}}});if(role==='ADMIN')adminId=user.id;const res=await request(app.getHttpServer()).post('/v1/sessions').send({email:user.email,password}).expect(200);if(role==='ADMIN')admin=res.body.token;else if(role==='MANAGER')manager=res.body.token;else production=res.body.token;}
  const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});
  sourceId=(await post('catalogue/supplier-setups',{supplier:{name:`Receiving ${originId}`},location:{registryId:registry.id}}).expect(201)).body.source.id;
  otherSource=(await post('catalogue/supplier-setups',{supplier:{name:`Alternate ${originId}`},location:{registryId:registry.id}}).expect(201)).body.source.id;
  const notebook=(await post('catalogue/product-setups',{sourceId,product:{name:'A5 Maple Leatherbound Notebook'},variants:['Red','Brown'].map(name=>({name,suffix:name.toUpperCase(),attributes:[{attribute:'Colour',value:name}]}))}).expect(201)).body;
  productId=notebook.product.id;red=notebook.skus[0].id;brown=notebook.skus[1].id;
  const penProduct=(await post('catalogue/product-setups',{sourceId,product:{name:'Pen'},variants:[]}).expect(201)).body;pen=penProduct.skus[0].id;
  otherRed=(await post('catalogue/product-setups',{sourceId:otherSource,product:{id:productId},variants:[{variantId:notebook.skus[0].variantId,suffix:'RED'}]}).expect(201)).body.skus[0].id;
 });
 afterAll(async()=>{await app?.close();await db?.$disconnect();});
 it('receives 62 usable +3 damaged across products in one immutable delivery',async()=>{
  accepted=(await post('receipts',receipt(),randomUUID(),manager).expect(201)).body;
  expect(accepted.totals).toEqual({usable:'62',damaged:'3',delivered:'65'});
  expect(accepted.lines).toHaveLength(3); expect(new Set(accepted.lines.map((x:any)=>x.lotId)).size).toBe(3);
  expect(accepted.batch.publicCode).toMatch(/^B-\d{8}-\d{4,}$/);expect(accepted.batch.deliveredOn).toBe('2020-01-01');
  expect(accepted.batch.numberedOn).toBe(lagosDate(new Date(accepted.batch.acceptedAt)));
  expect((await read(`receipts/${accepted.id}`,manager).expect(200)).body).toEqual(accepted);
  const movements=await db.stockMovement.findMany({where:{batchId:accepted.batch.id}});
  expect(movements).toHaveLength(5);expect(movements.every(x=>x.quantity>0n&&x.fromState==='E')).toBe(true);
  const balances=(await read(`stock?batchId=${accepted.batch.id}`,manager).expect(200)).body;
  expect(balances.lots.find((x:any)=>x.skuId===red)).toMatchObject({usable:'30',damaged:'2'});
  expect(balances.lots.find((x:any)=>x.skuId===brown)).toMatchObject({usable:'20',damaged:'0'});
  expect(balances.lots.find((x:any)=>x.skuId===pen)).toMatchObject({usable:'12',damaged:'1'});
 });
 it('returns bounded lot provenance only to operational roles in the current origin', async () => {
  const id = accepted.lines[0].lotId;
  await request(app.getHttpServer()).get(`/v1/stock/lots/${id}`).expect(401);
  for (const token of [admin, manager]) {
   const result = (await read(`stock/lots/${id}`, token).expect(200)).body;
   expect(result.receiptId).toBe(accepted.id);
   expect(result.movements.map((row:any) => [row.toState, row.quantity]).sort()).toEqual([['D','2'],['U','30']]);
   expect(JSON.stringify(result)).not.toMatch(/invoice|damageReason|snapshot|password|actorId|commandId/);
  }
  await read(`stock/lots/${id}`, production).expect(403);
  await read(`stock/lots/${randomUUID()}`).expect(404);
  await read('stock/lots/not-a-uuid').expect(400);
  const foreign = randomUUID(); await db.originNode.create({data:{id:foreign,mode:'SHOP'}});
  const foreignApp = await createApp(db, foreign, 'SHOP');
  try { const foreignToken=await shopToken(db,foreignApp,foreign); await request(foreignApp.getHttpServer()).get(`/v1/stock/lots/${id}`).set('Authorization',`Bearer ${admin}`).expect(401); await request(foreignApp.getHttpServer()).get(`/v1/stock/lots/${id}`).set('Authorization',`Bearer ${foreignToken}`).expect(404); } finally { await foreignApp.close(); }
 });
 it('keeps repeat deliveries and other supplier stock distinct with correct product/SKU aggregates',async()=>{
  const next=(await post('receipts',receipt([{skuId:red,usableQuantity:5,damagedQuantity:0,damageReason:''}])).expect(201)).body;
  const other=(await post('receipts',{sourceId:otherSource,deliveredOn:'2019-02-01',lines:[{skuId:otherRed,usableQuantity:10,damagedQuantity:0}]}).expect(201)).body;
  expect(next.batch.id).not.toBe(accepted.batch.id);expect(next.lines[0].lotId).not.toBe(accepted.lines[0].lotId);
  expect(BigInt(next.originSequence)).toBeGreaterThan(BigInt(accepted.originSequence));expect(BigInt(other.originSequence)).toBeGreaterThan(BigInt(next.originSequence));
  const stock=(await read(`stock?productId=${productId}`).expect(200)).body;
  expect(stock.bySku.find((x:any)=>x.skuId===red)).toMatchObject({usable:'35',damaged:'2'});
  expect(stock.bySku.find((x:any)=>x.skuId===otherRed)).toMatchObject({usable:'10',damaged:'0'});
  expect(stock.byProduct[0]).toMatchObject({usable:'65',damaged:'2'});
 });
 it('replays concurrent/lost responses once and accepts separate intentional receipt keys',async()=>{
  const body=receipt([{skuId:red,usableQuantity:1,damagedQuantity:0,damageReason:''}]);const key=randomUUID();
  const responses=await Promise.all([post('receipts',body,key),post('receipts',body,key)]);
  expect(responses.map(x=>x.status)).toEqual([201,201]);expect(responses[0].body).toEqual(responses[1].body);
  expect((await post('receipts',body,key).expect(201)).body).toEqual(responses[0].body);
  await post('receipts',{...body,invoiceReference:'changed'},key).expect(409);
  expect((await post('receipts',body).expect(201)).body.batch.id).not.toBe(responses[0].body.batch.id);
  const command=await db.commandResult.findFirstOrThrow({where:{originId,key}});
  expect(await db.auditEvent.count({where:{commandId:command.id}})).toBe(1);expect(await db.outboxEvent.count({where:{commandId:command.id}})).toBe(1);
 });
 it('allocates unique ordered public codes concurrently, with date independent of backdated delivery',async()=>{
  const responses=await Promise.all(Array.from({length:4},()=>post('receipts',receipt([{skuId:pen,usableQuantity:1,damagedQuantity:0,damageReason:''}]))));
  expect(responses.every(x=>x.status===201)).toBe(true);
  expect(new Set(responses.map(x=>x.body.batch.publicCode)).size).toBe(4);
  expect(new Set(responses.map(x=>x.body.batch.id)).size).toBe(4);
  const rows=await db.deliveryBatch.findMany({where:{originId},orderBy:{dailyOrdinal:'asc'}});expect(rows.map(x=>x.dailyOrdinal)).toEqual(rows.map((_,i)=>i+1));
 });
 it('enforces auth, read allowlists, missing/foreign identity and validation rules',async()=>{
  for(const path of ['receiving/options','receipts',`receipts/${accepted.id}`,'stock']){await read(path,production).expect(403);await request(app.getHttpServer()).get(`/v1/${path}`).expect(401);const res=await read(path,manager).expect(200);expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|payloadHash|actorRole|valuation|tokenHash/);}
  await post('receipts',receipt(),randomUUID(),production).expect(403);
  await request(app.getHttpServer()).post('/v1/receipts').send(receipt()).expect(401);
  await request(app.getHttpServer()).post('/v1/receipts').set('Authorization',`Bearer ${admin}`).send(receipt()).expect(400);
  await post('receipts',receipt([{skuId:otherRed,usableQuantity:1,damagedQuantity:0,damageReason:''}])).expect(400);
  await post('receipts',receipt([{skuId:randomUUID(),usableQuantity:1,damagedQuantity:0,damageReason:''}])).expect(400);
  await post('receipts',{...receipt(),sourceId:randomUUID()}).expect(400);
  await post('receipts',{...receipt(),lines:[receipt().lines[0],receipt().lines[0]]}).expect(400);
  await post('receipts',{...receipt(),deliveredOn:'2999-01-01'}).expect(400);
  await read('stock?skuId=bad').expect(400);
  const cloud=await createApp(db,originId,'CLOUD');try{await request(cloud.getHttpServer()).post('/v1/receipts').set('Authorization',`Bearer ${admin}`).set('Idempotency-Key',randomUUID()).send(receipt()).expect(403);}finally{await cloud.close();}
 });
 async function counts(){return Promise.all([db.deliveryBatch.count({where:{originId}}),db.receiptLine.count(),db.stockMovement.count(),db.stockBalance.count(),db.auditEvent.count({where:{originId}}),db.outboxEvent.count({where:{originId}}),db.commandResult.count({where:{originId}}),db.originNode.findUniqueOrThrow({where:{id:originId}})]);}
 it('rolls back prepared lines/movements, allocation, sequence, audit, outbox and commands on injected late failures',async()=>{
  const actor=await db.user.findUniqueOrThrow({where:{id:adminId}});
  for(const target of ['stockMovement','auditEvent','outboxEvent'] as const){let seen=0;const before=await counts();
   const extended=db.$extends({query:{$allModels:{async create({model,args,query}){if(model.toLowerCase()===target.toLowerCase()&&++seen===(target==='stockMovement'?3:1))throw new Error('forced late failure');return query(args);}}}});
   const service=new ReceivingService(extended as unknown as PrismaClient,originId,'SHOP');
   await expect(service.create(actor,randomUUID(),receipt())).rejects.toThrow('forced late failure');expect(await counts()).toEqual(before);
  }
 });
 it('rejects history mutation/deletion, negative or forged projections and supplementation',async()=>{
  for(const name of ['deliveryBatch','receipt','receiptLine','stockLot','stockTransaction','stockMovement'] as const){const model=db[name] as any;const row=await model.findFirstOrThrow(name==='deliveryBatch'?{where:{originId}}:{});await expect(model.delete({where:{id:row.id}})).rejects.toThrow();await expect(db.$executeRawUnsafe(`UPDATE "${name[0]!.toUpperCase()+name.slice(1)}" SET id=id WHERE id=$1::uuid`,row.id)).rejects.toThrow();}
  const line=await db.receiptLine.findFirstOrThrow({where:{receiptId:accepted.id}});
  await expect(db.stockBalance.update({where:{lotId_state:{lotId:line.lotId,state:'U'}},data:{quantity:-1n}})).rejects.toThrow();
  await expect(db.stockBalance.update({where:{lotId_state:{lotId:line.lotId,state:'U'}},data:{quantity:999n}})).rejects.toThrow();
  await expect(db.stockBalance.delete({where:{lotId_state:{lotId:line.lotId,state:'U'}}})).rejects.toThrow();
  await expect(db.stockBalance.create({data:{lotId:line.lotId,state:'E',quantity:0n,lastTransactionId:(await db.receipt.findUniqueOrThrow({where:{id:accepted.id}})).transactionId}})).rejects.toThrow();
  await expect(db.stockLot.create({data:{batchId:accepted.batch.id,sourceId,originId,skuId:otherRed}})).rejects.toThrow();
 });
 // Build a complete candidate through SQL-backed models, then corrupt one edge before acceptance.
 async function candidate(mode:string){return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "OriginNode" WHERE id=${originId}::uuid FOR UPDATE`;
  const now=new Date();const numberedOn=new Date(lagosDate(now)+'T00:00:00Z');const last=await tx.deliveryBatch.aggregate({where:{originId,numberedOn},_max:{dailyOrdinal:true}});const ordinal=mode==='overflow'?10000:(last._max.dailyOrdinal??0)+1;
  const batch=await tx.deliveryBatch.create({data:{originId,sourceId,publicCode:batchCode(lagosDate(now),ordinal),numberedOn,dailyOrdinal:ordinal,deliveredOn:numberedOn,acceptedAt:now,snapshot:{}}});
  const node=await tx.originNode.update({where:{id:originId},data:{nextSequence:{increment:1}}});const commandId=randomUUID();
  const t=await tx.stockTransaction.create({data:{batchId:batch.id,originId,originSequence:node.nextSequence,commandId,type:'RECEIPT',actorId:adminId,actorRole:'ADMIN',recordedAt:now}});
  const r=await tx.receipt.create({data:{batchId:batch.id,transactionId:t.id,sourceId,acceptedAt:now}});
  const lot=await tx.stockLot.create({data:{skuId:red,batchId:batch.id,sourceId:mode==='cross-source'?otherSource:sourceId,originId}});
  if(mode!=='missing-lot-identity')await allocatePublicIdentity(tx,'LOT',lot.id,originId,commandId);
  const line=await tx.receiptLine.create({data:{receiptId:r.id,batchId:batch.id,skuId:mode==='sku-mismatch'?pen:red,lotId:lot.id,lineNumber:1,usableQuantity:2n,damagedQuantity:1n,damageReason:'Damaged on arrival',snapshot:{}}});
  if(mode==='duplicate-line')await tx.receiptLine.create({data:{receiptId:r.id,batchId:batch.id,skuId:red,lotId:lot.id,lineNumber:2,usableQuantity:1n,damagedQuantity:0n,damageReason:'',snapshot:{}}});
  if(mode!=='missing-movement')await tx.stockMovement.create({data:{transactionId:t.id,batchId:batch.id,lotId:lot.id,receiptLineId:mode==='orphan-movement'?randomUUID():line.id,fromState:'E',toState:'U',quantity:mode==='zero-movement'?0n:mode==='negative-movement'?-1n:mode==='wrong-quantity'?3n:2n}});
  await tx.stockMovement.create({data:{transactionId:t.id,batchId:batch.id,lotId:lot.id,receiptLineId:line.id,fromState:'E',toState:'D',quantity:1n}});
  for(const [state,quantity] of [['U',2n],['D',1n]] as const)await tx.stockBalance.create({data:{lotId:lot.id,state,quantity,lastTransactionId:t.id}});
  let pageOrdinal=0;
  const actor=await tx.user.findUniqueOrThrow({where:{id:adminId}});
  for(const movement of await tx.stockMovement.findMany({where:{transactionId:t.id}}))pageOrdinal=await receiveUnits(tx,{originId,lotId:lot.id,receiptLineId:line.id,movementId:movement.id,state:movement.toState as 'U'|'D',quantity:movement.toState==='U'?2:1,commandId,actor,now,pageOrdinal});
  if(mode!=='missing-evidence'){
   await tx.auditEvent.create({data:{originId,actorId:adminId,actorRole:'ADMIN',commandId,action:'inventory.receipt.accepted',subjectId:r.id,snapshot:{}}});
   await tx.outboxEvent.create({data:{originId,originSequence:node.nextSequence,actorId:adminId,commandId,eventType:'inventory.receipt.accepted',aggregateId:r.id,payload:{},payloadHash:'test'}});
   await tx.commandResult.create({data:{id:commandId,originId,actorId:adminId,commandType:'receiving.receipts.create',key:randomUUID(),requestHash:'test',response:{}}});
  }
 });}
 it('rejects incomplete or mismatched groups at database commit with all-or-nothing rollback',async()=>{
  for(const mode of ['missing-lot-identity','cross-source','sku-mismatch','duplicate-line','missing-movement','orphan-movement','zero-movement','negative-movement','wrong-quantity','missing-evidence']){const before=await counts();await expect(candidate(mode),mode).rejects.toThrow();expect(await counts(),mode).toEqual(before);}
 });
 it('accepts damaged-only intake without creating a zero usable movement',async()=>{
  const result=(await post('receipts',receipt([{skuId:pen,usableQuantity:0,damagedQuantity:4,damageReason:'Entire delivered pack arrived crushed'}])).expect(201)).body;
  expect(result.totals).toEqual({usable:'0',damaged:'4',delivered:'4'});
  const movements=await db.stockMovement.findMany({where:{batchId:result.batch.id}});expect(movements).toHaveLength(1);expect(movements[0]).toMatchObject({fromState:'E',toState:'D',quantity:4n});
  expect((await read(`stock?batchId=${result.batch.id}`).expect(200)).body.lots[0]).toMatchObject({usable:'0',damaged:'4'});
 });
 it('expands real database batch allocation beyond four digits without wrapping',async()=>{
  await candidate('overflow');
  const next=(await post('receipts',receipt([{skuId:pen,usableQuantity:1,damagedQuantity:0,damageReason:''}])).expect(201)).body;
  expect(next.batch.publicCode).toBe(batchCode(lagosDate(new Date(next.batch.acceptedAt)),10001));
 });
 it('qualifies readable batch codes by immutable origin across independent shop writers',async()=>{
  const independentOrigin=randomUUID();await db.originNode.create({data:{id:independentOrigin,mode:'SHOP'}});
  const independent=await createApp(db,independentOrigin,'SHOP');
  const independentToken=await shopToken(db,independent,independentOrigin);
  const send=(path:string,body:object)=>request(independent.getHttpServer()).post(`/v1/${path}`).set('Authorization',`Bearer ${independentToken}`).set('Idempotency-Key',randomUUID()).send(body);
  try{
   const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});
   const supplier=(await send('catalogue/supplier-setups',{supplier:{name:`Independent ${randomUUID()}`},location:{registryId:registry.id}}).expect(201)).body;
   const product=(await send('catalogue/product-setups',{sourceId:supplier.source.id,product:{name:'Independent pen'},variants:[]}).expect(201)).body;
   const result=(await send('receipts',{sourceId:supplier.source.id,deliveredOn:'2020-01-01',lines:[{skuId:product.skus[0].id,usableQuantity:1,damagedQuantity:0}]}).expect(201)).body;
   expect(result.batch.publicCode).toBe(accepted.batch.publicCode);expect(result.batch.originId).not.toBe(accepted.batch.originId);expect(result.batch.id).not.toBe(accepted.batch.id);
   await read(`receipts/${result.id}`).expect(404);
  }finally{await independent.close();}
 });
 it('reconciles every lot/state projection against accepted movements without an external boundary balance',async()=>{
  const bad=await db.$queryRaw<{count:bigint}[]>`SELECT count(*) FROM "StockBalance" b WHERE b.quantity<>COALESCE((SELECT sum(m.quantity) FROM "StockMovement" m WHERE m."lotId"=b."lotId" AND m."toState"=b.state),0)`;
  expect(bad[0]!.count).toBe(0n);expect(await db.stockBalance.count({where:{state:'E'}})).toBe(0);
 });
});
