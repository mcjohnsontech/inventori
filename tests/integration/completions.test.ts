import {canonical,digest} from '../../apps/api/src/security.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { shopToken } from './shop-fixture.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw Error('Isolated fixture required');
const db = database(url), originId = randomUUID();
let app: Awaited<ReturnType<typeof createApp>>, admin: string, manager: string, production: string, lotId: string, skuId: string, sourceId: string, units: {
    id: string;
}[], checkout: any, accepted: any;
const post = (path: string, body: object, key = randomUUID(), token = manager) => request(app.getHttpServer()).post('/v1/' + path).set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key).send(body);
const get = (path: string, token = manager) => request(app.getHttpServer()).get('/v1/' + path).set('Authorization', 'Bearer ' + token);
const body = (...unitIds: string[]) => ({ unitIds });
async function balances() { return (await db.stockBalance.findMany({ where: { lotId }, orderBy: { state: 'asc' } })).map(x => ({ state: x.state, quantity: x.quantity.toString() })); }
beforeAll(async () => {
    await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
    app = await createApp(db, originId, 'SHOP');
    admin = await shopToken(db, app, originId);
    manager = await shopToken(db, app, originId, 'MANAGER');
    production = await shopToken(db, app, originId, 'PRODUCTION');
    const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
    sourceId = (await post('catalogue/supplier-setups', { supplier: { name: 'Completion ' + originId }, location: { registryId: registry.id } }, randomUUID(), admin).expect(201)).body.source.id;
    skuId = (await post('catalogue/product-setups', { sourceId, product: { name: 'Completion notebook' }, variants: [] }, randomUUID(), admin).expect(201)).body.skus[0].id;
    const receipt = (await post('receipts', { sourceId, deliveredOn: '2020-01-01', lines: [{ skuId, usableQuantity: 10, damagedQuantity: 1, damageReason: 'Damaged intake evidence' }] }).expect(201)).body;
    lotId = receipt.lines[0].lotId;
    units = await db.stockUnit.findMany({ where: { lotId, initialState: 'U' }, select: { id: true }, orderBy: { id: 'asc' } });
    checkout = (await post('checkouts', { reason: { code: 'PRODUCTION_USE' }, orderReference: 'REUSABLE-ORDER', lines: units.slice(0, 7).map(unit => ({ unitId: unit.id })) }, randomUUID(), production).expect(201)).body;
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });
it('Admin and Manager confirm; Production cannot administer', async () => {
 await post('completions',body(units[0]!.id),randomUUID(),production).expect(403);
 for(const path of ['completion-config','completion-options','completion-sessions','completions'])await get(path,production).expect(403);
 await post('completions/preview',body(units[0]!.id),randomUUID(),production).expect(403);
 for(const token of [admin,manager])expect((await get('completion-config',token).expect(200)).body.canConfirm).toBe(true);
 await request(app.getHttpServer()).get('/v1/completions').expect(401);
 await request(app.getHttpServer()).get('/v1/completion-sessions').expect(401);
});
it('completes explicit subset, retains original checkout and does not deduct usable twice', async () => { const before = await balances(); const result = await post('completions', body(units[0]!.id)).expect(201); accepted = result.body; expect(accepted.lines).toHaveLength(1); expect(accepted.lines[0].checkoutId).toBe(checkout.id); expect(accepted.lines[0].orderReference).toBe('REUSABLE-ORDER'); expect((await balances()).find(x => x.state === 'U')).toEqual(before.find(x => x.state === 'U')); expect((await db.unitState.findUniqueOrThrow({ where: { unitId: units[0]!.id } })).state).toBe('C'); expect((await db.unitState.findUniqueOrThrow({ where: { unitId: units[1]!.id } })).state).toBe('P'); expect((await get('completions/' + accepted.id, admin).expect(200)).body).toEqual(accepted); });
it('canonical concurrent retries and lost response return original result; changed payload conflicts', async () => { const key = randomUUID(), input = body(units[1]!.id, units[2]!.id); const [a, b] = await Promise.all([post('completions', input, key), post('completions', body(units[2]!.id, units[1]!.id), key)]); expect(a.status).toBe(201); expect(b.body).toEqual(a.body); expect((await post('completions', input, key).expect(201)).body).toEqual(a.body); await post('completions', body(units[3]!.id), key).expect(409); });
it('rejects completed, damaged, usable, foreign, duplicate or mixed selections atomically', async () => { const damaged = await db.stockUnit.findFirstOrThrow({ where: { lotId, initialState: 'D' } }); const count = await db.productionCompletion.count({ where: { originId } }); for (const ids of [[units[0]!.id], [damaged.id], [units[9]!.id], [units[3]!.id, units[0]!.id]])
    await post('completions', { unitIds: ids }).expect(409); await post('completions', body(units[3]!.id, randomUUID())).expect(404); await post('completions', body(units[3]!.id, units[3]!.id)).expect(400); expect(await db.productionCompletion.count({ where: { originId } })).toBe(count); });
it('same order reference later checkout stays open; damage and checkout reconcile lots containing completed units', async () => { const later = (await post('checkouts', { reason: { code: 'SAMPLE' }, orderReference: 'REUSABLE-ORDER', lines: [{ unitId: units[8]!.id }] }, randomUUID(), production).expect(201)).body; expect(later.id).not.toBe(checkout.id); await post('damage-reports', { unitIds: [units[9]!.id], cause: 'Torn cover', description: 'Cover torn during shop storage handling' }).expect(201); expect((await db.unitState.findUniqueOrThrow({ where: { unitId: units[8]!.id } })).state).toBe('P'); expect((await db.unitState.findUniqueOrThrow({ where: { unitId: units[0]!.id } })).state).toBe('C'); });
it('concurrent BAD/completion accepts only one current-state transition', async () => { const id = units[3]!.id; const [complete, bad] = await Promise.all([post('completions', body(id)), post('damage-reports', { unitIds: [id], cause: 'Broken binding', description: 'Binding broke during production handling' })]); expect([complete.status, bad.status].sort()).toEqual([201, 409]); const state = await db.unitState.findUniqueOrThrow({ where: { unitId: id } }); expect(['C', 'D']).toContain(state.state); expect(await db.unitEvent.count({ where: { unitId: id } })).toBe(3); });
it('late outbox failure rolls back all domain, ledger, projection, sequence and command effects', async () => {
    const tables = ['ProductionCompletion', 'ProductionCompletionLine', 'StockTransaction', 'StockMovement', 'StockBalance', 'UnitState', 'UnitEvent', 'AuditEvent', 'OutboxEvent', 'CommandResult'];
    const fingerprints = async () => Promise.all(tables.map(async (table) => (await db.$queryRawUnsafe<{
        hash: string;
    }[]>(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) hash FROM "${table}" t WHERE ${table === 'StockBalance' ? 't."lotId" IN (SELECT id FROM "StockLot" WHERE "originId"=$1::uuid)' : table === 'StockMovement' ? 't."batchId" IN (SELECT id FROM "DeliveryBatch" WHERE "originId"=$1::uuid)' : 't."originId"=$1::uuid'}`, originId))[0]!.hash));
    const before = await fingerprints(), node = await db.originNode.findUniqueOrThrow({ where: { id: originId } });
    await db.$executeRawUnsafe(`CREATE FUNCTION synthetic_completion_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='production.completed' AND NEW."originId"='${originId}'::uuid THEN RAISE EXCEPTION 'Synthetic completion outbox failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER synthetic_completion_failure BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION synthetic_completion_failure()');
    try {
        await post('completions', body(units[4]!.id)).expect(500);
    }
    finally {
        await db.$executeRawUnsafe('DROP TRIGGER synthetic_completion_failure ON "OutboxEvent"');
        await db.$executeRawUnsafe('DROP FUNCTION synthetic_completion_failure()');
    }
    expect(await fingerprints()).toEqual(before);
    expect((await db.originNode.findUniqueOrThrow({ where: { id: originId } })).nextSequence).toBe(node.nextSequence);
});
it('history immutable; no late child, projection bypass or orphan transaction; origin isolation', async () => { await expect(db.productionCompletion.update({ where: { id: accepted.id }, data: { unitCount: 2 } })).rejects.toThrow(); await expect(db.productionCompletionLine.delete({ where: { id: accepted.lines[0].id } })).rejects.toThrow(); await expect(db.unitState.update({ where: { unitId: units[4]!.id }, data: { state: 'C', custody: 'COMPLETED', holderId: null } })).rejects.toThrow(); await expect(db.stockTransaction.create({ data: { id: randomUUID(), originId, actorId: accepted.manager.id, actorRole: 'MANAGER', commandId: randomUUID(), type: 'COMPLETE', recordedAt: new Date(), originSequence: 999999n } })).rejects.toThrow(); const foreignOrigin = randomUUID(); await db.originNode.create({ data: { id: foreignOrigin, mode: 'SHOP' } }); const foreign = await createApp(db, foreignOrigin, 'SHOP'); try {
    const token = await shopToken(db, foreign, foreignOrigin);
    await request(foreign.getHttpServer()).get('/v1/completions/' + accepted.id).set('Authorization', 'Bearer ' + token).expect(404);
    expect((await request(foreign.getHttpServer()).get('/v1/completion-sessions').set('Authorization','Bearer '+token).expect(200)).body.total).toBe(0);
    expect((await request(foreign.getHttpServer()).get('/v1/completion-options?checkoutId='+checkout.id).set('Authorization','Bearer '+token).expect(200)).body.total).toBe(0);
}
finally {
    await foreign.close();
} });
it('work and history are paginated with real filtering', async () => { const options = (await get('completion-options?page=1&query=REUSABLE-ORDER').expect(200)).body; expect(options.units.every((row: any) => row.state === 'P')).toBe(true); expect(options.units.some((row: any) => row.unit.unitId === units[0]!.id)).toBe(false); expect((await get('completions?page=1&query=REUSABLE-ORDER').expect(200)).body.total).toBeGreaterThan(0); await get('completions?page=0').expect(400); });

it('completes across distinct suppliers, batches and holders without changing supplier SKU identities',async()=>{
 const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});const original=await db.supplierVariantSku.findUniqueOrThrow({where:{id:skuId}});
 const source=(await post('catalogue/supplier-setups',{supplier:{name:'Second completion supplier '+originId},location:{registryId:registry.id}},randomUUID(),admin).expect(201)).body.source;
 const sourced=(await post('catalogue/product-setups',{sourceId:source.id,product:{id:original.productId},variants:[{variantId:original.variantId,suffix:'STD'}]},randomUUID(),admin).expect(201)).body.skus[0];
 const selected=[];for(const entry of [{sourceId,skuId},{sourceId:source.id,skuId:sourced.id}]){const receipt=(await post('receipts',{sourceId:entry.sourceId,deliveredOn:'2020-01-01',lines:[{skuId:entry.skuId,usableQuantity:1,damagedQuantity:0}]}).expect(201)).body;selected.push(await db.stockUnit.findFirstOrThrow({where:{lotId:receipt.lines[0].lotId}}));}
 for(let i=0;i<selected.length;i++)await post('checkouts',{reason:{code:'SAMPLE'},orderReference:i?'OTHER-ORDER':'REUSABLE-ORDER',lines:[{unitId:selected[i]!.id}]},randomUUID(),i?admin:production).expect(201);
 const result=(await post('completions',body(...selected.map(unit=>unit.id))).expect(201)).body;expect(new Set(result.lines.map((row:any)=>row.unit.skuId)).size).toBe(2);expect(new Set(result.lines.map((row:any)=>row.unit.batchId)).size).toBe(2);expect(new Set(result.lines.map((row:any)=>row.recordedHolder.id)).size).toBe(2);expect(result.lines.every((row:any)=>row.unit.productId===original.productId)).toBe(true);expect(await db.supplierVariantSku.findUniqueOrThrow({where:{id:skuId}})).toEqual(original);
});
it('500 explicit unit completion is atomic and preserves usable projection',async()=>{
 const receipt=(await post('receipts',{sourceId,deliveredOn:'2020-01-01',lines:[{skuId,usableQuantity:500,damagedQuantity:0}]}).expect(201)).body;const lot=receipt.lines[0].lotId,selected=await db.stockUnit.findMany({where:{lotId:lot}});await post('checkouts',{reason:{code:'PRODUCTION_USE'},orderReference:null,lines:selected.map(unit=>({unitId:unit.id}))}).expect(201);
 const before=await db.stockBalance.findUniqueOrThrow({where:{lotId_state:{lotId:lot,state:'U'}}});const start=performance.now(),result=(await post('completions',body(...selected.map(unit=>unit.id))).expect(201)).body,elapsedMs=performance.now()-start;
 expect(result.lines).toHaveLength(500);expect(await db.unitState.count({where:{lotId:lot,state:'C'}})).toBe(500);expect(await db.stockBalance.findUniqueOrThrow({where:{lotId_state:{lotId:lot,state:'U'}}})).toEqual(before);
 await mkdir('artifacts/completion',{recursive:true});await writeFile('artifacts/completion/completion-500-capacity.json',JSON.stringify({syntheticOnly:true,units:500,elapsedMs,accepted:true,usableUnchanged:true,samples:1,limitations:['Development loopback, one lot; not production or 500-distinct-lot certification']},null,2));
});

it('accepted completion cannot gain late children or be deleted; cloud cannot confirm',async()=>{
 const line=await db.productionCompletionLine.findUniqueOrThrow({where:{id:accepted.lines[0].id}});
 await expect(db.productionCompletionLine.create({data:{...line,snapshot:JSON.parse(JSON.stringify(line.snapshot)),id:randomUUID(),unitId:units[5]!.id,checkoutLineId:checkout.lines.find((x:any)=>x.unit.unitId===units[5]!.id)?.id??randomUUID(),previousEventId:randomUUID(),movementId:randomUUID(),eventId:randomUUID()}})).rejects.toThrow('Accepted completion cannot be supplemented');
 await expect(db.productionCompletion.delete({where:{id:accepted.id}})).rejects.toThrow();
 const cloud=await createApp(db,originId,'CLOUD');try{await request(cloud.getHttpServer()).post('/v1/completions').set('Authorization','Bearer '+manager).set('Idempotency-Key',randomUUID()).send(body(units[5]!.id)).expect(403);}finally{await cloud.close();}
 const history=(await get('units/'+units[0]!.id+'/tracking').expect(200)).body.timeline.events;expect(history.find((x:any)=>x.kind==='COMPLETED')).toMatchObject({completionId:accepted.id,checkoutId:checkout.id,fromState:'P',toState:'C'});
});

it('database rejects a COMPLETE transaction with a valid command but no completion root',async()=>{
 const id=randomUUID();await expect(db.$transaction(async tx=>{
  await tx.commandResult.create({data:{id,originId,actorId:accepted.manager.id,commandType:'production.complete',key:randomUUID(),requestHash:'synthetic',response:{}}});
  await tx.outboxEvent.create({data:{originId,actorId:accepted.manager.id,commandId:id,originSequence:999999n,eventType:'production.completed',aggregateId:randomUUID(),payload:{},payloadHash:digest(canonical({}))}});
  await tx.stockTransaction.create({data:{id:randomUUID(),originId,actorId:accepted.manager.id,actorRole:'MANAGER',commandId:id,type:'COMPLETE',recordedAt:new Date(),originSequence:999999n}});
 })).rejects.toThrow('Completion transaction requires new domain root');
 expect(await db.commandResult.findUnique({where:{id}})).toBeNull();
});

it('Admin completes only explicitly selected units and replay does not deduct usable again',async()=>{
 const id=units[6]!.id,key=randomUUID(),before=await balances();
 const accepted=(await post('completions',body(id),key,admin).expect(201)).body;
 expect((await post('completions',body(id),key,admin).expect(201)).body).toEqual(accepted);
 expect((await balances()).find(x=>x.state==='U')).toEqual(before.find(x=>x.state==='U'));
 expect((await db.productionCompletion.findUniqueOrThrow({where:{id:accepted.id}})).actorRole).toBe('ADMIN');
 expect((await db.unitState.findUniqueOrThrow({where:{unitId:units[5]!.id}})).state).toBe('P');
 const audit=await db.auditEvent.findFirstOrThrow({where:{subjectId:accepted.id,action:'production.completed'}});expect(audit.actorRole).toBe('ADMIN');
});
it('session discovery includes unlinked work and exact session filtering cannot cross origin',async()=>{
 const sessions=(await get('completion-sessions').expect(200)).body;
 expect(sessions.rows.some((row:any)=>row.id===checkout.id)).toBe(true);
 const selected=(await get('completion-options?checkoutId='+checkout.id).expect(200)).body;
 expect(selected.units.length).toBeGreaterThan(0);expect(selected.units.every((row:any)=>row.checkoutId===checkout.id)).toBe(true);
 expect((await get('completion-options?checkoutId='+randomUUID()).expect(200)).body.total).toBe(0);
 await get('completion-options?checkoutId=invalid').expect(400);
 await get('completion-sessions?originId='+originId).expect(400);
});

it('database denies Production completion actor roles directly',async()=>{
 const root=await db.productionCompletion.findUniqueOrThrow({where:{id:accepted.id}});
 await expect(db.productionCompletion.create({data:{...root,id:randomUUID(),commandId:randomUUID(),actorRole:'PRODUCTION',manifest:JSON.parse(JSON.stringify(root.manifest))}})).rejects.toThrow('ProductionCompletion_actorRole_check');
});
