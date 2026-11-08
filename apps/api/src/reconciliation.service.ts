import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { idempotencyKeySchema, reasonQueueQuerySchema, reasonSelectionSchema, reconcileReasonsSchema, type CheckoutItemIdentity, type CheckoutReason, type ReasonQueue, type ReasonResolutionView } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { canonical, digest } from './security.js';

const commandType = 'production.reasons.reconcile', eventType = 'production.reasons.reconciled';
type Target = { exceptionId: string; checkoutLineId: string; checkoutId: string; unitId: string; resolutionId: string | null; reasonCode: string | null };
type QueueRow = {
  exceptionId: string; checkoutLineId: string; checkoutId: string; acceptedAt: Date; employeeId: string; employeeName: string;
  orderReference: string | null; snapshot: CheckoutItemIdentity; resolutionId: string | null;
  managerId: string | null; managerName: string | null; recordedAt: Date | null; originSequence: bigint | null;
  reasonCode: CheckoutReason['code'] | null; reasonNote: string | null; remarks: string | null; manifestHash: string | null;
};
export class ReconciliationService {
  constructor(readonly db: PrismaClient, readonly originId: string, readonly mode: string) {}

  private async allow(user: User) {
    requireCapability(user, 'RECONCILIATION_READ');
    const [row] = await this.db.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"ReasonReconciliation"') IS NOT NULL
      AND to_regclass('"CheckoutReasonResolution"') IS NOT NULL AS ready`;
    if (!row?.ready) throw new ServiceUnavailableException('Reason reconciliation requires the separately approved shop database upgrade.');
  }

  async configuration(user: User) {
    await this.allow(user);
    const employees = await this.db.$queryRaw<{ id: string; name: string }[]>`SELECT DISTINCT u.id,u.name FROM "CheckoutException" e
      JOIN "Checkout" c ON c.id=e."checkoutId" JOIN "User" u ON u.id=c."actorId" WHERE e."originId"=${this.originId}::uuid ORDER BY u.name,u.id`;
    return { originId: this.originId, limit: 500, canResolve: user.role === 'MANAGER' && this.mode === 'SHOP', employees };
  }

  async list(user: User, input: unknown): Promise<ReasonQueue> { return this.read(user, input); }

  async preview(user: User, input: unknown) {
    const parsed = reasonSelectionSchema.safeParse(input);
    if (!parsed.success) { requireCapability(user, 'RECONCILIATION_READ'); throw new BadRequestException('Select distinct saved exception identities, at most 500.'); }
    const result = await this.read(user, { status: 'ALL' }, parsed.data.exceptionIds);
    if (result.rows.length !== parsed.data.exceptionIds.length) throw new NotFoundException('One or more exceptions are not available in this shop.');
    return { rows: result.rows };
  }

  private async read(user: User, input: unknown, exceptionIds?: string[]): Promise<ReasonQueue> {
    await this.allow(user);
    const parsed = reasonQueueQuerySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => issue.message).join('. '));
    const query = parsed.data;
    const from = Prisma.sql`FROM "CheckoutException" e JOIN "CheckoutLine" x ON x.id=e."lineId"
      JOIN "Checkout" c ON c.id=e."checkoutId" JOIN "User" employee ON employee.id=c."actorId"
      JOIN "StockUnit" unit ON unit.id=x."unitId"
      LEFT JOIN "CheckoutReasonResolution" resolved ON resolved."exceptionId"=e.id
      LEFT JOIN "ReasonReconciliation" r ON r.id=resolved."reconciliationId"
      LEFT JOIN "User" manager ON manager.id=r."actorId"
      LEFT JOIN "OutboxEvent" o ON o."commandId"=r."commandId"
      WHERE e."originId"=${this.originId}::uuid AND x."originId"=${this.originId}::uuid AND c."originId"=${this.originId}::uuid AND unit."originId"=${this.originId}::uuid
      ${exceptionIds ? Prisma.sql`AND e.id IN (${Prisma.join(exceptionIds.map(id => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
      ${query.status === 'UNRESOLVED' ? Prisma.sql`AND resolved.id IS NULL` : query.status === 'RESOLVED' ? Prisma.sql`AND resolved.id IS NOT NULL` : Prisma.empty}
      ${query.employeeId ? Prisma.sql`AND c."actorId"=${query.employeeId}::uuid` : Prisma.empty}
      ${query.orderReference ? Prisma.sql`AND x."orderReference"=${query.orderReference}` : Prisma.empty}
      ${query.unitCode ? Prisma.sql`AND unit."unitCode"=${query.unitCode}` : Prisma.empty}
      ${query.from ? Prisma.sql`AND c."acceptedAt">=(${query.from}::date::timestamp AT TIME ZONE 'Africa/Lagos')` : Prisma.empty}
      ${query.to ? Prisma.sql`AND c."acceptedAt"<((${query.to}::date+1)::timestamp AT TIME ZONE 'Africa/Lagos')` : Prisma.empty}`;
    return this.db.$transaction(async tx => {
      const [count] = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n ${from}`);
      const rows = await tx.$queryRaw<QueueRow[]>(Prisma.sql`SELECT e.id AS "exceptionId",x.id AS "checkoutLineId",c.id AS "checkoutId",c."acceptedAt",
        employee.id AS "employeeId",employee.name AS "employeeName",x."orderReference",x.snapshot,r.id AS "resolutionId",
        manager.id AS "managerId",manager.name AS "managerName",r."recordedAt",o."originSequence",r."reasonCode",r."reasonNote",r.remarks,r."manifestHash"
        ${from} ORDER BY c."acceptedAt",c.id,x.ordinal LIMIT ${exceptionIds?.length ?? 20} OFFSET ${exceptionIds ? 0 : (query.page - 1) * 20}`);
      return { page: query.page, pageSize: exceptionIds?.length ?? 20, total: Number(count!.n), rows: rows.map(row => ({
        exceptionId: row.exceptionId, checkoutLineId: row.checkoutLineId, checkoutId: row.checkoutId, acceptedAt: row.acceptedAt.toISOString(),
        employee: { id: row.employeeId, name: row.employeeName }, orderReference: row.orderReference, unit: row.snapshot,
        status: row.resolutionId ? 'RESOLVED' as const : 'UNRESOLVED' as const, resolution: row.resolutionId ? {
          id: row.resolutionId, originId: this.originId, manager: { id: row.managerId!, name: row.managerName! }, recordedAt: row.recordedAt!.toISOString(),
          originSequence: row.originSequence!.toString(), reason: { code: row.reasonCode!, note: row.reasonNote! }, remarks: row.remarks!, manifestHash: row.manifestHash!,
        } : null,
      })) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async get(user: User, input: unknown): Promise<ReasonResolutionView> {
    await this.allow(user);
    const id = idempotencyKeySchema.safeParse(input);
    if (!id.success) throw new BadRequestException('Invalid reconciliation identity.');
    const record = await this.db.reasonReconciliation.findFirst({ where: { id: id.data, originId: this.originId } });
    if (!record) throw new NotFoundException('Reconciliation not available.');
    const command = await this.db.commandResult.findUniqueOrThrow({ where: { id: record.commandId } });
    return command.response as unknown as ReasonResolutionView;
  }

  async reconcile(user: User, keyInput: unknown, input: unknown): Promise<ReasonResolutionView> {
    await this.allow(user); requireCapability(user, 'RECONCILE_REASON');
    if (this.mode !== 'SHOP') throw new ForbiddenException('Classification writes belong to the shop.');
    const parsed = reconcileReasonsSchema.safeParse(input), key = idempotencyKeySchema.safeParse(keyInput);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => issue.message).join('. '));
    if (!key.success) throw new BadRequestException('A valid idempotency key is required.');
    const body = parsed.data, requestHash = digest(canonical(body));
    for (let attempt = 0; ; attempt++) try {
      return await this.db.$transaction(async tx => {
        const [origin] = await tx.$queryRaw<{ mode: string }[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;
        if (origin?.mode !== 'SHOP') throw new ForbiddenException();
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;
        const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        requireCapability(actor, 'RECONCILE_REASON');
        if (actor.authVersion !== user.authVersion || !await tx.shopMembership.findUnique({ where: { userId_originId: { userId: actor.id, originId: this.originId } } }))
          throw new ForbiddenException('Session or shop access changed.');
        const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: actor.id, commandType, key: key.data } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new ConflictException('Idempotency key reused with a different classification.');
          return prior.response as unknown as ReasonResolutionView;
        }
        const ids = Prisma.join(body.exceptionIds.map(id => Prisma.sql`${id}::uuid`));
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "CheckoutException" WHERE "originId"=${this.originId}::uuid AND id IN (${ids}) ORDER BY id FOR UPDATE`);
        const targets = await tx.$queryRaw<Target[]>(Prisma.sql`SELECT e.id AS "exceptionId",e."lineId" AS "checkoutLineId",e."checkoutId",x."unitId",x."reasonCode",r.id AS "resolutionId"
          FROM "CheckoutException" e JOIN "CheckoutLine" x ON x.id=e."lineId" LEFT JOIN "CheckoutReasonResolution" r ON r."exceptionId"=e.id
          WHERE e."originId"=${this.originId}::uuid AND e.id IN (${ids}) ORDER BY e.id`);
        if (targets.length !== body.exceptionIds.length) throw new NotFoundException('One or more exceptions are not available in this shop.');
        if (targets.some(target => target.resolutionId || target.reasonCode !== null)) throw new ConflictException('One or more exceptions are already classified. No partial reconciliation was recorded.');
        const id = randomUUID(), commandId = randomUUID(), now = new Date();
        const manifest = targets.map(target => ({ id: randomUUID(), exceptionId: target.exceptionId, checkoutId: target.checkoutId, checkoutLineId: target.checkoutLineId, unitId: target.unitId }));
        const canonicalManifest = canonical(manifest), manifestHash = digest(canonicalManifest);
        await tx.reasonReconciliation.create({ data: { id, originId: this.originId, actorId: actor.id, actorRole: actor.role,
          commandId, recordedAt: now, reasonCode: body.reason.code, reasonNote: body.reason.note, remarks: body.remarks,
          exceptionCount: manifest.length, manifest, canonicalManifest, manifestHash } });
        await tx.checkoutReasonResolution.createMany({ data: manifest.map(row => ({ ...row, originId: this.originId, reconciliationId: id })) });
        const originState = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
        const response: ReasonResolutionView = { id, originId: this.originId, recordedAt: now.toISOString(), originSequence: originState.nextSequence.toString(),
          manager: { id: actor.id, name: actor.name }, reason: body.reason, remarks: body.remarks, manifestHash, lines: manifest };
        const evidence = { reconciliationId: id, manifestHash, reason: body.reason, remarks: body.remarks, exceptionCount: manifest.length };
        await tx.auditEvent.create({ data: { originId: this.originId, actorId: actor.id, actorRole: actor.role, commandId, action: eventType, subjectId: id, snapshot: evidence } });
        await tx.outboxEvent.create({ data: { originId: this.originId, actorId: actor.id, commandId, originSequence: originState.nextSequence,
          eventType, aggregateId: id, payload: evidence, payloadHash: digest(canonical(evidence)) } });
        await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: actor.id, commandType, key: key.data,
          requestHash, response: JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue } });
        return response;
      }, { timeout: 15000, maxWait: 10000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
}
