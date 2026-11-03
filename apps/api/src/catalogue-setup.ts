import { allocatePublicIdentity } from './public-code.js';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { combinationKey, nextSupplierCode, supplierCodeSeed, type ProductSetupInput, type SupplierSetupInput } from '@dayari/contracts';
import { allocateProductBase } from './product-code.js';
type Tx = Prisma.TransactionClient;

export async function setupSupplier(tx: Tx, data: SupplierSetupInput, originId: string) {
  const supplier = 'id' in data.supplier
    ? await tx.supplier.findUnique({ where: { id: data.supplier.id } })
    : await tx.supplier.create({ data: { name: data.supplier.name, originId, code: nextSupplierCode(data.supplier.name, (await tx.supplier.findMany({ where: { code: { startsWith: supplierCodeSeed(data.supplier.name) } }, select: { code: true } })).map(row => row.code)) } });
  if (!supplier) throw new BadRequestException('Choose an existing supplier');
  let registry;
  if ('registryId' in data.location) registry = await tx.locationRegistry.findUnique({ where: { id: data.location.registryId } });
  else {
    const normalizedName = data.location.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
    registry = await tx.locationRegistry.findUnique({ where: { normalizedName } });
    if (registry && registry.code !== data.location.code) throw new ConflictException(`This location already uses code ${registry.code}. Select it from the registry.`);
    registry ??= await tx.locationRegistry.create({ data: { name: data.location.name, normalizedName, code: data.location.code } });
  }
  if (!registry) throw new BadRequestException('Choose a registered location');
  let source;
  if (data.existingSourceId) {
    source = await tx.supplierSource.findUnique({ where: { id: data.existingSourceId }, include: { skuPrefix: true } });
    if (!source || source.supplierId !== supplier.id) throw new BadRequestException('This location does not belong to the chosen supplier');
    if (source.skuPrefix) throw new ConflictException('This supplier location already has a saved prefix');
  } else {
    if (data.useExistingPrefix) throw new BadRequestException('Choose an existing location to preserve its prefix');
    const location = await tx.sourceLocation.create({ data: { name: data.sourceName ?? registry.name, originId } });
    source = await tx.supplierSource.create({ data: { supplierId: supplier.id, locationId: location.id, name: data.sourceName ?? registry.name, code: `${supplier.code}${registry.code}`, originId } });
  }
  const prefixCode = data.useExistingPrefix ? source.code : `${supplier.code}${registry.code}`;
  const prefix = await tx.supplierLocationPrefix.create({ data: { sourceId: source.id, registryId: registry.id, code: prefixCode, originId } });
  return { id: supplier.id, supplier, registry, source, prefix };
}

export async function setupProduct(tx: Tx, data: ProductSetupInput, originId: string, commandId: string) {
  const prefix = await tx.supplierLocationPrefix.findUnique({ where: { sourceId: data.sourceId } });
  if (!prefix) throw new BadRequestException('Set up this supplier location prefix before adding products');
  const product = 'id' in data.product
    ? await tx.product.findUnique({ where: { id: data.product.id } })
    : await tx.product.create({ data: { ...data.product, originId, variants: { create: { name: 'Default', combinationKey: '', originId } } } });
  if (!product) throw new BadRequestException('Choose an existing shared product');
  if (!('id' in data.product)) await allocatePublicIdentity(tx, 'PRODUCT', product.id, originId, commandId);
  const extensionAttributes = data.extendVariants ? await tx.attribute.findMany({ where: { productId: product.id } }) : [];
  if (data.extendVariants && (!('id' in data.product) || !data.variants.length || !extensionAttributes.length || data.variants.some(row => 'variantId' in row))) throw new BadRequestException('Extension requires an existing option product and new combinations');
  const rows: { variantId: string; suffix: string }[] = [];
  if (!data.variants.length) {
    if (await tx.attribute.count({ where: { productId: product.id } })) throw new BadRequestException('Select at least one explicit variant for this product');
    const defaultVariant = await tx.variant.findUniqueOrThrow({ where: { productId_combinationKey: { productId: product.id, combinationKey: '' } } });
    rows.push({ variantId: defaultVariant.id, suffix: 'STD' });
  }
  for (const row of data.variants) {
    if ('variantId' in row) {
      const variant = await tx.variant.findUnique({ where: { id: row.variantId } });
      if (!variant || variant.productId !== product.id) throw new BadRequestException('Variant belongs to a different product');
      if (!variant.combinationKey && await tx.attribute.count({ where: { productId: product.id } })) throw new BadRequestException('Select an explicit variant');
      rows.push({ variantId: variant.id, suffix: row.suffix });
      continue;
    }
    if (new Set(row.attributes.map(value => value.attribute)).size !== row.attributes.length) throw new BadRequestException('A variant can have only one value per attribute');
    if (await tx.supplierVariantSku.count({ where: { productId: product.id, variant: { combinationKey: '' } } })) throw new ConflictException('An allocated default product requires identity supersession before adding options');
    if (data.extendVariants && (row.attributes.length !== extensionAttributes.length || extensionAttributes.some(attribute => !row.attributes.some(pair => pair.attribute === attribute.name)))) throw new BadRequestException('New combinations must use all existing product attributes without changing them');
    const values = [];
    for (const pair of row.attributes) {
      const attribute = await tx.attribute.upsert({ where: { productId_name: { productId: product.id, name: pair.attribute } }, create: { productId: product.id, name: pair.attribute, originId }, update: {} });
      const value = await tx.attributeValue.upsert({ where: { attributeId_label: { attributeId: attribute.id, label: pair.value } }, create: { attributeId: attribute.id, label: pair.value, originId }, update: {} });
      values.push(value);
    }
    const key = combinationKey(values.map(value => value.id));
    let variant = await tx.variant.findUnique({ where: { productId_combinationKey: { productId: product.id, combinationKey: key } } });
    if (variant && data.extendVariants) throw new ConflictException('This variant combination already exists. Select the existing variant instead.');
    variant ??= await tx.variant.create({ data: { productId: product.id, name: row.name, combinationKey: key, originId, selections: { create: values.map(value => ({ attributeId: value.attributeId, valueId: value.id })) } } });
    rows.push({ variantId: variant.id, suffix: row.suffix });
  }
  if (new Set(rows.map(row => row.variantId)).size !== rows.length || new Set(rows.map(row => row.suffix)).size !== rows.length) throw new BadRequestException('Each selected variant and suffix must be unique');
  let sourcing = await tx.productSourcing.findUnique({ where: { sourceId_productId: { sourceId: data.sourceId, productId: product.id } } });
  if (!sourcing) {
    const existing = await tx.productSourcing.findMany({ where: { baseCode: { startsWith: prefix.code } }, select: { baseCode: true } });
    const occupiedSkus = await tx.supplierVariantSku.findMany({ where: { fullCode: { startsWith: prefix.code } }, select: { fullCode: true } });
    const used = new Set(existing.map(row => row.baseCode));
    // Also avoid a code already used by a different manually registered full SKU.
    for (const row of occupiedSkus) for (const variant of rows) if (row.fullCode.endsWith(`-${variant.suffix}`)) used.add(row.fullCode.slice(0, -(variant.suffix.length + 1)));
    const baseCode = allocateProductBase(prefix.code, used);
    sourcing = await tx.productSourcing.create({ data: { sourceId: data.sourceId, productId: product.id, baseCode, originId } });
  }
  const skus = [];
  for (const row of rows) {
    let sku = await tx.supplierVariantSku.findUnique({ where: { sourcingId_variantId: { sourcingId: sourcing.id, variantId: row.variantId } } });
    if (sku && sku.suffix !== row.suffix) throw new ConflictException(`This variant already uses suffix ${sku.suffix}`);
    sku ??= await tx.supplierVariantSku.create({ data: { ...row, sourcingId: sourcing.id, productId: product.id, fullCode: `${sourcing.baseCode}-${row.suffix}`, originId } });
    skus.push(sku);
  }
  const savedProduct = await tx.product.findUniqueOrThrow({ where: { id: product.id }, include: { publicIdentity: true, variants: { include: { selections: true } }, attributes: { include: { values: true } } } });
  return { id: product.id, product: { ...savedProduct, productCode: savedProduct.publicIdentity?.code ?? null }, sourcing, skus };
}
