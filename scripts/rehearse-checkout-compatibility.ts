import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import request from 'supertest';
import { database } from '../apps/api/src/database.js';
import { createApp } from '../apps/api/src/app.js';
import { isolatedBackfillUrl } from '../apps/api/src/identity-backfill.js';
import { passwordHash } from '../apps/api/src/security.js';
import { encodeUnitQr } from '@dayari/contracts';

// Never reuse/clear a database, inherit operational SMTP, or fall back to DATABASE_URL.
const url = isolatedBackfillUrl(process.env.TEST_DATABASE_URL);
const name = `dayari_checkout_compat_${Date.now()}_test`;
const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.toString() }); await admin.connect();
try {
  if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount) throw Error('Refuses fixture overwrite');
  await admin.query(`CREATE DATABASE "${name}"`);
} finally { await admin.end(); }
url.pathname = '/' + name;
const sql = new Client({ connectionString: url.toString() }); await sql.connect();
const migrations = (await readdir('prisma/migrations')).filter(value => /^2026/.test(value)).sort();
if (migrations.at(-1) !== '202611080021_exact_unit_checkout') throw Error('Use matching checkout milestone');
const apply = async (names: string[]) => { for (const migration of names) await sql.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8')); };
const db = database(url.toString()), originId = randomUUID();
let app: Awaited<ReturnType<typeof createApp>> | undefined;
try {
  await apply(migrations.slice(0, 13));
  process.env.INVITATION_TRANSPORT = 'disabled'; process.env.INVITATION_LIVE_ENABLED = '0';
  await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
  const password = randomUUID(), email = randomUUID() + '@compat.fixture.test';
  await db.user.create({ data: { email, name: 'Synthetic compatibility Admin', role: 'ADMIN', passwordHash: passwordHash(password), membership: { create: { originId } } } });
  app = await createApp(db, originId, 'SHOP');
  const token = (await request(app.getHttpServer()).post('/v1/sessions').send({ email, password }).expect(200)).body.token;
  const post = (path: string, body: object) => request(app!.getHttpServer()).post('/v1/' + path).set('Authorization', 'Bearer ' + token).set('Idempotency-Key', randomUUID()).send(body);
  const get = (path: string) => request(app!.getHttpServer()).get('/v1/' + path).set('Authorization', 'Bearer ' + token);
  const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
  const source = (await post('catalogue/supplier-setups', { supplier: { name: 'Compatibility supplier' }, location: { registryId: registry.id } }).expect(201)).body.source;
  const product = (await post('catalogue/product-setups', { sourceId: source.id, product: { name: 'Compatibility notebook' }, variants: [] }).expect(201)).body;
  const body = { sourceId: source.id, deliveredOn: '2020-01-01', lines: [{ skuId: product.skus[0].id, usableQuantity: 3, damagedQuantity: 1, damageReason: 'Synthetic damaged intake evidence' }] };
  const legacy = (await post('receipts', body).expect(201)).body;
  await get(`stock/lots/${legacy.lines[0].lotId}`).expect(200);
  const legacyJob = (await post('label-print-jobs', { kind: 'INITIAL', receiptId: legacy.id, profileId: 'a4-70x35-v1' }).expect(201)).body;
  await post(`label-print-jobs/${legacyJob.id}/artifacts/0`, {}).expect(201);
  await apply(migrations.slice(13, 20));
  const native = (await post('receipts', body).expect(201)).body;
  const units = (await get(`receipts/${native.id}/units`).expect(200)).body.units;
  if (units.length !== 4) throw Error('Pre-checkout receiving did not serialize exactly');
  const unit = units.find((unit: { state: string }) => unit.state === 'U');
  await get(`units/${unit.id}/tracking`).expect(200);
  await post('unit-observations', { payload: encodeUnitQr(originId, unit.id), method: 'QR_INPUT' }).expect(201);
  const unitJob = (await post('unit-label-jobs', { kind: 'INITIAL', unitIds: [unit.id], profileId: 'unit-a4-70x35-v2' }).expect(201)).body;
  await post(`unit-label-jobs/${unitJob.id}/artifact`, {}).expect(201);
  await get('checkout-config').expect(503);
  const tables = (await sql.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const capture = async () => {
    const hashes: Record<string, string> = {};
    for (const { tablename } of tables) {
      const added = tablename === 'StockMovement' ? ['checkoutLineId'] : tablename === 'UnitEvent' ? ['previousEventId', 'checkoutLineId'] : tablename === 'UnitState' ? ['holderId'] : [];
      const projection = added.length ? `to_jsonb(t)-ARRAY[${added.map(column => "'" + column + "'").join(',')}]::text[]` : 'to_jsonb(t)';
      const table = '"' + tablename.replaceAll('"', '""') + '"';
      hashes[tablename] = (await sql.query(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(${projection} ORDER BY (${projection})::text)::text,''),'UTF8')),'hex') AS hash FROM ${table} t`)).rows[0].hash;
    }
    return hashes;
  };
  const before = await capture();
  await apply(migrations.slice(20));
  const after = await capture();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Migration changed previous field values');
  await get(`units/${unit.id}/tracking`).expect(200);
  await get(`unit-label-jobs/${unitJob.id}`).expect(200);
  await get('checkout-config').expect(200);
  const counts = await sql.query('SELECT (SELECT count(*) FROM "StockUnit")::int AS units,(SELECT count(*) FROM "Checkout")::int AS checkouts');
  if (counts.rows[0].units !== 4 || counts.rows[0].checkouts !== 0) throw Error('Migration fabricated units/checkouts');
  await mkdir('artifacts/completion', { recursive: true });
  await writeFile('artifacts/completion/checkout-populated-compatibility.json', JSON.stringify({ syntheticOnly: true, database: name,
    previousTables: tables.length, before, after, preCheckoutReceivingAndTrackingPassed: true, legacyAndNativePrintEvidencePreserved: true,
    nativeUnits: 4, fabricatedCheckouts: false, migration: migrations.at(-1), limitation: 'Isolated fixture only, new nullable columns excluded from prior-field fingerprints' }, null, 2));
  console.info('Current code received on schema 013 and 020; migration 021 preserved populated legacy/native stock, both print histories and all prior fields.');
} finally { await app?.close(); await db.$disconnect(); await sql.end(); }
