import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { decodeInventoryQr, idempotencyKeySchema, unitObservationSchema, unitTrackingQuerySchema, type UnitHistoryItem, type UnitObservationResult, type UnitTracking } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { canonical, digest } from './security.js';
import { UnitsService } from './units.service.js';

type HistoryRow = {
  id: string; kind: UnitHistoryItem['kind']; recordedAt: Date; originSequence: bigint;
  actorId: string; actorName: string; actorRole: UnitHistoryItem['actor']['role'];
  fromState: string | null; toState: string | null; receiptId: string | null;
  movementId: string | null; labelJobId: string | null; method: 'CAMERA' | 'QR_INPUT' | null;
};
export class UnitTrackingService {
  constructor(readonly db: PrismaClient, readonly originId: string, readonly mode: string,
    readonly units = new UnitsService(db, originId)) {}

  private async allow(user: User) {
    requireCapability(user, 'IDENTIFY');
    const [row] = await this.db.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"UnitObservation"') IS NOT NULL AS ready`;
    if (!row?.ready) throw new ServiceUnavailableException('Unit history is not enabled for this shop yet. Identity lookup remains available.');
  }

  async tracking(user: User, idInput: unknown, queryInput: unknown): Promise<UnitTracking> {
    await this.allow(user);
    const id = idempotencyKeySchema.safeParse(idInput), query = unitTrackingQuerySchema.safeParse(queryInput);
    if (!id.success || !query.success) throw new BadRequestException('Invalid unit history identity or page');
    return this.db.$transaction(async tx => {
      const unit = await this.units.byId(user, this.originId, id.data, tx);
      const observations = Prisma.sql`SELECT p.id,'QR_PRESENTED'::text AS kind,p."recordedAt",o."originSequence",
        p."actorId",u.name AS "actorName",p."actorRole",NULL::text AS "fromState",NULL::text AS "toState",
        NULL::uuid AS "receiptId",NULL::uuid AS "movementId",NULL::uuid AS "labelJobId",p.method
        FROM "UnitObservation" p JOIN "User" u ON u.id=p."actorId"
        JOIN "OutboxEvent" o ON o."commandId"=p."commandId" AND o."originId"=p."originId"
        WHERE p."unitId"=${id.data}::uuid AND p."originId"=${this.originId}::uuid
        ${user.role === 'PRODUCTION' ? Prisma.sql`AND p."actorId"=${user.id}::uuid` : Prisma.empty}`;
      const operational = user.role !== 'PRODUCTION';
      const [reasonSchema] = operational ? await tx.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"ReasonReconciliation"') IS NOT NULL AS ready` : [];
      const classification = reasonSchema?.ready ? Prisma.sql`UNION ALL
        SELECT resolved.id,'REASON_RECONCILED'::text,r."recordedAt",o."originSequence",r."actorId",u.name,r."actorRole",NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::text
        FROM "CheckoutReasonResolution" resolved JOIN "ReasonReconciliation" r ON r.id=resolved."reconciliationId" JOIN "User" u ON u.id=r."actorId"
        JOIN "OutboxEvent" o ON o."commandId"=r."commandId" AND o."originId"=r."originId"
        WHERE resolved."unitId"=${id.data}::uuid AND r."originId"=${this.originId}::uuid` : Prisma.empty;
      const [damageSchema] = operational ? await tx.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"DamageReview"') IS NOT NULL AS ready` : [];
      const damageReviews = damageSchema?.ready ? Prisma.sql`UNION ALL
        SELECT x.id,'DAMAGE_REVIEWED'::text,r."recordedAt",o."originSequence",r."actorId",u.name,r."actorRole",NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::text
        FROM "DamageReviewLine" x JOIN "DamageReview" r ON r.id=x."reviewId" JOIN "User" u ON u.id=r."actorId"
        JOIN "OutboxEvent" o ON o."commandId"=r."commandId" AND o."originId"=r."originId"
        WHERE x."unitId"=${id.data}::uuid AND r."originId"=${this.originId}::uuid AND r."transactionId" IS NULL` : Prisma.empty;
      const history = operational ? Prisma.sql`${observations} UNION ALL
        SELECT e.id,e.kind,e."recordedAt",o."originSequence",e."actorId",u.name,e."actorRole",e."fromState",e."toState",r."receiptId",e."movementId",NULL::uuid,NULL::text
        FROM "UnitEvent" e JOIN "User" u ON u.id=e."actorId" JOIN "StockUnit" s ON s.id=e."unitId" JOIN "ReceiptLine" r ON r.id=s."receiptLineId"
        JOIN "OutboxEvent" o ON o."commandId"=e."commandId" AND o."originId"=e."originId"
        WHERE e."unitId"=${id.data}::uuid AND e."originId"=${this.originId}::uuid UNION ALL
        SELECT e.id,CASE e.kind WHEN 'REQUESTED' THEN 'LABEL_REQUESTED' WHEN 'ARTIFACT_READY' THEN 'LABEL_PREPARED' ELSE 'PRINT_DIALOG_REQUESTED' END,e."recordedAt",o."originSequence",e."actorId",u.name,e."actorRole",NULL::text,NULL::text,NULL::uuid,NULL::uuid,e."jobId",NULL::text
        FROM "UnitLabelEvent" e JOIN "UnitLabelLine" l ON l."jobId"=e."jobId" JOIN "User" u ON u.id=e."actorId"
        JOIN "OutboxEvent" o ON o."commandId"=e."commandId" AND o."originId"=e."originId"
        WHERE l."unitId"=${id.data}::uuid AND e."originId"=${this.originId}::uuid ${classification} ${damageReviews}` : Prisma.sql`${observations} UNION ALL
        SELECT e.id,e.kind,e."recordedAt",o."originSequence",e."actorId",u.name,e."actorRole",e."fromState",e."toState",NULL::uuid,e."movementId",NULL::uuid,NULL::text
        FROM "UnitEvent" e JOIN "User" u ON u.id=e."actorId"
        JOIN "OutboxEvent" o ON o."commandId"=e."commandId" AND o."originId"=e."originId"
        WHERE e."unitId"=${id.data}::uuid AND e."originId"=${this.originId}::uuid AND (e.kind='ISSUED' OR (e.kind='BAD_REPORTED' AND e."actorRole"='PRODUCTION')) AND e."actorId"=${user.id}::uuid`;
      const [count] = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM (${history}) h`);
      const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT * FROM (${history}) h ORDER BY "originSequence",id LIMIT 20 OFFSET ${(query.data.page - 1) * 20}`);
      const classificationIds = rows.filter(row => row.kind === 'REASON_RECONCILED').map(row => row.id);
      const classifications = classificationIds.length ? await tx.$queryRaw<{ id: string; reconciliationId: string; checkoutId: string; orderReference: string | null; reasonCode: string; reasonNote: string; managerRemarks: string }[]>(Prisma.sql`
        SELECT resolved.id,r.id AS "reconciliationId",resolved."checkoutId",x."orderReference",r."reasonCode",r."reasonNote",r.remarks AS "managerRemarks"
        FROM "CheckoutReasonResolution" resolved JOIN "ReasonReconciliation" r ON r.id=resolved."reconciliationId" JOIN "CheckoutLine" x ON x.id=resolved."checkoutLineId"
        WHERE resolved.id IN (${Prisma.join(classificationIds.map(id => Prisma.sql`${id}::uuid`))}) AND r."originId"=${this.originId}::uuid`) : [];
      const classificationById = new Map(classifications.map(row => [row.id, row]));
      const issueIds = rows.filter(row => row.kind === 'ISSUED').map(row => row.id);
      const issueLines = issueIds.length ? await tx.checkoutLine.findMany({ where: { eventId: { in: issueIds }, originId: this.originId },
        select: { eventId: true, checkoutId: true, reasonCode: true, reasonNote: true, orderReference: true } }) : [];
      const issueByEvent = new Map(issueLines.map(line => [line.eventId, line]));
      const damageEvents = rows.filter(row => ['BAD_REPORTED','DAMAGE_REMOVED','DAMAGE_REVIEWED'].includes(row.kind)).map(row => row.id);
      const damageDetails = damageEvents.length ? await tx.$queryRaw<{ id: string; damageId: string; damageCause: string; damageDescription: string; damageOutcome: string | null }[]>(Prisma.sql`
        SELECT e.id,r.id AS "damageId",r.cause AS "damageCause",r.description AS "damageDescription",NULL::text AS "damageOutcome"
        FROM "UnitEvent" e JOIN "DamageLine" x ON x.id=e."damageLineId" JOIN "DamageReport" r ON r.id=x."reportId"
        WHERE e.id IN (${Prisma.join(damageEvents.map(id => Prisma.sql`${id}::uuid`))}) AND r."originId"=${this.originId}::uuid
        ${operational ? Prisma.empty : Prisma.sql`AND r."actorId"=${user.id}::uuid AND r."actorRole"='PRODUCTION'`}
        UNION ALL SELECT COALESCE(x."eventId",x.id),r.id,''::text,r.note,r.outcome FROM "DamageReviewLine" x JOIN "DamageReview" r ON r.id=x."reviewId"
        WHERE ${operational} AND COALESCE(x."eventId",x.id) IN (${Prisma.join(damageEvents.map(id => Prisma.sql`${id}::uuid`))}) AND r."originId"=${this.originId}::uuid`) : [];
      const damageByEvent = new Map(damageDetails.map(row => [row.id,row]));
      const ownIssue = operational ? false : await tx.unitEvent.count({ where: { unitId: id.data, originId: this.originId, actorId: user.id, kind: 'ISSUED' } }) > 0;
      const events = rows.map(row => ({
        ...(classificationById.get(row.id) ?? {}),
        ...(damageByEvent.get(row.id) ?? {}),
        ...(issueByEvent.get(row.id) ? { checkoutId: issueByEvent.get(row.id)!.checkoutId, orderReference: issueByEvent.get(row.id)!.orderReference, reasonCode: issueByEvent.get(row.id)!.reasonCode, reasonNote: issueByEvent.get(row.id)!.reasonNote } : {}),
        id: row.id, kind: row.kind, recordedAt: row.recordedAt.toISOString(), originSequence: row.originSequence.toString(),
        actor: { id: row.actorId, name: row.actorName, role: row.actorRole },
        ...(row.fromState ? { fromState: row.fromState } : {}), ...(row.toState ? { toState: row.toState } : {}),
        ...(row.receiptId ? { receiptId: row.receiptId } : {}), ...(row.movementId ? { movementId: row.movementId } : {}),
        ...(row.labelJobId ? { labelJobId: row.labelJobId } : {}), ...(row.method ? { method: row.method } : {}),
      }));
      const result: UnitTracking = { unit, timeline: { events, total: Number(count!.n), page: query.data.page, pageSize: 20 },
        historyScope: operational ? 'OPERATIONAL' : ownIssue ? 'OWN_ACTIVITY' : 'OWN_QR_PRESENTATIONS', physicalVerification: 'NOT_ESTABLISHED_BY_THIS_VIEW' };
      if (operational) {
        const saved = await tx.stockUnit.findUniqueOrThrow({ where: { id: id.data } });
        const state = await tx.unitState.findUniqueOrThrow({ where: { unitId: id.data }, select: { custody: true } });
        result.recordedCustody = state.custody;
        result.initialCondition = saved.initialState === 'U' ? 'USABLE' : 'DAMAGED';
        const line = await tx.receiptLine.findUniqueOrThrow({ where: { id: saved.receiptLineId }, select: { receiptId: true, batchId: true } });
        result.receiptId = line.receiptId;
        result.deliveredOn = (await tx.deliveryBatch.findUniqueOrThrow({ where: { id: line.batchId }, select: { deliveredOn: true } })).deliveredOn.toISOString().slice(0, 10);
      }
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async observe(user: User, keyInput: unknown, input: unknown): Promise<UnitObservationResult> {
    await this.allow(user);
    if (this.mode !== 'SHOP') throw new ForbiddenException('QR history writes belong to the shop');
    const parsed = unitObservationSchema.safeParse(input), key = idempotencyKeySchema.safeParse(keyInput);
    if (!parsed.success || !key.success) throw new BadRequestException('Invalid QR presentation or idempotency key');
    let identity: ReturnType<typeof decodeInventoryQr>;
    try { identity = decodeInventoryQr(parsed.data.payload); }
    catch { throw new BadRequestException('Malformed individual-unit QR'); }
    if (identity.version !== 2) throw new UnprocessableEntityException('Shared lot QR identifies no exact physical unit; use individual-unit QR');
    if (identity.originId !== this.originId) throw new NotFoundException('UNIT_NOT_AVAILABLE');
    const unitId = identity.unitId, body = parsed.data, requestHash = digest(canonical(body)), commandType = 'units.qr.present';
    for (let attempt = 0; ; attempt++) try {
      return await this.db.$transaction(async tx => {
        const [origin] = await tx.$queryRaw<{ mode: string }[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;
        if (origin?.mode !== 'SHOP') throw new ForbiddenException();
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;
        const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        requireCapability(actor, 'IDENTIFY');
        if (actor.authVersion !== user.authVersion) throw new ForbiddenException('Session security state changed');
        const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: actor.id, commandType, key: key.data } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new ConflictException('Idempotency key reused with a different QR presentation');
          return prior.response as unknown as UnitObservationResult;
        }
        const unit = await this.units.byId(actor, this.originId, unitId, tx);
        const commandId = randomUUID(), id = randomUUID(), now = new Date();
        await tx.unitObservation.create({ data: { id, originId: this.originId, unitId, lotId: unit.lotId, actorId: actor.id, actorRole: actor.role, commandId, method: body.method, recordedAt: now } });
        const originState = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
        const response: UnitObservationResult = { id, unitId, recordedAt: now.toISOString(), originSequence: originState.nextSequence.toString(), evidence: 'QR_PRESENTED_ONLY' };
        const evidence = { ...response, method: body.method, actorId: actor.id, actorRole: actor.role, commandId };
        await tx.auditEvent.create({ data: { originId: this.originId, actorId: actor.id, actorRole: actor.role, commandId, action: commandType, subjectId: id, snapshot: evidence } });
        await tx.outboxEvent.create({ data: { originId: this.originId, originSequence: originState.nextSequence, actorId: actor.id, commandId, eventType: commandType, aggregateId: id, payload: evidence, payloadHash: digest(canonical(evidence)) } });
        await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: actor.id, commandType, key: key.data, requestHash, response } });
        return response;
      }, { timeout: 15000, maxWait: 10000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
}
