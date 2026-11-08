import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { checkoutHistoryQuerySchema, checkoutSchema, checkoutSelectionSchema, idempotencyKeySchema, resolveCheckoutLines, type CheckoutCandidate, type CheckoutItemIdentity, type CheckoutReason, type CheckoutView } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { canonical, digest } from './security.js';

type Tx = Prisma.TransactionClient;
type SelectionRow = CheckoutItemIdentity & { state: string; version: bigint; lastEventId: string };
const commandType = 'production.checkouts.create';
const eventType = 'inventory.checkout.accepted';
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

export class CheckoutsService {
  constructor(readonly db: PrismaClient, readonly originId: string, readonly mode: string) {}

  private async allow(user: User) {
    requireCapability(user, 'CHECKOUT');
    const [row] = await this.db.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"Checkout"') IS NOT NULL AS ready`;
    if (!row?.ready) throw new ServiceUnavailableException('Checkout requires the separately approved shop database upgrade.');
  }

  async configuration(user: User) {
    await this.allow(user);
    return { originId: this.originId, limit: 500, writeEnabled: this.mode === 'SHOP' };
  }

  private async selection(tx: Tx, ids: string[]): Promise<SelectionRow[]> {
    return tx.$queryRaw<SelectionRow[]>(Prisma.sql`
      SELECT u.id AS "unitId",u."unitCode",u."lotId",li.code AS "lotCode",p.id AS "productId",pi.code AS "productCode",
       p.name AS "productName",v.id AS "variantId",v.name AS "variantName",sku.id AS "skuId",sku."fullCode" AS "fullSku",
       b.id AS "batchId",b."publicCode" AS "publicBatchCode",s.state,s.version,s."lastEventId"
      FROM "StockUnit" u JOIN "UnitState" s ON s."unitId"=u.id AND s."originId"=u."originId" AND s."lotId"=u."lotId"
      JOIN "StockLot" l ON l.id=u."lotId" AND l."originId"=u."originId"
      JOIN "SupplierVariantSku" sku ON sku.id=l."skuId" JOIN "Product" p ON p.id=sku."productId"
      JOIN "Variant" v ON v.id=sku."variantId" JOIN "DeliveryBatch" b ON b.id=l."batchId"
      LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id LEFT JOIN "ProductPublicIdentity" pi ON pi."productId"=p.id
      WHERE u."originId"=${this.originId}::uuid AND u.id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))})`);
  }

  private identity(row: SelectionRow): CheckoutItemIdentity {
    const { state: _state, version: _version, lastEventId: _lastEventId, ...identity } = row;
    return identity;
  }

  async get(user: User, input: unknown): Promise<CheckoutView> {
    await this.allow(user);
    const id = idempotencyKeySchema.safeParse(input);
    if (!id.success) throw new BadRequestException('Invalid checkout identity.');
    const checkout = await this.db.checkout.findFirst({ where: { id: id.data, originId: this.originId,
      ...(user.role === 'PRODUCTION' ? { actorId: user.id } : {}) } });
    if (!checkout) throw new NotFoundException('Checkout not available.');
    const command = await this.db.commandResult.findUniqueOrThrow({ where: { id: checkout.commandId } });
    // A recorded acceptance response, including balances as of acceptance; never pretend it is live stock.
    return command.response as unknown as CheckoutView;
  }

  async list(user: User, input: unknown) {
    await this.allow(user);
    const parsed = checkoutHistoryQuerySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid checkout page or Order ID.');
    const query = parsed.data;
    const filter = Prisma.sql`c."originId"=${this.originId}::uuid
      ${user.role === 'PRODUCTION' ? Prisma.sql`AND c."actorId"=${user.id}::uuid` : Prisma.empty}
      ${query.orderReference ? Prisma.sql`AND EXISTS(SELECT 1 FROM "CheckoutLine" x WHERE x."checkoutId"=c.id AND x."orderReference"=${query.orderReference})` : Prisma.empty}`;
    return this.db.$transaction(async tx => {
      const [count] = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM "Checkout" c WHERE ${filter}`);
      const rows = await tx.$queryRaw<{ id: string; acceptedAt: Date; actorName: string; unitCount: number; missing: bigint }[]>(Prisma.sql`
        SELECT c.id,c."acceptedAt",u.name AS "actorName",c."unitCount",
        (SELECT count(*) FROM "CheckoutException" e WHERE e."checkoutId"=c.id) AS missing
        FROM "Checkout" c JOIN "User" u ON u.id=c."actorId" WHERE ${filter}
        ORDER BY c."acceptedAt" DESC,c.id DESC LIMIT 20 OFFSET ${(query.page - 1) * 20}`);
      return { page: query.page, pageSize: 20, total: Number(count!.total),
        checkouts: rows.map(row => ({ id: row.id, acceptedAt: row.acceptedAt.toISOString(), actorName: row.actorName,
          totalUnits: row.unitCount, outstandingReasonCount: Number(row.missing) })) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async preview(user: User, input: unknown): Promise<{ units: CheckoutCandidate[] }> {
    await this.allow(user);
    const parsed = checkoutSelectionSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Select distinct saved unit identities, at most 500.');
    const rows = await this.selection(this.db, parsed.data.unitIds);
    if (rows.length !== parsed.data.unitIds.length) throw new NotFoundException('One or more units are not available in this shop.');
    const byId = new Map(rows.map(row => [row.unitId, row]));
    const dataAsOf = new Date().toISOString();
    return { units: parsed.data.unitIds.map(id => { const row = byId.get(id)!; return { ...this.identity(row), eligible: row.state === 'U', dataAsOf }; }) };
  }

  async create(user: User, keyInput: unknown, input: unknown): Promise<CheckoutView> {
    await this.allow(user);
    if (this.mode !== 'SHOP') throw new ForbiddenException('Stock writes belong to the shop.');
    const parsed = checkoutSchema.safeParse(input), key = idempotencyKeySchema.safeParse(keyInput);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => issue.message).join('. '));
    if (!key.success) throw new BadRequestException('A valid idempotency key is required.');
    const body = parsed.data, requestHash = digest(canonical(body));
    for (let attempt = 0; ; attempt++) try {
      return await this.db.$transaction(async tx => {
        const [origin] = await tx.$queryRaw<{ mode: string }[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;
        if (origin?.mode !== 'SHOP') throw new ForbiddenException();
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;
        const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        requireCapability(actor, 'CHECKOUT');
        if (actor.authVersion !== user.authVersion || !await tx.shopMembership.findUnique({ where: { userId_originId: { userId: actor.id, originId: this.originId } } }))
          throw new ForbiddenException('Session or shop access changed.');
        const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: actor.id, commandType, key: key.data } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new ConflictException('Idempotency key reused with different checkout details.');
          return prior.response as unknown as CheckoutView;
        }
        const ids = body.lines.map(line => line.unitId).sort();
        await tx.$queryRaw(Prisma.sql`SELECT u.id FROM "StockUnit" u WHERE u."originId"=${this.originId}::uuid
          AND u.id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))}) ORDER BY u.id FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT s."unitId" FROM "UnitState" s WHERE s."originId"=${this.originId}::uuid
          AND s."unitId" IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))}) ORDER BY s."unitId" FOR UPDATE`);
        const rows = await this.selection(tx, ids);
        if (rows.length !== ids.length) throw new NotFoundException('One or more units are not available in this shop.');
        if (rows.some(row => row.state !== 'U')) throw new ConflictException('One or more selected units are no longer usable. No units were checked out.');
        const byId = new Map(rows.map(row => [row.unitId, row]));
        const quantities = new Map<string, number>();
        for (const row of rows) quantities.set(row.lotId, (quantities.get(row.lotId) ?? 0) + 1);
        const lots = [...quantities.keys()].sort();
        await tx.$queryRaw(Prisma.sql`SELECT "lotId",state FROM "StockBalance" WHERE "lotId" IN
          (${Prisma.join(lots.map(id => Prisma.sql`${id}::uuid`))}) ORDER BY "lotId",state FOR UPDATE`);
        const now = new Date(), id = randomUUID(), commandId = randomUUID(), transactionId = randomUUID();
        const originState = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
        const common = { originId: this.originId, actorId: actor.id, actorRole: actor.role, commandId };
        await tx.stockTransaction.create({ data: { id: transactionId, ...common, batchId: null, type: 'ISSUE', originSequence: originState.nextSequence, recordedAt: now } });
        await tx.checkout.create({ data: { id, ...common, transactionId, acceptedAt: now, reasonCode: body.reason?.code ?? null,
          reasonNote: body.reason?.note ?? '', orderReference: body.orderReference, unitCount: rows.length } });
        const lines = resolveCheckoutLines(body).map(line => ({ ...line, id: randomUUID(), eventId: randomUUID(), movementId: randomUUID(),
          exceptionId: line.reason === null ? randomUUID() : null, unit: this.identity(byId.get(line.unitId)!) }));
        await tx.checkoutLine.createMany({ data: lines.map(line => ({ id: line.id, checkoutId: id, originId: this.originId, ordinal: line.ordinal,
          unitId: line.unitId, lotId: line.unit.lotId, skuId: line.unit.skuId, batchId: line.unit.batchId, eventId: line.eventId, movementId: line.movementId,
          reasonCode: line.reason?.code ?? null, reasonNote: line.reason?.note ?? '', orderReference: line.orderReference,
          reasonInherited: line.reasonInherited, orderInherited: line.orderInherited, snapshot: json(line.unit) })) });
        await tx.stockMovement.createMany({ data: lines.map(line => ({ id: line.movementId, transactionId, batchId: line.unit.batchId,
          lotId: line.unit.lotId, receiptLineId: null, checkoutLineId: line.id, fromState: 'U', toState: 'P', quantity: 1n })) });
        await tx.unitEvent.createMany({ data: lines.map(line => ({ id: line.eventId, unitId: line.unitId, lotId: line.unit.lotId,
          ...common, ordinal: Number(byId.get(line.unitId)!.version) + 1, kind: 'ISSUED', fromState: 'U', toState: 'P',
          previousEventId: byId.get(line.unitId)!.lastEventId, checkoutLineId: line.id, movementId: line.movementId, recordedAt: now,
          details: { checkoutId: id, checkoutLineId: line.id } })) });
        const updates = JSON.stringify(lines.map(line => ({ unitId: line.unitId, eventId: line.eventId })));
        const changed = await tx.$executeRaw`UPDATE "UnitState" s SET state='P',custody='ISSUED_TO_STAFF',"holderId"=${actor.id}::uuid,
          version=s.version+1,"lastEventId"=x."eventId" FROM jsonb_to_recordset(${updates}::jsonb) AS x("unitId" uuid,"eventId" uuid)
          WHERE s."unitId"=x."unitId" AND s."originId"=${this.originId}::uuid AND s.state='U'`;
        if (changed !== rows.length) throw new ConflictException('Unit availability changed; no checkout accepted.');
        const counts = JSON.stringify(lots.map(lotId => ({ lotId, quantity: quantities.get(lotId)! })));
        const balances = await tx.$queryRaw<{ lotId: string; usable: bigint }[]>`UPDATE "StockBalance" s
          SET quantity=s.quantity-x.quantity,version=s.version+1,"lastTransactionId"=${transactionId}::uuid
          FROM jsonb_to_recordset(${counts}::jsonb) AS x("lotId" uuid,quantity bigint)
          WHERE s."lotId"=x."lotId" AND s.state='U' AND s.quantity>=x.quantity RETURNING s."lotId",s.quantity AS usable`;
        if (balances.length !== lots.length) throw new ConflictException('Recorded stock is inconsistent; no checkout accepted.');
        await tx.$executeRaw`INSERT INTO "StockBalance"("lotId",state,quantity,version,"lastTransactionId")
          SELECT "lotId",'P',quantity,1,${transactionId}::uuid FROM jsonb_to_recordset(${counts}::jsonb) AS x("lotId" uuid,quantity bigint)
          ON CONFLICT("lotId",state) DO UPDATE SET quantity="StockBalance".quantity+EXCLUDED.quantity,
          version="StockBalance".version+1,"lastTransactionId"=EXCLUDED."lastTransactionId"`;
        const missing = lines.filter(line => line.exceptionId !== null);
        if (missing.length) await tx.checkoutException.createMany({ data: missing.map(line => ({ id: line.exceptionId!, checkoutId: id,
          lineId: line.id, originId: this.originId, commandId, createdAt: now })) });
        const members = lines.map(line => ({ id: line.unitId, unitCode: line.unit.unitCode, lotId: line.unit.lotId,
          eventId: line.eventId, movementId: line.movementId, checkoutLineId: line.id, state: 'P' }));
        const canonicalPayload = canonical(members), manifestId = randomUUID(), hash = digest(canonicalPayload);
        await tx.unitCommandManifestPage.create({ data: { id: manifestId, originId: this.originId, commandId, ordinal: 0,
          members: json(members), canonicalPayload, payloadHash: hash, createdAt: now } });
        const response: CheckoutView = { id, originId: this.originId, transactionId, acceptedAt: now.toISOString(), originSequence: originState.nextSequence.toString(),
          actor: { id: actor.id, name: actor.name, role: actor.role }, defaults: { reason: body.reason, orderReference: body.orderReference },
          totalUnits: lines.length, initialMissingReasonCount: missing.length, outstandingReasonCount: missing.length,
          lines: lines.map(line => ({ id: line.id, ordinal: line.ordinal, unit: line.unit, reason: line.reason as CheckoutReason | null,
            orderReference: line.orderReference, reasonInherited: line.reasonInherited, orderInherited: line.orderInherited,
            initiallyMissingReason: line.reason === null, exceptionId: line.exceptionId, movementId: line.movementId, eventId: line.eventId })),
          balances: balances.map(row => ({ lotId: row.lotId, usable: row.usable.toString() })), unitManifest: [{ id: manifestId, ordinal: 0, hash }] };
        const evidence = { checkoutId: id, transactionId, unitCount: rows.length, missingReasons: missing.length, manifestId, manifestHash: hash };
        await tx.auditEvent.create({ data: { ...common, action: eventType, subjectId: id, snapshot: evidence } });
        await tx.outboxEvent.create({ data: { originId: this.originId, actorId: actor.id, commandId, originSequence: originState.nextSequence,
          eventType, aggregateId: id, payload: evidence, payloadHash: digest(canonical(evidence)) } });
        await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: actor.id, commandType, key: key.data,
          requestHash, response: json(response) } });
        return response;
      }, { timeout: 15000, maxWait: 10000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
}
