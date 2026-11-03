import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export type InvitationMessage = {to:string;name:string;url:string};
export interface InvitationTransport { readonly mode:'isolated'; send(message:InvitationMessage):Promise<void> }
/** No SMTP adapter is enabled. The owner must verify sender/URL before live delivery. */
export class IsolatedInvitationTransport implements InvitationTransport {
 readonly mode='isolated' as const;
 readonly messages:InvitationMessage[]=[];
 async send(message:InvitationMessage){this.messages.push(message);if(this.messages.length>100)this.messages.shift();}
}
export type InvitationConfig = {publicUrl:string;key:Buffer;transport:InvitationTransport;worker?:boolean};
export function invitationConfig():InvitationConfig|undefined{
 if(process.env.INVITATION_TRANSPORT!=='isolated')return;
 const encoded=process.env.INVITATION_ENCRYPTION_KEY,publicUrl=process.env.APP_PUBLIC_URL;
 if(!encoded||!publicUrl)return;
 const key=Buffer.from(encoded,'base64');if(key.length!==32)return;
 try{const url=new URL(publicUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')return;}catch{return;}
 return {publicUrl,key,transport:new IsolatedInvitationTransport(),worker:process.env.INVITATION_WORKER==='1'};
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
