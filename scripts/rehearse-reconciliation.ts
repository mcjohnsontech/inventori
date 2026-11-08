import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { database } from '../apps/api/src/database.js';
import { isolatedBackfillUrl } from '../apps/api/src/identity-backfill.js';
import { passwordHash } from '../apps/api/src/security.js';
import { CheckoutsService } from '../apps/api/src/checkouts.service.js';
import { ReconciliationService } from '../apps/api/src/reconciliation.service.js';

const url = isolatedBackfillUrl(process.env.TEST_DATABASE_URL);
const previous = JSON.parse(await readFile('artifacts/completion/checkout-populated-compatibility.json', 'utf8'));
if (!previous.syntheticOnly || !/^dayari_checkout_compat_[0-9]+_test$/.test(previous.database)) throw Error('An isolated retained populated checkout fixture is required');
url.pathname = '/' + previous.database;
const names = (await readdir('prisma/migrations')).filter(value => /^2026/.test(value)).sort();
if (names.at(-1) !== '202611080022_reason_reconciliation') throw Error('Use the matching milestone commit; future migrations must not run silently');
const sql = new Client({ connectionString: url.toString() }); await sql.connect();
const db = database(url.toString());
try {
  const schema = (await sql.query('SELECT to_regclass($1) IS NOT NULL AS checkout,to_regclass($2) IS NULL AS missing', ['"Checkout"', '"ReasonReconciliation"'])).rows[0];
  if (!schema.checkout || !schema.missing) throw Error('Fixture must remain through 021; refuses repeated installation');
  const origin = await db.originNode.findFirstOrThrow({ where: { mode: 'SHOP' } });
  const manager = await db.user.create({ data: { name: 'Synthetic reconciliation Manager', email: randomUUID() + '@rehearsal.fixture.test', role: 'MANAGER',
    passwordHash: passwordHash(randomUUID()), membership: { create: { originId: origin.id } } } });
  const unit = await db.unitState.findFirstOrThrow({ where: { originId: origin.id, state: 'U' }, select: { unitId: true } });
  const checkouts = new CheckoutsService(db, origin.id, 'SHOP'), reconciliations = new ReconciliationService(db, origin.id, 'SHOP');
  const accepted = await checkouts.create(manager, randomUUID(), { reason: null, orderReference: 'Rehearsal reused reference', lines: [{ unitId: unit.unitId }] });
  await checkouts.get(manager, accepted.id);
  let unavailable = false;
  try { await reconciliations.configuration(manager); } catch (error) { unavailable = (error as { getStatus?: () => number }).getStatus?.() === 503; }
  if (!unavailable) throw Error('Pre-migration readiness boundary was not enforced');
  const tables = (await sql.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const capture = async (selected = tables) => {
    const result: Record<string, string> = {};
    for (const { tablename } of selected) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      result[tablename] = (await sql.query(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''),'UTF8')),'hex') AS hash FROM ${quoted} t`)).rows[0].hash;
    }
    return result;
  };
  const before = await capture();
  await sql.query(await readFile('prisma/migrations/202611080022_reason_reconciliation/migration.sql', 'utf8'));
  const after = await capture();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Migration changed existing field values');
  if (await db.reasonReconciliation.count() || await db.checkoutReasonResolution.count()) throw Error('Migration fabricated classifications');
  const stockTables = tables.filter(({ tablename }) => !['OriginNode', 'AuditEvent', 'OutboxEvent', 'CommandResult'].includes(tablename));
  const stockBefore = await capture(stockTables);
  const result = await reconciliations.reconcile(manager, randomUUID(), { exceptionIds: [accepted.lines[0]!.exceptionId], reason: { code: 'PRODUCTION_USE' }, remarks: 'Synthetic classification evidence' });
  const stockAfter = await capture(stockTables);
  if (JSON.stringify(stockBefore) !== JSON.stringify(stockAfter)) throw Error('Classification changed existing inventory/history');
  const live = await checkouts.get(manager, accepted.id);
  if (live.outstandingReasonCount !== 0 || accepted.outstandingReasonCount !== 1 || live.lines[0]!.reason !== null) throw Error('Original and resolved status were conflated');
  await mkdir('artifacts/completion', { recursive: true });
  await writeFile('artifacts/completion/reconciliation-preservation.json', JSON.stringify({ syntheticOnly: true, database: previous.database,
    migration: names.at(-1), existingTables: tables.length, before, after, migrationFabricatedClassifications: false,
    preMigrationCheckoutReadPassed: true, readinessDeniedUntilMigration: true, classificationNoStockEffects: true,
    stockBefore, stockAfter, resolvedCount: result.lines.length, originalMissingReasonPreserved: true,
    limitations: ['Retained isolated fixture only; no operational migration or backfill'] }, null, 2));
  console.info(`Migration 022 preserved all ${tables.length} existing table fingerprints; Manager classification preserved inventory/history and original missing reason.`);
} finally { await db.$disconnect(); await sql.end(); }
