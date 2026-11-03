import { randomInt } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { publicCodeAlphabet } from '@dayari/contracts';

export function drawPublicCode(kind: 'PRODUCT' | 'LOT', draw = () => randomInt(publicCodeAlphabet.length)) {
  return (kind === 'PRODUCT' ? 'P' : 'L') + Array.from({ length: 5 }, () => publicCodeAlphabet[draw()]!).join('');
}
export async function reservePublicCode(kind: 'PRODUCT' | 'LOT', reserve: (code: string) => Promise<boolean>, draw = () => drawPublicCode(kind)) {
  for (let i = 0; i < 32; i++) { const code = draw(); if (await reserve(code)) return code; }
  throw new ConflictException('CODE_ALLOCATION_BUSY: no free candidate after 32 attempts; retry the same command. Codes are never recycled or expanded silently.');
}
export async function allocatePublicIdentity(tx: Prisma.TransactionClient, kind: 'PRODUCT' | 'LOT', subjectId: string, originId: string, commandId: string, draw?: () => string) {
  const product = kind === 'PRODUCT';
  const prior = product ? await tx.productPublicIdentity.findUnique({ where: { productId: subjectId } }) : await tx.lotPublicIdentity.findUnique({ where: { lotId: subjectId } });
  if (prior) { if (prior.originId !== originId) throw new ConflictException('Identity origin mismatch'); return prior.code; }
  return reservePublicCode(kind, async code => {
    // A conflicting candidate does not abort PostgreSQL's current transaction.
    const rows = product
      ? await tx.$queryRaw<{ code: string }[]>`INSERT INTO "ProductPublicIdentity" ("productId","originId",code,"commandId") VALUES (${subjectId}::uuid,${originId}::uuid,${code},${commandId}::uuid) ON CONFLICT ("originId",code) DO NOTHING RETURNING code`
      : await tx.$queryRaw<{ code: string }[]>`INSERT INTO "LotPublicIdentity" ("lotId","originId",code,"commandId") VALUES (${subjectId}::uuid,${originId}::uuid,${code},${commandId}::uuid) ON CONFLICT ("originId",code) DO NOTHING RETURNING code`;
    return rows.length === 1;
  }, draw);
}
