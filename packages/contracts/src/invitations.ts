import { z } from 'zod';
import { staffRole, strongPassword } from './accounts.js';
export const inviteStaff = z.object({name:z.string().trim().min(1).max(160),email:z.email().max(254).transform(v=>v.toLowerCase()),role:staffRole,currentPassword:z.string().min(1).max(256)}).strict();
export const reissueInvitation = z.object({currentPassword:z.string().min(1).max(256),role:staffRole.optional()}).strict();
export const invitationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const acceptInvitation = z.object({token:invitationToken,password:strongPassword,confirmation:strongPassword}).strict().refine(v=>v.password===v.confirmation,'Passwords must match');
export type InvitationSummary = {id:string;name:string;email:string;role:z.infer<typeof staffRole>;status:string;delivery:string;expiresAt:string;createdAt:string};
