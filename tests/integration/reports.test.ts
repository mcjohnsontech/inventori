import { CheckoutsService } from '../../apps/api/src/checkouts.service.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { shopToken } from './shop-fixture.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw Error('Isolated fixture required');
const db = database(url), originId = randomUUID(), order = 'Reusable Report Order';
let app: Awaited<ReturnType<typeof createApp>>, admin: string, manager: string, production: string, sourceId: string, skuId: string, lotId: string, units: {
    id: string;
    unitCode: string;
}[], first: any, range: string;
const post = (path: string, body: object, key = randomUUID(), token = manager) => request(app.getHttpServer()).post('/v1/' + path).set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key).send(body);
const get = (path: string, token = manager) => request(app.getHttpServer()).get('/v1/' + path).set('Authorization', 'Bearer ' + token);
beforeAll(async () => {
    await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
    app = await createApp(db, originId, 'SHOP');
    admin = await shopToken(db, app, originId);
    manager = await shopToken(db, app, originId, 'MANAGER');
    production = await shopToken(db, app, originId, 'PRODUCTION');
    const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
    sourceId = (await post('catalogue/supplier-setups', { supplier: { name: 'Reports ' + originId }, location: { registryId: registry.id } }, randomUUID(), admin).expect(201)).body.source.id;
    skuId = (await post('catalogue/product-setups', { sourceId, product: { name: 'Report notebook' }, variants: [] }, randomUUID(), admin).expect(201)).body.skus[0].id;
    const receipt = (await post('receipts', { sourceId, deliveredOn: '2020-01-01', lines: [{ skuId, usableQuantity: 6, damagedQuantity: 1, damageReason: 'Damaged arriving packaging' }] }).expect(201)).body;
    lotId = receipt.lines[0].lotId;
    units = await db.stockUnit.findMany({ where: { lotId, initialState: 'U' }, select: { id: true, unitCode: true }, orderBy: { id: 'asc' } });
    first = (await post('checkouts', { reason: null, orderReference: order, lines: units.slice(0, 3).map(unit => ({ unitId: unit.id })) }, randomUUID(), production).expect(201)).body;
    await post('reason-reconciliations', { exceptionIds: [first.lines[0].exceptionId], reason: { code: 'SAMPLE' }, remarks: 'Supporting Manager classification evidence' }).expect(201);
    await post('completions', { unitIds: [units[0]!.id] }).expect(201);
    await post('damage-reports', { unitIds: [units[1]!.id], cause: 'Torn cover', description: 'The notebook cover tore during production use' }, randomUUID(), production).expect(201);
    await post('damage-reviews', { unitIds: [units[1]!.id], outcome: 'DISCARDED', note: 'Damaged item discarded after Manager review' }).expect(201);
    await post('checkouts', { reason: { code: 'INTERNAL_USE' }, orderReference: order, lines: [{ unitId: units[3]!.id }] }).expect(201);
    const initialDamaged = await db.stockUnit.findFirstOrThrow({ where: { lotId, initialState: 'D' } });
    await post('damage-reviews',{unitIds:[initialDamaged.id],outcome:'HELD',note:'Held damaged item pending separately authorized disposition'}).expect(201);
    await post('authorization-requests', { kind: 'RECOVERY', unitIds: [initialDamaged.id], reason: 'Inspect repaired incoming notebook for recovery', evidence: 'Damaged receipt evidence and repair observations retained' }).expect(201);
    const cfg = (await get('reports/config').expect(200)).body;
    range = new URLSearchParams({ from: cfg.from, to: cfg.today }).toString();
});
afterAll(async () => { vi.useRealTimers(); await app?.close(); await db.$disconnect(); });
it('reports are authorized operational reads and deny Production on every endpoint', async () => { for (const path of ['reports/config', 'reports/movements?' + range, 'reports/summary?' + range, 'reports/orders?orderReference=' + encodeURIComponent(order)]) {
    await get(path, admin).expect(200);
    await get(path, production).expect(403);
    await request(app.getHttpServer()).get('/v1/' + path).expect(401);
} await get('reports/movements?' + range).expect(200); });
it('returns exact ledger provenance and all enabled movement types without invoice/security fields', async () => { const report = (await get('reports/movements?' + range).expect(200)).body; expect(report.timezone).toBe('Africa/Lagos'); expect(report.certifiedClosing).toBe(false); expect(new Set(report.rows.map((row: any) => row.type))).toEqual(new Set(['RECEIPT', 'ISSUE', 'COMPLETE', 'DAMAGE', 'DISPOSITION'])); const completed = report.rows.find((row: any) => row.type === 'COMPLETE'); expect(completed).toMatchObject({ fromState: 'P', toState: 'C', quantity: '1', unitId: units[0]!.id, checkoutId: first.id, orderReference: order, skuId, lotId }); expect(JSON.stringify(report)).not.toMatch(/invoiceReference|passwordHash|sessionSecret|authVersion/); const received = report.rows.find((row: any) => row.type === 'RECEIPT' && row.toState === 'U'); expect(received.unitId).toBeNull(); expect(received.quantity).toBe('6'); });
it('opening and ending quantities conserve every internal state; reasons preserve missing evidence', async () => { const report = (await get('reports/summary?' + range).expect(200)).body; expect(report.balances).toHaveLength(1);expect(report.balances[0].flows).toEqual({receivedUsable:'6',receivedDamaged:'1',issued:'4',reportedBad:'1',completed:'1',removed:'1'});expect(report.reviews).toEqual([{outcome:'DISCARDED',records:'1',distinctUnits:'1'},{outcome:'HELD',records:'1',distinctUnits:'1'}]); const states = report.balances[0].states; for (const state of ['U', 'P', 'D', 'C', 'X'])
    expect(states[state].opening).toBe('0'); expect(Object.fromEntries(Object.entries(states).map(([state, value]: any) => [state, value.ending]))).toEqual({ U: '2', P: '2', D: '1', C: '1', X: '1' }); expect(report.reasons.find((row: any) => row.code === 'UNCLASSIFIED')).toMatchObject({ records: '2', pending: '2', classified: '0' }); expect(report.reasons.find((row: any) => row.code === 'SAMPLE')).toMatchObject({ records: '1', originallyMissing: '1', classified: '1', pending: '0' }); expect(report.requests).toEqual([{ kind: 'RECOVERY', records: '1' }]); expect(report.executedRecoveryEnabled).toBe(false); expect(report.days[0]).toMatchObject({ receipts: '1', issues: '2', damage: '1', completions: '1', dispositions: '1' }); });
it('exact reusable Order ID finds all sessions and units; case is preserved and grouping never completes others', async () => { const report = (await get('reports/orders?orderReference=' + encodeURIComponent(order)).expect(200)).body; expect(report.total).toBe(4); expect(report.sessions).toBe(2); expect(new Set(report.rows.map((row: any) => row.unitId))).toEqual(new Set(units.slice(0, 4).map(unit => unit.id))); expect(report.rows.find((row: any) => row.unitId === units[0]!.id)).toMatchObject({ state: 'C', originalReason: null, classifiedReason: 'SAMPLE', missingReasonStatus: 'RESOLVED' }); expect(report.rows.find((row: any) => row.unitId === units[2]!.id)).toMatchObject({ state: 'P', missingReasonStatus: 'PENDING' }); expect((await get('reports/orders?orderReference=' + encodeURIComponent(order.toLowerCase())).expect(200)).body.total).toBe(0); });
it('validates filters, pagination and date bounds; foreign-origin records are excluded', async () => { for (const query of ['from=2026-02-30&to=2026-03-01', 'from=2026-03-02&to=2026-03-01', 'from=2020-01-01&to=2026-01-01', range + '&page=0', range + '&sourceId=invalid'])
    await get('reports/movements?' + query).expect(400); await get('reports/summary?' + range + '&type=ISSUE').expect(400); expect((await get('reports/movements?' + range + '&page=2').expect(200)).body.rows).toEqual([]); const foreign = randomUUID(); await db.originNode.create({ data: { id: foreign, mode: 'SHOP' } }); const other = await createApp(db, foreign, 'SHOP'); try {
    const token = await shopToken(db, other, foreign);
    const result = await request(other.getHttpServer()).get('/v1/reports/orders?orderReference=' + encodeURIComponent(order)).set('Authorization', 'Bearer ' + token).expect(200);
    expect(result.body.total).toBe(0);
}
finally {
    await other.close();
} expect((await get('reports/movements?' + range + '&sourceId=' + randomUUID()).expect(200)).body.total).toBe(0); });
it('acceptance-day uses Lagos midnight and never the backdated delivery date', async () => {
    const actor = await db.user.findUniqueOrThrow({ where: { id: first.actor.id } }), service = new CheckoutsService(db, originId, 'SHOP'), checkouts: string[] = [];
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
        for (const [index, time] of ['2026-11-09T22:59:59.000Z', '2026-11-09T23:00:00.000Z'].entries()) {
            vi.setSystemTime(new Date(time));
            const accepted = await service.create(actor, randomUUID(), { reason: { code: 'SAMPLE' }, orderReference: 'Midnight boundary', lines: [{ unitId: units[index + 4]!.id }] });
            checkouts.push(accepted.id);
        }
    }
    finally {
        vi.useRealTimers();
    }
    const before = (await get('reports/movements?from=2026-11-09&to=2026-11-09').expect(200)).body.rows, after = (await get('reports/movements?from=2026-11-10&to=2026-11-10').expect(200)).body.rows;
    expect(before.some((row: any) => row.checkoutId === checkouts[0])).toBe(true);
    expect(before.some((row: any) => row.checkoutId === checkouts[1])).toBe(false);
    expect(after.some((row: any) => row.checkoutId === checkouts[1])).toBe(true);
    expect((await get('reports/movements?from=2020-01-01&to=2020-01-01').expect(200)).body.total).toBe(0);
});
it('report reads preserve stock, unit histories, commands, audit and outbox fingerprints', async () => { const tables = ['StockUnit', 'UnitState', 'UnitEvent', 'StockBalance', 'StockMovement', 'StockTransaction', 'AuditEvent', 'OutboxEvent', 'CommandResult', 'AuthorizationRequest', 'ProductionCompletion','DamageReview','DamageReviewLine']; const capture = async () => Promise.all(tables.map(async (table) => (await db.$queryRawUnsafe<{
    hash: string;
}[]>(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) hash FROM "${table}" t WHERE ${table === 'StockBalance' ? 't."lotId" IN (SELECT id FROM "StockLot" WHERE "originId"=$1::uuid)' : table === 'StockMovement' ? 't."batchId" IN (SELECT id FROM "DeliveryBatch" WHERE "originId"=$1::uuid)' : 't."originId"=$1::uuid'}`, originId))[0]!.hash)); const before = await capture(); await get('reports/summary?' + range).expect(200); await get('reports/movements?' + range).expect(200); await get('reports/orders?orderReference=' + encodeURIComponent(order)).expect(200); expect(await capture()).toEqual(before); });

it('shared parent variants retain independent supplier SKUs and source-filtered period quantities',async()=>{
 const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}}),original=await db.supplierVariantSku.findUniqueOrThrow({where:{id:skuId}});
 const source=(await post('catalogue/supplier-setups',{supplier:{name:'Other report supplier '+originId},location:{registryId:registry.id}},randomUUID(),admin).expect(201)).body.source;
 const sku=(await post('catalogue/product-setups',{sourceId:source.id,product:{id:original.productId},variants:[{variantId:original.variantId,suffix:'STD'}]},randomUUID(),admin).expect(201)).body.skus[0];
 const receipt=(await post('receipts',{sourceId:source.id,deliveredOn:'2020-01-01',lines:[{skuId:sku.id,usableQuantity:2,damagedQuantity:0}]}).expect(201)).body;
 const unit=await db.stockUnit.findFirstOrThrow({where:{lotId:receipt.lines[0].lotId}});await post('checkouts',{reason:{code:'SAMPLE'},orderReference:order,lines:[{unitId:unit.id}]}).expect(201);
 const report=(await get('reports/summary?'+range+'&sourceId='+source.id).expect(200)).body;expect(report.balances).toHaveLength(1);expect(report.balances[0]).toMatchObject({skuId:sku.id,productId:original.productId,states:{U:{ending:'1'},P:{ending:'1'}}});
 const movements=(await get('reports/movements?'+range+'&sourceId='+source.id).expect(200)).body;expect(movements.rows).toHaveLength(2);expect(movements.rows.every((row:any)=>row.skuId===sku.id&&row.productId===original.productId)).toBe(true);
 expect((await get('reports/orders?orderReference='+encodeURIComponent(order)).expect(200)).body).toMatchObject({total:5,sessions:3});expect(await db.supplierVariantSku.findUniqueOrThrow({where:{id:skuId}})).toEqual(original);
});
