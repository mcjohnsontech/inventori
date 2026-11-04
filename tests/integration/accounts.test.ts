import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { passwordHash } from '../../apps/api/src/security.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Isolated local test database required');
describe('shop staff administration',()=>{
 const originId=randomUUID(),foreign=randomUUID(),password=randomUUID(),initialPassword=randomUUID();
 const db=database(url);let app:Awaited<ReturnType<typeof createApp>>,other:typeof app;const tokens:Record<string,string>={},ids:Record<string,string>={};
 beforeAll(async()=>{
  for(const id of [originId,foreign])await db.originNode.create({data:{id,mode:'SHOP'}});
  app=await createApp(db,originId,'SHOP');other=await createApp(db,foreign,'SHOP');
  for(const role of ['ADMIN','MANAGER','PRODUCTION'] as const){const u=await db.user.create({data:{email:`${randomUUID()}@accounts.test`,name:role,role,passwordHash:passwordHash(password),membership:{create:{originId}}}});ids[role]=u.id;tokens[role]=(await request(app.getHttpServer()).post('/v1/sessions').send({email:u.email,password}).expect(200)).body.token;}
 });
 afterAll(async()=>{await app?.close();await other?.close();await db.$disconnect();});
 const get=(path:string,role='ADMIN')=>request(app.getHttpServer()).get(`/v1/${path}`).set('Authorization',`Bearer ${tokens[role]}`);
 const post=(path:string,body:object,key=randomUUID(),role='ADMIN')=>request(app.getHttpServer()).post(`/v1/${path}`).set('Authorization',`Bearer ${tokens[role]}`).set('Idempotency-Key',key).send(body);
 it('denies anonymous, manager, production and foreign-origin session access',async()=>{
  await request(app.getHttpServer()).get('/v1/admin/users').expect(401);
  for(const role of ['MANAGER','PRODUCTION']){await get('admin/users',role).expect(403);await post('admin/users',{},randomUUID(),role).expect(403);}
  await request(other.getHttpServer()).get('/v1/admin/users').set('Authorization',`Bearer ${tokens.ADMIN}`).expect(401);
 });
 it('never auto-enrolls historical users, binds membership immutably and filters all secret fields',async()=>{
  const u=await db.user.create({data:{email:`${randomUUID()}@unmapped.test`,name:'Unmapped',role:'ADMIN',passwordHash:passwordHash(password)}});
  await request(app.getHttpServer()).post('/v1/sessions').send({email:u.email,password}).expect(401);
  expect((await get('admin/users').expect(200)).body.users.map((x:{id:string})=>x.id)).not.toContain(u.id);
  await get(`admin/users/${u.id}`).expect(404);
  await expect(db.shopMembership.update({where:{userId:ids.ADMIN},data:{originId:foreign}})).rejects.toThrow();
  const r=await get(`admin/users/${ids.ADMIN}`).expect(200);expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|tokenHash|currentPassword|initialPassword/);
 });
 it('creates one mapped account under concurrent replay; rejects conflicting key and duplicate email',async()=>{
  const key=randomUUID(),body={name:'Staff member',email:`${randomUUID()}@staff.test`,role:'MANAGER',initialPassword,currentPassword:password};
  const [a,b]=await Promise.all([post('admin/users',body,key).expect(201),post('admin/users',body,key).expect(201)]);expect(a.body).toEqual(b.body);expect(a.body.mustChangePassword).toBe(true);
  await post('admin/users',{...body,name:'Other'},key).expect(409);await post('admin/users',body).expect(409);
  const evidence=await db.commandResult.findFirstOrThrow({where:{originId,key}});expect(JSON.stringify(evidence)).not.toContain(initialPassword);expect(JSON.stringify(evidence)).not.toContain(password);
  const login=await request(app.getHttpServer()).post('/v1/sessions').send({email:body.email,password:initialPassword}).expect(200);
  await request(app.getHttpServer()).get('/v1/receiving/options').set('Authorization',`Bearer ${login.body.token}`).expect(403);
 });
 it('protects self-access, rejects bad proof and revokes sessions after status/role changes',async()=>{
  await post(`admin/users/${ids.ADMIN}/update`,{name:'Admin',role:'PRODUCTION',active:true,currentPassword:password}).expect(409);
  await post(`admin/users/${ids.ADMIN}/update`,{name:'Admin',role:'ADMIN',active:false,currentPassword:password}).expect(409);
  await post(`admin/users/${ids.MANAGER}/update`,{name:'Manager',role:'MANAGER',active:false,currentPassword:'wrong'}).expect(403);
  await post(`admin/users/${ids.MANAGER}/update`,{name:'Manager',role:'MANAGER',active:false,currentPassword:password}).expect(201);
  await get('me','MANAGER').expect(401);
 });
 it('rolls back user creation and every evidence row if outbox fails',async()=>{
  const email=`${randomUUID()}@rollback.test`,sequence=(await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence;
  // Transactional database fault, isolated fixture only.
  await db.$executeRawUnsafe(`CREATE FUNCTION accounts_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."originId"='${originId}'::uuid AND NEW."eventType"='accounts.create' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER accounts_test_failure BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION accounts_test_fail()');
  try{await post('admin/users',{name:'Rollback',email,role:'PRODUCTION',initialPassword,currentPassword:password}).expect(500);expect(await db.user.findUnique({where:{email}})).toBeNull();expect((await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence).toBe(sequence);}finally{await db.$executeRawUnsafe('DROP TRIGGER accounts_test_failure ON "OutboxEvent"');await db.$executeRawUnsafe('DROP FUNCTION accounts_test_fail()');}
 });
 it('bounds filters and denies foreign account mutations without revealing the account',async()=>{
  const u=await db.user.create({data:{email:`${randomUUID()}@foreign.test`,name:'Foreign staff',role:'PRODUCTION',passwordHash:passwordHash(password),membership:{create:{originId:foreign}}}});
  await post(`admin/users/${u.id}/update`,{name:'Changed',role:'ADMIN',active:true,currentPassword:password}).expect(404);
  await post(`admin/users/${u.id}/revoke`,{currentPassword:password}).expect(404);
  await get('admin/users?originId='+foreign).expect(400);await get('admin/users?page=0').expect(400);
  const filtered=(await get('admin/users?role=PRODUCTION&active=true&q=staff').expect(200)).body;
  expect(filtered.users.every((u:{role:string;active:boolean})=>u.role==='PRODUCTION'&&u.active)).toBe(true);
  expect((await get('admin/users?page=100000').expect(200)).body.users).toEqual([]);
 });
 it('concurrent Admin demotions cannot remove the last active shop Admin',async()=>{
  const origin=randomUUID();await db.originNode.create({data:{id:origin,mode:'SHOP'}});const local=await createApp(db,origin,'SHOP');
  try{
   const actors:{id:string;token:string}[]=[];
   for(let i=0;i<2;i++){const u=await db.user.create({data:{email:`${randomUUID()}@admins.test`,name:'Concurrent Admin',role:'ADMIN',passwordHash:passwordHash(password),membership:{create:{originId:origin}}}});const login=await request(local.getHttpServer()).post('/v1/sessions').send({email:u.email,password}).expect(200);actors.push({id:u.id,token:login.body.token});}
   const results=await Promise.all(actors.map((a,i)=>request(local.getHttpServer()).post(`/v1/admin/users/${actors[1-i]!.id}/update`).set('Authorization','Bearer '+a.token).set('Idempotency-Key',randomUUID()).send({name:'Concurrent Admin',role:'MANAGER',active:true,currentPassword:password})));
   expect(results.filter(r=>r.status===201)).toHaveLength(1);expect(results.some(r=>[401,403].includes(r.status))).toBe(true);
   expect(await db.user.count({where:{membership:{originId:origin},role:'ADMIN',active:true}})).toBe(1);
   expect(await db.auditEvent.count({where:{originId:origin}})).toBe(1);expect((await db.originNode.findUniqueOrThrow({where:{id:origin}})).nextSequence).toBe(1n);
  }finally{await local.close();}
 });
});
