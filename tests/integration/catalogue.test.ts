import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { database } from '../../apps/api/src/database.js';
import { passwordHash } from '../../apps/api/src/security.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Set TEST_DATABASE_URL to an isolated local *_test database');
describe('catalogue vertical slice against PostgreSQL (FR-01,17–19,23–24)', () => {
  let db: ReturnType<typeof database>;
  let app: Awaited<ReturnType<typeof createApp>>;
  let token: string;
  let manager: string;
  let production: string;
  let userId: string;
  const originId = randomUUID();
  const password = randomUUID();
  const email = `${randomUUID()}@dayari.test`;
  beforeAll(async () => {
    db = database(url);
    await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
    for (const role of ['ADMIN', 'MANAGER', 'PRODUCTION'] as const) {
      const user = await db.user.create({ data: { email: role === 'ADMIN' ? email : `${role.toLowerCase()}-${email}`, name: role, role, passwordHash: passwordHash(password) } });
      if (role === 'ADMIN') userId = user.id;
    }
    app = await createApp(db, originId, 'SHOP');
    for (const role of ['ADMIN', 'MANAGER', 'PRODUCTION']) {
      const response = await request(app.getHttpServer()).post('/v1/sessions').send({ email: role === 'ADMIN' ? email : `${role}-${email}`, password }).expect(200);
      if (role === 'ADMIN') token = response.body.token;
      if (role === 'MANAGER') manager = response.body.token;
      if (role === 'PRODUCTION') production = response.body.token;
    }
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });
  function create(type: string, body: object, key = randomUUID(), auth = token) { return request(app.getHttpServer()).post(`/v1/catalogue/${type}`).set('Authorization', `Bearer ${auth}`).set('Idempotency-Key', key).send(body); }
  it('enforces server-side role checks and authentication, not just hidden controls', async () => {
    await request(app.getHttpServer()).get('/v1/catalogue').expect(401);
    await request(app.getHttpServer()).get('/v1/catalogue').set('Authorization', `Bearer ${manager}`).expect(200);
    await request(app.getHttpServer()).get('/v1/catalogue').set('Authorization', `Bearer ${production}`).expect(403);
    await create('products', { name: 'Forbidden' }, randomUUID(), manager).expect(403);
    await create('products', { name: 'Forbidden' }, randomUUID(), production).expect(403);
  });
  it('returns minimal read-only shop configuration only to Admin', async () => {
    await request(app.getHttpServer()).get('/v1/admin/shop').expect(401);
    for (const restricted of [manager, production]) await request(app.getHttpServer()).get('/v1/admin/shop').set('Authorization', `Bearer ${restricted}`).expect(403);
    const result = await request(app.getHttpServer()).get('/v1/admin/shop').set('Authorization', `Bearer ${token}`).expect(200);
    expect(result.body).toMatchObject({ originId, authority: 'SHOP', timeZone: 'Africa/Lagos', cloudSync: 'not-configured' });
    expect(Object.keys(result.body).sort()).toEqual(['originId','authority','timeZone','cloudSync','observedAt'].sort());
  });
  it('scopes catalogue reads to the configured shop origin', async () => {
    const foreignOrigin = randomUUID();
    await db.originNode.create({ data: { id: foreignOrigin, mode: 'SHOP' } });
    const foreignApp = await createApp(db, foreignOrigin, 'SHOP');
    try {
      const response = await request(foreignApp.getHttpServer()).post('/v1/catalogue/products').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).send({ name: `Foreign ${foreignOrigin}` }).expect(201);
      const local = await request(app.getHttpServer()).get('/v1/catalogue').set('Authorization', `Bearer ${token}`).expect(200);
      expect(JSON.stringify(local.body)).not.toMatch(/"commandId"|"actorId"|"publicIdentity"|"passwordHash"/);
      expect(local.body.products.some((product: {id:string}) => product.id === response.body.id)).toBe(false);
    } finally { await foreignApp.close(); }
  });
  it('creates one shared product and red variant with two independently attributable supplier SKUs', async () => {
    const product = (await create('products', { name: 'A5 Maple Notebook' }).expect(201)).body;
    expect(product.variants).toHaveLength(1);
    const attribute = (await create('attributes', { productId: product.id, name: 'Colour' }).expect(201)).body;
    const supplierForDefaultCheck = (await create('suppliers', { name: 'Default check' }).expect(201)).body;
    const sourceForDefaultCheck = (await create('sources', { supplierId: supplierForDefaultCheck.id, name: 'Source', code: randomUUID() }).expect(201)).body;
    await create('skus', { sourceId: sourceForDefaultCheck.id, variantId: product.variants[0].id, baseCode: randomUUID(), suffix: 'DEFAULT' }).expect(400);
    const value = (await create('values', { attributeId: attribute.id, label: 'Red' }).expect(201)).body;
    const variant = (await create('variants', { productId: product.id.toUpperCase(), name: 'Red', valueIds: [value.id.toUpperCase()] }).expect(201)).body;
    await create('variants', { productId: product.id, name: 'Different text, same identity', valueIds: [value.id] }).expect(409);
    const skus = [];
    for (const name of ['Chioma', 'Second Supplier']) {
      const supplier = (await create('suppliers', { name }).expect(201)).body;
      const source = (await create('sources', { supplierId: supplier.id, name: 'Lagos', code: randomUUID() }).expect(201)).body;
      skus.push((await create('skus', { sourceId: source.id, variantId: variant.id, baseCode: `${name === 'Chioma' ? 'CHILG03849' : 'OTHER'}-${randomUUID()}`, suffix: 'RED' }).expect(201)).body);
    }
    expect(skus[0].variantId).toBe(skus[1].variantId);
    expect(skus[0].sourcingId).not.toBe(skus[1].sourcingId);
    expect(skus[0].fullCode).not.toBe(skus[1].fullCode);
    const events = await db.outboxEvent.findMany({ where: { originId }, orderBy: { originSequence: 'asc' } });
    expect(events.map(event => Number(event.originSequence))).toEqual(events.map((_, index) => index + 1));
    expect(await db.auditEvent.count({ where: { originId } })).toBe(events.length);
  });
  it('commits parallel retries only once and rejects key reuse with different data', async () => {
    const key = randomUUID();
    const responses = await Promise.all(Array.from({ length: 4 }, () => create('products', { name: 'Concurrent notebook' }, key)));
    expect(responses.every(response => response.status === 201)).toBe(true);
    expect(new Set(responses.map(response => response.body.id)).size).toBe(1);
    expect(await db.commandResult.count({ where: { originId, key } })).toBe(1);
    await create('products', { name: 'Changed request' }, key).expect(409);
  });
  it('rejects wrong-product values and rolls invalid source creation back with no event', async () => {
    const first = (await create('products', { name: 'First' }).expect(201)).body;
    const second = (await create('products', { name: 'Second' }).expect(201)).body;
    const attribute = (await create('attributes', { productId: first.id, name: 'Size' }).expect(201)).body;
    const value = (await create('values', { attributeId: attribute.id, label: 'A5' }).expect(201)).body;
    await create('variants', { productId: second.id, name: 'Wrong parent', valueIds: [value.id] }).expect(400);
    const before = await db.outboxEvent.count({ where: { originId } });
    const locations = await db.sourceLocation.count({ where: { originId } });
    await create('sources', { supplierId: randomUUID(), name: 'Unknown supplier', code: randomUUID() }).expect(400);
    expect(await db.sourceLocation.count({ where: { originId } })).toBe(locations);
    expect(await db.outboxEvent.count({ where: { originId } })).toBe(before);
    await request(app.getHttpServer()).post('/v1/catalogue/products').set('Authorization', `Bearer ${token}`).send({ name: 'Missing key' }).expect(400);
    await create('products', { name: '', stock: 5 }).expect(400);
  });
  it('guards history and referenced identities at database level and rejects cloud writes', async () => {
    const audit = await db.auditEvent.findFirstOrThrow({ where: { originId } });
    await expect(db.auditEvent.delete({ where: { id: audit.id } })).rejects.toThrow();
    const sku = await db.supplierVariantSku.findFirstOrThrow({ where: { originId } });
    await expect(db.supplierVariantSku.update({ where: { id: sku.id }, data: { fullCode: 'REWRITTEN' } })).rejects.toThrow();
    const cloud = await createApp(db, originId, 'CLOUD');
    try { await request(cloud.getHttpServer()).post('/v1/catalogue/products').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).send({ name: 'Cloud write' }).expect(403); } finally { await cloud.close(); }
  });
  it('rejects concurrent readable-code collisions without leaving orphan sourcing records', async () => {
    const product = (await create('products', { name: 'Collision check' }).expect(201)).body;
    const sources: string[] = [];
    for (let index = 0; index < 2; index++) {
      const supplier = (await create('suppliers', { name: 'Collision supplier' }).expect(201)).body;
      const source = (await create('sources', { supplierId: supplier.id, name: 'Source', code: randomUUID() }).expect(201)).body;
      sources.push(source.id);
    }
    const base = `COLLISION-${randomUUID()}`;
    const before = await db.outboxEvent.count({ where: { originId } });
    const responses = await Promise.all([
      create('skus', { sourceId: sources[0], variantId: product.variants[0].id, baseCode: base, suffix: 'Y-Z' }),
      create('skus', { sourceId: sources[1], variantId: product.variants[0].id, baseCode: `${base}-Y`, suffix: 'Z' }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(await db.productSourcing.count({ where: { productId: product.id } })).toBe(1);
    expect(await db.outboxEvent.count({ where: { originId } })).toBe(before + 1);
  });
  it('allocates abbreviated supplier codes atomically, preserving old codes and replaying the same allocation', async () => {
    const prefix = `Q${randomUUID().replace(/[^a-z]/g, '').slice(0, 2)}`.toUpperCase();
    const existing = await db.supplier.findMany({ where: { code: { startsWith: prefix } } });
    // Legacy/manual codes remain valid and are never rewritten by new allocation.
    const legacyCode = `LEGACY-${randomUUID()}`;
    const legacy = await db.supplier.create({ data: { name: 'Legacy supplier', code: legacyCode, originId } });
    const requestName = `${prefix} Ventures`;
    const before = await db.outboxEvent.count({ where: { originId } });
    const key = randomUUID();
    const [first, retry, other] = await Promise.all([
      create('suppliers', { name: requestName }, key),
      create('suppliers', { name: requestName }, key),
      create('suppliers', { name: `${prefix} Supplies` }),
    ]);
    expect([first.status, retry.status, other.status]).toEqual([201, 201, 201]);
    expect(first.body.id).toBe(retry.body.id);
    expect(first.body.code).toBe(retry.body.code);
    expect(first.body.code).not.toBe(other.body.code);
    expect(first.body.code.startsWith(prefix)).toBe(true);
    if (existing.length === 0) expect([first.body.code, other.body.code].sort()).toEqual([prefix, `${prefix}-02`].sort());
    expect(await db.outboxEvent.count({ where: { originId } })).toBe(before + 2);
    expect((await db.supplier.findUniqueOrThrow({ where: { id: legacy.id } })).code).toBe(legacyCode);
    await db.supplier.update({ where: { id: first.body.id }, data: { name: 'Renamed supplier display' } });
    expect((await db.supplier.findUniqueOrThrow({ where: { id: first.body.id } })).code).toBe(first.body.code);
    await expect(db.supplier.update({ where: { id: first.body.id }, data: { code: `REWRITTEN-${randomUUID()}` } })).rejects.toThrow();
    await create('suppliers', { name: '123 Invalid' }).expect(400);
    await create('suppliers', { name: requestName, code: 'OVERRIDE' }).expect(400);
    await create('suppliers', { name: `${requestName} Changed` }, key).expect(409);
  });
  it('saves supplier and product setups atomically, reuses shared variants and product bases, and allocates random numbers once', async () => {
    const location = await db.locationRegistry.findUniqueOrThrow({ where: { code: 'LG' } });
    const setup = (await create('supplier-setups', { supplier: { name: `Wizard ${randomUUID()}` }, location: { registryId: location.id } }).expect(201)).body;
    expect(setup.prefix.code).toBe(`${setup.supplier.code}LG`);
    const body = { sourceId: setup.source.id, product: { name: `Progressive ${randomUUID()}` }, variants: [
      { name: 'Red', suffix: 'RED', attributes: [{ attribute: 'Colour', value: 'Red' }] },
      { name: 'Brown', suffix: 'BRN', attributes: [{ attribute: 'Colour', value: 'Brown' }] },
    ] };
    const key = randomUUID();
    const [first, replay] = await Promise.all([create('product-setups', body, key), create('product-setups', body, key)]);
    expect(first.status).toBe(201); expect(replay.status).toBe(201);
    expect(first.body).toEqual(replay.body);
    const number = first.body.sourcing.baseCode.slice(setup.prefix.code.length);
    expect(number).toMatch(/^\d{5}$/);
    expect(first.body.skus.map((row: { fullCode: string }) => row.fullCode).sort()).toEqual([`${setup.prefix.code}${number}-BRN`, `${setup.prefix.code}${number}-RED`].sort());
    const repeated = (await create('product-setups', { sourceId: setup.source.id, product: { id: first.body.product.id }, variants: first.body.skus.map((row: { variantId: string; suffix: string }) => ({ variantId: row.variantId, suffix: row.suffix })) }).expect(201)).body;
    expect(repeated.sourcing.id).toBe(first.body.sourcing.id);
    expect(repeated.skus.map((row: { id: string }) => row.id).sort()).toEqual(first.body.skus.map((row: { id: string }) => row.id).sort());
    const other = (await create('supplier-setups', { supplier: { name: `Another ${randomUUID()}` }, location: { registryId: location.id } }).expect(201)).body;
    const secondSource = (await create('product-setups', { sourceId: other.source.id, product: { id: first.body.product.id }, variants: first.body.skus.map((row: { variantId: string; suffix: string }) => ({ variantId: row.variantId, suffix: row.suffix })) }).expect(201)).body;
    expect(secondSource.product.id).toBe(first.body.product.id);
    expect(secondSource.sourcing.baseCode).not.toBe(first.body.sourcing.baseCode);
    const before = await db.product.count({ where: { originId } });
    const events = await db.outboxEvent.count({ where: { originId } });
    await create('product-setups', { ...body, product: { name: 'Must roll back' }, variants: [body.variants[0], { ...body.variants[1], suffix: 'RED' }] }).expect(400);
    expect(await db.product.count({ where: { originId } })).toBe(before);
    expect(await db.outboxEvent.count({ where: { originId } })).toBe(events);
    await create('product-setups', body, randomUUID(), manager).expect(403);
    await create('supplier-setups', { supplier: { name: 'No permission' }, location: { registryId: location.id } }, randomUUID(), production).expect(403);
    await expect(db.supplierLocationPrefix.update({ where: { id: setup.prefix.id }, data: { code: 'REWRITTEN' } })).rejects.toThrow();
  });
  it('adopts a selected legacy CHILG prefix without rewriting supplier/location identities and rejects registry conflicts atomically', async () => {
    const location = await db.locationRegistry.findUniqueOrThrow({ where: { code: 'LG' } });
    const supplier = await db.supplier.create({ data: { name: 'Legacy prefix owner', code: `LEG-${randomUUID()}`, originId } });
    const legacyPrefix = `CHILG-${randomUUID()}`;
    const source = (await create('sources', { supplierId: supplier.id, name: 'Lagos Island', code: legacyPrefix }).expect(201)).body;
    const adopted = (await create('supplier-setups', { supplier: { id: supplier.id }, existingSourceId: source.id, location: { registryId: location.id }, useExistingPrefix: true }).expect(201)).body;
    expect(adopted.prefix.code).toBe(legacyPrefix);
    expect(adopted.source.id).toBe(source.id);
    expect(adopted.supplier.code).toBe(supplier.code);
    const before = await db.supplier.count({ where: { originId } });
    await create('supplier-setups', { supplier: { name: 'Must roll back' }, location: { name: 'Lagos', code: 'DIFFERENT' } }).expect(409);
    expect(await db.supplier.count({ where: { originId } })).toBe(before);
  });
  it('allocates distinct product bases for concurrent different products and uses STD for products without options', async () => {
    const location = await db.locationRegistry.findUniqueOrThrow({ where: { code: 'LG' } });
    const setup = (await create('supplier-setups', { supplier: { name: `Random ${randomUUID()}` }, location: { registryId: location.id } }).expect(201)).body;
    const responses = await Promise.all(['One', 'Two'].map(name => create('product-setups', { sourceId: setup.source.id, product: { name }, variants: [] })));
    expect(responses.map(response => response.status)).toEqual([201, 201]);
    expect(new Set(responses.map(response => response.body.sourcing.baseCode)).size).toBe(2);
    expect(responses.every(response => response.body.skus[0].suffix === 'STD')).toBe(true);
  });
  it('extends populated variants atomically without changing identities, rejects duplicates and enforces permissions', async () => {
    const registry = await db.locationRegistry.findFirstOrThrow({ where: { code: 'LG' } });
    const supplier = (await create('supplier-setups', { supplier: { name: `Extension ${randomUUID()}` }, location: { registryId: registry.id } }).expect(201)).body;
    const variant = (value: string, suffix = value.toUpperCase()) => ({ name: value, suffix, attributes: [{ attribute: 'Colour', value }, { attribute: 'Size', value: 'A5' }] });
    const initial = (await create('product-setups', { sourceId: supplier.source.id, product: { name: 'A5 Maple Leatherbound Notebook' }, variants: [variant('Red'), variant('Brown')] }).expect(201)).body;
    const beforeSkus = await db.supplierVariantSku.findMany({ where: { productId: initial.product.id }, orderBy: { id: 'asc' } });
    const beforeVariants = await db.variant.findMany({ where: { productId: initial.product.id }, orderBy: { id: 'asc' } });
    const body = { sourceId: supplier.source.id, product: { id: initial.product.id }, extendVariants: true, variants: [variant('Green'), variant('Tan')] };
    const key = randomUUID();
    const results = await Promise.all([create('product-setups', body, key), create('product-setups', body, key)]);
    expect(results.map(row => row.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect(results[0].body.sourcing).toEqual(initial.sourcing);
    expect(results[0].body.skus.map((row: { fullCode: string }) => row.fullCode).sort()).toEqual([`${initial.sourcing.baseCode}-GREEN`, `${initial.sourcing.baseCode}-TAN`]);
    expect(await db.supplierVariantSku.findMany({ where: { id: { in: beforeSkus.map(row => row.id) } }, orderBy: { id: 'asc' } })).toEqual(beforeSkus);
    expect(await db.variant.findMany({ where: { id: { in: beforeVariants.map(row => row.id) } }, orderBy: { id: 'asc' } })).toEqual(beforeVariants);
    expect(await db.auditEvent.count({ where: { commandId: (await db.commandResult.findFirstOrThrow({ where: { originId, key } })).id } })).toBe(1);
    const auditCount = await db.auditEvent.count({ where: { originId } });
    const eventCount = await db.outboxEvent.count({ where: { originId } });
    await create('product-setups', body).expect(409);
    await create('product-setups', { ...body, variants: [variant('Blue'), variant('Red')] }).expect(409);
    await create('product-setups', { ...body, variants: [variant('Blue'), variant('Blue', 'BLUE2')] }).expect(409);
    await create('product-setups', { ...body, variants: [variant('Blue', 'RED')] }).expect(409);
    await create('product-setups', { ...body, variants: [{ ...variant('Blue'), attributes: [{ attribute: 'Colour', value: 'Blue' }] }] }).expect(400);
    await create('product-setups', { ...body, variants: [{ ...variant('Blue'), attributes: [{ attribute: 'Colour', value: 'Blue' }, { attribute: 'Finish', value: 'Gloss' }] }] }).expect(400);
    await create('product-setups', body, randomUUID(), manager).expect(403);
    await create('product-setups', body, randomUUID(), production).expect(403);
    await request(app.getHttpServer()).post('/v1/catalogue/product-setups').set('Idempotency-Key', randomUUID()).send(body).expect(401);
    expect(await db.attributeValue.count({ where: { attribute: { productId: initial.product.id }, label: 'Blue' } })).toBe(0);
    expect(await db.variant.count({ where: { productId: initial.product.id } })).toBe(5);
    expect(await db.auditEvent.count({ where: { originId } })).toBe(auditCount);
    expect(await db.outboxEvent.count({ where: { originId } })).toBe(eventCount);
    const duplicateRace = { ...body, variants: [variant('Olive')] };
    expect((await Promise.all([create('product-setups', duplicateRace), create('product-setups', duplicateRace)])).map(row => row.status).sort()).toEqual([201, 409]);
    const other = (await create('supplier-setups', { supplier: { name: `Other ${randomUUID()}` }, location: { registryId: registry.id } }).expect(201)).body;
    const green = results[0].body.skus[0];
    await create('product-setups', { sourceId: other.source.id, product: { id: initial.product.id }, variants: [{ variantId: green.variantId, suffix: green.suffix }] }).expect(201);
    expect(await db.variant.count({ where: { productId: initial.product.id } })).toBe(6);
  });
  it('makes deactivated sessions unusable', async () => {
    await db.user.update({ where: { id: userId }, data: { active: false } });
    await request(app.getHttpServer()).get('/v1/catalogue').set('Authorization', `Bearer ${token}`).expect(401);
  });

});
