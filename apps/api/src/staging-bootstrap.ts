import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { canonical, digest, passwordHash } from './security.js';

/** One-time deployment helper, never an HTTP endpoint or existing-account recovery path. */
export async function bootstrapStagingOwner(db: PrismaClient, input: { originId: string; email: string; password: string }) {
  if (!input.password || input.password.length < 16) throw new Error('A private random initial password is required');
  const { originId, password } = input, email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid owner email is required');
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('dayari-staging-bootstrap',0))::text`;
    if (await tx.user.count() || await tx.originNode.count() || await tx.stockLot.count() || await tx.product.count())
      throw new Error('Bootstrap refuses any existing accounts, origins, catalogue or inventory');
    await tx.originNode.create({ data: { id: originId, mode: 'SHOP' } });
    const id = randomUUID(), commandId = randomUUID(), eventType = 'staging.owner.provisioned';
    await tx.user.create({ data: { id, email, name: 'Staging owner', role: 'ADMIN',
      active: true, mustChangePassword: true, passwordHash: passwordHash(password),
      membership: { create: { originId } } } });
    const node = await tx.originNode.update({ where: { id: originId }, data: { nextSequence: { increment: 1 } } });
    const evidence = { id, originId, email, mustChangePassword: true, stagingOnly: true };
    await tx.auditEvent.create({ data: { originId, actorId: id, actorRole: 'ADMIN', commandId,
      action: eventType, subjectId: id, snapshot: evidence } });
    await tx.outboxEvent.create({ data: { originId, actorId: id, commandId, originSequence: node.nextSequence,
      eventType, aggregateId: id, payload: evidence, payloadHash: digest(canonical(evidence)) } });
    await tx.commandResult.create({ data: { id: commandId, originId, actorId: id, commandType: eventType,
      key: randomUUID(), requestHash: digest(canonical({ originId, email })), response: evidence } });
  }, { timeout: 15000 });
}
