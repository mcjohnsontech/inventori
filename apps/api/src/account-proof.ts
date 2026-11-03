import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient, User } from '@prisma/client';
import { verifyPassword } from './security.js';
// Persist failed proof attempts separately so a rejected domain transaction cannot erase throttling.
export async function accountProof(db:PrismaClient,user:User,password:string){
 const accepted=await db.$transaction(async tx=>{
  const key=`account-proof:${user.id}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
  const failures=await tx.loginAttempt.count({where:{email:key,succeeded:false,createdAt:{gt:new Date(Date.now()-15*60_000)}}});
  if(failures>=10)return false;
  const valid=verifyPassword(password,user.passwordHash);
  await tx.loginAttempt.create({data:{email:key,succeeded:valid}});return valid;
 });
 if(!accepted)throw new ForbiddenException('Current password was not accepted or confirmation is temporarily limited');
}
