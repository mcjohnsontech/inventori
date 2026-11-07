import 'dotenv/config';
import { Client } from 'pg';
import { readdir,readFile } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
const input=process.env.UNIT_CUTOVER_REHEARSAL_DATABASE_URL;
if(!input)throw Error('Explicit isolated rehearsal URL required');
const url=new URL(input),name=url.pathname.slice(1);
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^dayari_cutover_[a-z0-9_]+_test$/.test(name)||url.search||url.hash)throw Error('Only fresh loopback dayari_cutover_*_test fixtures are permitted');
const adminUrl=new URL(url);adminUrl.pathname='/postgres';
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
try {if((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)throw Error('Fixture already exists; refuses overwrite');await admin.query(`CREATE DATABASE "${name}"`);}finally{await admin.end();}
const db=new Client({connectionString:url.toString()});await db.connect();
try {
 await db.query('CREATE TABLE "_prisma_migrations" (id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)');
 const names=(await readdir('prisma/migrations')).filter(n=>/^2026/.test(n)).sort();
 for(const migration of names.slice(0,13)){
  const bytes=await readFile(`prisma/migrations/${migration}/migration.sql`);await db.query(bytes.toString('utf8'));
  await db.query('INSERT INTO "_prisma_migrations"(id,checksum,migration_name,finished_at,applied_steps_count) VALUES($1,$2,$3,now(),1)',[randomUUID(),createHash('sha256').update(bytes).digest('hex'),migration]);
 }
 await db.query('INSERT INTO "LocationRegistry"(id,name,code,"normalizedName") VALUES($1,$2,$3,lower($2)) ON CONFLICT DO NOTHING',[randomUUID(),'Lagos','LG']);
 console.info('Fresh isolated pre-unit fixture created through migration 013.');
}finally{await db.end();}
