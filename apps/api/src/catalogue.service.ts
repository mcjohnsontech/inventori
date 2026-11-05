import { requireCapability } from './permissions.js';
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
    const result = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'login:'+email},0))::text`;
      const attempts=await tx.loginAttempt.count({where:{email,createdAt:{gt:new Date(Date.now()-15*60_000)},succeeded:false}});
      if(attempts>=10)return null;
      // Session's origin FK also locks OriginNode. Acquire it before User, matching
      // account/catalogue/receiving commands and avoiding an origin/user lock cycle.
      const origin=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "OriginNode" WHERE id=${this.originId}::uuid FOR KEY SHARE`;
      if(!origin[0])return null;
      const found=await tx.user.findUnique({where:{email}});
      if(found)await tx.$queryRaw`SELECT id FROM "User" WHERE id=${found.id}::uuid FOR SHARE`;
      const user=found?await tx.user.findUnique({where:{id:found.id},include:{membership:true}}):null;
      const valid=verifyPassword(data.password,user?.passwordHash??dummyHash)&&user?.active&&user.membership?.originId===this.originId;
      await tx.loginAttempt.create({data:{email,succeeded:Boolean(valid)}});
      if(!valid||!user)return null;
      const token=`${randomUUID()}.${randomUUID()}`;
      await tx.session.create({data:{tokenHash:digest(token),userId:user.id,originId:this.originId,expiresAt:new Date(Date.now()+8*60*60_000)}});
      return {token,user:{id:user.id,name:user.name,role:user.role,mustChangePassword:user.mustChangePassword}};
    },{timeout:15000,maxWait:10000});
    if(!result)throw new UnauthorizedException('Invalid credentials or sign-in temporarily limited');
    return result;
  }

  async actor(token: string | undefined, allowPasswordChange = false): Promise<User> {
    if (!token || token.length > 200) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: {include:{membership:true}} } });
    if (!session || session.originId!==this.originId || session.user.membership?.originId!==this.originId || session.revokedAt || session.expiresAt <= new Date() || !session.user.active) throw new UnauthorizedException();
    if(session.user.mustChangePassword&&!allowPasswordChange)throw new ForbiddenException('PASSWORD_CHANGE_REQUIRED');
    return session.user;
  }

  async logout(token: string) {
    await this.db.session.updateMany({ where: { tokenHash: digest(token), revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  shopInfo(user: User) {
    requireCapability(user,'SHOP_INFO');
    return { originId: this.originId, authority: this.mode, timeZone: 'Africa/Lagos', cloudSync: 'not-configured', observedAt: new Date().toISOString() };
  }

  async catalogue(user: User): Promise<import('@dayari/contracts').Catalogue> {
    requireCapability(user,'CATALOGUE_READ');
    return this.db.$transaction(async tx => {
      const products=await tx.product.findMany({where:{originId:this.originId},orderBy:{createdAt:'desc'},include:{publicIdentity:true,variants:true,attributes:{include:{values:true}}}});
      const suppliers=await tx.supplier.findMany({where:{originId:this.originId},orderBy:{name:'asc'},include:{sources:{include:{skuPrefix:true}}}});
      const skus=await tx.supplierVariantSku.findMany({where:{originId:this.originId},orderBy:{fullCode:'asc'},include:{variant:{include:{product:true}},sourcing:{include:{source:{include:{supplier:true}}}}}});
      const locations=await tx.locationRegistry.findMany({orderBy:{name:'asc'}});
      const sourcings=await tx.productSourcing.findMany({where:{originId:this.originId},select:{sourceId:true,productId:true,baseCode:true}});
    // Return only the shared catalogue contract, never Prisma evidence/command metadata.
    return {
      products: products.map(product => ({ id: product.id, name: product.name, description: product.description, productCode: product.publicIdentity?.code ?? null, variants: product.variants.map(variant => ({ id: variant.id, name: variant.name, combinationKey: variant.combinationKey })), attributes: product.attributes.map(attribute => ({ id: attribute.id, name: attribute.name, values: attribute.values.map(value => ({ id: value.id, label: value.label })) })) })),
      suppliers: suppliers.map(supplier => ({ id: supplier.id, name: supplier.name, code: supplier.code, sources: supplier.sources.map(source => ({ id: source.id, name: source.name, code: source.code, skuPrefix: source.skuPrefix ? { id: source.skuPrefix.id, code: source.skuPrefix.code, registryId: source.skuPrefix.registryId } : null })) })),
      skus: skus.map(sku => ({ id: sku.id, fullCode: sku.fullCode, variantId: sku.variantId, suffix: sku.suffix, variant: { name: sku.variant.name, product: { name: sku.variant.product.name } }, sourcing: { source: { id: sku.sourcing.source.id, name: sku.sourcing.source.name, supplier: { name: sku.sourcing.source.supplier.name } } } })),
      locations: locations.map(location => ({ id: location.id, name: location.name, code: location.code })), sourcings,
    };
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000,maxWait:10000});
  }

  async create(user: User, type: string, keyInput: unknown, input: unknown) {
    return this.execute(user, type, keyInput, input, false);
  }

  async createReceivingProduct(user: User, keyInput: unknown, input: unknown) {
    return this.execute(user, 'product-setups', keyInput, input, true);
  }

  private async execute(user: User, type: string, keyInput: unknown, input: unknown, receiving: boolean) {
    const capability = receiving ? 'RECEIVE' : 'CATALOGUE_WRITE';
    requireCapability(user,capability);
    // Separate command namespace: a receipt registration cannot replay a catalogue command.
    const commandType = receiving ? 'receiving.product-setups' : type;
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
        // Recheck active role under lock; a previously authenticated request cannot bypass deactivation.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR SHARE`;
        const current = await tx.user.findUnique({ where: { id: user.id } });
        if (!current?.active || current.authVersion!==user.authVersion || current.mustChangePassword) throw new ForbiddenException();
        requireCapability(current,capability);
        const membership = await tx.shopMembership.findUnique({ where: { userId: user.id } });
        if (membership?.originId !== this.originId) throw new ForbiddenException();
        const prior = await tx.commandResult.findUnique({ where: { originId_actorId_commandType_key: { originId: this.originId, actorId: user.id, commandType, key } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new ConflictException('Idempotency key reused with different input');
          return prior.response;
        }
        const commandId = randomUUID();
        const eventType = receiving ? 'receiving.product.registered' : `catalogue.${type}.created`;
        const result = await this.insert(tx, type, data, commandId);
        const node = await tx.originNode.update({ where: { id: this.originId }, data: { nextSequence: { increment: 1 } } });
        const response = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
        const payload = { subject: response, actorId: user.id, actorRole: user.role, commandId } as Prisma.InputJsonValue;
        await tx.auditEvent.create({ data: { originId: this.originId, actorId: user.id, actorRole: user.role, commandId, action: eventType, subjectId: result.id, snapshot: payload } });
        await tx.outboxEvent.create({ data: { originId: this.originId, originSequence: node.nextSequence, eventType, aggregateId: result.id, commandId, actorId: user.id, payload, payloadHash: digest(canonical(payload)) } });
        await tx.commandResult.create({ data: { id: commandId, originId: this.originId, actorId: user.id, commandType, key, requestHash, response } });
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
