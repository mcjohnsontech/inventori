import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { damageQuerySchema, damageReportSchema, damageReviewSchema, damageSelectionSchema, idempotencyKeySchema,
  type CheckoutItemIdentity, type DamageCandidate, type DamageReportInput, type DamageReviewInput, type DamageView } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { canonical, digest } from './security.js';

export type DamageSelection = CheckoutItemIdentity & { state: string; version: bigint; lastEventId: string; receiptId: string;
  checkoutLineId: string | null; checkoutId: string | null; orderReference: string | null; holderId: string | null; holderName: string | null; damageLineId: string | null };
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export class DamageService {
  constructor(readonly db: PrismaClient, readonly originId: string, readonly mode: string) {}
  private async allow(user: User, review = false) {
    requireCapability(user, review ? 'OPERATIONAL_STOCK' : 'REPORT_BAD');
    const [schema] = await this.db.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"DamageReport"') IS NOT NULL AND to_regclass('"DamageReview"') IS NOT NULL AS ready`;
    if (!schema?.ready) throw new ServiceUnavailableException('Damage workflows require the separately approved shop database upgrade.');
  }
  async configuration(user: User) {
    await this.allow(user);
    return { originId: this.originId, limit: 500, canReport: this.mode === 'SHOP', canReview: user.role === 'MANAGER' && this.mode === 'SHOP',
      ownIssuedOnly: user.role === 'PRODUCTION', canViewReviews: user.role !== 'PRODUCTION' };
  }
  async selection(tx: Prisma.TransactionClient, user: User, ids: string[]): Promise<DamageSelection[]> {
    return tx.$queryRaw<DamageSelection[]>(Prisma.sql`SELECT u.id AS "unitId",u."unitCode",u."lotId",li.code AS "lotCode",p.id AS "productId",pi.code AS "productCode",
      p.name AS "productName",v.id AS "variantId",v.name AS "variantName",sku.id AS "skuId",sku."fullCode" AS "fullSku",
      b.id AS "batchId",b."publicCode" AS "publicBatchCode",s.state,s.version,s."lastEventId",r."receiptId",
      x.id AS "checkoutLineId",c.id AS "checkoutId",x."orderReference",s."holderId",holder.name AS "holderName",bad.id AS "damageLineId"
      FROM "StockUnit" u JOIN "UnitState" s ON s."unitId"=u.id AND s."originId"=u."originId"
      JOIN "StockLot" l ON l.id=u."lotId" AND l."originId"=u."originId" JOIN "ReceiptLine" r ON r.id=u."receiptLineId"
      JOIN "SupplierVariantSku" sku ON sku.id=l."skuId" JOIN "Product" p ON p.id=sku."productId" JOIN "Variant" v ON v.id=sku."variantId"
      JOIN "DeliveryBatch" b ON b.id=l."batchId" LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id LEFT JOIN "ProductPublicIdentity" pi ON pi."productId"=p.id
      LEFT JOIN "User" holder ON holder.id=s."holderId"
      LEFT JOIN "DamageLine" bad ON bad."eventId"=s."lastEventId"
      LEFT JOIN "CheckoutLine" x ON x."eventId"=s."lastEventId" OR x.id=bad."checkoutLineId" LEFT JOIN "Checkout" c ON c.id=x."checkoutId"
      WHERE u."originId"=${this.originId}::uuid AND u.id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))})
      ${user.role === 'PRODUCTION' ? Prisma.sql`AND s.state='P' AND c."actorId"=${user.id}::uuid AND s."holderId"=${user.id}::uuid` : Prisma.empty}
      ORDER BY u.id`);
  }
  identity(row: DamageSelection): CheckoutItemIdentity {
    const { state, version, lastEventId, receiptId, checkoutLineId, checkoutId, orderReference, holderId, holderName, damageLineId, ...identity } = row;
    return identity;
  }
  async preview(user: User, input: unknown, review = false) {
    await this.allow(user, review);
    const parsed = damageSelectionSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Select distinct exact saved units, at most 500.');
    const rows = await this.db.$transaction(tx => this.selection(tx, user, parsed.data.unitIds));
    if (rows.length !== parsed.data.unitIds.length) throw new NotFoundException('One or more units are not available for this workflow.');
    return { units: rows.map(row => ({ unit: this.identity(row), state: row.state, checkoutId: row.checkoutId, checkoutLineId: row.checkoutLineId,
      orderReference: row.orderReference, holder: row.holderId ? { id: row.holderId, name: row.holderName! } : null,
      receiptId: row.receiptId, damageLineId: row.damageLineId, eligible: review ? row.state === 'D' : ['U', 'P'].includes(row.state) }) as DamageCandidate) };
  }
  async list(user: User, input: unknown, review = false) {
    await this.allow(user, review); const query = damageQuerySchema.safeParse(input);
    if (!query.success) throw new BadRequestException('Invalid history filters.');
    const root = review ? Prisma.sql`"DamageReview"` : Prisma.sql`"DamageReport"`;
    const filter = Prisma.sql`r."originId"=${this.originId}::uuid
      ${user.role === 'PRODUCTION' ? Prisma.sql`AND r."actorId"=${user.id}::uuid AND r."actorRole"='PRODUCTION'` : Prisma.empty}
      ${query.data.unitCode ? review ? Prisma.sql`AND EXISTS(SELECT 1 FROM "DamageReviewLine" x JOIN "StockUnit" u ON u.id=x."unitId" WHERE x."reviewId"=r.id AND u."unitCode"=${query.data.unitCode})`
        : Prisma.sql`AND EXISTS(SELECT 1 FROM "DamageLine" x JOIN "StockUnit" u ON u.id=x."unitId" WHERE x."reportId"=r.id AND u."unitCode"=${query.data.unitCode})` : Prisma.empty}`;
    return this.db.$transaction(async tx => {
      const [count] = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM ${root} r WHERE ${filter}`);
      const rows = await tx.$queryRaw(Prisma.sql`SELECT r.id,r."recordedAt",r."unitCount",u.name AS "actorName",${review ? Prisma.sql`r.outcome` : Prisma.sql`r.cause`}
        FROM ${root} r JOIN "User" u ON u.id=r."actorId" WHERE ${filter} ORDER BY r."recordedAt" DESC,r.id DESC LIMIT 20 OFFSET ${(query.data.page - 1) * 20}`);
      return { page: query.data.page, pageSize: 20, total: Number(count!.n), rows };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async get(user: User, input: unknown, review = false): Promise<DamageView> {
    await this.allow(user, review); const id = idempotencyKeySchema.safeParse(input);
    if (!id.success) throw new BadRequestException('Invalid damage identity.');
    const root = review ? await this.db.damageReview.findFirst({ where: { id: id.data, originId: this.originId } })
      : await this.db.damageReport.findFirst({ where: { id: id.data, originId: this.originId,
        ...(user.role === 'PRODUCTION' ? { actorId: user.id, actorRole: 'PRODUCTION' } : {}) } });
    if (!root) throw new NotFoundException('Damage record not available.');
    return (await this.db.commandResult.findUniqueOrThrow({ where: { id: root.commandId } })).response as unknown as DamageView;
  }
  async create(user: User, keyInput: unknown, input: unknown, review = false): Promise<DamageView> {
    await this.allow(user, review); if (review) requireCapability(user, 'REVIEW_DAMAGE');
    if (this.mode !== 'SHOP') throw new ForbiddenException('Stock commands belong to the shop.');
    const parsed = review ? damageReviewSchema.safeParse(input) : damageReportSchema.safeParse(input), key = idempotencyKeySchema.safeParse(keyInput);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => issue.message).join('. '));
    if (!key.success) throw new BadRequestException('A valid idempotency key is required.');
    const body = parsed.data, badBody = body as DamageReportInput, reviewBody = body as DamageReviewInput;
    const removed = review && ['DISCARDED', 'RETURNED_TO_VENDOR'].includes(reviewBody.outcome), moves = !review || removed;
    const commandType = review ? 'inventory.damage.review' : 'inventory.damage.report', eventType = review ? 'inventory.damage.reviewed' : 'inventory.damage.reported';
    const requestHash = digest(canonical(body));
    for (let attempt = 0; ; attempt++) try {
      return await this.db.$transaction(async tx => {
        const [origin] = await tx.$queryRaw<{ mode: string }[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;
        if (origin?.mode !== 'SHOP') throw new ForbiddenException();
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;
        const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } }); requireCapability(actor, review ? 'REVIEW_DAMAGE' : 'REPORT_BAD');
        if (actor.authVersion !== user.authVersion || !await tx.shopMembership.findUnique({ where: { userId_originId: { userId: actor.id, originId: this.originId } } })) throw new ForbiddenException('Session or shop access changed.');
        const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: actor.id, commandType, key: key.data } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new ConflictException('Idempotency key reused with a different request.');
          const saved = prior.response as unknown as DamageView;
          if (actor.role === 'PRODUCTION' && saved.actor.role !== 'PRODUCTION') throw new ForbiddenException();
          return saved;
        }
        const ids = Prisma.join(body.unitIds.map(id => Prisma.sql`${id}::uuid`));
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "StockUnit" WHERE "originId"=${this.originId}::uuid AND id IN (${ids}) ORDER BY id FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT "unitId" FROM "UnitState" WHERE "originId"=${this.originId}::uuid AND "unitId" IN (${ids}) ORDER BY "unitId" FOR UPDATE`);
        const rows = await this.selection(tx, actor, body.unitIds);
        if (rows.length !== body.unitIds.length) throw new NotFoundException('One or more units are not available for this workflow.');
        if (rows.some(row => review ? row.state !== 'D' : !['U', 'P'].includes(row.state))) throw new ConflictException('One or more units are no longer eligible. Nothing was accepted.');
        const lots = [...new Set(rows.map(row => row.lotId))].sort();
        await tx.$queryRaw(Prisma.sql`SELECT "lotId",state FROM "StockBalance" WHERE "lotId" IN (${Prisma.join(lots.map(id => Prisma.sql`${id}::uuid`))}) ORDER BY "lotId",state FOR UPDATE`);
        const now = new Date(), id = randomUUID(), commandId = randomUUID(), transactionId = moves ? randomUUID() : null;
        const node = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
        const common = { originId: this.originId, actorId: actor.id, actorRole: actor.role, commandId };
        const lines = rows.map(row => ({ id: randomUUID(), unit: this.identity(row), fromState: row.state, toState: review ? removed ? 'X' : 'D' : 'D',
          checkoutId: row.checkoutId, checkoutLineId: row.checkoutLineId, orderReference: row.orderReference, receiptId: row.receiptId,
          recordedHolder: row.holderId ? { id: row.holderId, name: row.holderName! } : null,
          damageLineId: row.damageLineId, movementId: moves ? randomUUID() : null, eventId: moves ? randomUUID() : null, previousEventId: row.lastEventId }));
        const manifest = lines.map(line => ({ id: line.id, unitId: line.unit.unitId })), canonicalManifest = canonical(manifest), manifestHash = digest(canonicalManifest);
        if (transactionId) await tx.stockTransaction.create({ data: { id: transactionId, ...common, batchId: null, type: review ? 'DISPOSITION' : 'DAMAGE', originSequence: node.nextSequence, recordedAt: now } });
        const root = { id, ...common, recordedAt: now, unitCount: lines.length, manifest, canonicalManifest, manifestHash };
        if (review) {
          await tx.damageReview.create({ data: { ...root, transactionId, outcome: reviewBody.outcome, note: reviewBody.note } });
          await tx.damageReviewLine.createMany({ data: lines.map(line => ({ id: line.id, reviewId: id, originId: this.originId, unitId: line.unit.unitId,
            lotId: line.unit.lotId, batchId: line.unit.batchId, previousEventId: line.previousEventId, damageLineId: line.damageLineId,
            movementId: line.movementId, eventId: line.eventId, snapshot: json(line) })) });
        } else {
          await tx.damageReport.create({ data: { ...root, transactionId: transactionId!, cause: badBody.cause, description: badBody.description } });
          await tx.damageLine.createMany({ data: lines.map(line => ({ id: line.id, reportId: id, originId: this.originId, unitId: line.unit.unitId,
            lotId: line.unit.lotId, batchId: line.unit.batchId, fromState: line.fromState, previousEventId: line.previousEventId,
            checkoutLineId: line.checkoutLineId, movementId: line.movementId!, eventId: line.eventId!, snapshot: json(line) })) });
        }
        if (transactionId) {
          await tx.stockMovement.createMany({ data: lines.map(line => ({ id: line.movementId!, transactionId, batchId: line.unit.batchId, lotId: line.unit.lotId,
            receiptLineId: null, checkoutLineId: null, damageLineId: review ? null : line.id, damageReviewLineId: review ? line.id : null,
            fromState: line.fromState, toState: line.toState, quantity: 1n })) });
          const byId = new Map(rows.map(row => [row.unitId, row]));
          await tx.unitEvent.createMany({ data: lines.map(line => ({ id: line.eventId!, ...common, unitId: line.unit.unitId, lotId: line.unit.lotId,
            ordinal: Number(byId.get(line.unit.unitId)!.version) + 1, kind: review ? 'DAMAGE_REMOVED' : 'BAD_REPORTED',
            fromState: line.fromState, toState: line.toState, previousEventId: line.previousEventId, movementId: line.movementId!,
            checkoutLineId: null, damageLineId: review ? null : line.id, damageReviewLineId: review ? line.id : null,
            recordedAt: now, details: { damageId: id, damageLineId: line.id, ...(review ? { outcome: reviewBody.outcome } : {}) } })) });
          const updates = JSON.stringify(lines.map(line => ({ unitId: line.unit.unitId, eventId: line.eventId, fromState: line.fromState, toState: line.toState })));
          const changed = await tx.$executeRaw`UPDATE "UnitState" s SET state=x."toState",condition='DAMAGED',custody=CASE x."toState" WHEN 'X' THEN 'REMOVED' ELSE 'SHOP_STORAGE' END,
            "holderId"=NULL,version=s.version+1,"lastEventId"=x."eventId" FROM jsonb_to_recordset(${updates}::jsonb) AS x("unitId" uuid,"eventId" uuid,"fromState" text,"toState" text)
            WHERE s."unitId"=x."unitId" AND s.state=x."fromState" AND s."originId"=${this.originId}::uuid`;
          if (changed !== lines.length) throw new ConflictException('Unit state changed. No damage command accepted.');
          const deltas = new Map<string, { lotId: string; state: string; quantity: number }>();
          for (const line of lines) for (const [state, delta] of [[line.fromState, -1], [line.toState, 1]] as const) {
            const key = line.unit.lotId + ':' + state, saved = deltas.get(key) ?? { lotId: line.unit.lotId, state, quantity: 0 }; saved.quantity += delta; deltas.set(key, saved);
          }
          for (const delta of [...deltas.values()].sort((a, b) => (a.lotId + a.state).localeCompare(b.lotId + b.state))) {
            if (delta.quantity < 0) {
              const count = await tx.$executeRaw`UPDATE "StockBalance" SET quantity=quantity+${BigInt(delta.quantity)},version=version+1,"lastTransactionId"=${transactionId}::uuid
                WHERE "lotId"=${delta.lotId}::uuid AND state=${delta.state} AND quantity>=${BigInt(-delta.quantity)}`;
              if (count !== 1) throw new ConflictException('Ledger balance is inconsistent. No damage command accepted.');
            } else await tx.$executeRaw`INSERT INTO "StockBalance"("lotId",state,quantity,version,"lastTransactionId") VALUES(${delta.lotId}::uuid,${delta.state},${BigInt(delta.quantity)},1,${transactionId}::uuid)
              ON CONFLICT("lotId",state) DO UPDATE SET quantity="StockBalance".quantity+EXCLUDED.quantity,version="StockBalance".version+1,"lastTransactionId"=EXCLUDED."lastTransactionId"`;
          }
        }
        const response: DamageView = { id, originId: this.originId, recordedAt: now.toISOString(), originSequence: node.nextSequence.toString(), transactionId,
          actor: { id: actor.id, name: actor.name, role: actor.role }, kind: review ? 'REVIEW' : 'BAD', cause: review ? '' : badBody.cause,
          description: review ? reviewBody.note : badBody.description, outcome: review ? reviewBody.outcome : null, manifestHash,
          lines: lines.map(({ previousEventId, ...line }) => line) };
        const evidence = { damageId: id, transactionId, manifestHash, unitCount: lines.length, kind: response.kind, outcome: response.outcome };
        await tx.auditEvent.create({ data: { ...common, action: eventType, subjectId: id, snapshot: evidence } });
        await tx.outboxEvent.create({ data: { originId: this.originId, actorId: actor.id, commandId, originSequence: node.nextSequence, eventType,
          aggregateId: id, payload: evidence, payloadHash: digest(canonical(evidence)) } });
        await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: actor.id, commandType, key: key.data, requestHash, response: json(response) } });
        return response;
      }, { timeout: 15000, maxWait: 10000 });
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue; throw error; }
  }
}
