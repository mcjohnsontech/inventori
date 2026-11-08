import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { shopToken } from './shop-fixture.js';
import { DamageService } from '../../apps/api/src/damage.service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw Error('Isolated test database required');
const db = database(url), originId = randomUUID();
let app: Awaited<ReturnType<typeof createApp>>, admin: string, manager: string, production: string, receipt: any, own: any, other: any;
let usable: { id: string; unitCode: string; lotId: string }[], intake: { id: string; unitCode: string; lotId: string }[], skuId: string, sourceId: string, accepted: any;
const post = (path: string, body: object, key = randomUUID(), token = manager) => request(app.getHttpServer()).post('/v1/' + path)
  .set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key).send(body);
const get = (path: string, token = manager) => request(app.getHttpServer()).get('/v1/' + path).set('Authorization', 'Bearer ' + token);
const body = (ids: string[]) => ({ unitIds: ids, cause: 'Torn cover', description: 'Cover torn while preparing this exact item' });
async function projection() { return db.stockBalance.findMany({ where: { lotId: { in: [...new Set([...usable, ...intake].map(unit => unit.lotId))] } }, orderBy: [{ lotId: 'asc' }, { state: 'asc' }] }); }
async function counts() {
  return Promise.all([db.damageReport.count({ where: { originId } }), db.damageLine.count({ where: { originId } }), db.damageReview.count({ where: { originId } }),
    db.stockTransaction.count({ where: { originId } }), db.unitEvent.count({ where: { originId } }), db.auditEvent.count({ where: { originId } }),
    db.outboxEvent.count({ where: { originId } }), db.commandResult.count({ where: { originId } }), db.originNode.findUniqueOrThrow({ where: { id: originId } }), projection()]);
}
beforeAll(async () => {
  await db.originNode.create({ data: { id: originId, mode: 'SHOP' } }); app = await createApp(db, originId, 'SHOP');
  admin = await shopToken(db, app, originId); manager = await shopToken(db, app, originId, 'MANAGER'); production = await shopToken(db, app, originId, 'PRODUCTION');
  const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
  sourceId = (await post('catalogue/supplier-setups', { supplier: { name: 'Damage ' + originId }, location: { registryId: registry.id } }, randomUUID(), admin).expect(201)).body.source.id;
  skuId = (await post('catalogue/product-setups', { sourceId, product: { name: 'Damage notebook' }, variants: [] }, randomUUID(), admin).expect(201)).body.skus[0].id;
  receipt = (await post('receipts', { sourceId, deliveredOn: '2020-01-01', invoiceReference: 'PRIVATE-DAMAGE-INVOICE', lines: [{ skuId, usableQuantity: 8, damagedQuantity: 3, damageReason: 'Damaged delivery packaging' }] }).expect(201)).body;
  usable = await db.stockUnit.findMany({ where: { receiptLineId: receipt.lines[0].id, initialState: 'U' }, select: { id: true, unitCode: true, lotId: true }, orderBy: { id: 'asc' } });
  intake = await db.stockUnit.findMany({ where: { receiptLineId: receipt.lines[0].id, initialState: 'D' }, select: { id: true, unitCode: true, lotId: true } });
  own = (await post('checkouts', { reason: null, orderReference: 'Damage Order', lines: usable.slice(0, 2).map(unit => ({ unitId: unit.id })) }, randomUUID(), production).expect(201)).body;
  other = (await post('checkouts', { reason: { code: 'PRODUCTION_USE' }, orderReference: null, lines: [{ unitId: usable[2]!.id }] }).expect(201)).body;
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });
it('enforces own-checkout Production scope and operational Manager/Admin scope before returning evidence', async () => {
  await request(app.getHttpServer()).post('/v1/damage-reports').send(body([usable[0]!.id])).expect(401);
  for (const id of [usable[2]!.id, usable[3]!.id, intake[0]!.id, randomUUID()]) {
    await post('damage-reports/preview', { unitIds: [id] }, randomUUID(), production).expect(404);
    await post('damage-reports', body([id]), randomUUID(), production).expect(404);
  }
  const selected = (await post('damage-reports/preview', { unitIds: [usable[0]!.id] }, randomUUID(), production).expect(200)).body.units[0];
  expect(selected.checkoutId).toBe(own.id); expect(selected.orderReference).toBe('Damage Order');
  expect(JSON.stringify(selected)).not.toMatch(/PRIVATE-DAMAGE-INVOICE|supplierName|sourceName|passwordHash|damageReason/);
  await post('damage-reviews/preview', { unitIds: [intake[0]!.id] }, randomUUID(), production).expect(403);
});
it('reports issued damage once without another usable deduction, preserves original issue and resolves historical reasons later', async () => {
  const before = await projection(), command = body([usable[0]!.id]), key = randomUUID();
  const results = await Promise.all([post('damage-reports', command, key, production), post('damage-reports', command, key, production)]);
  expect(results.map(result => result.status)).toEqual([201, 201]); expect(results[1]!.body).toEqual(results[0]!.body); accepted = results[0]!.body;
  expect(accepted.lines[0]).toMatchObject({ fromState: 'P', toState: 'D', checkoutId: own.id, checkoutLineId: own.lines[0].id, orderReference: 'Damage Order' });
  const balances = await projection();
  expect(balances.find(row => row.state === 'U')!.quantity).toBe(before.find(row => row.state === 'U')!.quantity);
  expect(balances.find(row => row.state === 'P')!.quantity).toBe(2n); expect(balances.find(row => row.state === 'D')!.quantity).toBe(4n);
  expect(await db.unitState.findUniqueOrThrow({ where: { unitId: usable[0]!.id } })).toMatchObject({ state: 'D', version: 3n, holderId: null });
  await post('damage-reports', { ...command, cause: 'Changed cause' }, key, production).expect(409);
  await post('damage-reports', command, randomUUID(), production).expect(404);
  await post('checkouts', { reason: null, orderReference: null, lines: [{ unitId: usable[0]!.id }] }, randomUUID(), production).expect(409);
  await post('reason-reconciliations', { exceptionIds: [own.lines[0].exceptionId], reason: { code: 'PRODUCTION_USE' } }).expect(201);
  expect((await get('checkouts/' + own.id, production).expect(200)).body.initialMissingReasonCount).toBe(2);
});
it('Admin reports pre-issue stock and Manager can report another worker issued unit, rejecting mixed ineligible selections atomically', async () => {
  await post('damage-reports', body([usable[3]!.id]), randomUUID(), admin).expect(201);
  const managerReport = (await post('damage-reports', body([usable[2]!.id])).expect(201)).body;
  expect(managerReport.lines[0]).toMatchObject({ checkoutId: other.id, fromState: 'P', toState: 'D' });
  const before = await counts(); await post('damage-reports', body([usable[4]!.id, usable[3]!.id])).expect(409); expect(await counts()).toEqual(before);
  expect((await db.unitState.findUniqueOrThrow({ where: { unitId: usable[4]!.id } })).state).toBe('U');
});
it('Manager Held/Reworked reviews change metadata only, while terminal disposition moves exact damaged stock to Removed', async () => {
  const review = { unitIds: [usable[0]!.id], outcome: 'HELD', note: 'Held pending a documented disposition decision' }, key = randomUUID();
  await post('damage-reviews', review, randomUUID(), admin).expect(403); await post('damage-reviews', review, randomUUID(), production).expect(403);
  const before = await projection(), states = await db.unitState.findMany({ where: { originId }, orderBy: { unitId: 'asc' } });
  const held = (await post('damage-reviews', review, key).expect(201)).body; expect(held.transactionId).toBeNull(); expect(held.lines[0].movementId).toBeNull();
  expect((await post('damage-reviews', review, key).expect(201)).body).toEqual(held);
  await post('damage-reviews', { ...review, outcome: 'REWORKED', note: 'Rework recorded but recovery is not authorized' }).expect(201);
  expect(await projection()).toEqual(before); expect(await db.unitState.findMany({ where: { originId }, orderBy: { unitId: 'asc' } })).toEqual(states);
  const removalKey = randomUUID(), removalInput = { unitIds: [usable[0]!.id, intake[0]!.id], outcome: 'RETURNED_TO_VENDOR', note: 'Both damaged items returned to the original vendor' };
  const removed = (await post('damage-reviews', removalInput, removalKey).expect(201)).body;
  expect((await post('damage-reviews', removalInput, removalKey).expect(201)).body).toEqual(removed);
  await post('damage-reviews', { ...removalInput, outcome: 'DISCARDED' }, removalKey).expect(409);
  expect(removed.lines.every((line: any) => line.fromState === 'D' && line.toState === 'X')).toBe(true);
  expect(removed.lines.find((line: any) => line.unit.unitId === usable[0]!.id).damageLineId).toBe(accepted.lines[0].id);
  expect(removed.lines.find((line: any) => line.unit.unitId === intake[0]!.id).damageLineId).toBeNull();
  const after = await projection(); expect(after.find(row => row.state === 'U')!.quantity).toBe(before.find(row => row.state === 'U')!.quantity); expect(after.find(row => row.state === 'X')!.quantity).toBe(2n);
  await post('damage-reviews', review).expect(409); await post('damage-reports', body([usable[0]!.id])).expect(409);
  const beforeMixed = await counts(); await post('damage-reviews', { ...removalInput, unitIds: [usable[0]!.id, intake[1]!.id] }).expect(409); expect(await counts()).toEqual(beforeMixed);
  await post('damage-reviews', { unitIds: [intake[1]!.id], outcome: 'DISCARDED', note: 'The damaged intake item was discarded after review' }).expect(201);
});
it('rolls back all prepared evidence, movements, states, balances, origin order and command on late failure', async () => {
  const name = 'damage_failure_' + originId.replaceAll('-', ''), fn = name + '_fn', before = await counts(), key = randomUUID();
  await db.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."originId"='${originId}'::uuid AND NEW.action='inventory.damage.reported' THEN RAISE EXCEPTION 'Synthetic BAD audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
  try { await post('damage-reports', body([usable[4]!.id, usable[5]!.id]), key).expect(500); expect(await counts()).toEqual(before); }
  finally { await db.$executeRawUnsafe(`DROP TRIGGER ${name} ON "AuditEvent"`); await db.$executeRawUnsafe(`DROP FUNCTION ${fn}()`); }
  await post('damage-reports', body([usable[4]!.id, usable[5]!.id]), key).expect(201);
});
it('rejects orphan/late/mutable damage evidence and unauthorized cloud stock writes', async () => {
  await expect(db.damageReport.update({ where: { id: accepted.id }, data: { cause: 'Rewrite' } })).rejects.toThrow();
  await expect(db.damageLine.delete({ where: { id: accepted.lines[0].id } })).rejects.toThrow();
  const line = await db.damageLine.findUniqueOrThrow({ where: { id: accepted.lines[0].id } });
  await expect(db.damageLine.create({ data: { ...line, snapshot: JSON.parse(JSON.stringify(line.snapshot)), id: randomUUID(), unitId: usable[6]!.id, movementId: randomUUID(), eventId: randomUUID() } })).rejects.toThrow();
  const cloud = await createApp(db, originId, 'CLOUD');
  try { await request(cloud.getHttpServer()).post('/v1/damage-reports').set('Authorization', 'Bearer ' + manager).set('Idempotency-Key', randomUUID()).send(body([usable[6]!.id])).expect(403); }
  finally { await cloud.close(); }
  const ownList = (await get('damage-reports', production).expect(200)).body;
  expect(ownList.total).toBe(1); expect(ownList.rows[0].id).toBe(accepted.id); await get('damage-reviews', production).expect(403);
  const managerOnly = await db.damageReport.findFirstOrThrow({ where: { originId, actorRole: 'MANAGER' } }); await get('damage-reports/' + managerOnly.id, production).expect(404);
});
it('isolates foreign origins and denies replay of an earlier privileged report after a role reduction', async () => {
  const foreignId = randomUUID(); await db.originNode.create({ data: { id: foreignId, mode: 'SHOP' } });
  const foreign = await createApp(db, foreignId, 'SHOP');
  try {
    const token = await shopToken(db, foreign, foreignId, 'MANAGER');
    await request(foreign.getHttpServer()).get('/v1/damage-reports/' + accepted.id).set('Authorization', 'Bearer ' + token).expect(404);
    await request(foreign.getHttpServer()).post('/v1/damage-reports/preview').set('Authorization', 'Bearer ' + token).send({ unitIds: [usable[1]!.id] }).expect(404);
  } finally { await foreign.close(); }
  const actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', membership: { originId } } });
  const service = new DamageService(db, originId, 'SHOP'), key = randomUUID(), input = body([usable[6]!.id]);
  const saved = await service.create(actor, key, input);
  // Isolated fixture deliberately changes the authoritative role; a fresh actor must not replay privileged evidence.
  try {
    const reduced = await db.user.update({ where: { id: actor.id }, data: { role: 'PRODUCTION', authVersion: { increment: 1 } } });
    await expect(service.create(reduced, key, input)).rejects.toMatchObject({ status: 403 });
    await expect(service.get(reduced, saved.id)).rejects.toMatchObject({ status: 404 });
  } finally { await db.user.update({ where: { id: actor.id }, data: { role: 'ADMIN', authVersion: { increment: 1 } } }); }
});
it('serializes competing damage/checkout commands and processes 500 exact units without partial acceptance', async () => {
  const result = await Promise.all([post('damage-reports', body([usable[7]!.id])), post('checkouts', { reason: { code: 'SAMPLE' }, orderReference: null, lines: [{ unitId: usable[7]!.id }] })]);
  expect(result[0]!.status).toBe(201); expect([201, 409]).toContain(result[1]!.status);
  // Checkout may validly commit first, followed by P-to-D. Either ordering ends damaged without a second usable deduction.
  expect((await db.unitState.findUniqueOrThrow({ where: { unitId: usable[7]!.id } })).state).toBe('D');
  const incoming = (await post('receipts', { sourceId, deliveredOn: '2020-01-01', lines: [{ skuId, usableQuantity: 500, damagedQuantity: 0, damageReason: '' }] }).expect(201)).body;
  const units = await db.stockUnit.findMany({ where: { receiptLineId: incoming.lines[0].id }, select: { id: true } });
  const start = performance.now(); const report = (await post('damage-reports', body(units.map(unit => unit.id))).expect(201)).body; const elapsedMs = performance.now() - start;
  expect(report.lines).toHaveLength(500); expect(await db.unitState.count({ where: { lotId: incoming.lines[0].lotId, state: 'D' } })).toBe(500);
  await mkdir('artifacts/completion', { recursive: true }); await writeFile('artifacts/completion/damage-500-capacity.json', JSON.stringify({ syntheticOnly: true, units: 500, elapsedMs, accepted: true, samples: 1, limitations: ['Development loopback only; not a production hardware certification'] }, null, 2));
});
it('preserves separate supplier SKUs and batch lots when one damage command spans shared-parent sources', async () => {
  const currentAdmin = await shopToken(db, app, originId), registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
  const source = (await post('catalogue/supplier-setups', { supplier: { name: 'Second damage supplier ' + originId }, location: { registryId: registry.id } }, randomUUID(), currentAdmin).expect(201)).body.source;
  const original = await db.supplierVariantSku.findUniqueOrThrow({ where: { id: skuId } });
  const sourced = (await post('catalogue/product-setups', { sourceId: source.id, product: { id: original.productId }, variants: [{ variantId: original.variantId, suffix: 'STD' }] }, randomUUID(), currentAdmin).expect(201)).body.skus[0];
  expect(sourced.fullCode).not.toBe(original.fullCode);
  const deliveries = [];
  for (const entry of [{ sourceId, skuId }, { sourceId: source.id, skuId: sourced.id }]) deliveries.push((await post('receipts', {
    sourceId: entry.sourceId, deliveredOn: '2020-01-01', lines: [{ skuId: entry.skuId, usableQuantity: 1, damagedQuantity: 0, damageReason: '' }],
  }).expect(201)).body);
  const units = await db.stockUnit.findMany({ where: { receiptLineId: { in: deliveries.map(row => row.lines[0].id) } } });
  await post('checkouts', { reason: { code: 'SAMPLE' }, orderReference: 'Shared product damage', lines: [{ unitId: units[0]!.id }] }).expect(201);
  const result = (await post('damage-reports', body(units.map(unit => unit.id))).expect(201)).body;
  expect(new Set(result.lines.map((line: any) => line.unit.skuId)).size).toBe(2); expect(new Set(result.lines.map((line: any) => line.unit.batchId)).size).toBe(2);
  expect(result.lines.every((line: any) => line.unit.productId === original.productId)).toBe(true);
  const movement = await db.stockMovement.findMany({ where: { transactionId: result.transactionId } }); expect(movement).toHaveLength(2);
  expect(movement.map(row => row.fromState).sort()).toEqual(['P', 'U']);
  await post('damage-reviews', { unitIds: units.map(unit => unit.id), outcome: 'DISCARDED', note: 'Both damaged units discarded after separate source review' }).expect(201);
  for (const unit of units) {
    const balances = await db.stockBalance.findMany({ where: { lotId: unit.lotId } });
    expect(balances.find(row => row.state === 'X')!.quantity).toBe(1n); expect(balances.filter(row => row.state !== 'X').every(row => row.quantity === 0n)).toBe(true);
  }
  expect(await db.supplierVariantSku.findUniqueOrThrow({ where: { id: skuId } })).toEqual(original);
});
