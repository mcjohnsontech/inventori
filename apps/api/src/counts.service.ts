import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { countSessionSchema, countAttemptSchema, countObservationSchema, countResultSchema, countResolutionSchema, countQuerySchema, idempotencyKeySchema, type CountSnapshot } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { canonical, digest } from './security.js';
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
const schemas = { CountSession: countSessionSchema, CountAttempt: countAttemptSchema, CountObservation: countObservationSchema, CountResult: countResultSchema, CountResolution: countResolutionSchema };
type Kind = keyof typeof schemas;
export class CountsService {
    constructor(readonly db: PrismaClient, readonly originId: string, readonly mode: string) { }
    private async allow(user: User, write = false) { requireCapability(user, 'OPERATIONAL_STOCK'); if (write && (user.role !== 'MANAGER' || this.mode !== 'SHOP'))
        throw new ForbiddenException('Only the shop Inventory Manager records counts.'); const [r] = await this.db.$queryRaw<{
        ready: boolean;
    }[]> `SELECT to_regclass('"CountSession"') IS NOT NULL AS ready`; if (!r?.ready)
        throw new ServiceUnavailableException('Physical counts require the separately approved database upgrade.'); }
    private async descriptions(tx:Prisma.TransactionClient,ids:string[]){
        if(!ids.length)return new Map<string,Record<string,unknown>>();
        const rows=await tx.$queryRaw<({lotId:string}&Record<string,unknown>)[]>(Prisma.sql`SELECT l.id AS "lotId",li.code AS "lotCode",sku."fullCode" AS "fullSku",p.name AS "productName",v.name AS "variantName",b."publicCode" AS "publicBatchCode" FROM "StockLot" l JOIN "SupplierVariantSku" sku ON sku.id=l."skuId" JOIN "Product" p ON p.id=sku."productId" JOIN "Variant" v ON v.id=sku."variantId" JOIN "DeliveryBatch" b ON b.id=l."batchId" LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id WHERE l."originId"=${this.originId}::uuid AND l.id IN (${Prisma.join(ids.map(id=>Prisma.sql`${id}::uuid`))})`);
        return new Map(rows.map(row=>[row.lotId,row]));
    }
    async configuration(user: User) { await this.allow(user); return { originId: this.originId, canCount: user.role === 'MANAGER' && this.mode === 'SHOP', chunkSize: 500 }; }
    async list(user: User, input: unknown) { await this.allow(user); const q = countQuerySchema.safeParse(input); if (!q.success)
        throw new BadRequestException('Invalid count filters'); const where = { originId: this.originId, ...(q.data.lotId ? { lotId: q.data.lotId } : {}) }; const [total, rows] = await this.db.$transaction([this.db.countSession.count({ where }), this.db.countSession.findMany({ where, orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }], take: 20, skip: (q.data.page - 1) * 20 })]); const metadata=await this.descriptions(this.db,rows.map(r=>r.lotId));return { total, rows:rows.map(row=>({...row,...metadata.get(row.lotId)})), page: q.data.page, pageSize: 20 }; }
    async get(user: User, input: unknown) {
        await this.allow(user);
        const parsed = idempotencyKeySchema.safeParse(input);
        if (!parsed.success)
            throw new BadRequestException('Invalid count identity');
        return this.db.$transaction(async (tx) => {
            const root = await tx.countSession.findFirst({ where: { id: parsed.data, originId: this.originId } });
            if (!root)
                throw new NotFoundException('Count not available');
            const attempts = await tx.countAttempt.findMany({ where: { sessionId: root.id }, orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }] });
            const detail = [];
            for (const a of attempts) {
                const observations = await tx.$queryRaw<{
                    id: string;
                    unitId: string;
                    unitCode: string;
                }[]> `SELECT o.id,o."unitId",u."unitCode" FROM "CountObservation" o JOIN "StockUnit" u ON u.id=o."unitId" WHERE o."attemptId"=${a.id}::uuid ORDER BY o."recordedAt",o.id`;
                const result = await tx.countResult.findUnique({ where: { attemptId: a.id } });
                detail.push({ ...a, result: result ? { ...result, observedQuantity: result.observedQuantity.toString(), unidentifiedExtras: result.unidentifiedExtras.toString(), resolution: await tx.countResolution.findUnique({ where: { resultId: result.id } }) } : null, observations });
            }
            return { ...root, ...(await this.descriptions(tx,[root.lotId])).get(root.lotId), attempts: detail };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }
    async command(user: User, kind: Kind, keyInput: unknown, input: unknown) {
        await this.allow(user, true);
        const p = schemas[kind].safeParse(input), k = idempotencyKeySchema.safeParse(keyInput);
        if (!p.success || !k.success)
            throw new BadRequestException('Check count evidence and idempotency key');
        const body = p.data, hash = digest(canonical(body)), type = 'inventory.count.' + kind.toLowerCase();
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
                    requireCapability(actor, 'OPERATIONAL_STOCK');
                    if (actor.role !== 'MANAGER' || actor.authVersion !== user.authVersion || !await tx.shopMembership.findUnique({ where: { userId_originId: { userId: actor.id, originId: this.originId } } }))
                        throw new ForbiddenException('Account or shop access changed');
                    const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: actor.id, commandType: type, key: k.data } } });
                    if (prior) {
                        if (prior.requestHash !== hash)
                            throw new ConflictException('Key reused with different count evidence');
                        return prior.response;
                    }
                    const id = randomUUID(), commandId = randomUUID(), base = { id, originId: this.originId, actorId: actor.id, commandId };
                    let response: Record<string, unknown> = { id, stockChanged: false };
                    if (kind === 'CountSession') {
                        const data = countSessionSchema.parse(body);
                        if (!await tx.stockLot.findFirst({ where: { id: data.lotId, originId: this.originId } }))
                            throw new NotFoundException('Lot unavailable');
                        await tx.countSession.create({ data: { ...base, ...data } });
                    }
                    else if (kind === 'CountAttempt') {
                        const data = countAttemptSchema.parse(body), session = await tx.countSession.findFirst({ where: { id: data.sessionId, originId: this.originId } });
                        if (!session)
                            throw new NotFoundException('Count unavailable');
                        if ((await tx.$queryRaw<{
                            id: string;
                        }[]> `SELECT a.id FROM "CountAttempt" a WHERE a."sessionId"=${session.id}::uuid AND NOT EXISTS(SELECT 1 FROM "CountResult" r WHERE r."attemptId"=a.id) LIMIT 1`).length)
                            throw new ConflictException('Finalize the open attempt before recounting');
                        const [row] = await tx.$queryRaw<{
                            snapshot: CountSnapshot;
                        }[]> `SELECT dayari_count_snapshot(${session.lotId}::uuid,${session.state}) snapshot`;
                        await tx.countAttempt.create({ data: { ...base, sessionId: session.id, snapshot: json(row!.snapshot) } });
                        response.snapshot = row!.snapshot;
                    }
                    else if (kind === 'CountResolution') {
                        const data = countResolutionSchema.parse(body), r = await tx.countResult.findFirst({ where: { id: data.resultId, originId: this.originId } }), m = await tx.countResult.findFirst({ where: { id: data.matchingResultId, originId: this.originId } });
                        if (!r || !m)
                            throw new NotFoundException('Count evidence unavailable');
                        const a = await tx.countAttempt.findUniqueOrThrow({ where: { id: r.attemptId } }), b = await tx.countAttempt.findUniqueOrThrow({ where: { id: m.attemptId } }), scope = await tx.countSession.findUniqueOrThrow({ where: { id: a.sessionId } });
                        const [snap] = await tx.$queryRaw<{
                            snapshot: CountSnapshot;
                        }[]> `SELECT dayari_count_snapshot(${scope.lotId}::uuid,${scope.state}) snapshot`;
                        if (r.status !== 'MISMATCH' || m.status !== 'MATCHED' || a.sessionId !== b.sessionId || m.recordedAt <= r.recordedAt || (b.snapshot as unknown as CountSnapshot).fingerprint !== snap!.snapshot.fingerprint || await tx.countResolution.findUnique({ where: { resultId: r.id } }))
                            throw new ConflictException('A later matching same-scope recount and explanation are required');
                        await tx.countResolution.create({ data: { ...base, ...data } });
                    }
                    else {
                        const attemptId = ('attemptId' in body ? body.attemptId : '') as string, a = await tx.countAttempt.findFirst({ where: { id: attemptId, originId: this.originId } });
                        if (!a)
                            throw new NotFoundException('Attempt unavailable');
                        if (await tx.countResult.findUnique({ where: { attemptId } }))
                            throw new ConflictException('Attempt is finalized; start an explicit recount');
                        const session = await tx.countSession.findUniqueOrThrow({ where: { id: a.sessionId } }), snapshot = a.snapshot as unknown as CountSnapshot;
                        if (kind === 'CountObservation') {
                            const data = countObservationSchema.parse(body);
                            if (snapshot.mode !== 'NATIVE')
                                throw new BadRequestException('Legacy counts record quantities without invented units');
                            const units = await tx.stockUnit.findMany({ where: { id: { in: data.unitIds }, lotId: session.lotId, originId: this.originId } });
                            if (units.length !== data.unitIds.length)
                                throw new NotFoundException('Select saved units from this exact lot');
                            if (await tx.countObservation.count({ where: { attemptId, unitId: { in: data.unitIds } } }))
                                throw new ConflictException('A unit was already observed in this attempt');
                            const observationIds = data.unitIds.map(() => randomUUID());
                            await tx.countObservation.createMany({ data: data.unitIds.map((unitId, i) => ({ ...base, id: observationIds[i]!, attemptId, unitId })) });
                            response = { ...response, id: observationIds[0], observationIds };
                        }
                        else {
                            const data = countResultSchema.parse(body), observed = BigInt(data.observedQuantity), extras = BigInt(data.unidentifiedExtras), n = await tx.countObservation.count({ where: { attemptId } });
                            if (snapshot.mode === 'NATIVE' ? observed !== BigInt(n) + extras : extras !== 0n)
                                throw new BadRequestException('Observed quantity must equal distinct observed units plus unidentified extras for native lots; legacy uses quantity only');
                            const [result] = await tx.$queryRaw<{
                                status: string;
                            }[]> `SELECT dayari_count_status(${attemptId}::uuid,${observed}::bigint,${extras}::bigint) status`;
                            await tx.countResult.create({ data: { ...base, ...data, observedQuantity: observed, unidentifiedExtras: extras, status: result!.status } });
                            response.status = result!.status;
                        }
                    }
                    const node = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
                    response.originSequence = node.nextSequence.toString();
                    const payload = { ...response, kind, stockChanged: false };
                    await tx.auditEvent.create({ data: { originId: this.originId, actorId: actor.id, actorRole: actor.role, commandId, action: type, subjectId: String(response.id), snapshot: json(payload) } });
                    await tx.outboxEvent.create({ data: { originId: this.originId, actorId: actor.id, commandId, originSequence: node.nextSequence, eventType: type, aggregateId: String(response.id), payload: json(payload), payloadHash: digest(canonical(payload)) } });
                    await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: actor.id, commandType: type, key: k.data, requestHash: hash, response: json(response) } });
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
