import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { shopToken } from './shop-fixture.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw Error('Isolated fixture required');
const db = database(url), originId = randomUUID(), reason = 'Manager requests investigation of the recorded discrepancy', evidence = 'Physical observation and original receipt evidence reviewed';
let app: Awaited<ReturnType<typeof createApp>>, admin: string, manager: string, production: string, sourceId: string, skuId: string, lotId: string, accepted: any;
let usable: { id: string }[], damaged: { id: string }[], badUnit: string;
const post = (path: string, body: object, key = randomUUID(), token = manager) => request(app.getHttpServer()).post('/v1/' + path).set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key).send(body);
const get = (path: string, token = manager) => request(app.getHttpServer()).get('/v1/' + path).set('Authorization', 'Bearer ' + token);
const recovery = (ids: string[]) => ({ kind: 'RECOVERY', unitIds: ids, reason, evidence });
async function correction(observedQuantity: string, state = 'U') {
  const target = (await post('authorization-requests/preview', { kind: 'CORRECTION', lotId, state }).expect(200)).body.target;
  return { kind: 'CORRECTION', lotId, state, observedQuantity, reviewedLedgerQuantity: target.ledgerQuantity, reviewedProjectionQuantity: target.projectionQuantity, reason, evidence };
}
async function stock() {
  const result: Record<string, string> = {};
  for (const table of ['StockUnit', 'UnitState', 'UnitEvent', 'StockTransaction', 'StockMovement', 'StockBalance', 'Receipt', 'ReceiptLine', 'DeliveryBatch', 'StockLot', 'Checkout', 'CheckoutLine', 'CheckoutException', 'DamageReport', 'DamageLine', 'DamageReview', 'DamageReviewLine', 'UnitObservation', 'UnitLabelJob']) {
    const scope = table === 'StockBalance' ? `t."lotId" IN (SELECT id FROM "StockLot" WHERE "originId"=$1::uuid)`
      : ['StockMovement', 'Receipt', 'ReceiptLine'].includes(table) ? `t."batchId" IN (SELECT id FROM "DeliveryBatch" WHERE "originId"=$1::uuid)` : `t."originId"=$1::uuid`;
    const [row] = await db.$queryRawUnsafe<{ hash: string }[]>(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''),'UTF8')),'hex') AS hash FROM "${table}" t WHERE ${scope}`, originId);
    result[table] = row!.hash;
  }
  return result;
}
async function metadata() { return Promise.all([db.authorizationRequest.count({ where: { originId } }), db.authorizationRequestUnit.count({ where: { originId } }), db.auditEvent.count({ where: { originId } }), db.outboxEvent.count({ where: { originId } }), db.commandResult.count({ where: { originId } }), db.originNode.findUniqueOrThrow({ where: { id: originId } })]); }
beforeAll(async () => {
  await db.originNode.create({ data: { id: originId, mode: 'SHOP' } }); app = await createApp(db, originId, 'SHOP');
  admin = await shopToken(db, app, originId); manager = await shopToken(db, app, originId, 'MANAGER'); production = await shopToken(db, app, originId, 'PRODUCTION');
  const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
  sourceId = (await post('catalogue/supplier-setups', { supplier: { name: 'Pending requests ' + originId }, location: { registryId: registry.id } }, randomUUID(), admin).expect(201)).body.source.id;
  skuId = (await post('catalogue/product-setups', { sourceId, product: { name: 'Pending request notebook' }, variants: [] }, randomUUID(), admin).expect(201)).body.skus[0].id;
  const receipt = (await post('receipts', { sourceId, deliveredOn: '2020-01-01', lines: [{ skuId, usableQuantity: 6, damagedQuantity: 2, damageReason: 'Damaged arrival evidence' }] }).expect(201)).body; lotId = receipt.lines[0].lotId;
  usable = await db.stockUnit.findMany({ where: { lotId, initialState: 'U' }, select: { id: true }, orderBy: { id: 'asc' } });
  damaged = await db.stockUnit.findMany({ where: { lotId, initialState: 'D' }, select: { id: true }, orderBy: { id: 'asc' } });
  badUnit = usable[0]!.id;
  await post('checkouts', { reason: { code: 'SAMPLE' }, orderReference: 'Request evidence order', lines: [{ unitId: badUnit }] }, randomUUID(), production).expect(201);
  await post('damage-reports', { unitIds: [badUnit], cause: 'Torn cover', description: 'The cover tore after issue during preparation' }, randomUUID(), production).expect(201);
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });
it('enforces Manager submission, operational review and no Production administration', async () => {
  const body = recovery([damaged[0]!.id]);
  await request(app.getHttpServer()).post('/v1/authorization-requests').send(body).expect(401);
  await post('authorization-requests', body, randomUUID(), admin).expect(403); await post('authorization-requests', body, randomUUID(), production).expect(403);
  for (const path of ['authorization-request-config', 'authorization-requests']) await get(path, production).expect(403);
  await post('authorization-requests/preview', { kind: 'RECOVERY', unitIds: [damaged[0]!.id] }, randomUUID(), production).expect(403);
  expect((await get('authorization-request-config', admin).expect(200)).body).toMatchObject({ canSubmit: false, executionEnabled: false, approvalDelivery: 'DEFERRED' });
});
it('records exact BAD/intake recovery evidence with concurrent canonical replay and zero stock effects', async () => {
  const before = await stock(), body = recovery([badUnit, damaged[0]!.id]), key = randomUUID();
  const results = await Promise.all([post('authorization-requests', body, key), post('authorization-requests', { ...body, unitIds: [...body.unitIds].reverse() }, key)]);
  expect(results.map(row => row.status)).toEqual([201, 201]); expect(results[0]!.body).toEqual(results[1]!.body); accepted = results[0]!.body;
  expect(accepted).toMatchObject({ status: 'PENDING_CLOUD_AUTHORIZATION', stockChanged: false, approvalDelivery: 'DEFERRED', requestedDelta: null });
  expect(accepted.preview.units.find((row: any) => row.unit.unitId === badUnit)).toMatchObject({ state: 'D', recordedVersion: '3' });
  expect(accepted.preview.units.find((row: any) => row.unit.unitId === badUnit).damageLineId).toBeTruthy();
  expect(accepted.preview.units.find((row: any) => row.unit.unitId === damaged[0]!.id).damageLineId).toBeNull();
  await post('authorization-requests', { ...body, evidence: 'Different supporting evidence for this request' }, key).expect(409);
  expect((await get('authorization-requests/' + accepted.id, admin).expect(200)).body).toEqual(accepted);
  const operational = (await get(`units/${badUnit}/tracking`).expect(200)).body;
  expect(operational.timeline.events.some((row: any) => row.kind === 'RECOVERY_REQUESTED' && row.requestId === accepted.id)).toBe(true);
  const ownHistory = (await get(`units/${badUnit}/tracking`, production).expect(200)).body;
  expect(ownHistory.timeline.events.some((row: any) => row.kind === 'RECOVERY_REQUESTED')).toBe(false);
  expect(JSON.stringify(ownHistory)).not.toContain(evidence);
  expect(await stock()).toEqual(before);
});
it('captures server ledger/projection values and signed discrepancy without creating excess units or corrections', async () => {
  const before = await stock(), fewer = await correction('4'), more = await correction('9');
  const first = (await post('authorization-requests', fewer).expect(201)).body, second = (await post('authorization-requests', more).expect(201)).body;
  expect(first.requestedDelta).toBe('-1'); expect(second.requestedDelta).toBe('4');
  expect(first.preview.target).toMatchObject({ lotId, ledgerQuantity: '5', projectionQuantity: '5', state: 'U' });
  expect(second.status).toBe('PENDING_CLOUD_AUTHORIZATION'); expect(await stock()).toEqual(before);
  await post('authorization-requests', await correction('5')).expect(400);
  await post('authorization-requests', { ...fewer, state: 'E' }).expect(400);
  await post('authorization-requests', { ...fewer, observedQuantity: '-1' }).expect(400);
});
it('rejects stale quantity review and invalid recovery selections atomically', async () => {
  const stale = await correction('3');
  await post('checkouts', { reason: { code: 'INTERNAL_USE' }, orderReference: null, lines: [{ unitId: usable[1]!.id }] }).expect(201);
  const before = await stock(), meta = await metadata(); await post('authorization-requests', stale).expect(409);
  for (const ids of [[damaged[0]!.id, usable[2]!.id], [randomUUID()], [badUnit, badUnit]]) await post('authorization-requests', recovery(ids)).expect(ids[0] === ids[1] ? 400 : ids.length === 1 ? 404 : 409);
  expect(await stock()).toEqual(before); expect(await metadata()).toEqual(meta);
  expect((await post('authorization-requests', await correction('3')).expect(201)).body.requestedDelta).toBe('-1');
});
it('rolls back prepared request/children, sequence, audit, outbox and result on late failure', async () => {
  const fn = 'request_failure_' + originId.replaceAll('-', ''), trigger = fn + '_trigger', before = await stock(), meta = await metadata(), key = randomUUID(), body = recovery([damaged[1]!.id]);
  await db.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."originId"='${originId}'::uuid AND NEW."eventType"='inventory.authorization.requested' THEN RAISE EXCEPTION 'Synthetic pending-request outbox failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
  try { await post('authorization-requests', body, key).expect(500); expect(await metadata()).toEqual(meta); expect(await stock()).toEqual(before); }
  finally { await db.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON "OutboxEvent"`); await db.$executeRawUnsafe(`DROP FUNCTION ${fn}()`); }
  await post('authorization-requests', body, key).expect(201); expect(await stock()).toEqual(before);
});
it('has immutable pending history and no local approval, rejection, execution or cloud substitute', async () => {
  await expect(db.authorizationRequest.update({ where: { id: accepted.id }, data: { status: 'APPROVED' } })).rejects.toThrow();
  await expect(db.authorizationRequest.delete({ where: { id: accepted.id } })).rejects.toThrow();
  const line = await db.authorizationRequestUnit.findFirstOrThrow({ where: { requestId: accepted.id } });
  await expect(db.authorizationRequestUnit.delete({ where: { id: line.id } })).rejects.toThrow();
  await expect(db.authorizationRequestUnit.create({ data: { ...line, id: randomUUID(), unitId: damaged[1]!.id, snapshot: JSON.parse(JSON.stringify(line.snapshot)) } })).rejects.toThrow();
  const before = await stock();
  for (const suffix of ['approve', 'reject', 'execute', 'authorize']) await post(`authorization-requests/${accepted.id}/${suffix}`, {}, randomUUID(), admin).expect(404);
  const cloud = await createApp(db, originId, 'CLOUD');
  try { await request(cloud.getHttpServer()).post('/v1/authorization-requests').set('Authorization', 'Bearer ' + manager).set('Idempotency-Key', randomUUID()).send(recovery([damaged[0]!.id])).expect(403); }
  finally { await cloud.close(); }
  expect(await stock()).toEqual(before);
});
it('preserves the original pending request after later legitimate disposition and replays without recovery', async () => {
  const key = randomUUID(), body = recovery([damaged[1]!.id]), result = (await post('authorization-requests', body, key).expect(201)).body;
  await post('damage-reviews', { unitIds: [damaged[1]!.id], outcome: 'DISCARDED', note: 'Damaged item discarded after inspection, not recovered' }).expect(201);
  const before = await stock(); expect((await post('authorization-requests', body, key).expect(201)).body).toEqual(result);
  expect((await get('authorization-requests/' + result.id).expect(200)).body.status).toBe('PENDING_CLOUD_AUTHORIZATION');
  await post('authorization-requests', body).expect(409); expect(await stock()).toEqual(before);
});
it('isolates origins and paginates/filter requests without exposing other shops', async () => {
  const foreignId = randomUUID(); await db.originNode.create({ data: { id: foreignId, mode: 'SHOP' } }); const foreign = await createApp(db, foreignId, 'SHOP');
  try {
    const token = await shopToken(db, foreign, foreignId, 'MANAGER');
    await request(foreign.getHttpServer()).get('/v1/authorization-requests/' + accepted.id).set('Authorization', 'Bearer ' + token).expect(404);
    await request(foreign.getHttpServer()).post('/v1/authorization-requests/preview').set('Authorization', 'Bearer ' + token).send({ kind: 'CORRECTION', lotId, state: 'U' }).expect(404);
  } finally { await foreign.close(); }
  for (let index = 0; index < 21; index++) await post('authorization-requests', recovery([damaged[0]!.id])).expect(201);
  const first = (await get('authorization-requests?kind=RECOVERY').expect(200)).body, second = (await get('authorization-requests?kind=RECOVERY&page=2').expect(200)).body;
  expect(first.rows).toHaveLength(20); expect(second.rows.length).toBeGreaterThan(0); expect(second.total).toBe(first.total);
  expect(first.rows.every((row: any) => row.kind === 'RECOVERY' && row.status === 'PENDING_CLOUD_AUTHORIZATION')).toBe(true);
  expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(first.total);
});
it('records a 500-unit recovery request without changing a single unit or stock quantity', async () => {
  const receipt = (await post('receipts', { sourceId, deliveredOn: '2020-01-01', lines: [{ skuId, usableQuantity: 0, damagedQuantity: 500, damageReason: 'Synthetic damaged intake for request benchmark' }] }).expect(201)).body;
  const units = await db.stockUnit.findMany({ where: { receiptLineId: receipt.lines[0].id }, select: { id: true } }), before = await stock(), start = performance.now();
  const result = (await post('authorization-requests', recovery(units.map(unit => unit.id))).expect(201)).body, elapsedMs = performance.now() - start;
  expect(result.preview.units).toHaveLength(500); expect(await stock()).toEqual(before);
  await mkdir('artifacts/completion', { recursive: true }); await writeFile('artifacts/completion/pending-request-500-capacity.json', JSON.stringify({ syntheticOnly: true, units: 500, elapsedMs, accepted: true, stockUnchanged: true, samples: 1, limitations: ['Development loopback only; not production hardware certification'] }, null, 2));
});
