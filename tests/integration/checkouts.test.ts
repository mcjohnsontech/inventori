import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { CheckoutsService } from '../../apps/api/src/checkouts.service.js';
import { shopToken } from './shop-fixture.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw Error('Isolated test database required');
const db = database(url), originId = randomUUID();
let app: Awaited<ReturnType<typeof createApp>>, admin: string, manager: string, production: string, units: { id: string; lotId: string }[], damaged: string;
const post = (path: string, body: object, key = randomUUID(), token = admin) => request(app.getHttpServer())
  .post('/v1/' + path).set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key).send(body);
beforeAll(async () => {
  await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
  app = await createApp(db, originId, 'SHOP');
  admin = await shopToken(db, app, originId); manager = await shopToken(db, app, originId, 'MANAGER'); production = await shopToken(db, app, originId, 'PRODUCTION');
  const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
  const source = (await post('catalogue/supplier-setups', { supplier: { name: 'Checkout ' + originId }, location: { registryId: registry.id } }).expect(201)).body.source;
  const product = (await post('catalogue/product-setups', { sourceId: source.id, product: { name: 'Checkout notebook' }, variants: [] }).expect(201)).body;
  await post('receipts', { sourceId: source.id, deliveredOn: '2020-01-01', invoiceReference: 'PRIVATE-INVOICE', lines: [
    { skuId: product.skus[0].id, usableQuantity: 8, damagedQuantity: 1, damageReason: 'Damaged in delivery transit' },
  ] }).expect(201);
  units = await db.stockUnit.findMany({ where: { originId, initialState: 'U' }, select: { id: true, lotId: true }, orderBy: { id: 'asc' } });
  damaged = (await db.stockUnit.findFirstOrThrow({ where: { originId, initialState: 'D' } })).id;
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });

it('confirms exact units once, preserves explicit missing reasons and atomically records U to P', async () => {
  const key = randomUUID(), body = { reason: { code: 'PRODUCTION_USE' }, orderReference: 'Order-A', lines: [
    { unitId: units[0]!.id }, { unitId: units[1]!.id, reason: null, orderReference: null },
  ] };
  const accepted = (await post('checkouts', body, key, production).expect(201)).body;
  expect(accepted.totalUnits).toBe(2); expect(accepted.initialMissingReasonCount).toBe(1);
  expect(accepted.lines[0]).toMatchObject({ reasonInherited: true, orderReference: 'Order-A' });
  expect(accepted.lines[1]).toMatchObject({ reason: null, orderReference: null, initiallyMissingReason: true });
  const replay = (await post('checkouts', body, key, production).expect(201)).body;
  expect(replay).toEqual(accepted);
  await post('checkouts', { ...body, orderReference: 'Changed' }, key, production).expect(409);
  expect(await db.checkout.count({ where: { originId } })).toBe(1);
  expect(await db.checkoutException.count({ where: { originId } })).toBe(1);
  const state = await db.unitState.findUniqueOrThrow({ where: { unitId: units[0]!.id } });
  expect(state).toMatchObject({ state: 'P', condition: 'USABLE', custody: 'ISSUED_TO_STAFF', version: 2n });
  expect((await db.stockBalance.findUniqueOrThrow({ where: { lotId_state: { lotId: units[0]!.lotId, state: 'U' } } })).quantity).toBe(6n);
  expect((await db.stockBalance.findUniqueOrThrow({ where: { lotId_state: { lotId: units[0]!.lotId, state: 'P' } } })).quantity).toBe(2n);
  expect(JSON.stringify(accepted)).not.toMatch(/supplierName|invoiceReference|damageReason|damagedQuantity/);
});

it('rejects one unavailable member without checking out any other selected unit', async () => {
  await post('checkouts', { reason: null, orderReference: null, lines: [{ unitId: units[2]!.id }, { unitId: damaged }] }).expect(409);
  expect((await db.unitState.findUniqueOrThrow({ where: { unitId: units[2]!.id } })).state).toBe('U');
  expect(await db.checkout.count({ where: { originId } })).toBe(1);
});

it('serializes concurrent replay and rejects competing new commands for one physical unit', async () => {
  const key = randomUUID(), body = { reason: { code: 'SAMPLE' }, orderReference: 'Order-A', lines: [{ unitId: units[3]!.id }] };
  const same = await Promise.all([post('checkouts', body, key), post('checkouts', body, key)]);
  expect(same.map(result => result.status)).toEqual([201, 201]); expect(same[0]!.body).toEqual(same[1]!.body);
  const other = { ...body, lines: [{ unitId: units[4]!.id }] };
  const competing = await Promise.all([post('checkouts', other), post('checkouts', other)]);
  expect(competing.map(result => result.status).sort()).toEqual([201, 409]);
  expect(await db.unitEvent.count({ where: { unitId: units[4]!.id, kind: 'ISSUED' } })).toBe(1);
});

it('keeps Production reads scoped to its own checkouts and denies unknown or foreign identities', async () => {
  const get = (path: string, token: string) => request(app.getHttpServer()).get('/v1/' + path).set('Authorization', 'Bearer ' + token);
  const all = (await get('checkouts', admin).expect(200)).body;
  const own = (await get('checkouts', production).expect(200)).body;
  expect(all.total).toBe(3); expect(own.total).toBe(1);
  const tracking = (await get(`units/${units[0]!.id}/tracking`, production).expect(200)).body;
  expect(tracking.historyScope).toBe('OWN_ACTIVITY');
  expect(tracking.timeline.events.map((event: { kind: string }) => event.kind)).toEqual(['ISSUED']);
  expect(tracking.timeline.events[0]).toMatchObject({ orderReference: 'Order-A', reasonCode: 'PRODUCTION_USE' });
  expect(JSON.stringify(tracking)).not.toMatch(/PRIVATE-INVOICE|supplierName|initialCondition|receiptId|LABEL_REQUESTED|RECEIVED/);
  const adminCheckout = await db.checkout.findFirstOrThrow({ where: { originId, actorRole: 'ADMIN' } });
  await get('checkouts/' + adminCheckout.id, production).expect(404);
  await get('checkouts?originId=' + originId, production).expect(400);
  await get('checkouts?orderReference=Order-A', production).expect(200);
  await post('checkouts/preview', { unitIds: [randomUUID()] }, randomUUID(), production).expect(404);
  await request(app.getHttpServer()).post('/v1/checkouts').send({}).expect(401);
  const actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', membership: { originId } } });
  await expect(new CheckoutsService(db, originId, 'CLOUD').create(actor, randomUUID(), {
    reason: null, orderReference: null, lines: [{ unitId: units[2]!.id }],
  })).rejects.toThrow('Stock writes belong to the shop');
  const unassigned = { ...actor, id: randomUUID() };
  await expect(new CheckoutsService(db, originId, 'SHOP').create(unassigned, randomUUID(), {
    reason: null, orderReference: null, lines: [{ unitId: units[2]!.id }],
  })).rejects.toThrow();
});

it('rolls back prepared movements, projections, exceptions, sequence and command when audit acceptance fails', async () => {
  const sequence = (await db.originNode.findUniqueOrThrow({ where: { id: originId } })).nextSequence;
  const key = randomUUID();
  const before = await db.stockBalance.findMany({ where: { lotId: units[0]!.lotId }, orderBy: { state: 'asc' } });
  const trigger = 'fixture_fail_checkout_' + originId.replaceAll('-', '');
  await db.$executeRawUnsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW."originId"='${originId}'::uuid AND NEW.action='inventory.checkout.accepted' THEN RAISE EXCEPTION 'Synthetic checkout audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
  try {
    await post('checkouts', { reason: null, orderReference: null, lines: [{ unitId: units[5]!.id }, { unitId: units[6]!.id }] }, key).expect(500);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON "AuditEvent"`);
    await db.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
  }
  expect((await db.originNode.findUniqueOrThrow({ where: { id: originId } })).nextSequence).toBe(sequence);
  expect(await db.stockBalance.findMany({ where: { lotId: units[0]!.lotId }, orderBy: { state: 'asc' } })).toEqual(before);
  expect(await db.checkout.count({ where: { originId } })).toBe(3);
  expect(await db.commandResult.count({ where: { originId, commandType: 'production.checkouts.create', key } })).toBe(0);
  expect(await db.outboxEvent.count({ where: { originId, originSequence: { gt: sequence } } })).toBe(0);
  expect(await db.unitEvent.count({ where: { unitId: { in: [units[5]!.id, units[6]!.id] }, kind: 'ISSUED' } })).toBe(0);
  expect((await db.unitState.findUniqueOrThrow({ where: { unitId: units[5]!.id } })).state).toBe('U');
});

it('enforces immutable accepted evidence, no late lines, nonnegative balances and event-backed unit state', async () => {
  const checkout = await db.checkout.findFirstOrThrow({ where: { originId } });
  const line = await db.checkoutLine.findFirstOrThrow({ where: { checkoutId: checkout.id } });
  await expect(db.checkout.update({ where: { id: checkout.id }, data: { orderReference: 'Rewritten' } })).rejects.toThrow();
  await expect(db.checkoutLine.delete({ where: { id: line.id } })).rejects.toThrow();
  await expect(db.unitEvent.delete({ where: { id: line.eventId } })).rejects.toThrow();
  await expect(db.unitState.update({ where: { unitId: line.unitId }, data: { state: 'U', custody: 'SHOP_STORAGE', holderId: null } })).rejects.toThrow();
  await expect(db.stockBalance.update({ where: { lotId_state: { lotId: line.lotId, state: 'U' } }, data: { quantity: -1n } })).rejects.toThrow();
  await expect(db.checkoutLine.create({ data: { id: randomUUID(), checkoutId: checkout.id, originId, ordinal: 500,
    unitId: units[7]!.id, lotId: line.lotId, skuId: line.skuId, batchId: line.batchId, movementId: randomUUID(), eventId: randomUUID(),
    reasonCode: null, reasonNote: '', orderReference: null, reasonInherited: false, orderInherited: false, snapshot: {} } })).rejects.toThrow();
  expect(await db.checkoutLine.count({ where: { checkoutId: checkout.id } })).toBe(checkout.unitCount);
  const transaction = await db.stockTransaction.findUniqueOrThrow({ where: { id: checkout.transactionId } });
  await expect(db.$transaction(async tx => {
    await tx.stockTransaction.create({ data: { id: randomUUID(), batchId: null, originId, commandId: randomUUID(),
      originSequence: transaction.originSequence + 100000n, type: 'ISSUE', actorId: transaction.actorId,
      actorRole: transaction.actorRole, recordedAt: new Date() } });
    await tx.$executeRawUnsafe('SET CONSTRAINTS issue_transaction_complete IMMEDIATE');
  })).rejects.toThrow('Issue requires its complete exact-unit checkout');
});

it('checks out a mixed supplier and multi-batch selection without changing sourcing or intake identities', async () => {
  const originalLot = await db.stockLot.findUniqueOrThrow({ where: { id: units[0]!.lotId } });
  const originalSku = await db.supplierVariantSku.findUniqueOrThrow({ where: { id: originalLot.skuId } });
  const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
  const source = (await post('catalogue/supplier-setups', { supplier: { name: 'Other checkout supplier ' + originId }, location: { registryId: registry.id } }).expect(201)).body.source;
  const product = (await post('catalogue/product-setups', { sourceId: source.id, product: { id: originalSku.productId }, variants: [{ variantId: originalSku.variantId, suffix: 'STD' }] }).expect(201)).body;
  const second = (await post('receipts', { sourceId: source.id, deliveredOn: '2020-01-01', lines: [{ skuId: product.skus[0].id, usableQuantity: 1, damagedQuantity: 0, damageReason: '' }] }).expect(201)).body;
  const newUnit = await db.stockUnit.findFirstOrThrow({ where: { originId, receiptLineId: second.lines[0].id } });
  const accepted = (await post('checkouts', { reason: { code: 'INTERNAL_USE' }, orderReference: 'Order-A', lines: [{ unitId: units[7]!.id }, { unitId: newUnit.id }] }).expect(201)).body;
  expect(new Set(accepted.lines.map((line: any) => line.unit.batchId)).size).toBe(2);
  expect(new Set(accepted.lines.map((line: any) => line.unit.skuId)).size).toBe(2);
  expect(new Set(accepted.lines.map((line: any) => line.unit.productId)).size).toBe(1);
  expect((await db.supplierVariantSku.findUniqueOrThrow({ where: { id: originalSku.id } })).fullCode).toBe(originalSku.fullCode);
});

it('accepts a bounded 500-unit confirmation atomically and records its development timing', async () => {
  const lot = await db.stockLot.findUniqueOrThrow({ where: { id: units[0]!.lotId } });
  const receipt = (await post('receipts', { sourceId: lot.sourceId, deliveredOn: '2020-01-01', lines: [{ skuId: lot.skuId, usableQuantity: 500, damagedQuantity: 0, damageReason: '' }] }).expect(201)).body;
  const selected = await db.stockUnit.findMany({ where: { receiptLineId: receipt.lines[0].id }, select: { id: true } });
  expect(selected).toHaveLength(500);
  const start = performance.now();
  const response = await post('checkouts', { reason: { code: 'PRODUCTION_USE' }, orderReference: null, lines: selected.map(unit => ({ unitId: unit.id })) }).expect(201);
  const elapsedMs = performance.now() - start;
  expect(response.body.totalUnits).toBe(500);
  expect(await db.checkoutLine.count({ where: { checkoutId: response.body.id } })).toBe(500);
  expect((await db.stockBalance.findUniqueOrThrow({ where: { lotId_state: { lotId: receipt.lines[0].lotId, state: 'U' } } })).quantity).toBe(0n);
  await mkdir('artifacts/completion', { recursive: true });
  await writeFile('artifacts/completion/checkout-500-capacity.json', JSON.stringify({ syntheticOnly: true, selectedUnits: 500, elapsedMs, accepted: true, samples: 1,
    limitations: ['Development loopback sample, not production hardware or mixed-lot maximum certification', 'Existing 15-second transaction limit unchanged'] }, null, 2));
}, 60_000);

it('allows Inventory Manager confirmation under the same exact-unit rules', async () => {
  const accepted = (await post('checkouts', { reason: { code: 'OTHER', note: 'Prepared for an internal display' }, orderReference: 'Order-A',
    lines: [{ unitId: units[2]!.id }] }, randomUUID(), manager).expect(201)).body;
  expect(accepted.actor.role).toBe('MANAGER'); expect(accepted.totalUnits).toBe(1);
  expect(accepted.outstandingReasonCount).toBe(0);
  expect(accepted.lines[0].unit.unitId).toBe(units[2]!.id);
  expect((await db.unitState.findUniqueOrThrow({ where: { unitId: units[2]!.id } })).state).toBe('P');
});
