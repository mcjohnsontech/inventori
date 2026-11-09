import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { database } from '../apps/api/src/database.js';
import { isolatedBackfillUrl } from '../apps/api/src/identity-backfill.js';
import { AuthorizationRequestsService } from '../apps/api/src/authorization-requests.service.js';

const url = isolatedBackfillUrl(process.env.TEST_DATABASE_URL), previous = JSON.parse(await readFile('artifacts/completion/damage-preservation.json', 'utf8'));
if (!previous.syntheticOnly || !/^dayari_checkout_compat_[0-9]+_test$/.test(previous.database)) throw Error('Isolated retained fixture required');
url.pathname = '/' + previous.database;
const names = (await readdir('prisma/migrations')).filter(name => /^2026/.test(name)).sort();
if (names.at(-1) !== '202611080026_request_review_preconditions') throw Error('Use the matching milestone commit; future migrations are not installed silently');
const sql = new Client({ connectionString: url.toString() }); await sql.connect(); const db = database(url.toString());
try {
  const schema = (await sql.query(`SELECT to_regclass('"DamageReview"') IS NOT NULL AS previous,to_regclass('"AuthorizationRequest"') IS NULL AS missing`)).rows[0];
  if (!schema.previous || !schema.missing) throw Error('Fixture must remain through 024; no reset or repeated installation');
  const manager = await db.user.findFirstOrThrow({ where: { role: 'MANAGER', active: true, membership: { isNot: null } } });
  const membership = await db.shopMembership.findFirstOrThrow({ where: { userId: manager.id } }), originId = membership.originId;
  const unit = await db.unitState.findFirstOrThrow({ where: { originId, state: 'D' } }), service = new AuthorizationRequestsService(db, originId, 'SHOP');
  let denied = false; try { await service.configuration(manager); } catch (error) { denied = (error as { getStatus?: () => number }).getStatus?.() === 503; }
  if (!denied) throw Error('Readiness gate did not protect prior schema');
  const tables = (await sql.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  async function capture(selected = tables) {
    const result: Record<string, string> = {};
    for (const { tablename } of selected) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      result[tablename] = (await sql.query(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''),'UTF8')),'hex') AS hash FROM ${quoted} t`)).rows[0].hash;
    }
    return result;
  }
  const before = await capture();
  for (const name of ['202611080025_pending_authorization_requests', '202611080026_request_review_preconditions']) await sql.query(await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  const after = await capture(); if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Migration changed existing record fields');
  if (await db.authorizationRequest.count() || await db.authorizationRequestUnit.count()) throw Error('Migration fabricated requests');
  const unchangedTables = tables.filter(({ tablename }) => !['OriginNode', 'AuditEvent', 'OutboxEvent', 'CommandResult'].includes(tablename));
  const stockBefore = await capture(unchangedTables);
  const recovery = await service.create(manager, randomUUID(), { kind: 'RECOVERY', unitIds: [unit.unitId], reason: 'Synthetic recovery investigation request', evidence: 'Retained damaged unit and receipt reviewed in isolated fixture' });
  const preview = await service.preview(manager, { kind: 'CORRECTION', lotId: unit.lotId, state: 'U' });
  if (preview.kind !== 'CORRECTION') throw Error('Expected correction preview');
  const correction = await service.create(manager, randomUUID(), { kind: 'CORRECTION', lotId: unit.lotId, state: 'U',
    observedQuantity: (BigInt(preview.target.ledgerQuantity) + 1n).toString(), reviewedLedgerQuantity: preview.target.ledgerQuantity, reviewedProjectionQuantity: preview.target.projectionQuantity,
    reason: 'Synthetic unresolved extra physical quantity', evidence: 'Observation recorded as pending evidence only; no historical units fabricated' });
  const stockAfter = await capture(unchangedTables); if (JSON.stringify(stockBefore) !== JSON.stringify(stockAfter)) throw Error('Pending request changed existing stock or history');
  if (recovery.status !== 'PENDING_CLOUD_AUTHORIZATION' || correction.requestedDelta !== '1') throw Error('Request acceptance did not preserve pending semantics');
  await mkdir('artifacts/completion', { recursive: true });
  await writeFile('artifacts/completion/pending-request-preservation.json', JSON.stringify({ syntheticOnly: true, database: previous.database,
    migrations: names.slice(-2), existingTables: tables.length, before, after, priorFieldsPreserved: true, migrationFabricatedRequests: false,
    readinessDeniedUntilMigration: true, stockBefore, stockAfter, recoveryAndCorrectionPending: true, extraUnitsNotCreated: true,
    limitations: ['Retained synthetic fixture only; no operational upgrade, historical enrollment or approval execution'] }, null, 2));
  console.info(`Pending-request migrations preserved ${tables.length} prior-table fingerprints; requests preserved all existing stock/history.`);
} finally { await db.$disconnect(); await sql.end(); }
