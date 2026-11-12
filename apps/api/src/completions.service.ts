import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { completionSchema, completionQuerySchema, completionOptionsQuerySchema, idempotencyKeySchema, type CompletionView, type CompletionCandidate } from '@dayari/contracts';
import { DamageService, type DamageSelection } from './damage.service.js';
import { requireCapability } from './permissions.js';
import { canonical, digest } from './security.js';
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export class CompletionsService {
    readonly damage: DamageService;
    constructor(readonly db: PrismaClient, readonly originId: string, readonly mode: string) { this.damage = new DamageService(db, originId, mode); }
    private async allow(user: User) { requireCapability(user, 'OPERATIONAL_STOCK'); const [row] = await this.db.$queryRaw<{
        ready: boolean;
    }[]> `SELECT to_regclass('"ProductionCompletion"') IS NOT NULL AS ready`; if (!row?.ready)
        throw new ServiceUnavailableException('Completion requires the separately approved shop database upgrade.'); }
    private async adminReady() {
        const [row]=await this.db.$queryRaw<{ready:boolean}[]>`SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"ProductionCompletion"'::regclass AND conname='ProductionCompletion_actorRole_check' AND pg_get_constraintdef(oid) LIKE '%ADMIN%') AS ready`;
        return Boolean(row?.ready);
    }
    async configuration(user: User) { await this.allow(user); const adminUpgradeRequired=user.role==='ADMIN'&&!await this.adminReady(); return { originId:this.originId,limit:500,canConfirm:['ADMIN','MANAGER'].includes(user.role)&&!adminUpgradeRequired&&this.mode==='SHOP',adminUpgradeRequired }; }
    async sessions(user:User,input:unknown) {
        await this.allow(user); const parsed=completionQuerySchema.safeParse(input);if(!parsed.success)throw new BadRequestException('Invalid session filters.');
        const {page,query:text}=parsed.data;
        return this.db.$transaction(async tx=>{
            const from=Prisma.sql`FROM "Checkout" c JOIN "User" employee ON employee.id=c."actorId" JOIN "CheckoutLine" x ON x."checkoutId"=c.id JOIN "StockUnit" u ON u.id=x."unitId" JOIN "UnitState" s ON s."unitId"=u.id JOIN "SupplierVariantSku" sku ON sku.id=x."skuId" JOIN "Product" p ON p.id=sku."productId" JOIN "Variant" v ON v.id=sku."variantId" WHERE c."originId"=${this.originId}::uuid AND s."originId"=${this.originId}::uuid AND s.state='P' AND s."lastEventId"=x."eventId" AND (${text}='' OR position(lower(${text}) in lower(concat_ws(' ',c.id::text,employee.name,x."orderReference",u."unitCode",p.name,v.name,sku."fullCode")))>0)`;
            const [count]=await tx.$queryRaw<{n:bigint}[]>(Prisma.sql`SELECT count(DISTINCT c.id) n ${from}`);
            const rows=await tx.$queryRaw<{id:string;acceptedAt:Date;employeeName:string;remaining:bigint;orderReferences:string[]}[]>(Prisma.sql`SELECT c.id,c."acceptedAt",employee.name AS "employeeName",count(*) AS remaining,COALESCE(array_agg(DISTINCT x."orderReference") FILTER(WHERE x."orderReference" IS NOT NULL),ARRAY[]::text[]) AS "orderReferences" ${from} GROUP BY c.id,employee.name ORDER BY c."acceptedAt" DESC,c.id DESC LIMIT 20 OFFSET ${(page-1)*20}`);
            return {page,pageSize:20,total:Number(count!.n),rows:rows.map(row=>({...row,acceptedAt:row.acceptedAt.toISOString(),remaining:Number(row.remaining)}))};
        },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    }
    private candidate(row: DamageSelection): CompletionCandidate { return { unit: this.damage.identity(row), state: row.state as CompletionCandidate['state'], checkoutId: row.checkoutId, checkoutLineId: row.checkoutLineId, orderReference: row.orderReference, holder: row.holderId ? { id: row.holderId, name: row.holderName! } : null, receiptId: row.receiptId, damageLineId: row.damageLineId, eligible: row.state === 'P' && !!row.checkoutLineId }; }
    private async resolve(tx: Prisma.TransactionClient, user: User, ids: string[]) { const rows = await this.damage.selection(tx, user, ids); if (rows.length !== ids.length)
        throw new NotFoundException('One or more units are not available in this shop.'); if (rows.some(row => row.state !== 'P' || !row.checkoutLineId || !row.holderId))
        throw new ConflictException('Select only currently In Production units. Nothing completed.'); return rows; }
    async preview(user: User, input: unknown) { await this.allow(user); const parsed = completionSchema.safeParse(input); if (!parsed.success)
        throw new BadRequestException('Select distinct exact issued units, at most 500.'); return this.db.$transaction(async (tx) => ({ units: (await this.resolve(tx, user, parsed.data.unitIds)).map(row => this.candidate(row)) })); }
    async options(user: User, input: unknown) {
        await this.allow(user);
        const query = completionOptionsQuerySchema.safeParse(input);
        if (!query.success)
            throw new BadRequestException('Invalid work filters.');
        const { page, query: text,checkoutId } = query.data;
        return this.db.$transaction(async (tx) => {
            const filter = Prisma.sql `u."originId"=${this.originId}::uuid AND s.state='P' AND ${checkoutId?Prisma.sql`x."checkoutId"=${checkoutId}::uuid`:Prisma.sql`TRUE`} AND (${text}='' OR position(lower(${text}) in lower(concat_ws(' ',u."unitCode",p.name,v.name,sku."fullCode",x."orderReference")))>0)`;
            const from = Prisma.sql `FROM "StockUnit" u JOIN "UnitState" s ON s."unitId"=u.id JOIN "StockLot" l ON l.id=u."lotId" JOIN "SupplierVariantSku" sku ON sku.id=l."skuId" JOIN "Product" p ON p.id=sku."productId" JOIN "Variant" v ON v.id=sku."variantId" JOIN "CheckoutLine" x ON x."eventId"=s."lastEventId" WHERE ${filter}`;
            const [count] = await tx.$queryRaw<{
                n: bigint;
            }[]>(Prisma.sql `SELECT count(*) n ${from}`);
            const selected = await tx.$queryRaw<{
                id: string;
            }[]>(Prisma.sql `SELECT u.id ${from} ORDER BY u."unitCode",u.id LIMIT 20 OFFSET ${(page - 1) * 20}`);
            return { page, pageSize: 20, total: Number(count!.n), units: selected.length ? (await this.damage.selection(tx, user, selected.map(row => row.id))).map(row => this.candidate(row)) : [] };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }
    async get(user: User, input: unknown): Promise<CompletionView> { await this.allow(user); const id = idempotencyKeySchema.safeParse(input); if (!id.success)
        throw new BadRequestException('Invalid completion identity.'); const root = await this.db.productionCompletion.findFirst({ where: { id: id.data, originId: this.originId } }); if (!root)
        throw new NotFoundException('Completion not available.'); return (await this.db.commandResult.findUniqueOrThrow({ where: { id: root.commandId } })).response as unknown as CompletionView; }
    async list(user: User, input: unknown) {
        await this.allow(user);
        const query = completionQuerySchema.safeParse(input);
        if (!query.success)
            throw new BadRequestException('Invalid completion history filters.');
        const { page, query: text } = query.data;
        return this.db.$transaction(async (tx) => {
            const filter = Prisma.sql `c."originId"=${this.originId}::uuid AND (${text}='' OR EXISTS(SELECT 1 FROM "ProductionCompletionLine" x JOIN "StockUnit" u ON u.id=x."unitId" JOIN "CheckoutLine" cl ON cl.id=x."checkoutLineId" WHERE x."completionId"=c.id AND position(lower(${text}) in lower(concat_ws(' ',u."unitCode",cl."orderReference")))>0))`;
            const [count] = await tx.$queryRaw<{
                n: bigint;
            }[]>(Prisma.sql `SELECT count(*) n FROM "ProductionCompletion" c WHERE ${filter}`);
            const rows = await tx.$queryRaw(Prisma.sql `SELECT c.id,c."recordedAt",c."unitCount",u.name AS "managerName" FROM "ProductionCompletion" c JOIN "User" u ON u.id=c."actorId" WHERE ${filter} ORDER BY c."recordedAt" DESC,c.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`);
            return { page, pageSize: 20, total: Number(count!.n), rows };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }
    async create(user: User, keyInput: unknown, input: unknown): Promise<CompletionView> {
        await this.allow(user);
        requireCapability(user, 'COMPLETE_PRODUCTION');
        if(user.role==='ADMIN'&&!await this.adminReady())throw new ServiceUnavailableException('Admin completion requires the separately approved shop database upgrade.');
        if (this.mode !== 'SHOP')
            throw new ForbiddenException('Confirm at the shop.');
        const parsed = completionSchema.safeParse(input), key = idempotencyKeySchema.safeParse(keyInput);
        if (!parsed.success || !key.success)
            throw new BadRequestException('Select distinct units and supply an idempotency key.');
        const body = parsed.data, requestHash = digest(canonical(body)), commandType = 'production.complete', eventType = 'production.completed';
        for (let attempt = 0;; attempt++)
            try {
                return await this.db.$transaction(async (tx) => {
                    const [origin] = await tx.$queryRaw<{
                        mode: string;
                    }[]> `SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;
                    if (origin?.mode !== 'SHOP')
                        throw new ForbiddenException();
                    await tx.$queryRaw `SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;
                    const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
                    requireCapability(actor, 'COMPLETE_PRODUCTION');
                    if (actor.authVersion !== user.authVersion || !await tx.shopMembership.findUnique({ where: { userId_originId: { userId: actor.id, originId: this.originId } } }))
                        throw new ForbiddenException('Session or shop access changed.');
                    const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: actor.id, commandType, key: key.data } } });
                    if (prior) {
                        if (prior.requestHash !== requestHash)
                            throw new ConflictException('Key reused with different units.');
                        return prior.response as unknown as CompletionView;
                    }
                    const ids = Prisma.join(body.unitIds.map(id => Prisma.sql `${id}::uuid`));
                    await tx.$queryRaw(Prisma.sql `SELECT id FROM "StockUnit" WHERE "originId"=${this.originId}::uuid AND id IN (${ids}) ORDER BY id FOR UPDATE`);
                    await tx.$queryRaw(Prisma.sql `SELECT "unitId" FROM "UnitState" WHERE "originId"=${this.originId}::uuid AND "unitId" IN (${ids}) ORDER BY "unitId" FOR UPDATE`);
                    const rows = await this.resolve(tx, actor, body.unitIds), lots = [...new Set(rows.map(row => row.lotId))].sort();
                    await tx.$queryRaw(Prisma.sql `SELECT "lotId",state FROM "StockBalance" WHERE "lotId" IN (${Prisma.join(lots.map(id => Prisma.sql `${id}::uuid`))}) ORDER BY "lotId",state FOR UPDATE`);
                    const now = new Date(), id = randomUUID(), commandId = randomUUID(), transactionId = randomUUID(), common = { originId: this.originId, actorId: actor.id, actorRole: actor.role, commandId };
                    const node = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
                    const lines = rows.map(row => ({ id: randomUUID(), unit: this.damage.identity(row), checkoutId: row.checkoutId!, checkoutLineId: row.checkoutLineId!, orderReference: row.orderReference, recordedHolder: { id: row.holderId!, name: row.holderName! }, previousEventId: row.lastEventId, movementId: randomUUID(), eventId: randomUUID() }));
                    const manifest = lines.map(line => ({ id: line.id, unitId: line.unit.unitId })), canonicalManifest = canonical(manifest), manifestHash = digest(canonicalManifest);
                    await tx.stockTransaction.create({ data: { id: transactionId, ...common, type: 'COMPLETE', batchId: null, recordedAt: now, originSequence: node.nextSequence } });
                    await tx.productionCompletion.create({ data: { id, ...common, transactionId, recordedAt: now, unitCount: lines.length, manifest, canonicalManifest, manifestHash } });
                    await tx.productionCompletionLine.createMany({ data: lines.map(line => ({ id: line.id, completionId: id, originId: this.originId, unitId: line.unit.unitId, lotId: line.unit.lotId, batchId: line.unit.batchId, checkoutLineId: line.checkoutLineId, previousEventId: line.previousEventId, movementId: line.movementId, eventId: line.eventId, snapshot: json(line) })) });
                    await tx.stockMovement.createMany({ data: lines.map(line => ({ id: line.movementId, transactionId, lotId: line.unit.lotId, batchId: line.unit.batchId, completionLineId: line.id, fromState: 'P', toState: 'C', quantity: 1n })) });
                    await tx.unitEvent.createMany({ data: lines.map((line, index) => ({ id: line.eventId, ...common, unitId: line.unit.unitId, lotId: line.unit.lotId, ordinal: Number(rows[index]!.version) + 1, kind: 'COMPLETED', fromState: 'P', toState: 'C', previousEventId: line.previousEventId, completionLineId: line.id, movementId: line.movementId, recordedAt: now, details: { completionId: id, checkoutId: line.checkoutId } })) });
                    const updates = JSON.stringify(lines.map(line => ({ unitId: line.unit.unitId, eventId: line.eventId })));
                    const changed = await tx.$executeRaw `UPDATE "UnitState" s SET state='C',condition='USABLE',custody='COMPLETED',"holderId"=NULL,version=s.version+1,"lastEventId"=x."eventId" FROM jsonb_to_recordset(${updates}::jsonb) AS x("unitId" uuid,"eventId" uuid) WHERE s."unitId"=x."unitId" AND s."originId"=${this.originId}::uuid AND s.state='P'`;
                    if (changed !== lines.length)
                        throw new ConflictException('Unit state changed. Nothing completed.');
                    for (const lotId of lots) {
                        const n = BigInt(rows.filter(row => row.lotId === lotId).length);
                        const changed = await tx.$executeRaw `UPDATE "StockBalance" SET quantity=quantity-${n},version=version+1,"lastTransactionId"=${transactionId}::uuid WHERE "lotId"=${lotId}::uuid AND state='P' AND quantity>=${n}`;
                        if (changed !== 1)
                            throw new ConflictException('In Production balance is inconsistent.');
                        await tx.$executeRaw `INSERT INTO "StockBalance"("lotId",state,quantity,version,"lastTransactionId") VALUES(${lotId}::uuid,'C',${n},1,${transactionId}::uuid) ON CONFLICT("lotId",state) DO UPDATE SET quantity="StockBalance".quantity+EXCLUDED.quantity,version="StockBalance".version+1,"lastTransactionId"=EXCLUDED."lastTransactionId"`;
                    }
                    const response: CompletionView = { id, originId: this.originId, recordedAt: now.toISOString(), originSequence: node.nextSequence.toString(), transactionId, manager: { id: actor.id, name: actor.name }, manifestHash, lines: lines.map(({ previousEventId, ...line }) => line) };
                    const evidence = { completionId: id, transactionId, manifestHash, unitCount: lines.length };
                    await tx.auditEvent.create({ data: { ...common, action: eventType, subjectId: id, snapshot: evidence } });
                    await tx.outboxEvent.create({ data: { originId: this.originId, actorId: actor.id, commandId, originSequence: node.nextSequence, eventType, aggregateId: id, payload: evidence, payloadHash: digest(canonical(evidence)) } });
                    await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: actor.id, commandType, key: key.data, requestHash, response: json(response) } });
                    return response;
                }, { timeout: 15000, maxWait: 10000 });
            }
            catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2)
                    continue;
                throw error;
            }
    }
}
