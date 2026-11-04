import { randomUUID } from 'node:crypto';
import type { PrismaClient, Role } from '@prisma/client';
import request from 'supertest';
import type { createApp } from '../../apps/api/src/app.js';
import { passwordHash } from '../../apps/api/src/security.js';
// Explicit isolated account per origin; never reuse a different shop's session.
export async function shopToken(db:PrismaClient,app:Awaited<ReturnType<typeof createApp>>,originId:string,role:Role='ADMIN'){
 const password=randomUUID(),email=`${randomUUID()}@fixture.test`;
 await db.user.create({data:{email,name:'Isolated shop fixture',role,passwordHash:passwordHash(password),membership:{create:{originId}}}});
 return (await request(app.getHttpServer()).post('/v1/sessions').send({email,password}).expect(200)).body.token as string;
}
