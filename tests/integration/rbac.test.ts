import { randomUUID } from 'node:crypto';
import { beforeAll,afterAll,it,expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { database } from '../../apps/api/src/database.js';
import { shopToken } from './shop-fixture.js';
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Isolated local test database required');
const db=database(url),originId=randomUUID(),id=randomUUID();let app:Awaited<ReturnType<typeof createApp>>;const tokens:Record<string,string>={};
beforeAll(async()=>{await db.originNode.create({data:{id:originId,mode:'SHOP'}});app=await createApp(db,originId,'SHOP');for(const role of ['ADMIN','MANAGER','PRODUCTION'] as const)tokens[role]=await shopToken(db,app,originId,role);});
afterAll(async()=>{await app?.close();await db.$disconnect();});
it('denies direct sensitive GET routes to Production, including filters and guessed IDs',async()=>{
 for(const path of ['catalogue','receiving/options','receipts',`receipts/${id}`,`receipts/${id}/label-plan`,'stock?productId='+id,`stock/lots/${id}`,'label-print-jobs',`label-print-jobs/${id}`,`label-print-jobs/${id}/artifacts/1.pdf`,'admin/shop','admin/users?q=Admin&active=true',`admin/users/${id}`]){
  await request(app.getHttpServer()).get('/v1/'+path).set('Authorization','Bearer '+tokens.PRODUCTION).expect(403);
 }
});
it('denies sensitive POST routes before resolving foreign or malformed input',async()=>{
 const paths=['catalogue/products','catalogue/product-setups','catalogue/supplier-setups','receipts','label-print-jobs',`label-print-jobs/${id}/events`,`label-print-jobs/${id}/artifacts/1`,'admin/users',`admin/users/${id}/update`,`admin/users/${id}/revoke`];
 for(const path of paths)await request(app.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+tokens.PRODUCTION).set('Idempotency-Key',randomUUID()).send({}).expect(403);
 for(const path of ['admin/users',`admin/users/${id}/update`,`admin/users/${id}/revoke`,'catalogue/products'])await request(app.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+tokens.MANAGER).set('Idempotency-Key',randomUUID()).send({}).expect(403);
});
it('permits only safe own-account DTOs and denies inactive sessions across all roles',async()=>{
 for(const role of ['ADMIN','MANAGER','PRODUCTION']){
  const r=await request(app.getHttpServer()).get('/v1/account').set('Authorization','Bearer '+tokens[role]).expect(200);expect(Object.keys(r.body).sort()).toEqual(['id','name','email','role','active','mustChangePassword','createdAt','originId','sessions'].sort());
  expect(JSON.stringify(r.body)).not.toMatch(/tokenHash|passwordHash|authVersion/);
  await db.user.update({where:{id:r.body.id},data:{active:false}});
  for(const path of ['me','account','qr/manual-sources'])await request(app.getHttpServer()).get('/v1/'+path).set('Authorization','Bearer '+tokens[role]).expect(401);
 }
});
