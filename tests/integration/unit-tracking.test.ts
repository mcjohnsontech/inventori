import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { encodeQr, encodeUnitQr } from '@dayari/contracts';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { UnitTrackingService } from '../../apps/api/src/unit-tracking.service.js';
import { ReceivingService } from '../../apps/api/src/receiving.service.js';
import { shopToken } from './shop-fixture.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw Error('Isolated local test database required');
const db = database(url), originId = randomUUID();
let app: Awaited<ReturnType<typeof createApp>>, admin: string, manager: string, production: string, otherProduction: string, receipt: any, unit: any, damaged: any, payload: string;
const post = (path: string, body: object, key = randomUUID(), token = admin) => request(app.getHttpServer()).post('/v1/' + path).set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key).send(body);
const get = (path: string, token = admin) => request(app.getHttpServer()).get('/v1/' + path).set('Authorization', 'Bearer ' + token);
async function immutableStock() {
  const result: Record<string,string> = {};
  for (const table of ['StockUnit','UnitEvent','UnitState','StockLot','StockTransaction','StockMovement','StockBalance','Receipt','ReceiptLine','DeliveryBatch','UnitLabelJob','UnitLabelLine']) {
    const scope = table === 'StockBalance' ? `t."lotId" IN (SELECT id FROM "StockLot" WHERE "originId"=$1::uuid)` : ['Receipt','ReceiptLine','StockMovement'].includes(table) ? `t."batchId" IN (SELECT id FROM "DeliveryBatch" WHERE "originId"=$1::uuid)` : table === 'UnitLabelLine' ? `t."jobId" IN (SELECT id FROM "UnitLabelJob" WHERE "originId"=$1::uuid)` : `t."originId"=$1::uuid`;
    const [row] = await db.$queryRawUnsafe<{ hash:string }[]>(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''),'UTF8')),'hex') AS hash FROM "${table}" t WHERE ${scope}`, originId);
    result[table] = row!.hash;
  }
  return result;
}
beforeAll(async () => {
  await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
  app = await createApp(db, originId, 'SHOP');
  admin = await shopToken(db, app, originId); manager = await shopToken(db, app, originId, 'MANAGER');
  production = await shopToken(db, app, originId, 'PRODUCTION'); otherProduction = await shopToken(db, app, originId, 'PRODUCTION');
  const registry = await db.locationRegistry.findFirstOrThrow({ where: { code:'LG' } });
  const source = (await post('catalogue/supplier-setups', { supplier: { name:'Tracking ' + originId }, location:{ registryId:registry.id } }).expect(201)).body.source;
  const product = (await post('catalogue/product-setups', { sourceId:source.id, product:{name:'Tracking notebook'}, variants:[] }).expect(201)).body;
  receipt = (await post('receipts', { sourceId:source.id, deliveredOn:'2020-01-01', invoiceReference:'PRIVATE-INVOICE', lines:[{skuId:product.skus[0].id,usableQuantity:1,damagedQuantity:1,damageReason:'PRIVATE damaged intake explanation'}] }).expect(201)).body;
  unit = await db.stockUnit.findFirstOrThrow({ where:{originId,initialState:'U'} });
  damaged = await db.stockUnit.findFirstOrThrow({ where:{originId,initialState:'D'} });
  payload = encodeUnitQr(originId, unit.id);
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });

it('preserves lookup reads, records concurrent same-key presentations once and rejects changed retries', async () => {
  const before = await immutableStock(), sequence = (await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence;
  await post('qr/resolve',{payload},randomUUID(),production).expect(200);
  await get('inventory/units/by-code/' + unit.unitCode,production).expect(200);
  expect((await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence).toBe(sequence);
  const body = {payload,method:'QR_INPUT'}, key = randomUUID();
  const [a,b] = await Promise.all([post('unit-observations',body,key,production),post('unit-observations',body,key,production)]);
  expect(a.status).toBe(201); expect(b.body).toEqual(a.body); expect(a.body.evidence).toBe('QR_PRESENTED_ONLY');
  expect(await db.unitObservation.count({where:{originId}})).toBe(1);
  await post('unit-observations',{...body,method:'CAMERA'},key,production).expect(409);
  expect((await post('unit-observations',body,key,production).expect(201)).body).toEqual(a.body);
  expect(await immutableStock()).toEqual(before);
});

it('presents real accepted chronology and hides damage, suppliers, print evidence and other actors from Production', async () => {
  const label = (await post('unit-label-jobs',{kind:'INITIAL',unitIds:[unit.id],profileId:'unit-a4-70x35-v2'}).expect(201)).body;
  await post(`unit-label-jobs/${label.id}/artifact`,{}).expect(201);
  await post(`unit-label-jobs/${label.id}/handoffs`,{attemptId:randomUUID()}).expect(201);
  await post('unit-observations',{payload,method:'CAMERA'},randomUUID(),otherProduction).expect(201);
  const before = await immutableStock();
  for (const token of [admin,manager]) {
    const history = (await get(`units/${unit.id}/tracking`,token).expect(200)).body;
    expect(history.recordedCustody).toBe('SHOP_STORAGE'); expect(history.receiptId).toBe(receipt.id);
    expect(history.deliveredOn).toBe('2020-01-01');
    expect(Date.parse(history.unit.receivedAt)).toBeGreaterThan(Date.parse('2020-01-02'));
    expect(history.timeline.events.map((event:any)=>event.kind)).toEqual(['RECEIVED','QR_PRESENTED','LABEL_REQUESTED','LABEL_PREPARED','PRINT_DIALOG_REQUESTED','QR_PRESENTED']);
    const sequences = history.timeline.events.map((event:any)=>BigInt(event.originSequence));
    expect(sequences).toEqual([...sequences].sort((a:bigint,b:bigint)=>a<b?-1:a>b?1:0));
    expect(history.physicalVerification).toBe('NOT_ESTABLISHED_BY_THIS_VIEW');
  }
  const own = (await get(`units/${unit.id}/tracking`,production).expect(200)).body;
  expect(own.historyScope).toBe('OWN_QR_PRESENTATIONS'); expect(own.timeline.events).toHaveLength(1);
  expect(own.timeline.events[0].kind).toBe('QR_PRESENTED'); expect(own).not.toHaveProperty('recordedCustody'); expect(own).not.toHaveProperty('receiptId');
  expect(own).not.toHaveProperty('deliveredOn');
  expect(JSON.stringify(own)).not.toMatch(/supplierName|sourceName|invoice|PRIVATE|LABEL_|PRINT_|initialCondition|fromState|toState|movementId|labelJobId/i);
  const restricted = (await get(`units/${damaged.id}/tracking`,production).expect(200)).body;
  expect(restricted.unit.availability).toBe('UNAVAILABLE'); expect(restricted.timeline.events).toEqual([]);
  expect(JSON.stringify(restricted)).not.toMatch(/damaged|condition|supplier|invoice|PRIVATE/i);
  expect(await immutableStock()).toEqual(before);
});

it('paginates intentional repeated presentations without inventing physical events or changing inventory', async () => {
  const before = await immutableStock();
  const samples:number[]=[];
  for (let index=0;index<21;index++) { const start=performance.now();await post('unit-observations',{payload,method:'QR_INPUT'},randomUUID(),manager).expect(201);samples.push(performance.now()-start); }
  const first=(await get(`units/${unit.id}/tracking?page=1`,manager).expect(200)).body;
  const second=(await get(`units/${unit.id}/tracking?page=2`,manager).expect(200)).body;
  expect(first.timeline.total).toBe(27); expect(first.timeline.events).toHaveLength(20); expect(second.timeline.events).toHaveLength(7);
  expect(new Set([...first.timeline.events,...second.timeline.events].map((event:any)=>event.id)).size).toBe(27);
  expect(await immutableStock()).toEqual(before);
  await mkdir('artifacts/completion',{recursive:true});
  await writeFile('artifacts/completion/unit-observation-latency.json',JSON.stringify({syntheticOnly:true,recordedAt:new Date().toISOString(),node:process.version,samplesMs:samples,maxMs:Math.max(...samples),targetMs:2000,limitations:['Loopback API acceptance only; no camera, shop Wi-Fi or hardware certification','Single-worker isolated fixture, not a concurrency/load benchmark']},null,2));
});

it('rejects malformed, shared-lot, foreign, unknown and unauthenticated presentation requests', async () => {
  await request(app.getHttpServer()).post('/v1/unit-observations').send({payload,method:'QR_INPUT'}).expect(401);
  await post('unit-observations',{payload,method:'QR_INPUT',state:'U'}).expect(400);
  await post('unit-observations',{payload:'not-qr',method:'QR_INPUT'}).expect(400);
  await post('unit-observations',{payload:encodeQr(originId,unit.lotId),method:'QR_INPUT'}).expect(422);
  await post('unit-observations',{payload:encodeUnitQr(randomUUID(),unit.id),method:'QR_INPUT'}).expect(404);
  await post('unit-observations',{payload:encodeUnitQr(originId,randomUUID()),method:'QR_INPUT'}).expect(404);
  await get(`units/${randomUUID()}/tracking`).expect(404);
  await get(`units/${unit.id}/tracking?originId=${randomUUID()}`).expect(400);
  await get(`units/${unit.id}/tracking?page=0`).expect(400);
});

it('rolls incomplete evidence back and prevents observation history edits without touching stock', async () => {
  const actor=await db.user.findFirstOrThrow({where:{role:'ADMIN',membership:{originId}}});
  const before=await immutableStock(),sequence=(await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence,count=await db.unitObservation.count({where:{originId}});
  for (const model of ['AuditEvent','OutboxEvent','CommandResult']) {
    const extended=db.$extends({query:{$allModels:{async create({model:current,args,query}){if(current===model)throw Error('Injected observation evidence failure');return query(args);}}}});
    await expect(new UnitTrackingService(extended as unknown as PrismaClient,originId,'SHOP').observe(actor,randomUUID(),{payload,method:'CAMERA'})).rejects.toThrow('Injected observation evidence failure');
    expect(await db.unitObservation.count({where:{originId}})).toBe(count);expect((await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence).toBe(sequence);
  }
  const saved=await db.unitObservation.findFirstOrThrow({where:{originId}});
  await expect(db.unitObservation.update({where:{id:saved.id},data:{method:'CAMERA'}})).rejects.toThrow();
  await expect(db.unitObservation.delete({where:{id:saved.id}})).rejects.toThrow();
  await expect(db.unitObservation.create({data:{...saved,id:randomUUID(),commandId:randomUUID()}})).rejects.toThrow();
  await expect(new UnitTrackingService(db,originId,'CLOUD').observe(actor,randomUUID(),{payload,method:'CAMERA'})).rejects.toThrow('shop');
  expect(await immutableStock()).toEqual(before);
});
it('keeps identical Product and Unit Code text in explicit immutable identity namespaces', async () => {
  const actor=await db.user.findFirstOrThrow({where:{role:'ADMIN',membership:{originId}}});
  const saved=await db.receipt.findUniqueOrThrow({where:{id:receipt.id}});
  const code=receipt.lines[0].productCode;
  const accepted=await new ReceivingService(db,originId,'SHOP',()=>code).create(actor,randomUUID(),{sourceId:saved.sourceId,deliveredOn:'2020-01-01',lines:[{skuId:receipt.lines[0].skuId,usableQuantity:1,damagedQuantity:0}]}) as any;
  const byProduct=(await get('inventory/products/by-code/'+code).expect(200)).body;
  const byUnit=(await get('inventory/units/by-code/'+code).expect(200)).body;
  expect(byProduct.kind).toBe('PRODUCT');expect(byProduct.productId).toBe(receipt.lines[0].productId);
  expect(byUnit.unitCode).toBe(code);expect(byUnit.lotId).toBe(accepted.lines[0].lotId);expect(byUnit.productId).toBe(byProduct.productId);
  expect(byUnit.unitId).not.toBe(byProduct.productId);expect(byUnit.payloadVersion).toBe(2);
  expect((await db.productPublicIdentity.findUniqueOrThrow({where:{productId:byProduct.productId}})).code).toBe(code);
});
it('rejects actual foreign units on both history and presentation endpoints', async () => {
  const foreignOrigin=randomUUID();await db.originNode.create({data:{id:foreignOrigin,mode:'SHOP'}});
  const foreignApp=await createApp(db,foreignOrigin,'SHOP');
  try {
    const token=await shopToken(db,foreignApp,foreignOrigin);
    const foreignPost=(path:string,body:object)=>request(foreignApp.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+token).set('Idempotency-Key',randomUUID()).send(body);
    const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});
    const source=(await foreignPost('catalogue/supplier-setups',{supplier:{name:'Foreign tracking '+foreignOrigin},location:{registryId:registry.id}}).expect(201)).body.source;
    const product=(await foreignPost('catalogue/product-setups',{sourceId:source.id,product:{name:'Foreign tracking item'},variants:[]}).expect(201)).body;
    await foreignPost('receipts',{sourceId:source.id,deliveredOn:'2020-01-01',lines:[{skuId:product.skus[0].id,usableQuantity:1,damagedQuantity:0}]}).expect(201);
    const foreign=await db.stockUnit.findFirstOrThrow({where:{originId:foreignOrigin}});
    await get(`units/${foreign.id}/tracking`).expect(404);
    await post('unit-observations',{payload:encodeUnitQr(originId,foreign.id),method:'QR_INPUT'}).expect(404);
    await post('unit-observations',{payload:encodeUnitQr(foreignOrigin,foreign.id),method:'QR_INPUT'}).expect(404);
  } finally {await foreignApp.close();}
});
