import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { reportQuerySchema, orderInvestigationSchema, type ReportQuery, type ReportFreshness, type MovementReport, type MovementReportRow, type PeriodReport, type ReportBalance, type OrderInvestigation } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
export class ReportsService {
    constructor(readonly db: PrismaClient, readonly originId: string) { }
    private async allow(user: User) { requireCapability(user, 'OPERATIONAL_STOCK'); const [schema] = await this.db.$queryRaw<{
        ready: boolean;
    }[]> `SELECT to_regclass('"ProductionCompletion"') IS NOT NULL AND to_regclass('"AuthorizationRequest"') IS NOT NULL AS ready`; if (!schema?.ready)
        throw new ServiceUnavailableException('Detailed reporting requires the separately approved shop database upgrade. Existing stock, receipt and print reports remain available.'); }
    private query(input: unknown) { const parsed = reportQuerySchema.safeParse(input); if (!parsed.success)
        throw new BadRequestException(parsed.error.issues.map(issue => issue.message).join('. ')); return parsed.data; }
    private scope(q: ReportQuery) { return Prisma.sql `l."originId"=${this.originId}::uuid ${q.productId ? Prisma.sql `AND s."productId"=${q.productId}::uuid` : Prisma.empty} ${q.sourceId ? Prisma.sql `AND l."sourceId"=${q.sourceId}::uuid` : Prisma.empty} ${q.skuId ? Prisma.sql `AND s.id=${q.skuId}::uuid` : Prisma.empty}`; }
    private period(q: ReportQuery) { return Prisma.sql `t."originId"=${this.originId}::uuid AND t."recordedAt">=(${q.from}::date::timestamp AT TIME ZONE 'Africa/Lagos') AND t."recordedAt"<((${q.to}::date+1)::timestamp AT TIME ZONE 'Africa/Lagos')`; }
    private async freshness(tx: Prisma.TransactionClient): Promise<ReportFreshness> { const [row] = await tx.$queryRaw<{
        asOf: Date;
        originSequence: bigint;
    }[]> `SELECT statement_timestamp() AS "asOf","nextSequence" AS "originSequence" FROM "OriginNode" WHERE id=${this.originId}::uuid`; return { asOf: row!.asOf.toISOString(), originSequence: row!.originSequence.toString(), timezone: 'Africa/Lagos', certifiedClosing: false }; }
    async configuration(user: User) { await this.allow(user); const [date] = await this.db.$queryRaw<{
        today: string;
        from: string;
    }[]> `SELECT (current_timestamp AT TIME ZONE 'Africa/Lagos')::date::text AS today,((current_timestamp AT TIME ZONE 'Africa/Lagos')::date-29)::text AS "from"`; return { originId: this.originId, ...date, maximumBusinessDates: 366, certifiedClosingAvailable: false, recoveryExecutionEnabled: false }; }
    async movements(user: User, input: unknown): Promise<MovementReport> {
        await this.allow(user);
        const q = this.query(input);
        return this.db.$transaction(async (tx) => {
            const fresh = await this.freshness(tx);
            const where = Prisma.sql `${this.scope(q)} AND ${this.period(q)} ${q.type ? Prisma.sql `AND t.type=${q.type}` : Prisma.empty}`;
            const base = Prisma.sql `FROM "StockMovement" m JOIN "StockTransaction" t ON t.id=m."transactionId" JOIN "StockLot" l ON l.id=m."lotId" JOIN "SupplierVariantSku" s ON s.id=l."skuId" WHERE ${where}`;
            const [count] = await tx.$queryRaw<{
                n: bigint;
            }[]>(Prisma.sql `SELECT count(*) n ${base}`);
            const rows = await tx.$queryRaw<(Omit<MovementReportRow, 'recordedAt'> & {
                recordedAt: Date;
            })[]>(Prisma.sql `
 WITH selected AS(SELECT m.id ${base} ORDER BY t."originSequence" DESC,m.id DESC LIMIT 20 OFFSET ${(q.page - 1) * 20})
 SELECT m.id,t.id AS "transactionId",t.type,t."recordedAt",t."originSequence"::text AS "originSequence",actor.name AS "actorName",m."fromState",m."toState",m.quantity::text AS quantity,
 l.id AS "lotId",li.code AS "lotCode",b.id AS "batchId",b."publicCode" AS "publicBatchCode",s.id AS "skuId",s."fullCode" AS "fullSku",p.id AS "productId",pi.code AS "productCode",p.name AS "productName",v.name AS "variantName",supplier.name AS "supplierName",src.name AS "sourceName",rl."receiptId",cl."checkoutId",COALESCE(bad."reportId",review.id) AS "damageId",completion."completionId",identified."unitId",identified."unitCode",cl."orderReference"
 FROM selected chosen JOIN "StockMovement" m ON m.id=chosen.id JOIN "StockTransaction" t ON t.id=m."transactionId" JOIN "User" actor ON actor.id=t."actorId"
 JOIN "StockLot" l ON l.id=m."lotId" JOIN "DeliveryBatch" b ON b.id=l."batchId" JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "Product" p ON p.id=s."productId" JOIN "Variant" v ON v.id=s."variantId"
 JOIN "SupplierSource" src ON src.id=l."sourceId" JOIN "Supplier" supplier ON supplier.id=src."supplierId" JOIN "ReceiptLine" rl ON rl."lotId"=l.id
 LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id LEFT JOIN "ProductPublicIdentity" pi ON pi."productId"=p.id
 LEFT JOIN "ProductionCompletionLine" completion ON completion.id=m."completionLineId" LEFT JOIN "DamageReviewLine" reviewed ON reviewed.id=m."damageReviewLineId"
 LEFT JOIN "DamageReview" review ON review.id=reviewed."reviewId" LEFT JOIN "DamageLine" bad ON bad.id=COALESCE(m."damageLineId",reviewed."damageLineId")
 LEFT JOIN "CheckoutLine" cl ON cl.id=COALESCE(m."checkoutLineId",completion."checkoutLineId",bad."checkoutLineId")
 LEFT JOIN LATERAL(SELECT CASE WHEN count(*)=1 THEN min(e."unitId"::text)::uuid END AS "unitId",CASE WHEN count(*)=1 THEN min(u."unitCode") END AS "unitCode" FROM "UnitEvent" e JOIN "StockUnit" u ON u.id=e."unitId" WHERE e."movementId"=m.id) identified ON true
 ORDER BY t."originSequence" DESC,m.id DESC`);
            return { ...fresh, page: q.page, pageSize: 20, total: Number(count!.n), rows: rows.map(row => ({ ...row, recordedAt: row.recordedAt.toISOString() })) };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }
    async summary(user: User, input: unknown): Promise<PeriodReport> {
        await this.allow(user);
        const q = this.query(input);
        if (q.type)
            throw new BadRequestException('Movement type filters apply to movement history, not ledger balances.');
        return this.db.$transaction(async (tx) => {
            const fresh = await this.freshness(tx);
            const [count] = await tx.$queryRaw<{
                n: bigint;
            }[]>(Prisma.sql `SELECT count(DISTINCT s.id) n FROM "StockLot" l JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "DeliveryBatch" b ON b.id=l."batchId" WHERE ${this.scope(q)} AND b."acceptedAt"<((${q.to}::date+1)::timestamp AT TIME ZONE 'Africa/Lagos')`);
            const balances = await tx.$queryRaw<Omit<ReportBalance,'flows'>[]>(Prisma.sql `WITH scoped AS(SELECT l.id AS "lotId",s.id AS "skuId",s."fullCode" AS "fullSku",p.id AS "productId",p.name AS "productName",v.name AS "variantName" FROM "StockLot" l JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "Product" p ON p.id=s."productId" JOIN "Variant" v ON v.id=s."variantId" JOIN "DeliveryBatch" b ON b.id=l."batchId" WHERE ${this.scope(q)} AND b."acceptedAt"<((${q.to}::date+1)::timestamp AT TIME ZONE 'Africa/Lagos')),
 page AS(SELECT DISTINCT "skuId","fullSku","productId","productName","variantName" FROM scoped ORDER BY "fullSku","skuId" LIMIT 20 OFFSET ${(q.page - 1) * 20}),
 quantities AS(SELECT page."skuId",states.state,COALESCE(sum(CASE WHEN m."toState"=states.state THEN m.quantity WHEN m."fromState"=states.state THEN -m.quantity ELSE 0 END) FILTER(WHERE t."recordedAt"<(${q.from}::date::timestamp AT TIME ZONE 'Africa/Lagos')),0)::text AS opening,
 COALESCE(sum(CASE WHEN m."toState"=states.state THEN m.quantity WHEN m."fromState"=states.state THEN -m.quantity ELSE 0 END) FILTER(WHERE t."recordedAt"<((${q.to}::date+1)::timestamp AT TIME ZONE 'Africa/Lagos')),0)::text AS ending
 FROM page CROSS JOIN(VALUES('U'),('P'),('D'),('C'),('X')) states(state) JOIN scoped scope ON scope."skuId"=page."skuId" LEFT JOIN "StockMovement" m ON m."lotId"=scope."lotId" LEFT JOIN "StockTransaction" t ON t.id=m."transactionId" GROUP BY page."skuId",states.state)
 SELECT page.*,jsonb_object_agg(q.state,jsonb_build_object('opening',q.opening,'ending',q.ending)) AS states FROM page JOIN quantities q ON q."skuId"=page."skuId" GROUP BY page."skuId",page."fullSku",page."productId",page."productName",page."variantName" ORDER BY page."fullSku",page."skuId"`);
            const flows=balances.length?await tx.$queryRaw<{skuId:string;flows:ReportBalance['flows']}[]>(Prisma.sql`SELECT s.id AS "skuId",jsonb_build_object(
              'receivedUsable',COALESCE(sum(m.quantity) FILTER(WHERE t.type='RECEIPT' AND m."toState"='U'),0)::text,
              'receivedDamaged',COALESCE(sum(m.quantity) FILTER(WHERE t.type='RECEIPT' AND m."toState"='D'),0)::text,
              'issued',COALESCE(sum(m.quantity) FILTER(WHERE t.type='ISSUE'),0)::text,
              'reportedBad',COALESCE(sum(m.quantity) FILTER(WHERE t.type='DAMAGE'),0)::text,
              'completed',COALESCE(sum(m.quantity) FILTER(WHERE t.type='COMPLETE'),0)::text,
              'removed',COALESCE(sum(m.quantity) FILTER(WHERE t.type='DISPOSITION'),0)::text) AS flows
              FROM "StockMovement" m JOIN "StockTransaction" t ON t.id=m."transactionId" JOIN "StockLot" l ON l.id=m."lotId" JOIN "SupplierVariantSku" s ON s.id=l."skuId"
              WHERE ${this.scope(q)} AND ${this.period(q)} AND s.id IN (${Prisma.join(balances.map(row=>Prisma.sql`${row.skuId}::uuid`))}) GROUP BY s.id`):[];
            const flowMap=new Map(flows.map(row=>[row.skuId,row.flows]));
            const completeBalances=balances.map(row=>({...row,flows:flowMap.get(row.skuId)??{receivedUsable:'0',receivedDamaged:'0',issued:'0',reportedBad:'0',completed:'0',removed:'0'}}));
            const days = await tx.$queryRaw<PeriodReport['days']>(Prisma.sql `SELECT (t."recordedAt" AT TIME ZONE 'Africa/Lagos')::date::text AS day,count(DISTINCT t.id) FILTER(WHERE t.type='RECEIPT')::text AS receipts,count(DISTINCT t.id) FILTER(WHERE t.type='ISSUE')::text AS issues,count(DISTINCT t.id) FILTER(WHERE t.type='DAMAGE')::text AS damage,count(DISTINCT t.id) FILTER(WHERE t.type='COMPLETE')::text AS completions,count(DISTINCT t.id) FILTER(WHERE t.type='DISPOSITION')::text AS dispositions FROM "StockTransaction" t JOIN "StockMovement" m ON m."transactionId"=t.id JOIN "StockLot" l ON l.id=m."lotId" JOIN "SupplierVariantSku" s ON s.id=l."skuId" WHERE ${this.scope(q)} AND ${this.period(q)} GROUP BY (t."recordedAt" AT TIME ZONE 'Africa/Lagos')::date ORDER BY day`);
            const reasons = await tx.$queryRaw<PeriodReport['reasons']>(Prisma.sql `SELECT COALESCE(r."reasonCode",cl."reasonCode",'UNCLASSIFIED') AS code,count(*)::text AS records,count(*) FILTER(WHERE cl."reasonCode" IS NULL)::text AS "originallyMissing",count(*) FILTER(WHERE r.id IS NOT NULL)::text AS classified,count(*) FILTER(WHERE cl."reasonCode" IS NULL AND r.id IS NULL)::text AS pending FROM "CheckoutLine" cl JOIN "Checkout" c ON c.id=cl."checkoutId" JOIN "StockTransaction" t ON t.id=c."transactionId" JOIN "StockLot" l ON l.id=cl."lotId" JOIN "SupplierVariantSku" s ON s.id=l."skuId" LEFT JOIN "CheckoutReasonResolution" resolved ON resolved."checkoutLineId"=cl.id LEFT JOIN "ReasonReconciliation" r ON r.id=resolved."reconciliationId" WHERE ${this.scope(q)} AND ${this.period(q)} GROUP BY COALESCE(r."reasonCode",cl."reasonCode",'UNCLASSIFIED') ORDER BY code`);
            const requests = await tx.$queryRaw<PeriodReport['requests']>(Prisma.sql `SELECT r.kind,count(*)::text AS records FROM "AuthorizationRequest" r WHERE r."originId"=${this.originId}::uuid AND r."recordedAt">=(${q.from}::date::timestamp AT TIME ZONE 'Africa/Lagos') AND r."recordedAt"<((${q.to}::date+1)::timestamp AT TIME ZONE 'Africa/Lagos') AND (EXISTS(SELECT 1 FROM "StockLot" l JOIN "SupplierVariantSku" s ON s.id=l."skuId" WHERE l.id=r."lotId" AND ${this.scope(q)}) OR EXISTS(SELECT 1 FROM "AuthorizationRequestUnit" member JOIN "StockLot" l ON l.id=member."lotId" JOIN "SupplierVariantSku" s ON s.id=l."skuId" WHERE member."requestId"=r.id AND ${this.scope(q)})) GROUP BY r.kind ORDER BY r.kind`);
            const reviews=await tx.$queryRaw<PeriodReport['reviews']>(Prisma.sql`SELECT r.outcome,count(DISTINCT r.id)::text AS records,count(DISTINCT x."unitId")::text AS "distinctUnits" FROM "DamageReview" r JOIN "DamageReviewLine" x ON x."reviewId"=r.id JOIN "StockLot" l ON l.id=x."lotId" JOIN "SupplierVariantSku" s ON s.id=l."skuId" WHERE r."originId"=${this.originId}::uuid AND ${this.scope(q)} AND r."recordedAt">=(${q.from}::date::timestamp AT TIME ZONE 'Africa/Lagos') AND r."recordedAt"<((${q.to}::date+1)::timestamp AT TIME ZONE 'Africa/Lagos') GROUP BY r.outcome ORDER BY r.outcome`);
            return { ...fresh, page: q.page, pageSize: 20, total: Number(count!.n), balances:completeBalances, days, reasons, requests, reviews, basis: 'ACCEPTED_AT', executedRecoveryEnabled: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }
    async orders(user: User, input: unknown): Promise<OrderInvestigation> {
        await this.allow(user);
        const parsed = orderInvestigationSchema.safeParse(input);
        if (!parsed.success)
            throw new BadRequestException('Enter an exact Order ID and valid page.');
        const q = parsed.data;
        return this.db.$transaction(async (tx) => {
            const fresh = await this.freshness(tx);
            const where = Prisma.sql `cl."originId"=${this.originId}::uuid AND cl."orderReference"=${q.orderReference}`;
            const [count] = await tx.$queryRaw<{
                n: bigint;
                sessions: bigint;
            }[]>(Prisma.sql `SELECT count(*) n,count(DISTINCT cl."checkoutId") sessions FROM "CheckoutLine" cl WHERE ${where}`);
            const rows = await tx.$queryRaw<(Omit<OrderInvestigation['rows'][number], 'acceptedAt'> & {
                acceptedAt: Date;
            })[]>(Prisma.sql `SELECT cl."checkoutId",cl.id AS "checkoutLineId",c."acceptedAt",actor.name AS "actorName",u.id AS "unitId",u."unitCode",l.id AS "lotId",li.code AS "lotCode",b."publicCode" AS "publicBatchCode",p.name AS "productName",v.name AS "variantName",sku."fullCode" AS "fullSku",state.state,cl."reasonCode" AS "originalReason",r."reasonCode" AS "classifiedReason",CASE WHEN cl."reasonCode" IS NOT NULL THEN NULL WHEN r.id IS NOT NULL THEN 'RESOLVED' ELSE 'PENDING' END AS "missingReasonStatus",done."completionId" FROM "CheckoutLine" cl JOIN "Checkout" c ON c.id=cl."checkoutId" JOIN "User" actor ON actor.id=c."actorId" JOIN "StockUnit" u ON u.id=cl."unitId" JOIN "UnitState" state ON state."unitId"=u.id JOIN "StockLot" l ON l.id=u."lotId" JOIN "DeliveryBatch" b ON b.id=l."batchId" JOIN "SupplierVariantSku" sku ON sku.id=l."skuId" JOIN "Product" p ON p.id=sku."productId" JOIN "Variant" v ON v.id=sku."variantId" LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id LEFT JOIN "CheckoutReasonResolution" resolved ON resolved."checkoutLineId"=cl.id LEFT JOIN "ReasonReconciliation" r ON r.id=resolved."reconciliationId" LEFT JOIN "ProductionCompletionLine" done ON done."checkoutLineId"=cl.id WHERE ${where} ORDER BY c."acceptedAt" DESC,c.id DESC,cl.ordinal LIMIT 20 OFFSET ${(q.page - 1) * 20}`);
            return { ...fresh, page: q.page, pageSize: 20, total: Number(count!.n), sessions: Number(count!.sessions), orderReference: q.orderReference, rows: rows.map(row => ({ ...row, acceptedAt: row.acceptedAt.toISOString() })) };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }
}
