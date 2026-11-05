import { requireCapability } from './permissions.js';
import { allocatePublicIdentity } from './public-code.js';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { z, type ZodType } from 'zod';
import { batchCode, idempotencyKeySchema, lagosDate, receiptSchema, type AcceptedReceipt, type LotEvidence, type OperationalStock } from '@dayari/contracts';
import { canonical, digest } from './security.js';

type Reader = Prisma.TransactionClient;
const commandType = 'receiving.receipts.create';
function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ message: result.error.issues.map(issue => issue.message).join('. '), issues: result.error.issues });
  return result.data;
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item)) as Prisma.InputJsonValue;
export class ReceivingService {
  constructor(readonly db: PrismaClient, readonly originId: string, readonly mode: string) {}
  allow(user: User) { requireCapability(user,'RECEIVE'); }
  async options(user: User) {
    this.allow(user);
    const sources = await this.db.supplierSource.findMany({ where: { originId: this.originId, OR: [{ skuPrefix: { isNot: null } }, { sourcings: { some: { skus: { some: {} } } } }] }, include: { supplier: true } });
    const skus = await this.db.supplierVariantSku.findMany({ where: { sourcing: { sourceId: { in: sources.map(source => source.id) } } }, include: { sourcing: true, variant: { include: { product: true } } }, orderBy: { fullCode: 'asc' } });
    const suppliers = new Map<string, { id: string; name: string; code: string; sources: { id: string; name: string; code: string }[] }>();
    for (const source of sources) {
      const supplier = suppliers.get(source.supplierId) ?? { id: source.supplierId, name: source.supplier.name, code: source.supplier.code, sources: [] };
      supplier.sources.push({ id: source.id, name: source.name, code: source.code }); suppliers.set(source.supplierId, supplier);
    }
    return { suppliers: [...suppliers.values()], skus: skus.map(sku => ({ id: sku.id, fullCode: sku.fullCode, sourceId: sku.sourcing.sourceId, productId: sku.productId, productName: sku.variant.product.name, variantId: sku.variantId, variantName: sku.variant.name })) };
  }
  async list(user: User) {
    this.allow(user);
    const batches = await this.db.deliveryBatch.findMany({ where: { originId: this.originId }, orderBy: { acceptedAt: 'desc' }, take: 100 });
    const receipts = await this.db.receipt.findMany({ where: { batchId: { in: batches.map(batch => batch.id) } } });
    return batches.map(batch => ({ id: receipts.find(receipt => receipt.batchId === batch.id)!.id, batchId: batch.id, originId: batch.originId, publicCode: batch.publicCode, deliveredOn: batch.deliveredOn.toISOString().slice(0, 10), acceptedAt: batch.acceptedAt.toISOString(), supplierName: (batch.snapshot as { supplierName: string }).supplierName, sourceName: (batch.snapshot as { sourceName: string }).sourceName }));
  }
  async read(tx: Reader, id: string): Promise<AcceptedReceipt> {
    const receipt = await tx.receipt.findUnique({ where: { id } });
    if (!receipt) throw new NotFoundException('Receipt not found');
    const batch = await tx.deliveryBatch.findUniqueOrThrow({ where: { id: receipt.batchId } });
    if (batch.originId !== this.originId) throw new NotFoundException('Receipt not found');
    const transaction = await tx.stockTransaction.findUniqueOrThrow({ where: { id: receipt.transactionId } });
    const lines = await tx.receiptLine.findMany({ where: { receiptId: id }, orderBy: { lineNumber: 'asc' } });
    const lotIdentities = await tx.lotPublicIdentity.findMany({ where: { lotId: { in: lines.map(l => l.lotId) } } });
    const productIds = lines.map(l => (l.snapshot as {productId:string}).productId).filter(Boolean);
    const productIdentities = await tx.productPublicIdentity.findMany({ where: { productId: { in: productIds } } });
    const sum = (field: 'usableQuantity' | 'damagedQuantity' | 'totalQuantity') => lines.reduce((total, row) => total + row[field], 0n).toString();
    return { id, batch: { id: batch.id, originId: batch.originId, publicCode: batch.publicCode, deliveredOn: batch.deliveredOn.toISOString().slice(0, 10), acceptedAt: batch.acceptedAt.toISOString(), numberedOn: batch.numberedOn.toISOString().slice(0, 10), invoiceReference: batch.invoiceReference, supplierName: (batch.snapshot as { supplierName: string }).supplierName, sourceName: (batch.snapshot as { sourceName: string }).sourceName }, originSequence: transaction.originSequence.toString(), lines: lines.map(line => ({ lotCode: lotIdentities.find(i => i.lotId === line.lotId)?.code ?? null, productCode: productIdentities.find(i => i.productId === (line.snapshot as {productId:string}).productId)?.code ?? null, id: line.id, skuId: line.skuId, lotId: line.lotId, usableQuantity: line.usableQuantity.toString(), damagedQuantity: line.damagedQuantity.toString(), totalQuantity: line.totalQuantity.toString(), damageReason: line.damageReason, fullCode: (line.snapshot as { fullCode: string }).fullCode, productId: (line.snapshot as { productId: string }).productId, productName: (line.snapshot as { productName: string }).productName, variantName: (line.snapshot as { variantName: string }).variantName })), totals: { usable: sum('usableQuantity'), damaged: sum('damagedQuantity'), delivered: sum('totalQuantity') } };
  }
  async get(user: User, id: string) { this.allow(user); return this.read(this.db, parse(idempotencyKeySchema, id)); }
  async lotEvidence(user: User, input: string): Promise<LotEvidence> {
    this.allow(user);
    const id = parse(idempotencyKeySchema, input);
    return this.db.$transaction(async tx => {
      const lot = await tx.stockLot.findUnique({ where: { id } });
      if (!lot || lot.originId !== this.originId) throw new NotFoundException('Stock lot not found');
      const line = await tx.receiptLine.findUniqueOrThrow({ where: { lotId: id } });
      const receipt = await tx.receipt.findUniqueOrThrow({ where: { id: line.receiptId } });
      const batch = await tx.deliveryBatch.findUniqueOrThrow({ where: { id: lot.batchId } });
      const transaction = await tx.stockTransaction.findUniqueOrThrow({ where: { id: receipt.transactionId } });
      const movements = await tx.stockMovement.findMany({ where: { lotId: id, transactionId: transaction.id }, orderBy: { toState: 'asc' } });
      return { lotId: id, receiptId: receipt.id, deliveredOn: batch.deliveredOn.toISOString().slice(0, 10), acceptedAt: transaction.recordedAt.toISOString(), originSequence: transaction.originSequence.toString(), movements: movements.map(movement => ({ id: movement.id, fromState: movement.fromState, toState: movement.toState, quantity: movement.quantity.toString() })) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async stock(user: User, query: unknown): Promise<OperationalStock> {
    this.allow(user);
    const uuid = z.uuid();
    const filters = parse(z.object({ sourceId: uuid.optional(), skuId: uuid.optional(), batchId: uuid.optional(), productId: uuid.optional() }).strict(), query);
    return this.db.$transaction(async tx => {
      const lots = await tx.$queryRaw<OperationalStock['lots']>(Prisma.sql`
        SELECT pi.code AS "productCode",li.code AS "lotCode",l.id AS "lotId",l."skuId",s."productId",l."sourceId",l."batchId",b."originId",b."publicCode",s."fullCode",
        p.name AS "productName",v.name AS "variantName",sup.name AS "supplierName",src.name AS "sourceName",
        COALESCE(u.quantity,0)::text AS usable,COALESCE(d.quantity,0)::text AS damaged
        FROM "StockLot" l JOIN "DeliveryBatch" b ON b.id=l."batchId" JOIN "SupplierVariantSku" s ON s.id=l."skuId"
        JOIN "Variant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=s."productId"
        JOIN "SupplierSource" src ON src.id=l."sourceId" JOIN "Supplier" sup ON sup.id=src."supplierId"
        LEFT JOIN "ProductPublicIdentity" pi ON pi."productId"=p.id LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id
        LEFT JOIN "StockBalance" u ON u."lotId"=l.id AND u.state='U' LEFT JOIN "StockBalance" d ON d."lotId"=l.id AND d.state='D'
        WHERE b."originId"=${this.originId}::uuid
        ${filters.sourceId ? Prisma.sql`AND l."sourceId"=${filters.sourceId}::uuid` : Prisma.empty}
        ${filters.skuId ? Prisma.sql`AND l."skuId"=${filters.skuId}::uuid` : Prisma.empty}
        ${filters.batchId ? Prisma.sql`AND l."batchId"=${filters.batchId}::uuid` : Prisma.empty}
        ${filters.productId ? Prisma.sql`AND s."productId"=${filters.productId}::uuid` : Prisma.empty}
        ORDER BY b."acceptedAt" DESC,s."fullCode" ASC`);
      const bySku = new Map<string, OperationalStock['bySku'][number]>();
      const byProduct = new Map<string, OperationalStock['byProduct'][number]>();
      for (const lot of lots) {
        const sku = bySku.get(lot.skuId) ?? { skuId: lot.skuId, fullCode: lot.fullCode, usable: '0', damaged: '0' };
        const product = byProduct.get(lot.productId) ?? { productId: lot.productId, productName: lot.productName, usable: '0', damaged: '0' };
        for (const row of [sku, product]) { row.usable = (BigInt(row.usable) + BigInt(lot.usable)).toString(); row.damaged = (BigInt(row.damaged) + BigInt(lot.damaged)).toString(); }
        bySku.set(lot.skuId, sku); byProduct.set(lot.productId, product);
      }
      return { asOf: new Date().toISOString(), lots, bySku: [...bySku.values()], byProduct: [...byProduct.values()] };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async create(user: User, keyInput: unknown, input: unknown) {
    this.allow(user);
    if (this.mode !== 'SHOP') throw new ForbiddenException('Only the shop may receive stock');
    const key = parse(idempotencyKeySchema, keyInput);
    const data = parse(receiptSchema, input);
    const requestHash = digest(canonical(data));
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(async tx => {
          const nodes = await tx.$queryRaw<{ mode: string }[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;
          if (nodes[0]?.mode !== 'SHOP') throw new ForbiddenException('Shop origin is not provisioned');
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;
          const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id } }); this.allow(actor); if(actor.authVersion!==user.authVersion||actor.mustChangePassword)throw new ForbiddenException('Session security state changed');
          const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: user.id, commandType, key } } });
          if (prior) { if (prior.requestHash !== requestHash) throw new ConflictException('Idempotency key reused with different receipt'); return prior.response; }
          const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
          const now = clock!.now;
          const date = lagosDate(now);
          if (data.deliveredOn > date) throw new BadRequestException('Delivery date cannot be in the future');
          const source = await tx.supplierSource.findUnique({ where: { id: data.sourceId }, include: { supplier: true } });
          if (!source || source.originId !== this.originId) throw new BadRequestException('Choose a supplier source belonging to this shop');
          const skus = await tx.supplierVariantSku.findMany({ where: { id: { in: data.lines.map(line => line.skuId) } }, include: { sourcing: true, variant: { include: { product: true, selections: { include: { value: true } } } } } });
          if (skus.length !== data.lines.length || skus.some(sku => sku.sourcing.sourceId !== source.id)) throw new BadRequestException('Every SKU must belong to the selected supplier source');
          const numberedOn = new Date(`${date}T00:00:00Z`);
          const previous = await tx.deliveryBatch.aggregate({ where: { originId: this.originId, numberedOn }, _max: { dailyOrdinal: true } });
          const ordinal = (previous._max.dailyOrdinal ?? 0) + 1;
          if (ordinal > 2147483647) throw new ConflictException('Daily batch numbering capacity exhausted');
          const batch = await tx.deliveryBatch.create({ data: { originId: this.originId, sourceId: source.id, publicCode: batchCode(date, ordinal), numberedOn, dailyOrdinal: ordinal, deliveredOn: new Date(`${data.deliveredOn}T00:00:00Z`), invoiceReference: data.invoiceReference || null, acceptedAt: now, snapshot: { supplierName: source.supplier.name, sourceName: source.name, supplierCode: source.supplier.code, sourceCode: source.code } } });
          const commandId = randomUUID();
          const node = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
          const transaction = await tx.stockTransaction.create({ data: { batchId: batch.id, originId: this.originId, commandId, originSequence: node.nextSequence, type: 'RECEIPT', actorId: actor.id, actorRole: actor.role, recordedAt: now } });
          const receipt = await tx.receipt.create({ data: { batchId: batch.id, transactionId: transaction.id, sourceId: source.id, acceptedAt: now } });
          for (const [index, line] of data.lines.entries()) {
            const sku = skus.find(item => item.id === line.skuId)!;
            const lot = await tx.stockLot.create({ data: { skuId: sku.id, batchId: batch.id, sourceId: source.id, originId: this.originId } });
            await allocatePublicIdentity(tx, 'LOT', lot.id, this.originId, commandId);
            const record = await tx.receiptLine.create({ data: { receiptId: receipt.id, batchId: batch.id, skuId: sku.id, lotId: lot.id, lineNumber: index + 1, usableQuantity: BigInt(line.usableQuantity), damagedQuantity: BigInt(line.damagedQuantity), damageReason: line.damageReason, snapshot: json({ fullCode: sku.fullCode, productId: sku.productId, productName: sku.variant.product.name, variantId: sku.variantId, variantName: sku.variant.name, selections: sku.variant.selections.map(selection => ({ attributeId: selection.attributeId, valueId: selection.valueId, label: selection.value.label })) }) } });
            // New batch means new lots: no pre-existing balances can race. Future operations must lock sorted lot/state rows after the origin lock.
            for (const [state, quantity] of [['U', line.usableQuantity], ['D', line.damagedQuantity]] as const) {
              if (quantity > 0) await tx.stockMovement.create({ data: { transactionId: transaction.id, batchId: batch.id, lotId: lot.id, receiptLineId: record.id, fromState: 'E', toState: state, quantity: BigInt(quantity) } });
              await tx.stockBalance.create({ data: { lotId: lot.id, state, quantity: BigInt(quantity), lastTransactionId: transaction.id } });
            }
          }
          const response = json(await this.read(tx, receipt.id));
          const movements = await tx.stockMovement.findMany({ where: { transactionId: transaction.id } });
          const payload = json({ subject: response, transactionId: transaction.id, movements, actorId: actor.id, actorRole: actor.role, commandId });
          await tx.auditEvent.create({ data: { originId: this.originId, actorId: actor.id, actorRole: actor.role, commandId, action: 'inventory.receipt.accepted', subjectId: receipt.id, snapshot: payload } });
          await tx.outboxEvent.create({ data: { originId: this.originId, originSequence: node.nextSequence, eventType: 'inventory.receipt.accepted', aggregateId: receipt.id, commandId, actorId: actor.id, payload, payloadHash: digest(canonical(payload)) } });
          await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: actor.id, commandType, key, requestHash, response } });
          return response;
        }, { timeout: 15000, maxWait: 10000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2034' && attempt < 2) continue;
          if (error.code === 'P2002') throw new ConflictException('Receipt identity or batch number conflict; retry the same command');
          if (['P2003', 'P2025'].includes(error.code)) throw new BadRequestException('Referenced receiving identity is unavailable');
        }
        throw error;
      }
    }
  }
}
