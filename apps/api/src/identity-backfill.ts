import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { allocatePublicIdentity } from './public-code.js';
import { canonical, digest } from './security.js';

export const backfillPlanSchema = z.object({ version: z.literal(1), database: z.string().min(1), originId: z.uuid(), actorId: z.uuid(), kind: z.enum(['PRODUCT','LOT']), ids: z.array(z.uuid()).max(500), key: z.uuid(), after: z.uuid().nullable(), nextCursor: z.uuid().nullable() }).strict();
export function isolatedBackfillUrl(input: string | undefined) {
  if (!input) throw new Error('Set IDENTITY_BACKFILL_DATABASE_URL explicitly to an isolated local *_test database');
  const url = new URL(input);
  if (url.search || url.hash || !['localhost','127.0.0.1'].includes(url.hostname) || !/^\/[A-Za-z0-9_]+_test$/.test(url.pathname)) throw new Error('Backfill refuses operational/remote databases; only isolated local *_test rehearsal is enabled');
  return url;
}
export async function planIdentityBackfill(db: PrismaClient, database: string, originId: string, actorId: string, kind: 'PRODUCT'|'LOT', limit = 100, after: string | null = null) {
  z.object({ originId:z.uuid(),actorId:z.uuid(),kind:z.enum(['PRODUCT','LOT']),limit:z.number().int().min(1).max(500),after:z.uuid().nullable() }).parse({originId,actorId,kind,limit,after});
  const node = await db.originNode.findUnique({where:{id:originId}}), actor=await db.user.findUnique({where:{id:actorId}});
  if(node?.mode!=='SHOP'||!actor?.active||actor.role!=='ADMIN')throw new ForbiddenException('Active Admin and shop origin required');
  const rows = kind==='PRODUCT'
    ? await db.product.findMany({where:{originId,publicIdentity:null,...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:limit+1,select:{id:true}})
    : await db.stockLot.findMany({where:{originId,publicIdentity:null,...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:limit+1,select:{id:true}});
  const ids=rows.slice(0,limit).map(r=>r.id);
  return {version:1 as const,database,originId,actorId,kind,ids,key:randomUUID(),after,nextCursor:rows.length>limit?ids.at(-1)!:null};
}
export async function applyIdentityBackfill(db: PrismaClient, database: string, input: unknown) {
  const plan=backfillPlanSchema.parse(input);
  if(plan.database!==database||new Set(plan.ids).size!==plan.ids.length)throw new BadRequestException('Plan database mismatch or duplicate subjects');
  const hash=digest(canonical(plan));
  for(let attempt=0;;attempt++)try{return await db.$transaction(async tx=>{
    const nodes=await tx.$queryRaw<{mode:string}[]>`SELECT mode FROM "OriginNode" WHERE id=${plan.originId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${plan.actorId}::uuid FOR SHARE`;
    const actor=await tx.user.findUnique({where:{id:plan.actorId}});
    if(nodes[0]?.mode!=='SHOP'||!actor?.active||actor.role!=='ADMIN')throw new ForbiddenException();
    const prior=await tx.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:plan.originId,actorId:plan.actorId,commandType:'identity.backfill',key:plan.key}}});
    if(prior){if(prior.requestHash!==hash)throw new ConflictException('Idempotency key reused with changed backfill plan');return prior.response;}
    if(!plan.ids.length)return {mapped:[],nextCursor:plan.nextCursor};
    const commandId=randomUUID(),mapped=[];
    for(const id of [...plan.ids].sort()){
      const subject=plan.kind==='PRODUCT'?await tx.product.findUnique({where:{id}}):await tx.stockLot.findUnique({where:{id}});
      if(!subject||subject.originId!==plan.originId)throw new BadRequestException('Backfill subject missing or foreign');
      mapped.push({id,code:await allocatePublicIdentity(tx,plan.kind,id,plan.originId,commandId)});
    }
    const response={mapped,nextCursor:plan.nextCursor},node=await tx.originNode.update({where:{id:plan.originId},data:{nextSequence:{increment:1}}});
    const payload={...response,kind:plan.kind,planHash:hash};
    await tx.auditEvent.create({data:{originId:plan.originId,actorId:actor.id,actorRole:actor.role,commandId,action:'identity.backfill',subjectId:plan.originId,snapshot:payload}});
    await tx.outboxEvent.create({data:{originId:plan.originId,originSequence:node.nextSequence,actorId:actor.id,commandId,eventType:'identity.backfill',aggregateId:plan.originId,payload,payloadHash:digest(canonical(payload))}});
    await tx.commandResult.create({data:{id:commandId,originId:plan.originId,actorId:actor.id,commandType:'identity.backfill',key:plan.key,requestHash:hash,response}});
    return response;
  },{timeout:15000,maxWait:10000});}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2034'&&attempt<2)continue;throw e;}
}
