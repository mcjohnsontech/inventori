import { randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { acceptInvitation, idempotencyKeySchema, inviteStaff, reissueInvitation, sessionRevoke, type InvitationSummary } from '@dayari/contracts';
import type { ZodType } from 'zod';
import { accountProof } from './account-proof.js';
import { requireCapability } from './permissions.js';
import { canonical, digest, passwordHash, verifyPassword } from './security.js';
import { decryptInvitation, encryptInvitation, type InvitationConfig } from './invitation-mail.js';
function parse<T>(schema:ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)throw new BadRequestException('Check invitation fields and password confirmation');return result.data;}
const unavailable=()=>new BadRequestException('Invitation unavailable, expired or already used. Ask your Admin for a new invitation, or sign in if you already accepted it.');
export class InvitationsService {
 constructor(readonly db:PrismaClient,readonly originId:string,readonly mode:string,readonly config?:InvitationConfig){}
 private timer?:ReturnType<typeof setInterval>;
 private working=false;
 onModuleInit(){if(this.config?.worker){this.timer=setInterval(()=>{if(this.working)return;this.working=true;void this.deliverOne().catch(()=>{/* readiness errors contain no delivery secrets and never affect account operations */}).finally(()=>{this.working=false;});},5000);this.timer.unref();}}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 private async ready(){
  if(this.mode!=='SHOP'||!this.config)throw new ServiceUnavailableException('Invitations are not enabled. Live email awaits verified sender and access URL.');
  const tables=await this.db.$queryRaw<{ready:boolean}[]>`SELECT to_regclass('public."StaffInvitation"') IS NOT NULL AS ready`;
  if(!tables[0]?.ready)throw new ServiceUnavailableException('Invitation database upgrade requires owner approval. Existing account provisioning remains available.');
 }
 async list(user:User){requireCapability(user,'STAFF_ADMIN');await this.ready();const rows=await this.db.staffInvitation.findMany({where:{originId:this.originId},include:{state:true,mail:true},orderBy:[{createdAt:'desc'},{id:'asc'}],take:100});return {mode:'isolated',invitations:rows.map(i=>this.dto(i))};}
 private dto(i:Prisma.StaffInvitationGetPayload<{include:{state:true;mail:true}}>):InvitationSummary{return {id:i.id,name:i.name,email:i.email,role:i.role,status:i.state?.status==='PENDING'&&i.expiresAt<=new Date()?'EXPIRED':i.state?.status??'UNAVAILABLE',delivery:i.mail?.status??'UNAVAILABLE',expiresAt:i.expiresAt.toISOString(),createdAt:i.createdAt.toISOString()};}
 private async lock(tx:Prisma.TransactionClient){const nodes=await tx.$queryRaw<{mode:string}[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;if(nodes[0]?.mode!=='SHOP')throw new ForbiddenException();}
 private async evidence(tx:Prisma.TransactionClient,actor:User,id:string,type:string,key:string,hash:string,response:object,commandId:string){
  const node=await tx.originNode.update({where:{id:this.originId},data:{nextSequence:{increment:1}}}),payload={subjectId:id,actorId:actor.id,actorRole:actor.role,commandId};
  await tx.auditEvent.create({data:{originId:this.originId,actorId:actor.id,actorRole:actor.role,commandId,action:type,subjectId:id,snapshot:payload}});
  await tx.outboxEvent.create({data:{originId:this.originId,originSequence:node.nextSequence,eventType:type,aggregateId:id,commandId,actorId:actor.id,payload,payloadHash:digest(canonical(payload))}});
  await tx.commandResult.create({data:{id:commandId,originId:this.originId,actorId:actor.id,commandType:type,key,requestHash:hash,response:response as Prisma.InputJsonValue}});
 }
 async command(user:User,action:'create'|'resend'|'revoke',idInput:unknown,keyInput:unknown,input:unknown){
  requireCapability(user,'STAFF_ADMIN');await this.ready();const key=parse(idempotencyKeySchema,keyInput),id=action==='create'?null:parse(idempotencyKeySchema,idInput);
  const data=action==='create'?parse(inviteStaff,input):action==='resend'?parse(reissueInvitation,input):parse(sessionRevoke,input);await accountProof(this.db,user,data.currentPassword);
  const {currentPassword,...fields}=data,hash=digest(canonical({id,...fields})),type=`invitations.${action}`;
  return this.db.$transaction(async tx=>{
   await this.lock(tx);await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR UPDATE`;
   const actor=await tx.user.findFirst({where:{id:user.id,membership:{originId:this.originId}}});
   if(!actor?.active||actor.mustChangePassword||actor.authVersion!==user.authVersion)throw new ForbiddenException();requireCapability(actor,'STAFF_ADMIN');
   if(!verifyPassword(currentPassword,actor.passwordHash))throw new ForbiddenException();
   const prior=await tx.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:this.originId,actorId:user.id,commandType:type,key}}});
   if(prior){if(prior.requestHash!==hash)throw new ConflictException('Idempotency key reused with different input');return prior.response;}
   const recent=await tx.staffInvitation.count({where:{originId:this.originId,createdAt:{gt:new Date(Date.now()-3600000)}}});
   if(action!=='revoke'&&recent>=100)throw new ConflictException('Invitation limit reached. Try again later.');
   const old=id?await tx.staffInvitation.findFirst({where:{id,originId:this.originId},include:{state:true}}):null;
   if(id&&(!old||old.state?.status!=='PENDING'))throw new NotFoundException('Pending invitation unavailable');
   const commandId=randomUUID();
   if(old){await tx.invitationState.update({where:{invitationId:old.id},data:{status:'REVOKED',changedAt:new Date()}});await tx.invitationMail.update({where:{invitationId:old.id},data:{status:'CANCELLED',encryptedPayload:null,leaseId:null,leaseUntil:null}});await tx.invitationEvent.create({data:{invitationId:old.id,type:'REVOKED',commandId}});}
   if(action==='revoke'){const response={id:old!.id,status:'REVOKED'};await this.evidence(tx,actor,old!.id,type,key,hash,response,commandId);return response;}
   const details=action==='create'?parse(inviteStaff,input):{...old!,role:parse(reissueInvitation,input).role??old!.role};
   if(await tx.user.findFirst({where:{email:{equals:details.email,mode:'insensitive'}}}))throw new ConflictException('This email already has an account. Invitations cannot recover existing accounts.');
   const pending=await tx.staffInvitation.findFirst({where:{originId:this.originId,email:details.email,state:{status:'PENDING'},expiresAt:{gt:new Date()}}});
   if(pending)throw new ConflictException('A pending invitation already exists. Resend or revoke it first.');
   const token=randomBytes(32).toString('base64url'),newId=randomUUID(),now=new Date(),url=new URL('/accept-invitation',this.config!.publicUrl);url.searchParams.set('token',token);
   const created=await tx.staffInvitation.create({data:{id:newId,originId:this.originId,creatorId:actor.id,creatorVersion:actor.authVersion,name:details.name,email:details.email,role:details.role,tokenHash:digest(token),createdAt:now,expiresAt:new Date(now.valueOf()+86400000),commandId,state:{create:{}},events:{create:{type:'CREATED',commandId}},mail:{create:{encryptedPayload:encryptInvitation({to:details.email,name:details.name,url:url.toString()},this.config!.key)}}},include:{state:true,mail:true}});
   const response=this.dto(created);await this.evidence(tx,actor,newId,type,key,hash,response,commandId);return response;
  },{timeout:15000,maxWait:10000});
 }
 async accept(input:unknown,keyInput:unknown){
  await this.ready();const data=parse(acceptInvitation,input),key=parse(idempotencyKeySchema,keyInput),tokenHash=digest(data.token);
  // A persistent origin-wide cap bounds random-token attempts without logging or storing tokens.
  const limitKey=`invitation-accept:${this.originId}`;
  const allowed=await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${limitKey},0))::text`;if(await tx.loginAttempt.count({where:{email:limitKey,createdAt:{gt:new Date(Date.now()-60000)}}})>=60)return false;await tx.loginAttempt.create({data:{email:limitKey,succeeded:false}});return true;});
  if(!allowed)throw new ConflictException('Invitation setup is temporarily limited. Try again later.');
  try{return await this.db.$transaction(async tx=>{
   await this.lock(tx);const invitation=await tx.staffInvitation.findFirst({where:{originId:this.originId,tokenHash},include:{state:true}});
   if(!invitation||invitation.state?.status!=='PENDING'||invitation.expiresAt<=new Date())throw unavailable();
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${invitation.creatorId}::uuid FOR UPDATE`;
   const creator=await tx.user.findFirst({where:{id:invitation.creatorId,active:true,role:'ADMIN',authVersion:invitation.creatorVersion,membership:{originId:this.originId}}});
   if(!creator||await tx.user.findFirst({where:{email:{equals:invitation.email,mode:'insensitive'}}}))throw unavailable();
   const user=await tx.user.create({data:{email:invitation.email,name:invitation.name,role:invitation.role,passwordHash:passwordHash(data.password),membership:{create:{originId:this.originId}}}});
   const commandId=randomUUID();await tx.invitationState.update({where:{invitationId:invitation.id},data:{status:'ACCEPTED',userId:user.id,changedAt:new Date()}});
   await tx.invitationMail.update({where:{invitationId:invitation.id},data:{status:'CANCELLED',encryptedPayload:null,leaseId:null,leaseUntil:null}});
   await tx.invitationEvent.create({data:{invitationId:invitation.id,type:'ACCEPTED',commandId}});
   const response={ok:true,signInRequired:true};await this.evidence(tx,user,invitation.id,'invitations.accept',key,'credential-not-retained',response,commandId);return response;
  },{timeout:15000,maxWait:10000});}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw unavailable();throw error;}
 }
 /** Bounded worker: claim under origin lock, send outside the transaction, fence completion. */
 async deliverOne(){
  await this.ready();const leaseId=randomUUID();
  const claim=await this.db.$transaction(async tx=>{
   await this.lock(tx);const job=await tx.invitationMail.findFirst({where:{status:'PENDING',availableAt:{lte:new Date()},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}],invitation:{originId:this.originId}},include:{invitation:{include:{state:true}}},orderBy:{availableAt:'asc'}});
   if(!job)return null;
   const i=job.invitation,creator=await tx.user.findFirst({where:{id:i.creatorId,role:'ADMIN',active:true,authVersion:i.creatorVersion,membership:{originId:this.originId}}});
   if(i.expiresAt<=new Date()||i.state?.status!=='PENDING'||!creator||job.attempts>=5){await tx.invitationMail.update({where:{invitationId:i.id},data:{status:'CANCELLED',encryptedPayload:null,leaseId:null,leaseUntil:null}});await tx.invitationEvent.create({data:{invitationId:i.id,type:'DELIVERY_EXPIRED'}});return null;}
   return tx.invitationMail.update({where:{invitationId:i.id},data:{leaseId,leaseUntil:new Date(Date.now()+60000),attempts:{increment:1}}});
  });
  if(!claim?.encryptedPayload)return false;let sent=false;
  try{await this.config!.transport.send(decryptInvitation(claim.encryptedPayload,this.config!.key));sent=true;}catch{/* Never log transport error: it can contain recipient credentials or links. */}
  await this.db.$transaction(async tx=>{
   await this.lock(tx);const current=await tx.invitationMail.findUnique({where:{invitationId:claim.invitationId}});if(current?.leaseId!==leaseId||current.status!=='PENDING')return;
   await tx.invitationMail.update({where:{invitationId:claim.invitationId},data:{status:sent?'SENT':claim.attempts>=5?'FAILED':'PENDING',...(sent||claim.attempts>=5?{encryptedPayload:null}:{}),leaseId:null,leaseUntil:null,availableAt:new Date(Date.now()+60000*2**claim.attempts),updatedAt:new Date()}});
   await tx.invitationEvent.create({data:{invitationId:claim.invitationId,type:sent?'DELIVERY_SENT':'DELIVERY_FAILED'}});
  });return sent;
 }
}
