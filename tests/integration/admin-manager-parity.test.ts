// Owner decision, 24 November 2026 (docs/decisions.md): Admin may do everything an
// Inventory Manager may do. These checks run real Admin commands end to end so the
// API and the migration 034 database guards are both exercised.
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import { lagosDate } from '@dayari/contracts';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { shopToken } from './shop-fixture.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw Error('Isolated test database required');
const db = database(url), originId = randomUUID(), day = lagosDate(new Date());
let app: Awaited<ReturnType<typeof createApp>>, admin: string, production: string, lotId: string, units: { id: string }[];
const post = (path: string, body: object, token: string, key = randomUUID()) => request(app.getHttpServer()).post('/v1/' + path).set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key).send(body);
const get = (path: string, token: string) => request(app.getHttpServer()).get('/v1/' + path).set('Authorization', 'Bearer ' + token);

beforeAll(async () => {
  await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
  app = await createApp(db, originId, 'SHOP');
  admin = await shopToken(db, app, originId);
  production = await shopToken(db, app, originId, 'PRODUCTION');
  const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
  const source = (await post('catalogue/supplier-setups', { supplier: { name: 'Parity ' + originId }, location: { registryId: registry.id } }, admin).expect(201)).body.source.id;
  const sku = (await post('catalogue/product-setups', { sourceId: source, product: { name: 'Parity notebooks' }, variants: [] }, admin).expect(201)).body.skus[0].id;
  const receipt = (await post('receipts', { sourceId: source, deliveredOn: '2020-01-01', lines: [{ skuId: sku, usableQuantity: 4, damagedQuantity: 0 }] }, admin).expect(201)).body;
  lotId = receipt.lines[0].lotId;
  units = await db.stockUnit.findMany({ where: { lotId }, select: { id: true }, orderBy: { id: 'asc' } });
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });

it('reports the Manager abilities as available to Admin', async () => {
  expect((await get('count-config', admin).expect(200)).body.canCount).toBe(true);
  expect((await get('closing-config', admin).expect(200)).body.canConfirm).toBe(true);
  expect((await get('damage-config', admin).expect(200)).body.canReview).toBe(true);
  expect((await get('authorization-request-config', admin).expect(200)).body.canSubmit).toBe(true);
  await get('count-config', production).expect(403);
});

it('Admin records a complete stock count without changing stock', async () => {
  const before = await db.stockBalance.findMany({ where: { lotId }, orderBy: { state: 'asc' } });
  const session = (await post('count-sessions', { lotId, state: 'U', purpose: 'Admin parity physical count' }, admin).expect(201)).body;
  const attempt = (await post('count-attempts', { sessionId: session.id }, admin).expect(201)).body;
  await post('count-observations', { attemptId: attempt.id, unitIds: units.map(u => u.id) }, admin).expect(201);
  const result = (await post('count-results', { attemptId: attempt.id, observedQuantity: '4', unidentifiedExtras: '0', explanation: 'Physical items counted by Admin', evidence: 'Selected lot checked against its actual physical labels' }, admin).expect(201)).body;
  expect(result.status).toBe('MATCHED');
  expect(await db.stockBalance.findMany({ where: { lotId }, orderBy: { state: 'asc' } })).toEqual(before);
  const adminUser = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', membership: { originId } } });
  expect((await db.countSession.findUniqueOrThrow({ where: { id: session.id } })).actorId).toBe(adminUser.id);
});

it('Admin records a damage decision, including a terminal removal', async () => {
  await post('damage-reports', { unitIds: [units[0]!.id, units[1]!.id], cause: 'Torn cover', description: 'The cover tore while moving the box' }, admin).expect(201);
  const held = (await post('damage-reviews', { unitIds: [units[0]!.id], outcome: 'HELD', note: 'Held pending a documented disposition decision' }, admin).expect(201)).body;
  expect(held.transactionId).toBeNull();
  const removed = (await post('damage-reviews', { unitIds: [units[1]!.id], outcome: 'DISCARDED', note: 'Damaged beyond use and discarded by Admin' }, admin).expect(201)).body;
  expect(removed.transactionId).toBeTruthy();
  expect((await db.stockTransaction.findUniqueOrThrow({ where: { id: removed.transactionId } })).actorRole).toBe('ADMIN');
});

it('Admin confirms the daily closing', async () => {
  const close = (await post('daily-closings', { businessDate: day }, admin).expect(201)).body;
  expect(close.businessDate).toBe(day);
  const adminUser = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', membership: { originId } } });
  expect((await db.dailyClose.findFirstOrThrow({ where: { originId, businessDate: new Date(day + 'T00:00:00Z') } })).actorId).toBe(adminUser.id);
});

it('Admin submits a recovery request without changing stock', async () => {
  const before = await db.stockBalance.findMany({ where: { lotId }, orderBy: { state: 'asc' } });
  const recorded = (await post('authorization-requests', { kind: 'RECOVERY', unitIds: [units[0]!.id], reason: 'Admin requests recovery of the held item', evidence: 'Item inspected; cover repaired and usable again' }, admin).expect(201)).body;
  expect(recorded.id).toBeTruthy();
  expect(await db.stockBalance.findMany({ where: { lotId }, orderBy: { state: 'asc' } })).toEqual(before);
});
