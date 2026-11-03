import { requireCapability } from './permissions.js';
import { accountProof } from './account-proof.js';
import { createHmac, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { idempotencyKeySchema, staffCreate, staffQuery, staffUpdate, sessionRevoke, passwordChange, type StaffSummary } from '@dayari/contracts';
import { canonical, digest, passwordHash, verifyPassword } from './security.js';
import type { ZodType } from 'zod';
function parse<T>(schema:ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)throw new BadRequestException('Check account fields and password requirements');return result.data;}
export function staffDto(user:User):StaffSummary{return {id:user.id,name:user.name,email:user.email,role:user.role,active:user.active,mustChangePassword:user.mustChangePassword,createdAt:user.createdAt.toISOString()};}
export class AccountsService {
 constructor(readonly db:PrismaClient,readonly originId:string,readonly mode:string){}
 private admin(user:User){requireCapability(user,'STAFF_ADMIN');}
 async list(user:User,input:unknown){
  this.admin(user);const q=parse(staffQuery,input);
  const where:Prisma.UserWhereInput={membership:{originId:this.originId},...(q.role?{role:q.role}:{}),...(q.active?{active:q.active==='true'}:{}),...(q.q?{OR:[{name:{contains:q.q,mode:'insensitive'}},{email:{contains:q.q,mode:'insensitive'}}]}:{})};
  const [total,users]=await this.db.$transaction([this.db.user.count({where}),this.db.user.findMany({where,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(q.page-1)*20,take:20})]);
  return {users:users.map(staffDto),total,page:q.page,pageSize:20};
 }
 async detail(user:User,idInput:unknown){
  this.admin(user);const id=parse(idempotencyKeySchema,idInput);
  const found=await this.db.user.findFirst({where:{id,membership:{originId:this.originId}},include:{sessions:{where:{originId:this.originId},orderBy:{createdAt:'desc'},take:20,select:{id:true,createdAt:true,expiresAt:true,revokedAt:true}}}});
  if(!found)throw new NotFoundException('Account unavailable');
  return {...staffDto(found),sessions:found.sessions.map(s=>({id:s.id,createdAt:s.createdAt.toISOString(),expiresAt:s.expiresAt.toISOString(),revokedAt:s.revokedAt?.toISOString()??null}))};
 }
 async own(user:User){
  const sessions=await this.db.session.findMany({where:{userId:user.id,originId:this.originId},orderBy:{createdAt:'desc'},take:20,select:{id:true,createdAt:true,expiresAt:true,revokedAt:true}});
  return {...staffDto(user),originId:this.originId,sessions};
 }
 async changePassword(user:User,keyInput:unknown,input:unknown){
  if(this.mode!=='SHOP')throw new ForbiddenException('Account writes belong to the shop');
  const key=parse(idempotencyKeySchema,keyInput),data=parse(passwordChange,input);
  await accountProof(this.db,user,data.currentPassword);
  if(verifyPassword(data.newPassword,user.passwordHash))throw new BadRequestException('Choose a different password');
  return this.db.$transaction(async tx=>{
   const origins=await tx.$queryRaw<{mode:string}[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;
   if(origins[0]?.mode!=='SHOP')throw new ForbiddenException();
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR UPDATE`;
   const current=await tx.user.findFirst({where:{id:user.id,membership:{originId:this.originId}}});
   if(!current?.active||current.authVersion!==user.authVersion||!verifyPassword(data.currentPassword,current.passwordHash))throw new ForbiddenException('Account security state changed; sign in again');
   const prior=await tx.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:this.originId,actorId:user.id,commandType:'accounts.password.changed',key}}});
   if(prior)throw new ConflictException('This password-change key was already accepted. Sign in and review your account before starting another change');
   await tx.user.update({where:{id:user.id},data:{passwordHash:passwordHash(data.newPassword),mustChangePassword:false,authVersion:{increment:1}}});
   await tx.session.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
   const commandId=randomUUID(),commandType='accounts.password.changed',response={ok:true,signInRequired:true};
   const node=await tx.originNode.update({where:{id:this.originId},data:{nextSequence:{increment:1}}});
   const payload={subjectId:user.id,actorId:user.id,actorRole:user.role,commandId};
   await tx.auditEvent.create({data:{originId:this.originId,actorId:user.id,actorRole:user.role,commandId,action:commandType,subjectId:user.id,snapshot:payload}});
   await tx.outboxEvent.create({data:{originId:this.originId,originSequence:node.nextSequence,eventType:commandType,aggregateId:user.id,commandId,actorId:user.id,payload,payloadHash:digest(canonical(payload))}});
   await tx.commandResult.create({data:{id:commandId,originId:this.originId,actorId:user.id,commandType,key,requestHash:createHmac('sha256',user.passwordHash).update(data.newPassword).digest('hex'),response}});
   return response;
  },{timeout:15000,maxWait:10000});
 }
 async command(user:User,type:'create'|'update'|'revoke',idInput:unknown,keyInput:unknown,input:unknown){
  this.admin(user);if(this.mode!=='SHOP')throw new ForbiddenException('Account writes belong to the shop');
  const key=parse(idempotencyKeySchema,keyInput),id=type==='create'?null:parse(idempotencyKeySchema,idInput);
  const data:Record<string,unknown>=parse(type==='create'?staffCreate:type==='update'?staffUpdate:sessionRevoke,input);
  const {currentPassword,initialPassword,...publicInput}=data;
  await accountProof(this.db,user,String(currentPassword));
  const requestHash=digest(canonical({id,...publicInput,...(initialPassword?{passwordFingerprint:createHmac('sha256',user.passwordHash).update(String(initialPassword)).digest('hex')}:{})}));
  try{return await this.db.$transaction(async tx=>{
   const origins=await tx.$queryRaw<{mode:string}[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;
   if(origins[0]?.mode!=='SHOP')throw new ForbiddenException();
   for(const lockId of [...new Set([user.id,...(id?[id]:[])])].sort())await tx.$queryRaw`SELECT id FROM "User" WHERE id=${lockId}::uuid FOR UPDATE`;
   const actor=await tx.user.findFirst({where:{id:user.id,membership:{originId:this.originId}}});if(!actor)throw new ForbiddenException();this.admin(actor);if(actor.authVersion!==user.authVersion)throw new ForbiddenException('Session security state changed');
   if(!verifyPassword(String(currentPassword),actor.passwordHash))throw new ForbiddenException('Current password was not accepted');
   const commandType=`accounts.${type}`,prior=await tx.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:this.originId,actorId:user.id,commandType,key}}});
   if(prior){if(prior.requestHash!==requestHash)throw new ConflictException('Idempotency key reused with different input');return prior.response;}
   let subject:User;
   if(type==='create')subject=await tx.user.create({data:{name:String(data.name),email:String(data.email),role:data.role as User['role'],passwordHash:passwordHash(String(initialPassword)),mustChangePassword:true,membership:{create:{originId:this.originId}}}});
   else{
    const target=await tx.user.findFirst({where:{id:id!,membership:{originId:this.originId}}});if(!target)throw new NotFoundException('Account unavailable');
    if(type==='update'){
     if(id===user.id&&(data.active===false||data.role!=='ADMIN'))throw new ConflictException('You cannot deactivate or demote your own account');
     if(target.role==='ADMIN'&&target.active&&(data.active===false||data.role!=='ADMIN')&&await tx.user.count({where:{role:'ADMIN',active:true,membership:{originId:this.originId}}})<=1)throw new ConflictException('Keep at least one active shop Admin');
     subject=await tx.user.update({where:{id:id!},data:{name:String(data.name),role:data.role as User['role'],active:Boolean(data.active),...((data.role!==target.role||data.active!==target.active)?{authVersion:{increment:1}}:{})}});
     if(subject.role!==target.role||subject.active!==target.active)await tx.session.updateMany({where:{userId:id!,revokedAt:null},data:{revokedAt:new Date()}});
    }else{subject=await tx.user.update({where:{id:target.id},data:{authVersion:{increment:1}}});await tx.session.updateMany({where:{userId:id!,originId:this.originId,revokedAt:null},data:{revokedAt:new Date()}});}
   }
   const commandId=randomUUID(),response=staffDto(subject),node=await tx.originNode.update({where:{id:this.originId},data:{nextSequence:{increment:1}}});
   const evidence={subject:response,actorId:user.id,actorRole:actor.role,commandId};
   await tx.auditEvent.create({data:{originId:this.originId,actorId:user.id,actorRole:actor.role,commandId,action:commandType,subjectId:subject.id,snapshot:evidence}});
   await tx.outboxEvent.create({data:{originId:this.originId,originSequence:node.nextSequence,eventType:commandType,aggregateId:subject.id,commandId,actorId:user.id,payload:evidence,payloadHash:digest(canonical(evidence))}});
   await tx.commandResult.create({data:{id:commandId,originId:this.originId,actorId:user.id,commandType,key,requestHash,response}});return response;
  },{timeout:15000,maxWait:10000});}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ConflictException('An account with this email already exists');throw error;}
 }
}
