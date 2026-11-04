import type {PrismaClient} from '@prisma/client';
export async function assertAccountSchema(db:PrismaClient){
 const rows=await db.$queryRaw<{ready:boolean}[]>`SELECT count(*)=5 AS ready FROM information_schema.columns WHERE table_schema=current_schema() AND ((table_name='User' AND column_name IN ('authVersion','mustChangePassword')) OR (table_name='Session' AND column_name='originId') OR (table_name='ShopMembership' AND column_name IN ('userId','originId')))`;
 if(!rows[0]?.ready)throw new Error('Account schema upgrade required. No migration or account enrollment was performed. Obtain owner approval before upgrading an operational database.');
}
