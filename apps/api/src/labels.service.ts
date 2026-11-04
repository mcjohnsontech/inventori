import { requireCapability } from './permissions.js';
import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { z, type ZodType } from 'zod';
import { defaultSheetCount, defaultSheetStart, planLabelSheets, savedSheetStart, sheetStartSchema, type SheetStart, chunkRange, decodeQr, encodeQr, idempotencyKeySchema, labelProfiles, printEventSchema, printJobSchema, qrRequestSchema, QrError, type LabelJob, type LabelLine, type LabelProfile, type QrLookup } from '@dayari/contracts';
import { canonical, digest } from './security.js';
import { ReceivingService } from './receiving.service.js';
import { renderLabelPdf, rendererVersion } from './label-pdf.js';
type Tx=Prisma.TransactionClient;
const bytesHash=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const json=(value:unknown)=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v)) as Prisma.InputJsonValue;
function parse<T>(schema:ZodType<T>,input:unknown):T {const r=schema.safeParse(input);if(!r.success)throw new BadRequestException(r.error.issues.map(x=>x.message).join('. '));return r.data;}
export class LabelsService {
 private activeRenders=0;
 private reads=new Map<string,{at:number;count:number}>();
 constructor(readonly db:PrismaClient,readonly originId:string,readonly mode:string){}
 private printRole(user:User){requireCapability(user,'PRINT_ADMIN');}
 private lookupRole(user:User){requireCapability(user,'IDENTIFY');const now=Date.now();if(this.reads.size>10000)for(const [id,row] of this.reads)if(now-row.at>60000)this.reads.delete(id);const prior=this.reads.get(user.id);const row=prior&&now-prior.at<60000?prior:{at:now,count:0};if(++row.count>120)throw new HttpException('Too many lookup requests; try again shortly',429);this.reads.set(user.id,row);}
 async resolve(user:User,input:unknown){this.lookupRole(user);const body=parse(qrRequestSchema,input);let identity;try{identity=decodeQr(body.payload);}catch(e){if(e instanceof QrError){if(e.kind==='UNSUPPORTED_QR_VERSION')throw new UnprocessableEntityException(e.kind);throw new BadRequestException(e.kind);}throw e;}return this.lookup(user,identity.originId,identity.lotId);}
 private async lookup(user:User,originId:string,lotId:string):Promise<QrLookup>{
  if(originId!==this.originId)throw new NotFoundException('LOT_NOT_AVAILABLE');
  const rows=await this.db.$queryRaw<(QrLookup & {damaged:string;supplierName:string;sourceName:string})[]>`
   SELECT pi.code AS "productCode",li.code AS "lotCode",l.id AS "lotId",l."originId",s.id AS "skuId",s."fullCode" AS "fullSku",b.id AS "batchId",b."publicCode" AS "publicBatchCode",p.id AS "productId",p.name AS "productName",v.id AS "variantId",v.name AS "variantName",sup.name AS "supplierName",src.name AS "sourceName",COALESCE(u.quantity,0)::text AS usable,COALESCE(d.quantity,0)::text AS damaged
   FROM "StockLot" l JOIN "DeliveryBatch" b ON b.id=l."batchId" AND b."originId"=l."originId" AND b."sourceId"=l."sourceId"
   JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "ProductSourcing" ps ON ps.id=s."sourcingId" AND ps."sourceId"=l."sourceId"
   JOIN "Product" p ON p.id=s."productId" JOIN "Variant" v ON v.id=s."variantId" AND v."productId"=p.id
   JOIN "SupplierSource" src ON src.id=l."sourceId" JOIN "Supplier" sup ON sup.id=src."supplierId"
   LEFT JOIN "ProductPublicIdentity" pi ON pi."productId"=p.id LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id
   LEFT JOIN "StockBalance" u ON u."lotId"=l.id AND u.state='U' LEFT JOIN "StockBalance" d ON d."lotId"=l.id AND d.state='D'
   WHERE l.id=${lotId}::uuid AND l."originId"=${originId}::uuid`;
  const row=rows[0];if(!row)throw new NotFoundException('LOT_NOT_AVAILABLE');
  const result:QrLookup={productCode:row.productCode??null,lotCode:row.lotCode??null,payloadVersion:1,originId:row.originId,lotId:row.lotId,skuId:row.skuId,fullSku:row.fullSku,batchId:row.batchId,publicBatchCode:row.publicBatchCode,productId:row.productId,productName:row.productName,variantId:row.variantId,variantName:row.variantName,usable:row.usable,dataAsOf:new Date().toISOString()};
  if(user.role!=='PRODUCTION'){result.damaged=row.damaged;result.supplierName=row.supplierName;result.sourceName=row.sourceName;}return result;
 }
 async manualSources(user:User){this.lookupRole(user);return this.db.$queryRaw<{id:string;name:string;code:string;originId:string}[]>`SELECT DISTINCT s.id,s.name,s.code,l."originId" FROM "SupplierSource" s JOIN "StockLot" l ON l."sourceId"=s.id WHERE l."originId"=${this.originId}::uuid ORDER BY s.name`;}
 async manual(user:User,input:unknown){this.lookupRole(user);const body=parse(z.object({sourceId:z.uuid().transform(value=>value.toLowerCase()),originId:z.uuid().transform(value=>value.toLowerCase()),fullSku:z.string().min(1).max(400),publicBatchCode:z.string().min(1).max(64)}).strict(),input);
  const rows=await this.db.$queryRaw<{id:string}[]>`SELECT l.id FROM "StockLot" l JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "DeliveryBatch" b ON b.id=l."batchId" WHERE l."sourceId"=${body.sourceId}::uuid AND l."originId"=${body.originId}::uuid AND s."fullCode"=${body.fullSku} AND b."publicCode"=${body.publicBatchCode} AND l."originId"=${this.originId}::uuid`;
  if(rows.length!==1)throw new NotFoundException('LOT_NOT_AVAILABLE');return this.lookup(user,body.originId,rows[0]!.id);
 }
 async readJob(tx:Tx,id:string):Promise<LabelJob>{
  const job=await tx.labelPrintJob.findUnique({where:{id}});if(!job||job.originId!==this.originId)throw new NotFoundException('Print job not found');
  const lines=await tx.labelPrintJobLine.findMany({where:{jobId:id},orderBy:{ordinal:'asc'}});const events=await tx.labelPrintEvent.findMany({where:{jobId:id},orderBy:[{createdAt:'asc'},{id:'asc'}]});const profile=job.profile as unknown as LabelProfile;
  return {id,receiptId:job.receiptId,originId:job.originId,kind:job.kind,originalJobId:job.originalJobId,reason:job.reason,profile,rendererVersion:job.rendererVersion,createdAt:job.createdAt.toISOString(),manifestHash:job.manifestHash,totalCopies:job.totalCopies.toString(),chunks:((job.totalCopies+499n)/500n).toString(),labelsPerSheet:profile.columns*profile.rows,totalSheets:defaultSheetCount(lines.map(l=>({...l,copies:l.copies.toString(),purpose:l.purpose as LabelLine['purpose'],content:l.content as LabelLine['content']})),profile).toString(),lines:lines.map(line=>({id:line.id,receiptLineId:line.receiptLineId,lotId:line.lotId,purpose:line.purpose as LabelLine['purpose'],copies:line.copies.toString(),payload:line.payload,content:line.content as unknown as LabelLine['content']})),events:events.map(e=>({id:e.id,kind:e.kind,chunk:e.chunk,attemptId:e.attemptId,copies:e.copies.toString(),artifactHash:e.artifactHash,note:e.note,createdAt:e.createdAt.toISOString()}))};
 }
 async get(user:User,id:string){this.printRole(user);return this.readJob(this.db,parse(idempotencyKeySchema,id));}
 async list(user:User){this.printRole(user);const jobs=await this.db.labelPrintJob.findMany({where:{originId:this.originId},orderBy:{createdAt:'desc'},take:100});return jobs.map(job=>({id:job.id,receiptId:job.receiptId,kind:job.kind,totalCopies:job.totalCopies.toString(),createdAt:job.createdAt.toISOString(),reason:job.reason}));}
 async plan(user:User,id:string){this.printRole(user);const receipt=await new ReceivingService(this.db,this.originId,this.mode).get(user,id);return {...receipt,profiles:labelProfiles,initialJobId:(await this.db.labelPrintJob.findFirst({where:{receiptId:id,kind:'INITIAL'}}))?.id??null};}
 private async command(user:User,keyInput:unknown,type:string,input:unknown,work:(tx:Tx,commandId:string)=>Promise<{id:string;[key:string]:unknown}>){
  this.printRole(user);if(this.mode!=='SHOP')throw new ForbiddenException('Print metadata writes belong to the shop');const key=parse(idempotencyKeySchema,keyInput),requestHash=digest(canonical(input));
  for(let attempt=0;;attempt++)try{return await this.db.$transaction(async tx=>{
   const nodes=await tx.$queryRaw<{mode:string}[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;if(nodes[0]?.mode!=='SHOP')throw new ForbiddenException();
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;const actor=await tx.user.findUniqueOrThrow({where:{id:user.id}});this.printRole(actor);if(actor.authVersion!==user.authVersion||actor.mustChangePassword)throw new ForbiddenException('Session security state changed');
   const prior=await tx.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:this.originId,actorId:user.id,commandType:type,key}}});if(prior){if(prior.requestHash!==requestHash)throw new ConflictException('Idempotency key reused with different label request');return prior.response;}
   const commandId=randomUUID(),response=json(await work(tx,commandId));const node=await tx.originNode.update({where:{id:this.originId},data:{nextSequence:{increment:1}}});const subjectId=(response as {id:string}).id;const payload=json({subject:response,actorId:user.id,actorRole:actor.role,commandId});
   await tx.auditEvent.create({data:{originId:this.originId,actorId:user.id,actorRole:actor.role,commandId,action:type,subjectId,snapshot:payload}});
   await tx.outboxEvent.create({data:{originId:this.originId,originSequence:node.nextSequence,actorId:user.id,commandId,eventType:type,aggregateId:subjectId,payload,payloadHash:digest(canonical(payload))}});
   await tx.commandResult.create({data:{id:commandId,originId:this.originId,actorId:user.id,commandType:type,key,requestHash,response}});return response;
  },{timeout:15000,maxWait:10000});}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError){if(e.code==='P2034'&&attempt<2)continue;if(e.code==='P2002')throw new ConflictException('Initial manifest or attempt already exists; open the existing job');}throw e;}
 }
 async create(user:User,key:unknown,input:unknown){this.printRole(user);const body=parse(printJobSchema,input);
  const parsedKey=parse(idempotencyKeySchema,key);
  const prior=await this.db.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:this.originId,actorId:user.id,commandType:'labels.job.created',key:parsedKey}}});
  if(body.kind==='INITIAL'&&!prior){
   // Accepted receipt evidence is immutable. Validate layout outside all write locks before reserving the one initial manifest.
   const receipt=await new ReceivingService(this.db,this.originId,this.mode).get(user,body.receiptId);const profile=labelProfiles.find(p=>p.id===body.profileId)!;const lines:LabelLine[]=[];
   for(const row of receipt.lines)for(const [purpose,count] of [['USABLE',row.usableQuantity],['DAMAGED_INTAKE',row.damagedQuantity]] as const)if(BigInt(count)>0n)lines.push({id:randomUUID(),receiptLineId:row.id,lotId:row.lotId,purpose,copies:'1',payload:encodeQr(this.originId,row.lotId),content:{fullCode:row.fullCode,publicCode:receipt.batch.publicCode,productName:row.productName,variantName:row.variantName,supplierName:receipt.batch.supplierName,sourceName:receipt.batch.sourceName}});
   await this.render({id:randomUUID(),receiptId:receipt.id,originId:this.originId,kind:'INITIAL',originalJobId:null,reason:'Layout preflight',profile,rendererVersion:rendererVersion(profile),createdAt:new Date().toISOString(),manifestHash:'preflight',totalCopies:String(lines.length),chunks:'1',labelsPerSheet:profile.columns*profile.rows,totalSheets:String(Math.ceil(lines.length/(profile.columns*profile.rows))),lines,events:[]},'0');
  }
  return this.command(user,key,'labels.job.created',body,async(tx,commandId)=>{
  let version=rendererVersion();let receiptId:string,profile:LabelProfile,originalJobId:string|null=null,reason='',lines:Omit<LabelLine,'id'>[]=[];
  if(body.kind==='INITIAL'){
   receiptId=body.receiptId;profile=labelProfiles.find(p=>p.id===body.profileId)!;version=rendererVersion(profile);
   if(await tx.labelPrintJob.findFirst({where:{receiptId,kind:'INITIAL'}}))throw new ConflictException('An initial label manifest already exists for this receipt');
   const receipt=await new ReceivingService(this.db,this.originId,this.mode).read(tx,receiptId);
   for(const line of receipt.lines)for(const [purpose,copies] of [['USABLE',line.usableQuantity],['DAMAGED_INTAKE',line.damagedQuantity]] as const){if(BigInt(copies)>0n)lines.push({receiptLineId:line.id,lotId:line.lotId,purpose,copies,payload:encodeQr(this.originId,line.lotId),content:{fullCode:line.fullCode,publicCode:receipt.batch.publicCode,productName:line.productName,variantName:line.variantName,supplierName:receipt.batch.supplierName,sourceName:receipt.batch.sourceName}});}
  }else{
   const original=await this.readJob(tx,body.originalJobId);receiptId=original.receiptId;profile=original.profile;version=original.rendererVersion;originalJobId=original.id;reason=body.reason;
   const unique=new Set<string>();for(const selection of body.lines){const match=original.lines.find(l=>l.lotId===selection.lotId&&l.purpose===selection.purpose);if(!match)throw new BadRequestException('Reprint must reference a purpose and lot in its original job');const combination=selection.lotId+selection.purpose;if(unique.has(combination))throw new BadRequestException('Duplicate reprint line/purpose');unique.add(combination);const {id:_,...line}=match;lines.push({...line,copies:selection.copies});}
  }
  if(profile.layoutVersion===2)lines.sort((a,b)=>Number(a.purpose==='DAMAGED_INTAKE')-Number(b.purpose==='DAMAGED_INTAKE'));
  const totalCopies=lines.reduce((n,line)=>n+BigInt(line.copies),0n);const manifestHash=digest(canonical({receiptId,profile,rendererVersion:version,lines}));
  const job=await tx.labelPrintJob.create({data:{receiptId,originId:this.originId,actorId:user.id,commandId,kind:body.kind,originalJobId,reason,profile:json(profile),rendererVersion:version,manifestHash,totalCopies,createdAt:new Date()}});
  for(const [i,line] of lines.entries())await tx.labelPrintJobLine.create({data:{...line,jobId:job.id,copies:BigInt(line.copies),content:json(line.content),ordinal:i+1}});
  await tx.labelPrintEvent.create({data:{jobId:job.id,originId:this.originId,actorId:user.id,commandId,kind:'REQUESTED',chunk:'0',attemptId:job.id,copies:0n,note:'Manifest requested; no claim of physical output',createdAt:new Date()}});
  return {...await this.readJob(tx,job.id)};
 });}
 private range(job:LabelJob,chunk:string){try{return chunkRange(job.totalCopies,chunk);}catch{throw new BadRequestException('Chunk outside manifest');}}
 private async render(job:LabelJob,chunk:string,layout:SheetStart=defaultSheetStart){
  this.range(job,chunk);if(this.activeRenders>=2)throw new ConflictException('PDF generation is busy; retry the same part shortly');this.activeRenders++;
  try{
   // PDF metadata is a render input too. Preserve the accepted manifest clock across
   // adapter/session timezone changes; never rewrite history or bypass its hash.
   const stored=await this.db.labelPrintJob.findUnique({where:{id:job.id},select:{commandId:true}});
   const command=stored?await this.db.commandResult.findUnique({where:{id:stored.commandId},select:{response:true}}):null;
   const accepted=command?.response as {id?:unknown;createdAt?:unknown}|undefined;
   const createdAt=accepted?.id===job.id&&typeof accepted.createdAt==='string'&&Number.isFinite(Date.parse(accepted.createdAt))?accepted.createdAt:job.createdAt;
   return await renderLabelPdf({...job,createdAt},chunk,layout);
  }catch(error){throw new UnprocessableEntityException((error as Error).message);}finally{this.activeRenders--;}
 }
 async preview(user:User,id:string,input:unknown){
  const job=await this.get(user,id),body=parse(z.object({chunk:z.string().regex(/^(0|[1-9][0-9]{0,11})$/),layout:sheetStartSchema.default(defaultSheetStart)}).strict(),input);
  try{planLabelSheets(job,body.chunk,body.layout);}catch(error){throw new BadRequestException((error as Error).message);}
  const bytes=await this.render(job,body.chunk,body.layout);return {bytes,hash:bytesHash(bytes)};
 }
 async prepare(user:User,id:string,chunk:string,key:unknown,input:unknown={}){
  const job=await this.get(user,id);parse(idempotencyKeySchema,key);
  const requested=parse(sheetStartSchema,input),existing=job.events.find(e=>e.kind==='ARTIFACT_READY'&&e.chunk===chunk);
  const saved=existing&&job.profile.layoutVersion===2?savedSheetStart(existing.note):defaultSheetStart;
  const layout=existing&&Object.keys(input as object).length===0?saved:requested;
  if(existing&&canonical(layout)!==canonical(saved))throw new ConflictException('This PDF layout is already saved. Create an explicit reprint to choose another start position.');
  let placement;try{placement=planLabelSheets(job,chunk,layout);}catch(error){throw new BadRequestException((error as Error).message);}
  const pdf=await this.render(job,chunk,layout),artifactHash=bytesHash(pdf),range=this.range(job,chunk);
  const request={id,chunk,...(job.profile.layoutVersion===2?{layout}:{})};
  return this.command(user,key,'labels.artifact.ready',request,async(tx,commandId)=>{
   const prior=await tx.labelPrintEvent.findFirst({where:{jobId:id,kind:'ARTIFACT_READY',chunk}});
   if(prior&&prior.artifactHash!==artifactHash)throw new ConflictException('Artifact differs from retained hash');
   if(!prior)await tx.labelPrintEvent.create({data:{jobId:id,originId:this.originId,actorId:user.id,commandId,kind:'ARTIFACT_READY',chunk,attemptId:randomUUID(),copies:BigInt(range.copies),artifactHash,note:job.profile.layoutVersion===2?canonical({layout,version:2}):'PDF generated; not printed',createdAt:new Date()}});
   return {id,chunk,artifactHash,copies:String(range.copies),pages:placement.pages,layout,edgeLabels:placement.edgeLabels,url:`/api/label-print-jobs/${id}/artifacts/${chunk}.pdf`};
  });
 }
 async pdf(user:User,id:string,chunk:string){const job=await this.get(user,id);const ready=job.events.find(e=>e.kind==='ARTIFACT_READY'&&e.chunk===chunk);if(!ready)throw new ConflictException('Prepare this PDF artifact first');const layout=job.profile.layoutVersion===2?savedSheetStart(ready.note):defaultSheetStart;const bytes=await this.render(job,chunk,layout);if(bytesHash(bytes)!==ready.artifactHash)throw new ConflictException('Reconstructed artifact hash does not match history');return {bytes,hash:ready.artifactHash};}
 async event(user:User,id:string,key:unknown,input:unknown){this.printRole(user);id=parse(idempotencyKeySchema,id);const body=parse(printEventSchema,input);return this.command(user,key,'labels.event.recorded',{id,...body},async(tx,commandId)=>{
  const job=await this.readJob(tx,id);const range=this.range(job,body.chunk);const events=job.events.filter(e=>e.attemptId===body.attemptId);
  if(events.some(e=>e.chunk!==body.chunk))throw new ConflictException('Attempt belongs to another chunk');
  if(events.some(e=>['OPERATOR_REPORTED_PRINTED','CANCELLED_BEFORE_HANDOFF','FAILED'].includes(e.kind)))throw new ConflictException('Attempt already has a final reported outcome');
  const handed=events.some(e=>e.kind==='HANDOFF_REQUESTED');
  if(body.kind==='HANDOFF_REQUESTED'&&!job.events.some(e=>e.kind==='ARTIFACT_READY'&&e.chunk===body.chunk))throw new ConflictException('Prepare the PDF before handoff');
  if(['DIALOG_OPENED','OPERATOR_REPORTED_PRINTED','OUTCOME_UNKNOWN'].includes(body.kind)&&!handed)throw new ConflictException('Record explicit handoff first');
  if(body.kind==='CANCELLED_BEFORE_HANDOFF'&&handed)throw new ConflictException('Output after handoff is uncertain; report outcome unknown instead');
  if(body.kind==='OPERATOR_REPORTED_PRINTED'&&(!body.copies||BigInt(body.copies)<1n||BigInt(body.copies)>BigInt(range.copies)))throw new BadRequestException('Reported copies must fit the artifact');
  const copies=body.kind==='HANDOFF_REQUESTED'?BigInt(range.copies):body.kind==='OPERATOR_REPORTED_PRINTED'?BigInt(body.copies!):0n;
  const e=await tx.labelPrintEvent.create({data:{jobId:id,originId:this.originId,actorId:user.id,commandId,kind:body.kind,chunk:body.chunk,attemptId:body.attemptId,copies,note:body.note,createdAt:new Date()}});
  return {...e,copies:e.copies.toString()};
 });}
}
