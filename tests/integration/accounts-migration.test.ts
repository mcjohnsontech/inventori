import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {it,expect} from 'vitest';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Isolated local test database required');
it('additive account migrations preserve historical identities/sessions without implicit enrollment',async()=>{
 const client=new Client({connectionString:url}),schema='account_rehearsal_'+randomUUID().replaceAll('-','');
 await client.connect();
 try{
  await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET search_path TO "${schema}"`);
  await client.query(await readFile('prisma/migrations/202611020001_catalogue_foundation/migration.sql','utf8'));
  const userId=randomUUID(),sessionId=randomUUID();
  await client.query('INSERT INTO "User"(id,email,name,role,"passwordHash",active) VALUES($1,$2,$3,$4,$5,true)',[userId,'historical@fixture.test','Historical fixture','ADMIN','isolated-invalid-hash']);
  await client.query('INSERT INTO "Session"(id,"tokenHash","userId","expiresAt") VALUES($1,$2,$3,now()+interval \'1 hour\')',[sessionId,'isolated-not-an-authentication-token',userId]);
  const users=(await client.query('SELECT * FROM "User"')).rows,sessions=(await client.query('SELECT * FROM "Session"')).rows;
  for(const migration of ['202611030009_shop_accounts','202611030010_account_generation'])await client.query(await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8'));
  const updated=(await client.query('SELECT * FROM "User"')).rows[0];expect(updated).toMatchObject(users[0]);expect(updated.mustChangePassword).toBe(false);expect(updated.authVersion).toBe(0);
  const oldSession=(await client.query('SELECT * FROM "Session"')).rows[0];expect(oldSession).toMatchObject(sessions[0]);expect(oldSession.originId).toBeNull();expect((await client.query('SELECT count(*) FROM "ShopMembership"')).rows[0].count).toBe('0');
 }finally{await client.query('SET search_path TO public');await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await client.end();}
});
