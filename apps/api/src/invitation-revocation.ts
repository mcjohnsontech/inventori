import type { Prisma } from '@prisma/client';
/** Compatibility: old local schemas stay usable until an operational upgrade is approved. */
export async function revokeCreatedInvitations(tx:Prisma.TransactionClient,userId:string,originId:string,commandId:string){
 const tables=await tx.$queryRaw<{ready:boolean}[]>`SELECT to_regclass('public."StaffInvitation"') IS NOT NULL AS ready`;
 if(!tables[0]?.ready)return;
 const rows=await tx.staffInvitation.findMany({where:{creatorId:userId,originId,state:{status:'PENDING'}},select:{id:true}});
 for(const {id} of rows){
  await tx.invitationState.update({where:{invitationId:id},data:{status:'REVOKED',changedAt:new Date()}});
  await tx.invitationMail.update({where:{invitationId:id},data:{status:'CANCELLED',encryptedPayload:null,leaseId:null,leaseUntil:null}});
  await tx.invitationEvent.create({data:{invitationId:id,type:'REVOKED',commandId}});
 }
}
