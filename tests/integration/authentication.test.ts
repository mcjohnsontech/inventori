import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,it,expect } from 'vitest';
import request from 'supertest';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { CatalogueService } from '../../apps/api/src/catalogue.service.js';
import { passwordHash } from '../../apps/api/src/security.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Isolated test database required');
describe('authentication, onboarding and revocation',()=>{
 const db=database(url),originId=randomUUID(),password=randomUUID();let app:Awaited<ReturnType<typeof createApp>>,token:string,id:string,email:string;
 const login=(email:string,password:string)=>request(app.getHttpServer()).post('/v1/sessions').send({email,password});
 const get=(path:string,auth=token)=>request(app.getHttpServer()).get(`/v1/${path}`).set('Authorization',`Bearer ${auth}`);
 const post=(path:string,body:object,auth=token)=>request(app.getHttpServer()).post(`/v1/${path}`).set('Authorization',`Bearer ${auth}`).set('Idempotency-Key',randomUUID()).send(body);
 beforeAll(async()=>{await db.originNode.create({data:{id:originId,mode:'SHOP'}});email=`${randomUUID()}@auth.test`;const u=await db.user.create({data:{email,name:'Auth Admin',role:'ADMIN',passwordHash:passwordHash(password),membership:{create:{originId}}}});id=u.id;app=await createApp(db,originId,'SHOP');await app.listen(0,'127.0.0.1');token=(await login(email,password).expect(200)).body.token;});
 afterAll(async()=>{await app?.close();await db.$disconnect();});
 it('enforces first-login change on every domain path and revokes all sessions on completion',async()=>{
  const email=`${randomUUID()}@onboarding.test`,initial=randomUUID(),next=randomUUID();
  await post('admin/users',{email,name:'New staff',role:'MANAGER',initialPassword:initial,currentPassword:password}).expect(201);
  const a=(await login(email,initial).expect(200)).body.token,b=(await login(email,initial).expect(200)).body.token;
  expect((await get('me',a).expect(200)).body.mustChangePassword).toBe(true);
  for(const path of ['account','catalogue','receipts','stock','qr/manual-sources','label-print-jobs','admin/users'])await get(path,a).expect(403);
  await post('account/password',{currentPassword:initial,newPassword:next},a).expect(201);
  await get('me',a).expect(401);await get('me',b).expect(401);await login(email,initial).expect(401);
  const signed=(await login(email,next).expect(200)).body;expect(signed.user.mustChangePassword).toBe(false);
  await get('stock',signed.token).expect(200);
  const events=await db.auditEvent.findMany({where:{originId,action:'accounts.password.changed'}});expect(events).toHaveLength(1);expect(JSON.stringify(events)).not.toContain(initial);expect(JSON.stringify(events)).not.toContain(next);
 });
 it('rejects password reuse, incorrect proof and weak passwords without changing security state',async()=>{
  const before=await db.user.findUniqueOrThrow({where:{id}});
  await post('account/password',{currentPassword:password,newPassword:password}).expect(400);
  await post('account/password',{currentPassword:'incorrect',newPassword:randomUUID()}).expect(403);
  await post('account/password',{currentPassword:password,newPassword:'short'}).expect(400);
  expect((await db.user.findUniqueOrThrow({where:{id}})).passwordHash).toBe(before.passwordHash);await get('me').expect(200);
 });
 it('rejects expired and revoked sessions, filters own profile and blocks stale authenticated commands',async()=>{
  const safe=(await get('account').expect(200)).body;expect(safe.email).toBe(email);expect(JSON.stringify(safe)).not.toMatch(/passwordHash|tokenHash|authVersion/);
  const expired=(await login(email,password).expect(200)).body.token;
  const {digest}=await import('../../apps/api/src/security.js');await db.session.update({where:{tokenHash:digest(expired)},data:{expiresAt:new Date(0)}});await get('me',expired).expect(401);
  const stale=await db.user.findUniqueOrThrow({where:{id}});
  await post(`admin/users/${id}/revoke`,{currentPassword:password}).expect(201);
  await get('me').expect(401);
  await expect(new CatalogueService(db,originId,'SHOP').create(stale,'products',randomUUID(),{name:'Stale command'})).rejects.toThrow();
  token=(await login(email,password).expect(200)).body.token;
 });
 it('serializes concurrent failed logins and enforces persistent failure limits',async()=>{
  const email=`${randomUUID()}@limit.test`;
  const results=await Promise.all(Array.from({length:12},()=>login(email,'wrong')));expect(results.every(r=>r.status===401)).toBe(true);
  expect(await db.loginAttempt.count({where:{email}})).toBe(10);
 });
 it('concurrent sign-in and deactivation preserve origin-first locks and leave no usable session',async()=>{
  const email=`${randomUUID()}@deactivation.test`;
  const u=await db.user.create({data:{email,name:'Concurrent staff',role:'PRODUCTION',passwordHash:passwordHash(password),membership:{create:{originId}}}});
  const [signed,disabled]=await Promise.all([login(email,password),post(`admin/users/${u.id}/update`,{name:u.name,role:u.role,active:false,currentPassword:password})]);
  expect(disabled.status).toBe(201);expect([200,401]).toContain(signed.status);
  if(signed.status===200)await get('me',signed.body.token).expect(401);
  expect(await db.session.count({where:{userId:u.id,revokedAt:null}})).toBe(0);
  expect((await db.user.findUniqueOrThrow({where:{id:u.id}})).active).toBe(false);
 });
});
