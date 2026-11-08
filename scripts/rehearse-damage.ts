import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { database } from '../apps/api/src/database.js';
import { isolatedBackfillUrl } from '../apps/api/src/identity-backfill.js';
import { ReceivingService } from '../apps/api/src/receiving.service.js';
import { CheckoutsService } from '../apps/api/src/checkouts.service.js';
import { DamageService } from '../apps/api/src/damage.service.js';

const url = isolatedBackfillUrl(process.env.TEST_DATABASE_URL);
const previous = JSON.parse(await readFile('artifacts/completion/reconciliation-preservation.json', 'utf8'));
if (!previous.syntheticOnly || !/^dayari_checkout_compat_[0-9]+_test$/.test(previous.database)) throw Error('Retained isolated fixture required');
url.pathname = '/' + previous.database;
const names = (await readdir('prisma/migrations')).filter(name => /^2026/.test(name)).sort();
if (names.at(-1) !== '202611080024_damage_snapshot_evidence') throw Error('Use the matching milestone commit; no future migration runs silently');
const sql = new Client({ connectionString: url.toString() }); await sql.connect(); const db = database(url.toString());
try {
  const schema = (await sql.query(`SELECT to_regclass('"ReasonReconciliation"') IS NOT NULL AS previous,to_regclass('"DamageReport"') IS NULL AS missing`)).rows[0];
  if (!schema.previous || !schema.missing) throw Error('Fixture must remain through 022; no reset or repeated installation');
  const manager = await db.user.findFirstOrThrow({ where: { role: 'MANAGER', active: true, membership: { isNot: null } } });
  const membership = await db.shopMembership.findFirstOrThrow({ where: { userId: manager.id } });
  const originId = membership.originId, sku = await db.supplierVariantSku.findFirstOrThrow({ where: { originId } });
  const sourcing = await db.productSourcing.findUniqueOrThrow({ where: { id: sku.sourcingId } });
  const receiving = new ReceivingService(db, originId, 'SHOP'), checkout = new CheckoutsService(db, originId, 'SHOP'), damage = new DamageService(db, originId, 'SHOP');
  const receipt = await receiving.create(manager, randomUUID(), { sourceId: sourcing.sourceId, deliveredOn: '2020-01-01',
    lines: [{ skuId: sku.id, usableQuantity: 2, damagedQuantity: 1, damageReason: 'Synthetic damaged arrival' }] });
  const unit = await db.stockUnit.findFirstOrThrow({ where: { receiptLineId: receipt.lines[0]!.id, initialState: 'U' } });
  const issued = await checkout.create(manager, randomUUID(), { reason: { code: 'SAMPLE' }, orderReference: 'Damage rehearsal', lines: [{ unitId: unit.id }] });
  let denied = false; try { await damage.configuration(manager); } catch (error) { denied = (error as { getStatus?: () => number }).getStatus?.() === 503; }
  if (!denied) throw Error('Readiness gate did not protect old schema');
  const tables = (await sql.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  async function capture() {
    const result: Record<string, string> = {};
    for (const { tablename } of tables) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      const row = ['StockMovement', 'UnitEvent'].includes(tablename) ? `to_jsonb(t)-ARRAY['damageLineId','damageReviewLineId']` : 'to_jsonb(t)';
      result[tablename] = (await sql.query(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(${row} ORDER BY (${row})::text)::text,''),'UTF8')),'hex') AS hash FROM ${quoted} t`)).rows[0].hash;
    }
    return result;
  }
  const before = await capture();
  for (const name of ['202611080023_unit_damage', '202611080024_damage_snapshot_evidence']) await sql.query(await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  const after = await capture(); if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Migration changed existing fields');
  if (await db.damageReport.count() || await db.damageReview.count()) throw Error('Migration fabricated damage history');
  const oldAcceptance = await checkout.get(manager, issued.id);
  const report = await damage.create(manager, randomUUID(), { unitIds: [unit.id], cause: 'Synthetic torn cover', description: 'Synthetic fixture damaged after checkout' });
  const usableBefore = await db.stockBalance.findUniqueOrThrow({ where: { lotId_state: { lotId: unit.lotId, state: 'U' } } });
  const stateBefore = await db.unitState.findUniqueOrThrow({ where: { unitId: unit.id } });
  await damage.create(manager, randomUUID(), { unitIds: [unit.id], outcome: 'REWORKED', note: 'Synthetic rework evidence with no recovery authorization' }, true);
  if (JSON.stringify(await db.unitState.findUniqueOrThrow({ where: { unitId: unit.id } }), (_, value) => typeof value === 'bigint' ? value.toString() : value)
    !== JSON.stringify(stateBefore, (_, value) => typeof value === 'bigint' ? value.toString() : value)) throw Error('Review changed unit state');
  if ((await db.stockBalance.findUniqueOrThrow({ where: { lotId_state: { lotId: unit.lotId, state: 'U' } } })).quantity !== usableBefore.quantity) throw Error('Review changed usable stock');
  const original = await checkout.get(manager, issued.id); if (JSON.stringify(original.lines) !== JSON.stringify(oldAcceptance.lines)) throw Error('Original checkout changed');
  await mkdir('artifacts/completion', { recursive: true });
  await writeFile('artifacts/completion/damage-preservation.json', JSON.stringify({ syntheticOnly: true, database: previous.database,
    migrations: names.slice(-2), existingTables: tables.length, before, after, priorFieldsPreserved: true, migrationFabricatedDamage: false,
    preMigrationReceivingAndCheckoutPassed: true, readinessDeniedUntilMigration: true, acceptedDamageUnits: report.lines.length,
    reworkNoStockEffects: true, originalCheckoutPreserved: true, limitations: ['Isolated synthetic fixture; no operational upgrade or historical enrollment'] }, null, 2));
  console.info(`Damage migrations preserved ${tables.length} prior tables; pre-upgrade receiving/checkout and post-upgrade damage/rework passed.`);
} finally { await db.$disconnect(); await sql.end(); }
