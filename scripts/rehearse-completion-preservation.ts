import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { database } from '../apps/api/src/database.js';
import { isolatedBackfillUrl } from '../apps/api/src/identity-backfill.js';
import { CompletionsService } from '../apps/api/src/completions.service.js';

const url = isolatedBackfillUrl(process.env.TEST_DATABASE_URL), previous = JSON.parse(await readFile('artifacts/completion/pending-request-preservation.json', 'utf8'));
if (!previous.syntheticOnly || !/^dayari_checkout_compat_[0-9]+_test$/.test(previous.database)) throw Error('Isolated retained fixture required');
url.pathname = '/' + previous.database;
const names = (await readdir('prisma/migrations')).filter(name => /^2026/.test(name)).sort();
if (names.at(-1) !== '202611090027_production_completion') throw Error('Use the matching milestone commit; future migrations are not installed silently');
const sql = new Client({ connectionString: url.toString() }); await sql.connect(); const db = database(url.toString());
try {
  const schema = (await sql.query(`SELECT to_regclass('"AuthorizationRequest"') IS NOT NULL AS previous,to_regclass('"ProductionCompletion"') IS NULL AS missing`)).rows[0];
  if (!schema.previous || !schema.missing) throw Error('Fixture must remain through 026; no reset or repeated installation');
  const manager = await db.user.findFirstOrThrow({ where: { role: 'MANAGER', active: true, membership: { isNot: null } } });
  const membership = await db.shopMembership.findFirstOrThrow({ where: { userId: manager.id } }), originId = membership.originId;
  const unit = await db.unitState.findFirstOrThrow({ where: { originId, state: 'P' } }), service = new CompletionsService(db, originId, 'SHOP');
  let denied = false; try { await service.configuration(manager); } catch (error) { denied = (error as { getStatus?: () => number }).getStatus?.() === 503; }
  if (!denied) throw Error('Readiness gate did not protect prior schema');
  const tables = (await sql.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  async function capture(selected = tables) {
    const result: Record<string, string> = {};
    for (const { tablename } of selected) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      result[tablename] = (await sql.query(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(${['StockMovement','UnitEvent'].includes(tablename)?"(to_jsonb(t)-'completionLineId')":'to_jsonb(t)'} ORDER BY ${['StockMovement','UnitEvent'].includes(tablename)?"(to_jsonb(t)-'completionLineId')":'to_jsonb(t)'}::text)::text,''),'UTF8')),'hex') AS hash FROM ${quoted} t`)).rows[0].hash;
    }
    return result;
  }
  const before = await capture();
  for (const name of ['202611090027_production_completion']) await sql.query(await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  const after = await capture(); if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Migration changed existing record fields');

  if(await db.productionCompletion.count()||await db.productionCompletionLine.count())throw Error('Migration fabricated completions');
  const unchangedTables=tables.filter(({tablename})=>!['OriginNode','AuditEvent','OutboxEvent','CommandResult','StockTransaction','StockMovement','StockBalance','UnitEvent','UnitState'].includes(tablename));
  const identitiesBefore=await capture(unchangedTables),usableBefore=await db.stockBalance.findFirst({where:{lotId:unit.lotId,state:'U'}});
  const accepted=await service.create(manager,randomUUID(),{unitIds:[unit.unitId]});
  const identitiesAfter=await capture(unchangedTables),usableAfter=await db.stockBalance.findFirst({where:{lotId:unit.lotId,state:'U'}});
  if(JSON.stringify(identitiesBefore)!==JSON.stringify(identitiesAfter))throw Error('Completion changed prior immutable identity, receipt, checkout, request or print history');
  if(usableBefore?.quantity!==usableAfter?.quantity||usableBefore?.version!==usableAfter?.version)throw Error('Completion deducted usable twice');
  if((await db.unitState.findUniqueOrThrow({where:{unitId:unit.unitId}})).state!=='C')throw Error('Completion failed');
  await mkdir('artifacts/completion',{recursive:true});await writeFile('artifacts/completion/completion-preservation.json',JSON.stringify({syntheticOnly:true,database:previous.database,migration:names.at(-1),existingTables:tables.length,before,after,priorFieldsPreserved:true,migrationFabricatedCompletions:false,readinessDeniedUntilMigration:true,identitiesBefore,identitiesAfter,usableUnchanged:true,completionAccepted:true,limitations:['Isolated retained fixture; no operational upgrade or historical enrollment']},null,2));
  console.info(`Completion migration preserved ${tables.length} prior-table fields; actual completion retained identity/receipt/checkout/QR/print/request history and usable balance.`);
} finally {await db.$disconnect();await sql.end();}
