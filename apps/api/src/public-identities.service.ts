import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { identityQuerySchema, publicCodeSchema, type PublicIdentityLookup } from '@dayari/contracts';

export class PublicIdentitiesService {
  private reads = new Map<string, { at: number; count: number }>();
  constructor(readonly db: PrismaClient, readonly originId: string) {}
  async lookup(user: User, kind: 'PRODUCT' | 'LOT', codeInput: unknown, query: unknown): Promise<PublicIdentityLookup> {
    if (!user.active || !['ADMIN','MANAGER','PRODUCTION'].includes(user.role)) throw new ForbiddenException();
    const now = Date.now();
    if (this.reads.size > 10000) for (const [id, row] of this.reads) if (now-row.at >= 60000) this.reads.delete(id);
    const row = this.reads.get(user.id); const rate = row && now-row.at < 60000 ? row : { at: now, count: 0 };
    this.reads.set(user.id, rate); if (++rate.count > 120) throw new HttpException('RATE_LIMITED',429);
    const code = publicCodeSchema(kind).safeParse(codeInput), filters = identityQuerySchema.safeParse(query);
    if (!code.success || !filters.success) throw new BadRequestException('INVALID_INPUT');
    if (filters.data.originId && filters.data.originId !== this.originId) throw new NotFoundException('IDENTITY_NOT_AVAILABLE');
    return this.db.$transaction(async tx => {
      const origin = await tx.originNode.findUnique({ where: { id: this.originId } });
      if (!origin) throw new NotFoundException('IDENTITY_NOT_AVAILABLE');
      const common = { dataAsOf: new Date().toISOString(), originSequence: origin.nextSequence.toString(), originId: this.originId };
      if (kind === 'PRODUCT') {
        const identity = await tx.productPublicIdentity.findUnique({ where: { originId_code: { originId: this.originId, code: code.data } }, include: { product: true } });
        if (!identity || identity.product.originId !== this.originId) throw new NotFoundException('IDENTITY_NOT_AVAILABLE');
        return { kind, ...common, productId: identity.productId, productCode: identity.code, productName: identity.product.name };
      }
      const rows = await tx.$queryRaw<(PublicIdentityLookup & { damaged: string })[]>`
        SELECT l.id AS "lotId",i.code AS "lotCode",s.id AS "skuId",s."fullCode" AS "fullSku",p.id AS "productId",p.name AS "productName",pi.code AS "productCode",
        v.id AS "variantId",v.name AS "variantName",b.id AS "batchId",b."publicCode" AS "publicBatchCode",COALESCE(u.quantity,0)::text AS usable,COALESCE(d.quantity,0)::text AS damaged
        FROM "LotPublicIdentity" i JOIN "StockLot" l ON l.id=i."lotId" AND l."originId"=i."originId"
        JOIN "DeliveryBatch" b ON b.id=l."batchId" AND b."originId"=l."originId" AND b."sourceId"=l."sourceId"
        JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "ProductSourcing" ps ON ps.id=s."sourcingId" AND ps."sourceId"=l."sourceId"
        JOIN "Product" p ON p.id=s."productId" JOIN "Variant" v ON v.id=s."variantId" AND v."productId"=p.id
        LEFT JOIN "ProductPublicIdentity" pi ON pi."productId"=p.id
        LEFT JOIN "StockBalance" u ON u."lotId"=l.id AND u.state='U' LEFT JOIN "StockBalance" d ON d."lotId"=l.id AND d.state='D'
        WHERE i."originId"=${this.originId}::uuid AND i.code=${code.data}`;
      if (!rows[0]) throw new NotFoundException('IDENTITY_NOT_AVAILABLE');
      const { damaged, ...identity } = rows[0];
      return { ...identity, kind, ...common, ...(user.role === 'PRODUCTION' ? {} : { damaged }) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
