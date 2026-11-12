import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { lagosDate } from '@dayari/contracts';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { ReconciliationService } from '../../apps/api/src/reconciliation.service.js';
import { ReceivingService } from '../../apps/api/src/receiving.service.js';
import { canonical, digest } from '../../apps/api/src/security.js';
import { shopToken } from './shop-fixture.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw Error('Isolated test database required');
const db = database(url), originId = randomUUID();
let app: Awaited<ReturnType<typeof createApp>>, admin: string, manager: string, production: string, checkout: any, resolution: any;
let checkoutBody: object, checkoutKey: string, extraUnitId: string;
const post = (path: string, body: object, key: string = randomUUID(), token = manager) => request(app.getHttpServer()).post('/v1/' + path)
  .set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key).send(body);
const get = (path: string, token = manager) => request(app.getHttpServer()).get('/v1/' + path).set('Authorization', 'Bearer ' + token);
async function stockFingerprint() {
  const result: Record<string, string> = {};
  for (const table of ['StockUnit', 'UnitEvent', 'UnitState', 'StockLot', 'StockTransaction', 'StockMovement', 'StockBalance', 'Receipt', 'ReceiptLine', 'DeliveryBatch', 'Checkout', 'CheckoutLine', 'CheckoutException', 'UnitObservation', 'UnitLabelJob', 'UnitLabelLine', 'UnitLabelArtifact']) {
    const scope = table === 'StockBalance' ? `t."lotId" IN (SELECT id FROM "StockLot" WHERE "originId"=$1::uuid)`
      : ['Receipt', 'ReceiptLine', 'StockMovement'].includes(table) ? `t."batchId" IN (SELECT id FROM "DeliveryBatch" WHERE "originId"=$1::uuid)`
      : table === 'UnitLabelLine' ? `t."jobId" IN (SELECT id FROM "UnitLabelJob" WHERE "originId"=$1::uuid)` : `t."originId"=$1::uuid`;
    const [row] = await db.$queryRawUnsafe<{ hash: string }[]>(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''),'UTF8')),'hex') AS hash FROM "${table}" t WHERE ${scope}`, originId);
    result[table] = row!.hash;
  }
  return result;
}
beforeAll(async () => {
  await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
  app = await createApp(db, originId, 'SHOP');
  admin = await shopToken(db, app, originId); manager = await shopToken(db, app, originId, 'MANAGER'); production = await shopToken(db, app, originId, 'PRODUCTION');
  const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
  const source = (await post('catalogue/supplier-setups', { supplier: { name: 'Reconciliation ' + originId }, location: { registryId: registry.id } }, randomUUID(), admin).expect(201)).body.source;
  const product = (await post('catalogue/product-setups', { sourceId: source.id, product: { name: 'Reconciliation notebook' }, variants: [] }, randomUUID(), admin).expect(201)).body;
  const receipt = (await post('receipts', { sourceId: source.id, deliveredOn: '2020-01-01', lines: [{ skuId: product.skus[0].id, usableQuantity: 4, damagedQuantity: 0, damageReason: '' }] }, randomUUID(), manager).expect(201)).body;
  const units = await db.stockUnit.findMany({ where: { receiptLineId: receipt.lines[0].id }, select: { id: true } });
  extraUnitId = units[3]!.id;
  checkoutBody = { reason: null, orderReference: 'Reusable-reconcile-A', lines: units.slice(0, 3).map(unit => ({ unitId: unit.id })) }; checkoutKey = randomUUID();
  checkout = (await post('checkouts', checkoutBody, checkoutKey, production).expect(201)).body;
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });

it('enforces Admin/Manager classification and operational review without leaking administration to Production', async () => {
  const body = { exceptionIds: [checkout.lines[0].exceptionId], reason: { code: 'SAMPLE' } };
  await get('checkout-reasons', admin).expect(200);
  await get('reason-reconciliation-config', admin).expect(200).expect(response => expect(response.body.canResolve).toBe(true));
  await post('reason-reconciliations', { ...body, exceptionIds: [] }, randomUUID(), admin).expect(400);
  for (const path of ['checkout-reasons', 'reason-reconciliation-config', 'reason-reconciliations/' + randomUUID()]) await get(path, production).expect(403);
  await post('reason-reconciliations', body, randomUUID(), production).expect(403);
  await request(app.getHttpServer()).post('/v1/reason-reconciliations').send(body).expect(401);
});

it('filters by original checkout date, employee, Unit Code, Order ID and exception status', async () => {
  const day = lagosDate(new Date(checkout.acceptedAt));
  const query = new URLSearchParams({ from: day, to: day, employeeId: checkout.actor.id, orderReference: 'Reusable-reconcile-A', unitCode: checkout.lines[0].unit.unitCode.toLowerCase() });
  const result = (await get('checkout-reasons?' + query).expect(200)).body;
  expect(result.total).toBe(1); expect(result.rows[0].exceptionId).toBe(checkout.lines[0].exceptionId);
  expect((await get('checkout-reasons?from=2020-01-01&to=2020-01-01').expect(200)).body.total).toBe(0);
  expect((await get('checkout-reasons?status=RESOLVED').expect(200)).body.total).toBe(0);
  await get('checkout-reasons?originId=' + originId).expect(400);
  await get('checkout-reasons?from=2026-02-02&to=2026-02-01').expect(400);
  const preview = (await post('checkout-reasons/preview', { exceptionIds: checkout.lines.map((line: any) => line.exceptionId) }).expect(200)).body;
  expect(preview.rows).toHaveLength(3);
  await post('checkout-reasons/preview', { exceptionIds: [checkout.lines[0].exceptionId] }, randomUUID(), production).expect(403);
});

it('classifies exact missing reasons once, preserves the original employee evidence and changes no stock record', async () => {
  const before = await stockFingerprint(), key = randomUUID();
  const body = { exceptionIds: checkout.lines.slice(0, 2).map((line: any) => line.exceptionId), reason: { code: 'PRODUCTION_USE' }, remarks: 'PRIVATE Manager supporting remark' };
  const responses = await Promise.all([post('reason-reconciliations', body, key), post('reason-reconciliations', { ...body, exceptionIds: [...body.exceptionIds].reverse() }, key)]);
  expect(responses.map(response => response.status)).toEqual([201, 201]); expect(responses[0]!.body).toEqual(responses[1]!.body);
  resolution = responses[0]!.body;
  expect(await stockFingerprint()).toEqual(before);
  expect(await db.reasonReconciliation.count({ where: { originId } })).toBe(1);
  expect(await db.checkoutReasonResolution.count({ where: { originId } })).toBe(2);
  await post('reason-reconciliations', { ...body, remarks: 'Changed' }, key).expect(409);
  await post('reason-reconciliations', body).expect(409);
  const live = (await get('checkouts/' + checkout.id, production).expect(200)).body;
  expect(live.initialMissingReasonCount).toBe(3); expect(live.outstandingReasonCount).toBe(1);
  expect(live.lines.every((line: any) => line.reason === null)).toBe(true);
  expect(live.lines.filter((line: any) => line.reconciliationStatus === 'RESOLVED')).toHaveLength(2);
  expect(live.exceptionStatusAsOf).toBeTruthy(); expect(JSON.stringify(live)).not.toContain('PRIVATE Manager');
  expect((await post('checkouts', checkoutBody, checkoutKey, production).expect(201)).body).toEqual(checkout);
  expect((await get('checkout-reasons?status=RESOLVED').expect(200)).body.total).toBe(2);
  expect((await get('checkout-reasons').expect(200)).body.total).toBe(1);
  expect((await get('reason-reconciliations/' + resolution.id, admin).expect(200)).body).toEqual(resolution);
  const operational = (await get(`units/${checkout.lines[0].unit.unitId}/tracking`, admin).expect(200)).body;
  expect(operational.timeline.events.map((event: { kind: string }) => event.kind)).toEqual(['RECEIVED', 'ISSUED', 'REASON_RECONCILED']);
  expect(operational.timeline.events[2]).toMatchObject({ managerRemarks: 'PRIVATE Manager supporting remark', checkoutId: checkout.id });
  const own = (await get(`units/${checkout.lines[0].unit.unitId}/tracking`, production).expect(200)).body;
  expect(own.timeline.events.map((event: { kind: string }) => event.kind)).toEqual(['ISSUED']);
  expect(JSON.stringify(own)).not.toContain('PRIVATE Manager');
});

it('rejects an invalid member atomically, forbids accepted evidence edits and permits one winning classification', async () => {
  const before = await stockFingerprint(), remaining = checkout.lines[2].exceptionId;
  await post('reason-reconciliations', { exceptionIds: [remaining, randomUUID()], reason: { code: 'SAMPLE' } }).expect(404);
  expect(await db.checkoutReasonResolution.count({ where: { originId } })).toBe(2);
  await expect(db.reasonReconciliation.update({ where: { id: resolution.id }, data: { remarks: 'Rewritten' } })).rejects.toThrow();
  const saved = await db.checkoutReasonResolution.findFirstOrThrow({ where: { reconciliationId: resolution.id } });
  await expect(db.checkoutReasonResolution.delete({ where: { id: saved.id } })).rejects.toThrow();
  await expect(db.checkoutReasonResolution.create({ data: { id: randomUUID(), originId, reconciliationId: resolution.id,
    exceptionId: remaining, checkoutId: checkout.id, checkoutLineId: checkout.lines[2].id, unitId: checkout.lines[2].unit.unitId } })).rejects.toThrow('An accepted reconciliation cannot be supplemented');
  const competing = await Promise.all([post('reason-reconciliations', { exceptionIds: [remaining], reason: { code: 'SAMPLE' } }),
    post('reason-reconciliations', { exceptionIds: [remaining], reason: { code: 'INTERNAL_USE' } })]);
  expect(competing.map(response => response.status).sort()).toEqual([201, 409]);
  expect(await stockFingerprint()).toEqual(before);
  expect((await get('checkouts/' + checkout.id, production).expect(200)).body.outstandingReasonCount).toBe(0);
});

it('rolls back prepared classifications, audit and origin sequence when outbox acceptance fails', async () => {
  const issued = (await post('checkouts', { reason: null, orderReference: 'Failure-reconcile', lines: [{ unitId: extraUnitId }] }, randomUUID(), production).expect(201)).body;
  const before = await stockFingerprint(), key = randomUUID();
  const sequence = (await db.originNode.findUniqueOrThrow({ where: { id: originId } })).nextSequence;
  const roots = await db.reasonReconciliation.count({ where: { originId } });
  const rows = await db.checkoutReasonResolution.count({ where: { originId } });
  const trigger = 'fixture_reason_fail_' + originId.replaceAll('-', '');
  await db.$executeRawUnsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW."originId"='${originId}'::uuid AND NEW."eventType"='production.reasons.reconciled' THEN RAISE EXCEPTION 'Synthetic classification outbox failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
  const body = { exceptionIds: [issued.lines[0].exceptionId], reason: { code: 'SAMPLE' } };
  try { await post('reason-reconciliations', body, key).expect(500); }
  finally { await db.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON "OutboxEvent"`); await db.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`); }
  expect(await stockFingerprint()).toEqual(before);
  expect((await db.originNode.findUniqueOrThrow({ where: { id: originId } })).nextSequence).toBe(sequence);
  expect(await db.reasonReconciliation.count({ where: { originId } })).toBe(roots);
  expect(await db.checkoutReasonResolution.count({ where: { originId } })).toBe(rows);
  expect(await db.commandResult.count({ where: { originId, key, commandType: 'production.reasons.reconcile' } })).toBe(0);
  expect(await db.outboxEvent.count({ where: { originId, originSequence: { gt: sequence } } })).toBe(0);
  expect((await get('checkouts/' + issued.id, production).expect(200)).body.outstandingReasonCount).toBe(1);
  await post('reason-reconciliations', body, key).expect(201);
  expect(await stockFingerprint()).toEqual(before);
});

it('classifies 500 exact obligations without creating another movement or changing their original checkout', async () => {
  const lot = await db.stockLot.findFirstOrThrow({ where: { originId } });
  const receipt = (await post('receipts', { sourceId: lot.sourceId, deliveredOn: '2020-01-01', lines: [{ skuId: lot.skuId, usableQuantity: 500, damagedQuantity: 0, damageReason: '' }] }).expect(201)).body;
  const units = await db.stockUnit.findMany({ where: { receiptLineId: receipt.lines[0].id }, select: { id: true } });
  const issued = (await post('checkouts', { reason: null, orderReference: 'Capacity-reconcile', lines: units.map(unit => ({ unitId: unit.id })) }, randomUUID(), production).expect(201)).body;
  const before = await stockFingerprint(), start = performance.now();
  const accepted = (await post('reason-reconciliations', { exceptionIds: issued.lines.map((line: any) => line.exceptionId), reason: { code: 'PRODUCTION_USE' }, remarks: 'Synthetic maximum-size classification' }).expect(201)).body;
  const elapsedMs = performance.now() - start;
  expect(accepted.lines).toHaveLength(500); expect(await stockFingerprint()).toEqual(before);
  expect((await get('checkouts/' + issued.id, production).expect(200)).body.outstandingReasonCount).toBe(0);
  await mkdir('artifacts/completion', { recursive: true });
  await writeFile('artifacts/completion/reconciliation-500-capacity.json', JSON.stringify({ syntheticOnly: true, exceptions: 500, elapsedMs, accepted: true,
    stockUnchanged: true, samples: 1, limitations: ['Development loopback sample only; not a production hardware certification'] }, null, 2));
}, 60_000);

it('denies cloud execution and rejects orphan classification roots at the database boundary', async () => {
  const actor = await db.user.findFirstOrThrow({ where: { role: 'MANAGER', membership: { originId } } });
  await expect(new ReconciliationService(db, originId, 'CLOUD').reconcile(actor, randomUUID(), {
    exceptionIds: [checkout.lines[0].exceptionId], reason: { code: 'SAMPLE' },
  })).rejects.toThrow('Classification writes belong to the shop');
  const manifest = [{ id: randomUUID(), exceptionId: checkout.lines[0].exceptionId, checkoutId: checkout.id,
    checkoutLineId: checkout.lines[0].id, unitId: checkout.lines[0].unit.unitId }];
  const canonicalManifest = canonical(manifest);
  await expect(db.$transaction(async tx => {
    await tx.reasonReconciliation.create({ data: { id: randomUUID(), originId, actorId: actor.id, actorRole: 'MANAGER', commandId: randomUUID(),
      recordedAt: new Date(), reasonCode: 'SAMPLE', reasonNote: '', remarks: '', exceptionCount: 1, manifest, canonicalManifest, manifestHash: digest(canonicalManifest) } });
    await tx.$executeRawUnsafe('SET CONSTRAINTS reason_reconciliation_complete IMMEDIATE');
  })).rejects.toThrow('Incomplete or stock-changing reason classification');
});

it('rejects actual foreign-shop exception and reconciliation identities', async () => {
  const foreignId = randomUUID(); await db.originNode.create({ data: { id: foreignId, mode: 'SHOP' } });
  const foreign = await createApp(db, foreignId, 'SHOP');
  try {
    const a = await shopToken(db, foreign, foreignId), m = await shopToken(db, foreign, foreignId, 'MANAGER');
    const send = (path: string, body: object, token = a) => request(foreign.getHttpServer()).post('/v1/' + path)
      .set('Authorization', 'Bearer ' + token).set('Idempotency-Key', randomUUID()).send(body);
    const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
    const source = (await send('catalogue/supplier-setups', { supplier: { name: 'Foreign reconciliation ' + foreignId }, location: { registryId: registry.id } }).expect(201)).body.source;
    const product = (await send('catalogue/product-setups', { sourceId: source.id, product: { name: 'Foreign notebook' }, variants: [] }).expect(201)).body;
    const receiver = await db.user.findFirstOrThrow({ where: { role: 'MANAGER', membership: { originId: foreignId } } });
    // Allocate the same human code initially in another origin; never rewrite an allocated identity.
    const receipt = await new ReceivingService(db, foreignId, 'SHOP', () => checkout.lines[0].unit.unitCode).create(receiver, randomUUID(), {
      sourceId: source.id, deliveredOn: '2020-01-01', lines: [{ skuId: product.skus[0].id, usableQuantity: 1, damagedQuantity: 0, damageReason: '' }],
    });
    const unit = await db.stockUnit.findFirstOrThrow({ where: { receiptLineId: receipt.lines[0]!.id } });
    const issued = (await send('checkouts', { reason: null, orderReference: null, lines: [{ unitId: unit.id }] }, m).expect(201)).body;
    const classified = (await send('reason-reconciliations', { exceptionIds: [issued.lines[0].exceptionId], reason: { code: 'SAMPLE' } }, m).expect(201)).body;
    await post('reason-reconciliations', { exceptionIds: [issued.lines[0].exceptionId], reason: { code: 'SAMPLE' } }).expect(404);
    await post('checkout-reasons/preview', { exceptionIds: [issued.lines[0].exceptionId] }).expect(404);
    await get('reason-reconciliations/' + classified.id).expect(404);
    const scoped = (await get('checkout-reasons?status=ALL&unitCode=' + unit.unitCode).expect(200)).body;
    expect(scoped.total).toBe(1);
    expect(scoped.rows[0].unit.unitId).toBe(checkout.lines[0].unit.unitId);
  } finally { await foreign.close(); }
});

it('allows Admin to reconcile exact obligations without changing original stock or granting other Manager commands', async () => {
 const lot=await db.stockLot.findFirstOrThrow({where:{originId}});
 const received=(await post('receipts',{sourceId:lot.sourceId,deliveredOn:'2020-01-01',lines:[{skuId:lot.skuId,usableQuantity:1,damagedQuantity:0,damageReason:''}]}).expect(201)).body;
 const unit=await db.stockUnit.findFirstOrThrow({where:{receiptLineId:received.lines[0].id}});
 const c=(await post('checkouts',{reason:null,orderReference:'Admin-reconcile',lines:[{unitId:unit.id}]},randomUUID(),production).expect(201)).body;
 const obligation=c.lines[0];
 const before=await stockFingerprint();
 const key=randomUUID(),body={exceptionIds:[obligation.exceptionId],reason:{code:'SAMPLE'}};
 const accepted=(await post('reason-reconciliations',body,key,admin).expect(201)).body;
 expect((await post('reason-reconciliations',body,key,admin).expect(201)).body).toEqual(accepted);
 expect(await stockFingerprint()).toEqual(before);
 expect((await db.reasonReconciliation.findUniqueOrThrow({where:{id:accepted.id}})).actorRole).toBe('ADMIN');
});
