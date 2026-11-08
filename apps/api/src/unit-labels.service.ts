import { randomUUID } from 'node:crypto';
import { BadRequestException,ConflictException,ForbiddenException,NotFoundException,ServiceUnavailableException,UnprocessableEntityException } from '@nestjs/common';
import { Prisma,type PrismaClient,type User } from '@prisma/client';
import { z,type ZodType } from 'zod';
import { encodeUnitQr,idempotencyKeySchema,sheetStartSchema,unitLabelHandoffSchema,unitLabelJobSchema,unitLabelOptionsSchema,unitLabelPreviewSchema,unitLabelProfiles,type LabelProfile,type UnitLabelContent,type UnitLabelJob,type UnitLabelLine,type UnitLabelOptions,type UnitLabelPreview } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { canonical,digest } from './security.js';
import { preflightUnitLabels,renderUnitLabels,unitArtifactCsp,unitRendererVersion } from './unit-label-render.js';
type Tx=Prisma.TransactionClient;
type Source={unitId:string;lotId:string;receiptLineId:string;receiptId:string;initialState:string;currentState:string;content:UnitLabelContent;claimedLineId:string|null;claimedJobId:string|null};
const json=(value:unknown)=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v)) as Prisma.InputJsonValue;
function parse<T>(schema:ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)throw new BadRequestException(result.error.issues.map(issue=>issue.message).join('. '));return result.data;}
const purpose=(state:string)=>state==='U'?'USABLE' as const:'DAMAGED_INTAKE' as const;
export class UnitLabelsService {
 private activeRenders=0;
 constructor(readonly db:PrismaClient,readonly originId:string,readonly mode:string){}
 private async allow(user:User){requireCapability(user,'PRINT_ADMIN');const [row]=await this.db.$queryRaw<{ready:boolean}[]>`SELECT to_regclass('"UnitLabelJob"') IS NOT NULL AS ready`;if(!row?.ready)throw new ServiceUnavailableException('Individual unit labels are not enabled for this shop yet. Existing lot labels remain available.');}
 async configuration(user:User){await this.allow(user);return {originId:this.originId,profiles:unitLabelProfiles,cartLimit:500};}
 private sourceSql(){return Prisma.sql`FROM "StockUnit" u JOIN "UnitState" state ON state."unitId"=u.id JOIN "ReceiptLine" r ON r.id=u."receiptLineId" JOIN "DeliveryBatch" b ON b.id=r."batchId"
  LEFT JOIN "ProductPublicIdentity" pi ON pi."productId"=(r.snapshot->>'productId')::uuid LEFT JOIN "LotPublicIdentity" li ON li."lotId"=u."lotId"
  LEFT JOIN "UnitLabelClaim" c ON c."unitId"=u.id WHERE u."originId"=${this.originId}::uuid`;}
 private sourceFields(){return Prisma.sql`u.id AS "unitId",u."lotId",u."receiptLineId",r."receiptId",u."initialState",state.state AS "currentState",c."lineId" AS "claimedLineId",c."jobId" AS "claimedJobId",
  jsonb_build_object('unitCode',u."unitCode",'productCode',pi.code,'lotCode',li.code,'fullSku',r.snapshot->>'fullCode','publicBatchCode',b."publicCode",'productName',r.snapshot->>'productName','variantName',r.snapshot->>'variantName','supplierName',b.snapshot->>'supplierName','sourceName',b.snapshot->>'sourceName') AS content`;}
 private async sources(tx:Tx,ids:string[]){
  const rows=await tx.$queryRaw<Source[]>(Prisma.sql`SELECT ${this.sourceFields()} ${this.sourceSql()} AND u.id IN (${Prisma.join(ids.map(id=>Prisma.sql`${id}::uuid`))}) ORDER BY u.id`);
  if(rows.length!==ids.length)throw new NotFoundException('One or more selected units are unavailable in this shop');return rows;
 }
 async options(user:User,input:unknown):Promise<UnitLabelOptions>{
  await this.allow(user);const query=parse(unitLabelOptionsSchema,input),pattern='%'+query.query.replace(/[\\%_]/g,'\\$&')+'%';
  return this.db.$transaction(async tx=>{
   const from=Prisma.sql`${this.sourceSql()} AND (${query.receiptId??null}::uuid IS NULL OR r."receiptId"=${query.receiptId??null}::uuid)
    AND (${query.lotId??null}::uuid IS NULL OR u."lotId"=${query.lotId??null}::uuid)
    AND (${query.mode}='INITIAL' AND c."unitId" IS NULL OR ${query.mode}='REPRINT' AND c."unitId" IS NOT NULL)
    AND (u."unitCode" ILIKE ${pattern} OR r.snapshot->>'productName' ILIKE ${pattern} OR r.snapshot->>'variantName' ILIKE ${pattern} OR r.snapshot->>'fullCode' ILIKE ${pattern} OR li.code ILIKE ${pattern} OR b."publicCode" ILIKE ${pattern})`;
   const [count]=await tx.$queryRaw<{n:bigint}[]>(Prisma.sql`SELECT count(*) AS n ${from}`);
   const rows=await tx.$queryRaw<Source[]>(Prisma.sql`SELECT ${this.sourceFields()} ${from} ORDER BY u."recordedAt" DESC,u."unitCode" LIMIT 50 OFFSET ${(query.page-1)*50}`);
   return {originId:this.originId,total:Number(count!.n),page:query.page,pageSize:50,profiles:unitLabelProfiles,units:rows.map(row=>({unitId:row.unitId,unitCode:row.content.unitCode,lotId:row.lotId,lotCode:row.content.lotCode,receiptId:row.receiptId,productName:row.content.productName,variantName:row.content.variantName,fullSku:row.content.fullSku,publicBatchCode:row.content.publicBatchCode,initialPurpose:purpose(row.initialState),currentState:row.currentState,claimedLineId:row.claimedLineId,claimedJobId:row.claimedJobId}))};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 async readJob(tx:Tx,id:string):Promise<UnitLabelJob>{
  const job=await tx.unitLabelJob.findUnique({where:{id}});if(!job||job.originId!==this.originId)throw new NotFoundException('Unit label job not found');
  const lines=await tx.unitLabelLine.findMany({where:{jobId:id},orderBy:{ordinal:'asc'}});
  const artifact=await tx.unitLabelArtifact.findUnique({where:{jobId:id},select:{id:true,htmlHash:true,pdfHash:true,pages:true,createdAt:true}});
  const handoffs=await tx.unitLabelEvent.findMany({where:{jobId:id,kind:'HANDOFF_REQUESTED'},orderBy:[{recordedAt:'desc'},{id:'asc'}],take:20,select:{id:true,artifactId:true,attemptId:true,recordedAt:true}});
  const handoffCount=await tx.unitLabelEvent.count({where:{jobId:id,kind:'HANDOFF_REQUESTED'}});
  return {id,originId:job.originId,kind:job.kind as UnitLabelJob['kind'],originalJobId:job.originalJobId,reason:job.reason,profile:job.profile as unknown as LabelProfile,rendererVersion:job.rendererVersion,manifestHash:job.manifestHash,totalLabels:job.totalLabels,createdAt:job.createdAt.toISOString(),lines:lines.map(line=>({id:line.id,unitId:line.unitId,lotId:line.lotId,receiptLineId:line.receiptLineId,ordinal:line.ordinal,purpose:line.purpose as UnitLabelLine['purpose'],payload:line.payload,content:line.content as unknown as UnitLabelContent,originalLineId:line.originalLineId})),artifact:artifact?{...artifact,createdAt:artifact.createdAt.toISOString()}:null,handoffCount,handoffs:handoffs.map(event=>({...event,artifactId:event.artifactId!,recordedAt:event.recordedAt.toISOString()}))};
 }
 async get(user:User,id:unknown){await this.allow(user);return this.readJob(this.db,parse(idempotencyKeySchema,id));}
 async previews(user:User,input:unknown):Promise<UnitLabelPreview[]>{
  await this.allow(user);const {unitIds}=parse(unitLabelPreviewSchema,input),rows=await this.sources(this.db,unitIds),byId=new Map(rows.map(row=>[row.unitId,row]));
  return unitIds.map(unitId=>{const row=byId.get(unitId)!;return {unitId,lotId:row.lotId,receiptLineId:row.receiptLineId,purpose:purpose(row.initialState),payload:encodeUnitQr(this.originId,unitId),content:row.content,currentState:row.currentState,claimedLineId:row.claimedLineId,claimedJobId:row.claimedJobId};});
 }
 async requests(user:User,idInput:unknown,input:unknown){
  await this.allow(user);const id=parse(idempotencyKeySchema,idInput),{page}=parse(z.object({page:z.coerce.number().int().min(1).max(1_000_000).default(1)}).strict(),input);await this.readJob(this.db,id);
  const where={jobId:id,kind:'HANDOFF_REQUESTED'},[total,events]=await this.db.$transaction([this.db.unitLabelEvent.count({where}),this.db.unitLabelEvent.findMany({where,orderBy:[{recordedAt:'desc'},{id:'asc'}],skip:(page-1)*20,take:20,select:{id:true,attemptId:true,recordedAt:true}})]);
  return {total,page,pageSize:20,events:events.map(event=>({...event,recordedAt:event.recordedAt.toISOString()}))};
 }
 async list(user:User,input:unknown){
  await this.allow(user);const {page,receiptId}=parse(z.object({page:z.coerce.number().int().min(1).max(1_000_000).default(1),receiptId:z.uuid().optional()}).strict(),input);
  const from=Prisma.sql`FROM "UnitLabelJob" j WHERE j."originId"=${this.originId}::uuid AND (${receiptId??null}::uuid IS NULL OR EXISTS(SELECT 1 FROM "UnitLabelLine" l JOIN "ReceiptLine" r ON r.id=l."receiptLineId" WHERE l."jobId"=j.id AND r."receiptId"=${receiptId??null}::uuid))`;
  const [count]=await this.db.$queryRaw<{n:bigint}[]>(Prisma.sql`SELECT count(*) AS n ${from}`);
  const jobs=await this.db.$queryRaw<{id:string;kind:string;totalLabels:number;reason:string;createdAt:Date}[]>(Prisma.sql`SELECT j.id,j.kind,j."totalLabels",j.reason,j."createdAt" ${from} ORDER BY j."createdAt" DESC,j.id LIMIT 20 OFFSET ${(page-1)*20}`);
  return {total:Number(count!.n),page,pageSize:20,jobs:jobs.map(job=>({...job,createdAt:job.createdAt.toISOString()}))};
 }
 private async command<T extends {id:string}>(user:User,keyInput:unknown,type:string,input:unknown,work:(tx:Tx,commandId:string,actor:User)=>Promise<T>):Promise<T>{
  await this.allow(user);if(this.mode!=='SHOP')throw new ForbiddenException('Print metadata writes belong to the shop');
  const key=parse(idempotencyKeySchema,keyInput),requestHash=digest(canonical(input));
  for(let attempt=0;;attempt++)try{return await this.db.$transaction(async tx=>{
   const [node]=await tx.$queryRaw<{mode:string}[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;if(node?.mode!=='SHOP')throw new ForbiddenException();
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;const actor=await tx.user.findUniqueOrThrow({where:{id:user.id}});requireCapability(actor,'PRINT_ADMIN');if(actor.authVersion!==user.authVersion||actor.mustChangePassword)throw new ForbiddenException('Session security state changed');
   const prior=await tx.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:this.originId,actorId:user.id,commandType:type,key}}});
   if(prior){if(prior.requestHash!==requestHash)throw new ConflictException('Idempotency key reused with a different label request');return prior.response as unknown as T;}
   const commandId=randomUUID(),result=await work(tx,commandId,actor),response=json(result),nodeState=await tx.originNode.update({where:{id:this.originId},data:{nextSequence:{increment:1}}});
   const payload=json({subject:response,actorId:actor.id,actorRole:actor.role,commandId});
   await tx.auditEvent.create({data:{originId:this.originId,actorId:actor.id,actorRole:actor.role,commandId,action:type,subjectId:result.id,snapshot:payload}});
   await tx.outboxEvent.create({data:{originId:this.originId,originSequence:nodeState.nextSequence,actorId:actor.id,commandId,eventType:type,aggregateId:result.id,payload,payloadHash:digest(canonical(payload))}});
   await tx.commandResult.create({data:{id:commandId,originId:this.originId,actorId:actor.id,commandType:type,key,requestHash,response}});return result;
  },{timeout:15000,maxWait:10000});}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError){if(error.code==='P2034'&&attempt<2)continue;if(error.code==='P2002')throw new ConflictException('A selected unit already has an initial label job, or this print attempt already exists. Refresh and use an explicit reprint.');}throw error;}
 }
 async create(user:User,key:unknown,input:unknown):Promise<UnitLabelJob>{
  await this.allow(user);const body=parse(unitLabelJobSchema,input),validatedKey=parse(idempotencyKeySchema,key),id=randomUUID();
  const prior=await this.db.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:this.originId,actorId:user.id,commandType:'unit.labels.jobs.create',key:validatedKey}}});
  if(prior)return this.command<UnitLabelJob>(user,validatedKey,'unit.labels.jobs.create',body,async()=>{throw new ConflictException('Accepted label command is unavailable');});let profile:LabelProfile,lines:UnitLabelLine[],originalJobId:string|null=null,reason='';
  if(body.kind==='INITIAL'){
   profile=unitLabelProfiles.find(profile=>profile.id===body.profileId)!;const rows=await this.sources(this.db,body.unitIds),byId=new Map(rows.map(row=>[row.unitId,row]));
   lines=body.unitIds.map(unitId=>{const row=byId.get(unitId)!;return {id:randomUUID(),unitId,lotId:row.lotId,receiptLineId:row.receiptLineId,ordinal:0,purpose:purpose(row.initialState),payload:encodeUnitQr(this.originId,unitId),content:row.content,originalLineId:null};});
  }else{
   const original=await this.readJob(this.db,body.originalJobId);profile=original.profile;originalJobId=original.id;reason=body.reason;
   if(original.rendererVersion!==unitRendererVersion)throw new ConflictException('The retained unit-label renderer is unavailable');
   lines=body.lineIds.map(lineId=>{const line=original.lines.find(line=>line.id===lineId);if(!line)throw new BadRequestException('Reprints must select exact lines in the original job');return {...line,id:randomUUID(),originalLineId:line.id};});
  }
  lines.sort((a,b)=>Number(a.purpose==='DAMAGED_INTAKE')-Number(b.purpose==='DAMAGED_INTAKE'));lines=lines.map((line,index)=>({...line,ordinal:index+1}));
  try{preflightUnitLabels({profile,lines});}catch(error){throw new UnprocessableEntityException((error as Error).message);}
  const manifest={originId:this.originId,kind:body.kind,originalJobId,reason,profile,rendererVersion:unitRendererVersion,lines},canonicalManifest=canonical(manifest),manifestHash=digest(canonicalManifest);
  return this.command(user,key,'unit.labels.jobs.create',body,async(tx,commandId,actor)=>{
   const unitIds=lines.map(line=>line.unitId).sort();await tx.$queryRaw(Prisma.sql`SELECT id FROM "StockUnit" WHERE id IN (${Prisma.join(unitIds.map(id=>Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`);
   const current=await this.sources(tx,unitIds);
   if(body.kind==='INITIAL')for(const line of lines){const row=current.find(row=>row.unitId===line.unitId)!;if(row.claimedLineId)throw new ConflictException('One or more units already have an initial label job. Select exact saved labels for reprint.');if(canonical(row.content)!==canonical(line.content))throw new ConflictException('Label information changed. Review the selection again.');}
   const now=new Date();await tx.unitLabelJob.create({data:{id,originId:this.originId,actorId:actor.id,actorRole:actor.role,commandId,kind:body.kind,originalJobId,reason,profile:json(profile),rendererVersion:unitRendererVersion,canonicalManifest,manifestHash,totalLabels:lines.length,createdAt:now}});
   const records=JSON.stringify(lines.map(line=>({...line,jobId:id})));await tx.$executeRaw`INSERT INTO "UnitLabelLine" SELECT * FROM jsonb_populate_recordset(NULL::"UnitLabelLine",${records}::jsonb)`;
   if(body.kind==='INITIAL')await tx.unitLabelClaim.createMany({data:lines.map(line=>({unitId:line.unitId,lineId:line.id,jobId:id}))});
   await tx.unitLabelEvent.create({data:{id:randomUUID(),jobId:id,originId:this.originId,actorId:actor.id,actorRole:actor.role,commandId,kind:'REQUESTED',attemptId:id,recordedAt:now}});
   return this.readJob(tx,id);
  });
 }
 private artifactSummary(jobId:string,artifact:{id:string;htmlHash:string;pdfHash:string;pages:number}){return {id:jobId,artifactId:artifact.id,htmlHash:artifact.htmlHash,pdfHash:artifact.pdfHash,pages:artifact.pages,htmlUrl:`/api/unit-label-jobs/${jobId}/artifacts/${artifact.id}.html`,pdfUrl:`/api/unit-label-jobs/${jobId}/artifacts/${artifact.id}.pdf`};}
 async prepare(user:User,idInput:unknown,key:unknown,input:unknown={}){
  await this.allow(user);parse(idempotencyKeySchema,key);const id=parse(idempotencyKeySchema,idInput),job=await this.readJob(this.db,id),requested=parse(sheetStartSchema,input);
  const existing=await this.db.unitLabelArtifact.findUnique({where:{jobId:id},select:{id:true,htmlHash:true,pdfHash:true,pages:true,layout:true}});
  const start=existing&&Object.keys(input as object).length===0?parse(sheetStartSchema,existing.layout):requested;
  if(existing&&canonical(start)!==canonical(existing.layout))throw new ConflictException('Prepared layout is immutable. Reprint the exact saved identities to use another sheet.');
  let rendered:Awaited<ReturnType<typeof renderUnitLabels>>|null=null;const artifactId=randomUUID();
  if(!existing){if(this.activeRenders>=2)throw new ConflictException('Label generation is busy; retry shortly');this.activeRenders++;try{rendered=await renderUnitLabels(job,artifactId,start);}catch(error){throw new UnprocessableEntityException((error as Error).message);}finally{this.activeRenders--;}}
  return this.command(user,key,'unit.labels.artifact.prepare',{id,start},async(tx,commandId,actor)=>{
   const prior=await tx.unitLabelArtifact.findUnique({where:{jobId:id},select:{id:true,htmlHash:true,pdfHash:true,pages:true,layout:true}});
   if(prior){if(canonical(prior.layout)!==canonical(start))throw new ConflictException('Another request prepared a different layout');return this.artifactSummary(id,prior);}
   if(!rendered)throw new ConflictException('Prepared artifact is unavailable');const now=new Date();
   await tx.unitLabelArtifact.create({data:{id:artifactId,jobId:id,originId:this.originId,actorId:actor.id,actorRole:actor.role,commandId,html:rendered.html,pdf:new Uint8Array(rendered.pdf),htmlHash:rendered.htmlHash,pdfHash:rendered.pdfHash,layout:json(start),pages:rendered.pages,createdAt:now}});
   await tx.unitLabelEvent.create({data:{id:randomUUID(),jobId:id,artifactId,originId:this.originId,actorId:actor.id,actorRole:actor.role,commandId,kind:'ARTIFACT_READY',attemptId:artifactId,recordedAt:now}});
   return this.artifactSummary(id,{id:artifactId,...rendered});
  });
 }
 async artifact(user:User,idInput:unknown,artifactInput:unknown,format:'html'|'pdf'){
  await this.allow(user);const id=parse(idempotencyKeySchema,idInput),artifactId=parse(idempotencyKeySchema,artifactInput);await this.readJob(this.db,id);
  const artifact=await this.db.unitLabelArtifact.findFirst({where:{id:artifactId,jobId:id,originId:this.originId}});if(!artifact)throw new NotFoundException('Prepared unit labels not found');
  return format==='html'?{bytes:Buffer.from(artifact.html,'utf8'),hash:artifact.htmlHash,csp:unitArtifactCsp(artifact.html)}:{bytes:Buffer.from(artifact.pdf),hash:artifact.pdfHash,csp:undefined};
 }
 async handoff(user:User,idInput:unknown,key:unknown,input:unknown){
  const id=parse(idempotencyKeySchema,idInput),body=parse(unitLabelHandoffSchema,input);
  return this.command(user,key,'unit.labels.handoff',{id,...body},async(tx,commandId,actor)=>{
   const job=await this.readJob(tx,id);if(!job.artifact)throw new ConflictException('Prepare the label document first');const now=new Date();
   const event=await tx.unitLabelEvent.create({data:{id:randomUUID(),jobId:id,artifactId:job.artifact.id,originId:this.originId,actorId:actor.id,actorRole:actor.role,commandId,kind:'HANDOFF_REQUESTED',attemptId:body.attemptId,recordedAt:now}});
   return {id,eventId:event.id,artifactId:job.artifact.id,attemptId:body.attemptId,requestedAt:now.toISOString(),physicalOutcome:'NOT_CONFIRMED'};
  });
 }
}
