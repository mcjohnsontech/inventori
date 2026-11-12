import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {expect,it} from 'vitest';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Isolated database only');
it('rehearses additive reconciliation/closing migrations on isolated copied historical tables without rewriting rows',async()=>{
 const client=new Client({connectionString:url});await client.connect();
 try{
  await client.query('BEGIN');const schema='closing_upgrade_'+randomUUID().replaceAll('-','');await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET LOCAL search_path TO "${schema}",public`);
  const tables=(await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('DailyClose','_prisma_migrations') ORDER BY tablename`)).rows.map(r=>r.tablename as string);
  for(const table of tables){
   await client.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
   const columns=(await client.query(`SELECT a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' ORDER BY a.attnum`,[table])).rows.map(r=>'"'+String(r.attname).replaceAll('"','""')+'"').join(',');
   await client.query(`INSERT INTO "${schema}"."${table}"(${columns}) SELECT ${columns} FROM public."${table}" ${table==='ReasonReconciliation'?`WHERE "actorRole"='MANAGER'`:''} LIMIT 3`);
  }
  await client.query(`ALTER TABLE "ReasonReconciliation" DROP CONSTRAINT "ReasonReconciliation_actorRole_check"`);await client.query(`ALTER TABLE "ReasonReconciliation" ADD CONSTRAINT "ReasonReconciliation_actorRole_check" CHECK("actorRole"='MANAGER')`);
  // LIKE INCLUDING ALL copied current indexes; restore the pre-031 fixture layout.
  for(const index of ['StockLot_originId_id_idx','AuditEvent_originId_commandId_idx','CountAttempt_sessionId_recordedAt_id_idx','StockTransaction_originId_recordedAt_originSequence_idx'])await client.query(`DROP INDEX IF EXISTS "${schema}"."${index}"`);
  const fingerprint=async()=>{const result:Record<string,string>={};for(const table of tables)result[table]=(await client.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) hash FROM "${schema}"."${table}" t`)).rows[0].hash;return result;};
  const before=await fingerprint();
  for(const migration of ['202611120029_admin_reason_reconciliation','202611120030_daily_closing','202611120031_completed_count_certification']){const sql=(await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8')).replace(/^\s*(BEGIN|COMMIT);\s*$/gm,'');await client.query(sql);}
  expect(await fingerprint()).toEqual(before);expect((await client.query('SELECT count(*) n FROM "DailyClose"')).rows[0].n).toBe('0');
 }finally{await client.query('ROLLBACK');await client.end();}
},30000);
