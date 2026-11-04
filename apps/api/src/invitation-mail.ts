import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { SmtpInvitationTransport } from './smtp-invitation-transport.js';
export type InvitationMessage = {to:string;name:string;url:string;invitationId?:string;deliveryMode?:'isolated'|'smtp'};
export interface InvitationTransport { readonly mode:'isolated'|'smtp'; send(message:InvitationMessage):Promise<void> }
/** Test-only transport. It never delivers to external recipients. */
export class IsolatedInvitationTransport implements InvitationTransport {
 readonly mode='isolated' as const;
 readonly messages:InvitationMessage[]=[];
 async send(message:InvitationMessage){this.messages.push(message);if(this.messages.length>100)this.messages.shift();}
}
export type InvitationConfig = {publicUrl:string;key:Buffer;transport:InvitationTransport;worker?:boolean};
export function invitationConfig(env:NodeJS.ProcessEnv=process.env):InvitationConfig|undefined{
 if(!['isolated','smtp'].includes(env.INVITATION_TRANSPORT??''))return;
 const encoded=env.INVITATION_ENCRYPTION_KEY,publicUrl=env.APP_PUBLIC_URL;
 if(!encoded||!publicUrl)return;
 const key=Buffer.from(encoded,'base64');if(key.length!==32||key.toString('base64')!==encoded)return;
 try{const url=new URL(publicUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')return;}catch{return;}
 if(env.INVITATION_TRANSPORT==='isolated')return {publicUrl,key,transport:new IsolatedInvitationTransport(),worker:env.INVITATION_WORKER==='1'};
 const url=new URL(publicUrl);
 if(env.INVITATION_LIVE_ENABLED!=='1'||env.SMTP_SENDER_VERIFIED!=='1'||url.protocol!=='https:'||['localhost','127.0.0.1','[::1]','0.0.0.0'].includes(url.hostname))return;
 const settings=z.object({host:z.string().regex(/^[a-zA-Z0-9.-]+$/).max(253),user:z.string().min(1).max(320),password:z.string().min(1).max(1000),from:z.email().max(254)}).safeParse({host:env.SMTP_HOST??'smtp-relay.brevo.com',user:env.SMTP_USER,password:env.SMTP_PASSWORD,from:env.SMTP_FROM_ADDRESS});
 if(!settings.success||(env.SMTP_PORT??'587')!=='587')return;
 return {publicUrl,key,transport:new SmtpInvitationTransport({...settings.data,port:587,publicUrl}),worker:true};
}
export function encryptInvitation(message:InvitationMessage,key:Buffer){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(message),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');
}
export function decryptInvitation(value:string,key:Buffer):InvitationMessage{
 const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
 cipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));
}
