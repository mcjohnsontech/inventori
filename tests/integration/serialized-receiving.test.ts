import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Prisma, PrismaClient, type User } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { ReceivingService } from '../../apps/api/src/receiving.service.js';
import { ReceivingService as OldReceivingService } from '../../apps/api/test-fixtures/pre-serialization-receiving.js';
import { shopToken } from './shop-fixture.js';
import { canonical,digest } from '../../apps/api/src/security.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw Error('Isolated local test database required');
const db = database(url), originId = randomUUID();
let app: Awaited<ReturnType<typeof createApp>>, token: string, manager: string, production: string, actor: User;
let sourceId: string, skuId: string, secondSku: string, accepted: any;
const post = (path: string, body: object, key = randomUUID(), auth = token) => request(app.getHttpServer()).post('/v1/' + path).set('Authorization', 'Bearer ' + auth).set('Idempotency-Key', key).send(body);
const body = (usable = 48, damaged = 2) => ({ sourceId, deliveredOn: '2020-01-01', lines: [{ skuId, usableQuantity: usable, damagedQuantity: damaged, damageReason: damaged ? 'Synthetic damaged arrivals' : '' }] });
beforeAll(async () => {
  await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
  app = await createApp(db, originId, 'SHOP');
  token = await shopToken(db, app, originId);
  actor = await db.user.findFirstOrThrow({ where: { membership: { originId }, role: 'ADMIN' } });
  manager = await shopToken(db, app, originId, 'MANAGER'); production = await shopToken(db, app, originId, 'PRODUCTION');
  const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
  sourceId = (await post('catalogue/supplier-setups', { supplier: { name: 'Serialized ' + originId }, location: { registryId: registry.id } }).expect(201)).body.source.id;
  const product = (await post('catalogue/product-setups', { sourceId, product: { name: 'Serialized notebooks' }, variants: ['Red','Brown'].map(name => ({ name, suffix: name.toUpperCase(), attributes: [{ attribute: 'Colour', value: name }] })) }).expect(201)).body;
  [skuId, secondSku] = product.skus.map((sku: { id: string }) => sku.id);
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });

async function snapshot() {
  const tables = ['DeliveryBatch','Receipt','ReceiptLine','StockLot','StockTransaction','StockMovement','StockBalance','StockUnit','UnitState','UnitEvent','UnitCommandManifestPage','AuditEvent','OutboxEvent','CommandResult'];
  const data: Record<string, unknown> = {};
  for (const table of tables) data[table] = (await db.$queryRawUnsafe<any[]>(`SELECT count(*)::text AS n FROM "${table}"`))[0].n;
  data.node = (await db.originNode.findUniqueOrThrow({ where: { id: originId } })).nextSequence.toString();
  return data;
}

it('atomically receives 50 unique physical identities with exact usable/damaged membership and no double stock', async () => {
  const key = randomUUID();
  const [a,b] = await Promise.all([post('receipts',body(),key,manager),post('receipts',body(),key,manager)]);
  expect(a.status).toBe(201);expect(b.body).toEqual(a.body);accepted=a.body;
  expect(accepted.serialization).toEqual({ unitCount: '50', manifestPages: 1 });
  const units = await db.stockUnit.findMany({ where: { lotId: accepted.lines[0].lotId } });
  expect(units).toHaveLength(50);expect(new Set(units.map(unit => unit.unitCode)).size).toBe(50);
  expect(units.every(unit => /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(unit.unitCode))).toBe(true);
  expect(units.filter(unit => unit.initialState==='U')).toHaveLength(48);expect(units.filter(unit => unit.initialState==='D')).toHaveLength(2);
  expect(await db.unitEvent.count({ where: { unitId: { in: units.map(unit => unit.id) } } })).toBe(50);
  const commandId=units[0]!.registrationCommandId;
  const pages=await db.unitCommandManifestPage.findMany({where:{commandId},orderBy:{ordinal:'asc'},select:{id:true,ordinal:true,payloadHash:true}});
  const outbox=await db.outboxEvent.findFirstOrThrow({where:{commandId}}),audit=await db.auditEvent.findFirstOrThrow({where:{commandId}});
  expect((outbox.payload as any).unitManifest).toEqual({version:1,pages});
  expect((audit.snapshot as any).unitManifest).toEqual({version:1,pages});
  const balances = await db.stockBalance.findMany({ where: { lotId: accepted.lines[0].lotId } });
  expect(balances.map(balance => [balance.state,balance.quantity.toString()]).sort()).toEqual([['D','2'],['U','48']]);
  const before = await snapshot();await post('receipts',body(49,1),key,manager).expect(409);expect(await snapshot()).toEqual(before);
});

it('provides bounded receipt-unit reads only to receiving roles and scopes foreign identities', async () => {
  for (const auth of [token,manager]) {
    const first = (await request(app.getHttpServer()).get(`/v1/receipts/${accepted.id}/units`).set('Authorization','Bearer '+auth).expect(200)).body;
    expect(first.total).toBe(50);expect(first.units).toHaveLength(20);expect(first.historicalUnassigned).toBe(false);
    const last=(await request(app.getHttpServer()).get(`/v1/receipts/${accepted.id}/units?page=3`).set('Authorization','Bearer '+auth).expect(200)).body;expect(last.units).toHaveLength(10);
    expect(JSON.stringify(first)).not.toMatch(/password|registrationCommandId|invoiceReference|canonicalPayload/);
  }
  await request(app.getHttpServer()).get(`/v1/receipts/${accepted.id}/units`).expect(401);
  await request(app.getHttpServer()).get(`/v1/receipts/${accepted.id}/units`).set('Authorization','Bearer '+production).expect(403);
  await request(app.getHttpServer()).get(`/v1/receipts/${randomUUID()}/units`).set('Authorization','Bearer '+token).expect(404);
});

it('rejects immutable identity/event changes, late supplementation and projection forgery', async () => {
  const unit=await db.stockUnit.findFirstOrThrow({ where: { lotId: accepted.lines[0].lotId, initialState: 'U' } });
  await expect(db.stockUnit.update({where:{id:unit.id},data:{unitCode:'222222'}})).rejects.toThrow();
  await expect(db.stockUnit.delete({where:{id:unit.id}})).rejects.toThrow();
  await expect(db.unitEvent.updateMany({where:{unitId:unit.id},data:{kind:'FORGED'}})).rejects.toThrow();
  await expect(db.stockUnit.create({data:{...unit,id:randomUUID(),unitCode:'222222'}})).rejects.toThrow();
  await expect(db.unitState.update({where:{unitId:unit.id},data:{state:'D',condition:'DAMAGED'}})).rejects.toThrow();
  await expect(db.unitState.update({where:{unitId:unit.id},data:{unitId:randomUUID()}})).rejects.toThrow();
});

it('retries forced code collisions, never expands, and rolls exhaustion/chunk/evidence failures back entirely', async () => {
  let draws=0;
  const existing=await db.stockUnit.findFirstOrThrow({where:{originId}});
  const { drawUnitCode }=await import('../../apps/api/src/unit-receiving.js');
  const collision=new ReceivingService(db,originId,'SHOP',()=>++draws<=2?existing.unitCode:drawUnitCode());
  const result=await collision.create(actor,randomUUID(),body(1,0)) as any;expect(result.serialization.unitCount).toBe('1');expect(draws).toBe(3);
  const before=await snapshot();
  await expect(new ReceivingService(db,originId,'SHOP',()=>existing.unitCode).create(actor,randomUUID(),body(1,0))).rejects.toThrow('UNIT_CODE_ALLOCATION_BUSY');expect(await snapshot()).toEqual(before);
  for(const model of ['UnitState','UnitCommandManifestPage','AuditEvent','OutboxEvent']) {
    let writes=0;
    const shouldFail=(current:string)=>current===model && ++writes===(model==='UnitCommandManifestPage'?2:1);
    const extended=db.$extends({query:{async $executeRaw({args,query}){if(args.sql.includes(`INSERT INTO "${model}"`) && shouldFail(model))throw Error('Injected unit evidence failure');return query(args);},$allModels:{async create({model: current,args,query}){if(shouldFail(current))throw Error('Injected unit evidence failure');return query(args);},async createMany({model:current,args,query}){if(shouldFail(current))throw Error('Injected unit evidence failure');return query(args);}}}});
    await expect(new ReceivingService(extended as unknown as PrismaClient,originId,'SHOP',undefined,2).create(actor,randomUUID(),body(5,1))).rejects.toThrow('Injected unit evidence failure');expect(await snapshot()).toEqual(before);
  }
});

it('rejects missing initial evidence and duplicate or foreign manifest membership at database commit', async () => {
  const before=await snapshot();
  for(const omit of ['UnitEvent','UnitState','UnitCommandManifestPage']) {
    const extended=db.$extends({query:{async $executeRaw({args,query}){return args.sql.includes(`INSERT INTO "${omit}"`)?0:query(args);},unitCommandManifestPage:{async create({args,query}){return omit==='UnitCommandManifestPage'?({...args.data} as any):query(args);}}}});
    await expect(new ReceivingService(extended as unknown as PrismaClient,originId,'SHOP').create(actor,randomUUID(),body(3,1))).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  }
  for(const foreign of [false,true]) {
    const extended=db.$extends({query:{unitCommandManifestPage:{async create({args,query}){
      const members=JSON.parse(JSON.stringify(args.data.members));
      if(foreign)members[0].id=randomUUID();else members[1]=members[0];
      args.data.members=members;args.data.canonicalPayload=canonical(members);args.data.payloadHash=digest(args.data.canonicalPayload);
      return query(args);
    }}}});
    await expect(new ReceivingService(extended as unknown as PrismaClient,originId,'SHOP').create(actor,randomUUID(),body(3,1))).rejects.toThrow('unit manifest');
    expect(await snapshot()).toEqual(before);
  }
});

it('fences the frozen old writer after cutover, including backdated delivery, without partial effects', async () => {
  const before=await snapshot();
  await expect(new OldReceivingService(db,originId,'SHOP').create(actor,randomUUID(),body())).rejects.toThrow('Receipt units');
  expect(await snapshot()).toEqual(before);
});

it('rejects stale receiving under a restricted runtime role that cannot disable database triggers', async () => {
  const role = 'unit_runtime_' + randomUUID().replaceAll('-','');
  const rolePassword=randomUUID()+randomUUID();
  await db.$executeRawUnsafe(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${rolePassword}'`);
  const runtimeUrl=new URL(url!);runtimeUrl.username=role;runtimeUrl.password=rolePassword;
  const runtime = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl.toString(), options: '-c timezone=UTC' }) });
  try {
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await db.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
    expect(await runtime.$queryRaw`SELECT current_user::text AS current,session_user::text AS session`).toEqual([{current:role,session:role}]);
    await runtime.$executeRawUnsafe('RESET ROLE');
    await expect(runtime.$executeRawUnsafe('ALTER TABLE "StockUnit" DISABLE TRIGGER ALL')).rejects.toThrow();
    await expect(runtime.$executeRawUnsafe("SET session_replication_role='replica'")).rejects.toThrow();
    const before=await snapshot();
    await expect(new OldReceivingService(runtime,originId,'SHOP').create(actor,randomUUID(),body(1,0))).rejects.toThrow('Receipt units');
    expect(await snapshot()).toEqual(before);
  } finally {
    await runtime.$disconnect();
    await db.$executeRawUnsafe(`REVOKE SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public FROM "${role}"`);
    await db.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM "${role}"`);
    await db.$executeRawUnsafe(`DROP ROLE "${role}"`);
  }
});

it('keeps batches independent and rejects oversized receipts without any allocation effects', async () => {
  const a=(await post('receipts',body(1,0)).expect(201)).body,b=(await post('receipts',body(1,0)).expect(201)).body;
  expect(a.lines[0].lotId).not.toBe(b.lines[0].lotId);
  const before=await snapshot();await post('receipts',body(10001,0)).expect(400);expect(await snapshot()).toEqual(before);
  const multi=(await post('receipts',{...body(2,1),lines:[...body(2,1).lines,{skuId:secondSku,usableQuantity:3,damagedQuantity:0}]}).expect(201)).body;
  expect(multi.serialization.unitCount).toBe('6');expect(multi.lines).toHaveLength(2);
});
