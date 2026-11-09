import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { authorizationHistoryQuerySchema, authorizationRequestSchema, authorizationSelectionSchema, idempotencyKeySchema,
  type AuthorizationPreview, type AuthorizationRequestView, type CorrectionTarget, type DamageCandidate, type RecoveryRequestTarget } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { canonical, digest } from './security.js';
import { DamageService, type DamageSelection } from './damage.service.js';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
type Selection = { kind: 'RECOVERY'; unitIds: string[] } | { kind: 'CORRECTION'; lotId: string; state: 'U' | 'P' | 'D' };
export class AuthorizationRequestsService {
  readonly damage: DamageService;
  constructor(readonly db: PrismaClient, readonly originId: string, readonly mode: string) { this.damage = new DamageService(db, originId, mode); }
  private async allow(user: User) {
    requireCapability(user, 'OPERATIONAL_STOCK');
    const [schema] = await this.db.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"AuthorizationRequest"') IS NOT NULL AS ready`;
    if (!schema?.ready) throw new ServiceUnavailableException('Pending requests require the separately approved shop database upgrade.');
  }
  async configuration(user: User) {
    await this.allow(user);
    return { originId: this.originId, limit: 500, canSubmit: user.role === 'MANAGER' && this.mode === 'SHOP', approvalDelivery: 'DEFERRED' as const, executionEnabled: false };
  }
  private candidate(row: DamageSelection): RecoveryRequestTarget {
    return { unit: this.damage.identity(row), state: row.state as DamageCandidate['state'], checkoutId: row.checkoutId, checkoutLineId: row.checkoutLineId,
      orderReference: row.orderReference, holder: row.holderId ? { id: row.holderId, name: row.holderName! } : null,
      receiptId: row.receiptId, damageLineId: row.damageLineId, eligible: row.state === 'D', recordedVersion: row.version.toString(), previousEventId: row.lastEventId };
  }
  private async resolve(tx: Prisma.TransactionClient, user: User, selection: Selection): Promise<{ preview: AuthorizationPreview; rows: DamageSelection[] }> {
    if (selection.kind === 'RECOVERY') {
      const rows = await this.damage.selection(tx, user, selection.unitIds);
      if (rows.length !== selection.unitIds.length) throw new NotFoundException('One or more units are not available in this shop.');
      if (rows.some(row => row.state !== 'D')) throw new ConflictException('Recovery requests require exact currently damaged units. Nothing was requested.');
      return { preview: { kind: 'RECOVERY', units: rows.map(row => this.candidate(row)) }, rows };
    }
    const [target] = await tx.$queryRaw<CorrectionTarget[]>`SELECT l.id AS "lotId",li.code AS "lotCode",pi.code AS "productCode",p.id AS "productId",p.name AS "productName",
      v.name AS "variantName",sku.id AS "skuId",sku."fullCode" AS "fullSku",b.id AS "batchId",b."publicCode" AS "publicBatchCode",${selection.state}::text AS state,
      COALESCE((SELECT sum(CASE WHEN m."toState"=${selection.state} THEN m.quantity ELSE -m.quantity END) FROM "StockMovement" m
        WHERE m."lotId"=l.id AND (m."toState"=${selection.state} OR m."fromState"=${selection.state})),0)::text AS "ledgerQuantity",
      COALESCE((SELECT quantity FROM "StockBalance" WHERE "lotId"=l.id AND state=${selection.state}),0)::text AS "projectionQuantity"
      FROM "StockLot" l JOIN "DeliveryBatch" b ON b.id=l."batchId" JOIN "SupplierVariantSku" sku ON sku.id=l."skuId"
      JOIN "Product" p ON p.id=sku."productId" JOIN "Variant" v ON v.id=sku."variantId"
      LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id LEFT JOIN "ProductPublicIdentity" pi ON pi."productId"=p.id
      WHERE l.id=${selection.lotId}::uuid AND l."originId"=${this.originId}::uuid`;
    if (!target) throw new NotFoundException('Stock lot is not available in this shop.');
    return { preview: { kind: 'CORRECTION', target }, rows: [] };
  }
  async preview(user: User, input: unknown) {
    await this.allow(user); const parsed = authorizationSelectionSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Select exact damaged units, or one saved lot and stock state.');
    return this.db.$transaction(async tx => (await this.resolve(tx, user, parsed.data)).preview, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async get(user: User, input: unknown): Promise<AuthorizationRequestView> {
    await this.allow(user); const id = idempotencyKeySchema.safeParse(input);
    if (!id.success) throw new BadRequestException('Invalid request identity.');
    const root = await this.db.authorizationRequest.findFirst({ where: { id: id.data, originId: this.originId } });
    if (!root) throw new NotFoundException('Request not available in this shop.');
    return (await this.db.commandResult.findUniqueOrThrow({ where: { id: root.commandId } })).response as unknown as AuthorizationRequestView;
  }
  async list(user: User, input: unknown) {
    await this.allow(user); const query = authorizationHistoryQuerySchema.safeParse(input);
    if (!query.success) throw new BadRequestException('Invalid request history filters.');
    const filter = Prisma.sql`r."originId"=${this.originId}::uuid ${query.data.kind ? Prisma.sql`AND r.kind=${query.data.kind}` : Prisma.empty}`;
    return this.db.$transaction(async tx => {
      const [count] = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM "AuthorizationRequest" r WHERE ${filter}`);
      const rows = await tx.$queryRaw(Prisma.sql`SELECT r.id,r.kind,r.status,r."recordedAt",r."unitCount",r."requestedDelta"::text AS "requestedDelta",u.name AS "managerName"
        FROM "AuthorizationRequest" r JOIN "User" u ON u.id=r."actorId" WHERE ${filter} ORDER BY r."recordedAt" DESC,r.id DESC LIMIT 20 OFFSET ${(query.data.page - 1) * 20}`);
      return { page: query.data.page, pageSize: 20, total: Number(count!.n), rows };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async create(user: User, keyInput: unknown, input: unknown): Promise<AuthorizationRequestView> {
    await this.allow(user); requireCapability(user, 'REQUEST_STOCK_AUTHORIZATION');
    if (this.mode !== 'SHOP') throw new ForbiddenException('Requests are recorded at the shop.');
    const parsed = authorizationRequestSchema.safeParse(input), key = idempotencyKeySchema.safeParse(keyInput);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => issue.message).join('. '));
    if (!key.success) throw new BadRequestException('A valid idempotency key is required.');
    const body = parsed.data, requestHash = digest(canonical(body)), commandType = 'inventory.authorization.request', eventType = 'inventory.authorization.requested';
    for (let attempt = 0; ; attempt++) try {
      return await this.db.$transaction(async tx => {
        const [origin] = await tx.$queryRaw<{ mode: string }[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;
        if (origin?.mode !== 'SHOP') throw new ForbiddenException();
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;
        const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } }); requireCapability(actor, 'REQUEST_STOCK_AUTHORIZATION');
        if (actor.authVersion !== user.authVersion || !await tx.shopMembership.findUnique({ where: { userId_originId: { userId: actor.id, originId: this.originId } } })) throw new ForbiddenException('Session or shop access changed.');
        const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: actor.id, commandType, key: key.data } } });
        if (prior) { if (prior.requestHash !== requestHash) throw new ConflictException('Idempotency key reused with different request evidence.'); return prior.response as unknown as AuthorizationRequestView; }
        if (body.kind === 'RECOVERY') {
          const ids = Prisma.join(body.unitIds.map(id => Prisma.sql`${id}::uuid`));
          await tx.$queryRaw(Prisma.sql`SELECT id FROM "StockUnit" WHERE "originId"=${this.originId}::uuid AND id IN (${ids}) ORDER BY id FOR UPDATE`);
          await tx.$queryRaw(Prisma.sql`SELECT "unitId" FROM "UnitState" WHERE "originId"=${this.originId}::uuid AND "unitId" IN (${ids}) ORDER BY "unitId" FOR UPDATE`);
        } else {
          await tx.$queryRaw`SELECT id FROM "StockLot" WHERE id=${body.lotId}::uuid AND "originId"=${this.originId}::uuid FOR SHARE`;
          await tx.$queryRaw`SELECT "lotId" FROM "StockBalance" WHERE "lotId"=${body.lotId}::uuid AND state=${body.state} FOR UPDATE`;
        }
        const { preview, rows } = await this.resolve(tx, actor, body);
        const target = preview.kind === 'CORRECTION' ? preview.target : null;
        const observed = body.kind === 'CORRECTION' ? BigInt(body.observedQuantity) : null;
        if (target && body.kind === 'CORRECTION' && (target.ledgerQuantity !== body.reviewedLedgerQuantity || target.projectionQuantity !== body.reviewedProjectionQuantity))
          throw new ConflictException('Stock quantities changed since review. Refresh the preview and review this request again. Stock has not changed.');
        if (target && observed === BigInt(target.ledgerQuantity) && target.projectionQuantity === target.ledgerQuantity) throw new BadRequestException('Observed quantity agrees with the ledger and projection. No correction is requested.');
        const id = randomUUID(), commandId = randomUUID(), now = new Date(), members = rows.map(row => ({ id: randomUUID(), unitId: row.unitId }));
        const payload = { input: body, preview, members }, canonicalEvidence = canonical(payload), evidenceHash = digest(canonicalEvidence);
        await tx.authorizationRequest.create({ data: { id, originId: this.originId, actorId: actor.id, actorRole: actor.role, commandId, recordedAt: now,
          kind: body.kind, status: 'PENDING_CLOUD_AUTHORIZATION', reason: body.reason, evidence: body.evidence, lotId: target?.lotId ?? null, state: target?.state ?? null,
          ledgerQuantity: target ? BigInt(target.ledgerQuantity) : null, projectionQuantity: target ? BigInt(target.projectionQuantity) : null,
          observedQuantity: observed, unitCount: rows.length, payload: json(payload), canonicalEvidence, evidenceHash } });
        if (preview.kind === 'RECOVERY') await tx.authorizationRequestUnit.createMany({ data: rows.map((row, index) => ({ id: members[index]!.id, requestId: id, originId: this.originId,
          unitId: row.unitId, lotId: row.lotId, previousEventId: row.lastEventId, recordedVersion: row.version, damageLineId: row.damageLineId, snapshot: json(this.candidate(row)) })) });
        const node = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
        const response: AuthorizationRequestView = { id, originId: this.originId, recordedAt: now.toISOString(), originSequence: node.nextSequence.toString(),
          manager: { id: actor.id, name: actor.name }, kind: body.kind, status: 'PENDING_CLOUD_AUTHORIZATION', reason: body.reason, evidence: body.evidence, evidenceHash,
          requestedDelta: target && observed !== null ? (observed - BigInt(target.ledgerQuantity)).toString() : null, observedQuantity: observed?.toString() ?? null, preview, stockChanged: false, approvalDelivery: 'DEFERRED' };
        const evidence = { requestId: id, kind: body.kind, status: response.status, evidenceHash, stockChanged: false };
        await tx.auditEvent.create({ data: { originId: this.originId, actorId: actor.id, actorRole: actor.role, commandId, action: eventType, subjectId: id, snapshot: evidence } });
        await tx.outboxEvent.create({ data: { originId: this.originId, actorId: actor.id, commandId, originSequence: node.nextSequence, eventType, aggregateId: id, payload: evidence, payloadHash: digest(canonical(evidence)) } });
        await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: actor.id, commandType, key: key.data, requestHash, response: json(response) } });
        return response;
      }, { timeout: 15000, maxWait: 10000 });
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue; throw error; }
  }
}
