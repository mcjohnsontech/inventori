import { allocatePublicIdentity } from './public-code.js';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { attributeSchema, combinationKey, idempotencyKeySchema, loginSchema, nextSupplierCode, productSchema, productSetupSchema, skuSchema, sourceSchema, supplierCodeSeed, supplierSchema, supplierSetupSchema, valueSchema, variantSchema } from '@dayari/contracts';
import type { ZodType } from 'zod';
import { canonical, digest, passwordHash, verifyPassword } from './security.js';
import { setupProduct, setupSupplier } from './catalogue-setup.js';

type Tx = Prisma.TransactionClient;
const dummyHash = passwordHash('unavailable-account');
function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException({ code: 'INVALID_INPUT', issues: result.error.issues });
  return result.data;
}
export class CatalogueService {
  constructor(readonly db: PrismaClient, readonly originId: string, readonly mode: string) {}

  async login(input: unknown) {
    const data = parse(loginSchema, input);
    const email = data.email.toLowerCase();
    const attempts = await this.db.loginAttempt.count({ where: { email, createdAt: { gt: new Date(Date.now() - 15 * 60_000) }, succeeded: false } });
    if (attempts >= 10) throw new UnauthorizedException('Too many attempts. Try again later.');
    const user = await this.db.user.findUnique({ where: { email } });
    const valid = verifyPassword(data.password, user?.passwordHash ?? dummyHash) && user?.active;
    await this.db.loginAttempt.create({ data: { email, succeeded: Boolean(valid) } });
    if (!valid || !user) throw new UnauthorizedException('Invalid credentials');
    const token = `${randomUUID()}.${randomUUID()}`;
    await this.db.session.create({ data: { tokenHash: digest(token), userId: user.id, expiresAt: new Date(Date.now() + 8 * 60 * 60_000) } });
    return { token, user: { id: user.id, name: user.name, role: user.role } };
  }

  async actor(token: string | undefined): Promise<User> {
    if (!token || token.length > 200) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active) throw new UnauthorizedException();
    return session.user;
  }

  async logout(token: string) {
    await this.db.session.updateMany({ where: { tokenHash: digest(token), revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async catalogue(user: User) {
    if (user.role === 'PRODUCTION') throw new ForbiddenException();
    const [products, suppliers, skus, locations, sourcings] = await this.db.$transaction([
      this.db.product.findMany({ orderBy: { createdAt: 'desc' }, include: { publicIdentity: true, variants: true, attributes: { include: { values: true } } } }),
      this.db.supplier.findMany({ orderBy: { name: 'asc' }, include: { sources: { include: { skuPrefix: true } } } }),
      this.db.supplierVariantSku.findMany({ orderBy: { fullCode: 'asc' }, include: { variant: { include: { product: true } }, sourcing: { include: { source: { include: { supplier: true } } } } } }),
      this.db.locationRegistry.findMany({ orderBy: { name: 'asc' } }),
      this.db.productSourcing.findMany({ select: { sourceId: true, productId: true, baseCode: true } }),
    ]);
    return { products: products.map(p => ({ ...p, productCode: p.publicIdentity?.code ?? null })), suppliers, skus, locations, sourcings };
  }

  async create(user: User, type: string, keyInput: unknown, input: unknown) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only Admin may create catalogue entries');
    if (this.mode !== 'SHOP') throw new ForbiddenException('Catalogue writes belong to the shop authority');
    const key = parse(idempotencyKeySchema, keyInput);
    const schemas: Record<string, ZodType> = { products: productSchema, suppliers: supplierSchema, sources: sourceSchema, attributes: attributeSchema, values: valueSchema, variants: variantSchema, skus: skuSchema, 'supplier-setups': supplierSetupSchema, 'product-setups': productSetupSchema };
    const schema = schemas[type];
    if (!schema) throw new BadRequestException('Unknown catalogue operation');
    const data = parse(schema, input);
    const requestHash = digest(canonical(data));
    try {
      return await this.db.$transaction(async tx => {
        // First lock serializes this origin's commits and keeps the sync cursor contiguous.
        const nodes = await tx.$queryRaw<{ mode: string }[]>`SELECT "mode" FROM "OriginNode" WHERE "id" = ${this.originId}::uuid FOR UPDATE`;
        if (nodes[0]?.mode !== 'SHOP') throw new ForbiddenException('Shop origin is not provisioned');
        const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: user.id, commandType: type, key } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new ConflictException('Idempotency key reused with different input');
          return prior.response;
        }
        // Recheck active role under lock; a previously authenticated request cannot bypass deactivation.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR SHARE`;
        const current = await tx.user.findUnique({ where: { id: user.id } });
        if (!current?.active || current.role !== 'ADMIN') throw new ForbiddenException();
        const commandId = randomUUID();
        const result = await this.insert(tx, type, data, commandId);
        const node = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
        const response = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
        const payload = { subject: response, actorId: user.id, actorRole: user.role, commandId } as Prisma.InputJsonValue;
        await tx.auditEvent.create({ data: { originId: this.originId, actorId: user.id, actorRole: user.role, commandId, action: `catalogue.${type}.created`, subjectId: result.id, snapshot: payload } });
        await tx.outboxEvent.create({ data: { originId: this.originId, originSequence: node.nextSequence, eventType: `catalogue.${type}.created`, aggregateId: result.id, commandId, actorId: user.id, payload, payloadHash: digest(canonical(payload)) } });
        await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: user.id, commandType: type, key, requestHash, response } });
        return response;
      }, { timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('An entry with this code or combination already exists');
        if (error.code === 'P2003' || error.code === 'P2025') throw new BadRequestException('Referenced catalogue entry does not exist');
      }
      throw error;
    }
  }

  private async insert(tx: Tx, type: string, input: unknown, commandId: string): Promise<{ id: string } & Record<string, unknown>> {
    const originId = this.originId;
    switch (type) {
      case 'supplier-setups': return setupSupplier(tx, parse(supplierSetupSchema, input), originId);
      case 'product-setups': return setupProduct(tx, parse(productSetupSchema, input), originId, commandId);
      case 'products': {
        const data = parse(productSchema, input);
        const product = await tx.product.create({ data: { ...data, originId, variants: { create: { name: 'Default', combinationKey: '', originId } } }, include: { variants: true } });
        const productCode = await allocatePublicIdentity(tx, 'PRODUCT', product.id, originId, commandId);
        return { ...product, productCode };
      }
      case 'suppliers': {
        const data = parse(supplierSchema, input);
        const codes = await tx.supplier.findMany({ where: { code: { startsWith: supplierCodeSeed(data.name) } }, select: { code: true } });
        // create() holds the single shop writer lock; allocation and its audit commit together.
        const code = nextSupplierCode(data.name, codes.map(supplier => supplier.code));
        return tx.supplier.create({ data: { ...data, code, originId } });
      }
      case 'sources': {
        const data = parse(sourceSchema, input);
        const location = await tx.sourceLocation.create({ data: { name: data.name, originId } });
        return tx.supplierSource.create({ data: { ...data, locationId: location.id, originId } });
      }
      case 'attributes': {
        const data = parse(attributeSchema, input);
        const defaultAllocation = await tx.supplierVariantSku.count({ where: { productId: data.productId, variant: { combinationKey: '' } } });
        if (defaultAllocation) throw new ConflictException('This product already has a default-variant SKU. Identity supersession is required before adding options.');
        return tx.attribute.create({ data: { ...data, originId } });
      }
      case 'values': return tx.attributeValue.create({ data: { ...parse(valueSchema, input), originId } });
      case 'variants': {
        const data = parse(variantSchema, input);
        let key: string;
        try { key = combinationKey(data.valueIds); } catch { throw new BadRequestException('Duplicate values'); }
        const values = await tx.attributeValue.findMany({ where: { id: { in: data.valueIds } }, include: { attribute: true } });
        if (values.length !== data.valueIds.length || values.some(value => value.attribute.productId !== data.productId)) throw new BadRequestException('Values must belong to this product');
        if (new Set(values.map(value => value.attributeId)).size !== values.length) throw new BadRequestException('Choose only one value per attribute');
        return tx.variant.create({ data: { productId: data.productId, name: data.name, combinationKey: key, originId, selections: { create: values.map(value => ({ attributeId: value.attributeId, valueId: value.id })) } } });
      }
      case 'skus': {
        const data = parse(skuSchema, input);
        const variant = await tx.variant.findUnique({ where: { id: data.variantId } });
        if (!variant) throw new BadRequestException('Variant does not exist');
        if (!variant.combinationKey && await tx.attribute.count({ where: { productId: variant.productId } })) throw new BadRequestException('Choose an explicit variant for a product with configured attributes');
        let sourcing = await tx.productSourcing.findUnique({ where: { sourceId_productId: { sourceId: data.sourceId, productId: variant.productId } } });
        if (sourcing && sourcing.baseCode !== data.baseCode) throw new ConflictException('This supplier source/product already has a different base code');
        sourcing ??= await tx.productSourcing.create({ data: { sourceId: data.sourceId, productId: variant.productId, baseCode: data.baseCode, originId } });
        return tx.supplierVariantSku.create({ data: { sourcingId: sourcing.id, productId: variant.productId, variantId: variant.id, suffix: data.suffix, fullCode: `${data.baseCode}-${data.suffix}`, originId } });
      }
      default: throw new BadRequestException();
    }
  }
}
