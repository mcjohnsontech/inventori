import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { shopToken } from './shop-fixture.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Isolated local *_test database required');

// Owner request 26 Nov 2026: Deliveries show items received and whether labels were printed;
// opening labels from a delivery prints exactly that delivery.
describe('delivery item totals and label progress', () => {
  const originId = randomUUID();
  let db: ReturnType<typeof database>, app: Awaited<ReturnType<typeof createApp>>, admin: string, manager: string, production: string, receipt: any, other: any;
  const send = (path: string, body: object, token = admin, key = randomUUID()) => request(app.getHttpServer()).post('/v1/' + path).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);
  const get = (path: string, token = admin) => request(app.getHttpServer()).get('/v1/' + path).set('Authorization', `Bearer ${token}`);
  const row = async (id: string) => (await get('receipts').expect(200)).body.find((r: any) => r.id === id);
  beforeAll(async () => {
    db = database(url); await db.originNode.create({ data: { id: originId, mode: 'SHOP' } }); app = await createApp(db, originId, 'SHOP');
    admin = await shopToken(db, app, originId); manager = await shopToken(db, app, originId, 'MANAGER'); production = await shopToken(db, app, originId, 'PRODUCTION');
    const registry = await db.locationRegistry.findFirstOrThrow();
    const vendor = (await send('receiving/supplier-setups', { supplier: { name: `Labels ${randomUUID()}` }, location: { registryId: registry.id } }, manager).expect(201)).body;
    const product = (await send('receiving/product-setups', { sourceId: vendor.source.id, product: { name: `Labelled ${randomUUID()}`, description: '' }, variants: [] }, manager).expect(201)).body;
    const intake = (usable: number, damaged: number) => ({ sourceId: vendor.source.id, deliveredOn: '2020-01-01', lines: [{ skuId: product.skus[0].id, usableQuantity: usable, damagedQuantity: damaged, damageReason: damaged ? 'Torn cover on arrival' : '' }] });
    receipt = (await send('receipts', intake(4, 1), manager).expect(201)).body;
    other = (await send('receipts', intake(2, 0), manager).expect(201)).body;
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });

  it('lists items received per delivery and starts with no labels printed', async () => {
    expect(await row(receipt.id)).toMatchObject({ totalItems: '5', labelledUnits: 5, labelsPrinted: 0 });
    expect(await row(other.id)).toMatchObject({ totalItems: '2', labelledUnits: 2, labelsPrinted: 0 });
  });

  it('returns exactly one delivery\'s unlabelled items, and only to staff who print', async () => {
    await get(`unit-label-options/delivery?receiptId=${receipt.id}`, production).expect(403);
    await get(`unit-label-options/delivery?receiptId=${randomUUID()}`).expect(404);
    const found = (await get(`unit-label-options/delivery?receiptId=${receipt.id}`, manager).expect(200)).body;
    expect(found).toMatchObject({ receiptId: receipt.id, batchCode: receipt.batch.publicCode, units: 5, unlabelled: 5 });
    const units = await db.$queryRaw<{ id: string }[]>`SELECT u.id FROM "StockUnit" u JOIN "ReceiptLine" r ON r.id=u."receiptLineId" WHERE r."receiptId"=${receipt.id}::uuid`;
    expect([...found.unitIds].sort()).toEqual(units.map(u => u.id).sort());
  });

  it('counts labels as printed only after they are sent to the printer', async () => {
    const found = (await get(`unit-label-options/delivery?receiptId=${receipt.id}`).expect(200)).body;
    const job = (await send('unit-label-jobs', { kind: 'INITIAL', unitIds: found.unitIds.slice(0, 3), profileId: 'unit-a4-70x35-v2' }, manager).expect(201)).body;
    expect(await row(receipt.id)).toMatchObject({ labelsPrinted: 0 });
    expect((await get(`unit-label-options/delivery?receiptId=${receipt.id}`).expect(200)).body).toMatchObject({ unlabelled: 2 });
    await send(`unit-label-jobs/${job.id}/artifact`, {}).expect(201);
    await send(`unit-label-jobs/${job.id}/handoffs`, { attemptId: randomUUID() }).expect(201);
    expect(await row(receipt.id)).toMatchObject({ totalItems: '5', labelledUnits: 5, labelsPrinted: 3 });
    expect(await row(other.id)).toMatchObject({ labelsPrinted: 0 });
  });
});
