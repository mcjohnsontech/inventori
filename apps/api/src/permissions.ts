import { ForbiddenException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { can,type Capability } from '@dayari/contracts';
export function requireCapability(user:User,capability:Capability){
 if(!user.active||user.mustChangePassword||!can(user.role,capability))throw new ForbiddenException('This action is not available for your account');
}
