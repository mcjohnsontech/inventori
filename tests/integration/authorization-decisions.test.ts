// Local Admin approval of recovery and correction requests.
// Owner decisions, 24 November 2026: docs/decisions.md and docs/local-admin-approval-design.md.
// PRD FR-08 (recovery needs Manager request + Admin approval) and §10 (corrections are new audited events).
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
const reason = 'Manager asks for this stock record to be put right', evidence = 'Shelf checked twice against the printed item labels';
let app: Awaited<ReturnType<typeof createApp>>, admin: string, admin2: string, manager: string, production: string, sku: string, source: string;
const post = (path: string, body: object, token = manager, key = randomUUID()) => request(app.getHttpServer()).post('/v1/' + path).set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key).send(body);
const get = (path: string, token = manager) => request(app.getHttpServer()).get('/v1/' + path).set('Authorization', 'Bearer ' + token);
async function receive(quantity: number) {
  const receipt = (await post('receipts', { sourceId: source, deliveredOn: '2020-01-01', lines: [{ skuId: sku, usableQuantity: quantity, damagedQuantity: 0 }] }).expect(201)).body;
  const lotId = receipt.lines[0].lotId as string;
  return { lotId, units: (await db.stockUnit.findMany({ where: { lotId }, select: { id: true }, orderBy: { id: 'asc' } })).map(u => u.id) };
}
const balances = async (lotId: string) => Object.fromEntries((await db.stockBalance.findMany({ where: { lotId } })).map(b => [b.state, Number(b.quantity)]));
async function correction(lotId: string, state: 'U' | 'P' | 'D', observedQuantity: string, token = manager) {
  const target = (await post('authorization-requests/preview', { kind: 'CORRECTION', lotId, state }, token).expect(200)).body.target;
  return (await post('authorization-requests', { kind: 'CORRECTION', lotId, state, observedQuantity, reviewedLedgerQuantity: target.ledgerQuantity, reviewedProjectionQuantity: target.projectionQuantity, reason, evidence }, token).expect(201)).body;
}
const blocking = async (requestId: string) => (await get('daily-closings/preview?businessDate=' + day).expect(200)).body.snapshot.blockers.some((b: any) => b.kind === 'CERTIFICATION_APPROVAL' && b.id === requestId);

beforeAll(async () => {
  await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
  app = await createApp(db, originId, 'SHOP');
  admin = await shopToken(db, app, originId); admin2 = await shopToken(db, app, originId);
  manager = await shopToken(db, app, originId, 'MANAGER'); production = await shopToken(db, app, originId, 'PRODUCTION');
  const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
  source = (await post('catalogue/supplier-setups', { supplier: { name: 'Approvals ' + originId }, location: { registryId: registry.id } }, admin).expect(201)).body.source.id;
  sku = (await post('catalogue/product-setups', { sourceId: source, product: { name: 'Approval notebooks' }, variants: [] }, admin).expect(201)).body.skus[0].id;
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });

it('Admin approves a recovery: exact damaged items return to usable once, with history kept', async () => {
  const { lotId, units } = await receive(3);
  await post('damage-reports', { unitIds: [units[0]!, units[1]!], cause: 'Scuffed cover', description: 'Cover scuffed while unpacking the box' }).expect(201);
  const req = (await post('authorization-requests', { kind: 'RECOVERY', unitIds: [units[0]!, units[1]!], reason, evidence }).expect(201)).body;
  const options = (await get(`authorization-requests/${req.id}/decision`, admin).expect(200)).body;
  expect(options).toMatchObject({ canDecide: true, outcomes: ['APPROVED', 'REJECTED'], stale: false });
  expect((await get(`authorization-requests/${req.id}/decision`, manager).expect(200)).body).toMatchObject({ canDecide: false, blockedReason: 'Only an Admin can approve or reject requests.' });
  await post(`authorization-requests/${req.id}/decision`, { outcome: 'APPROVED', note: 'Inspected and fine to sell again' }, manager).expect(403);
  await post(`authorization-requests/${req.id}/decision`, { outcome: 'APPROVED', note: 'Inspected and fine to sell again' }, production).expect(403);
  const eventsBefore = await db.unitEvent.count({ where: { lotId } });
  expect(await balances(lotId)).toMatchObject({ U: 1, D: 2 });
  const key = randomUUID(), body = { outcome: 'APPROVED', note: 'Inspected and fine to sell again' };
  const decided = (await post(`authorization-requests/${req.id}/decision`, body, admin, key).expect(201)).body;
  expect(decided.units.map((u: any) => u.toState)).toEqual(['U', 'U']);
  expect(await balances(lotId)).toMatchObject({ U: 3, D: 0 });
  expect((await db.stockTransaction.findUniqueOrThrow({ where: { id: decided.transactionId } }))).toMatchObject({ type: 'RECOVERY', actorRole: 'ADMIN' });
  expect(await db.unitEvent.count({ where: { lotId } })).toBe(eventsBefore + 2);
  expect((await db.unitState.findUniqueOrThrow({ where: { unitId: units[0]! } }))).toMatchObject({ state: 'U', condition: 'USABLE', custody: 'SHOP_STORAGE' });
  expect((await post(`authorization-requests/${req.id}/decision`, body, admin, key).expect(201)).body).toEqual(decided);
  await post(`authorization-requests/${req.id}/decision`, { ...body, note: 'A different note for the same key' }, admin, key).expect(409);
  await post(`authorization-requests/${req.id}/decision`, { outcome: 'REJECTED', note: 'Second decision must be refused' }, admin2).expect(409);
  expect(await balances(lotId)).toMatchObject({ U: 3, D: 0 });
  expect((await get(`authorization-requests/${req.id}/decision`, admin).expect(200)).body.decision.id).toBe(decided.id);
  const history = (await get('authorization-requests?kind=RECOVERY').expect(200)).body.rows.find((row: any) => row.id === req.id);
  expect(history.decision).toBe('APPROVED');
});

it('an Admin can never decide their own request; another Admin can reject it without moving stock', async () => {
  const { lotId, units } = await receive(1);
  await post('damage-reports', { unitIds: [units[0]!], cause: 'Torn page', description: 'Inside page torn during a check' }, admin).expect(201);
  const req = (await post('authorization-requests', { kind: 'RECOVERY', unitIds: [units[0]!], reason, evidence }, admin).expect(201)).body;
  expect((await get(`authorization-requests/${req.id}/decision`, admin).expect(200)).body).toMatchObject({ canDecide: false, blockedReason: 'You made this request, so another Admin must decide it.' });
  await post(`authorization-requests/${req.id}/decision`, { outcome: 'APPROVED', note: 'Trying to approve my own request' }, admin).expect(403);
  const before = await balances(lotId);
  const rejected = (await post(`authorization-requests/${req.id}/decision`, { outcome: 'REJECTED', note: 'Page is torn; keep it as damaged' }, admin2).expect(201)).body;
  expect(rejected).toMatchObject({ outcome: 'REJECTED', transactionId: null, units: [] });
  expect(await balances(lotId)).toEqual(before);
  await post(`authorization-requests/${req.id}/decision`, { outcome: 'REJECTED', note: 'Rejecting twice is not allowed' }, admin2).expect(409);
});

it('shortfall correction: Admin ticks exactly the missing items, which move to Removed; closing is unblocked', async () => {
  const { lotId, units } = await receive(4);
  const req = await correction(lotId, 'U', '3');
  expect(await blocking(req.id)).toBe(true);
  const options = (await get(`authorization-requests/${req.id}/decision`, admin).expect(200)).body;
  expect(options).toMatchObject({ shortfall: 1, surplus: 0, outcomes: ['APPROVED', 'REJECTED'] });
  expect(options.candidates).toHaveLength(4);
  await post(`authorization-requests/${req.id}/decision`, { outcome: 'APPROVED', note: 'One notebook is missing from the shelf' }, admin).expect(400);
  await post(`authorization-requests/${req.id}/decision`, { outcome: 'APPROVED', note: 'One notebook is missing from the shelf', unitIds: [units[0]!, units[1]!] }, admin).expect(400);
  await post(`authorization-requests/${req.id}/decision`, { outcome: 'RECEIVE_AS_DELIVERY', note: 'Not a valid choice for a shortfall' }, admin).expect(400);
  const decided = (await post(`authorization-requests/${req.id}/decision`, { outcome: 'APPROVED', note: 'One notebook is missing from the shelf', unitIds: [units[2]!] }, admin).expect(201)).body;
  expect(decided.units).toEqual([expect.objectContaining({ unitId: units[2]!, fromState: 'U', toState: 'X' })]);
  expect(await balances(lotId)).toMatchObject({ U: 3, X: 1 });
  expect((await db.unitState.findUniqueOrThrow({ where: { unitId: units[2]! } }))).toMatchObject({ state: 'X', condition: 'USABLE', custody: 'REMOVED' });
  expect((await db.stockTransaction.findUniqueOrThrow({ where: { id: decided.transactionId } })).type).toBe('CORRECTION');
  expect(await blocking(req.id)).toBe(false);
});

it('surplus correction is closed as "receive as a new delivery", never creates items, and keeps blocking until a matching recount', async () => {
  const { lotId, units } = await receive(2);
  const req = await correction(lotId, 'U', '4');
  const options = (await get(`authorization-requests/${req.id}/decision`, admin).expect(200)).body;
  expect(options).toMatchObject({ shortfall: 0, surplus: 2, outcomes: ['RECEIVE_AS_DELIVERY', 'REJECTED'], candidates: [] });
  await post(`authorization-requests/${req.id}/decision`, { outcome: 'APPROVED', note: 'Approval cannot create new items' }, admin).expect(400);
  const before = await balances(lotId), unitCount = await db.stockUnit.count({ where: { lotId } });
  const decided = (await post(`authorization-requests/${req.id}/decision`, { outcome: 'RECEIVE_AS_DELIVERY', note: 'Receive the two extra notebooks as a new delivery' }, admin).expect(201)).body;
  expect(decided.transactionId).toBeNull();
  expect(await balances(lotId)).toEqual(before);
  expect(await db.stockUnit.count({ where: { lotId } })).toBe(unitCount);
  expect(await blocking(req.id)).toBe(true);
  const session = (await post('count-sessions', { lotId, state: 'U', purpose: 'Recount after extra items were relabelled' }).expect(201)).body;
  const attempt = (await post('count-attempts', { sessionId: session.id }).expect(201)).body;
  await post('count-observations', { attemptId: attempt.id, unitIds: units }).expect(201);
  await post('count-results', { attemptId: attempt.id, observedQuantity: '2', unidentifiedExtras: '0', explanation: 'Recount after relabelling the extras', evidence: 'Every item on the shelf matched its label' }).expect(201);
  expect(await blocking(req.id)).toBe(false);
});

it('a correction whose stock changed after the request is refused and nothing is saved', async () => {
  const { lotId, units } = await receive(3);
  const req = await correction(lotId, 'U', '2');
  await post('checkouts', { reason: { code: 'INTERNAL_USE' }, orderReference: null, lines: [{ unitId: units[0]! }] }, production).expect(201);
  expect((await get(`authorization-requests/${req.id}/decision`, admin).expect(200)).body.stale).toBe(true);
  const before = await balances(lotId);
  await post(`authorization-requests/${req.id}/decision`, { outcome: 'APPROVED', note: 'Trying to approve an out of date request', unitIds: [units[1]!] }, admin).expect(409);
  expect(await balances(lotId)).toEqual(before);
  expect(await db.authorizationDecision.count({ where: { requestId: req.id } })).toBe(0);
});

it('two Admins deciding at the same moment: exactly one decision and one stock change', async () => {
  const { lotId, units } = await receive(2);
  await post('damage-reports', { unitIds: [units[0]!], cause: 'Bent corner', description: 'Corner bent when the box was dropped' }).expect(201);
  const req = (await post('authorization-requests', { kind: 'RECOVERY', unitIds: [units[0]!], reason, evidence }).expect(201)).body;
  const third = await shopToken(db, app, originId);
  const replies = await Promise.all([admin, admin2, third].map(token => post(`authorization-requests/${req.id}/decision`, { outcome: 'APPROVED', note: 'Corner pressed flat and usable' }, token)));
  expect(replies.map(r => r.status).sort()).toEqual([201, 409, 409]);
  expect(await balances(lotId)).toMatchObject({ U: 2, D: 0 });
  expect(await db.authorizationDecision.count({ where: { requestId: req.id } })).toBe(1);
});

it('the database refuses a decision whose actor made the request, even without the API', async () => {
  const { units } = await receive(1);
  await post('damage-reports', { unitIds: [units[0]!], cause: 'Water mark', description: 'Small water mark on the back cover' }).expect(201);
  const req = (await post('authorization-requests', { kind: 'RECOVERY', unitIds: [units[0]!], reason, evidence }).expect(201)).body;
  const root = await db.authorizationRequest.findUniqueOrThrow({ where: { id: req.id } });
  await expect(db.$transaction(tx => tx.authorizationDecision.create({ data: { id: randomUUID(), originId, requestId: req.id, actorId: root.actorId, actorRole: 'ADMIN',
    commandId: randomUUID(), transactionId: null, recordedAt: new Date(), outcome: 'REJECTED', note: 'Direct insert must be refused', unitCount: 0, manifest: [], canonicalManifest: '[]', manifestHash: 'x' } }))).rejects.toThrow();
  expect(await db.authorizationDecision.count({ where: { requestId: req.id } })).toBe(0);
});
