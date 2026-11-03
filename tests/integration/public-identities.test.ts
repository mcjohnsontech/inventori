import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { beforeAll, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { database } from '../../apps/api/src/database.js';
import { passwordHash } from '../../apps/api/src/security.js';
import { allocatePublicIdentity } from '../../apps/api/src/public-code.js';
import { planIdentityBackfill, applyIdentityBackfill } from '../../apps/api/src/identity-backfill.js';
import { LabelsService } from '../../apps/api/src/labels.service.js';
import { ReceivingService } from '../../apps/api/src/receiving.service.js';
import { PublicIdentitiesService } from '../../apps/api/src/public-identities.service.js';
import { encodeQr } from '@dayari/contracts';

const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local *_test required');
const originId=randomUUID(),password=randomUUID();let db:ReturnType<typeof database>,app:Awaited<ReturnType<typeof createApp>>;
let admin:string,manager:string,production:string,adminId:string,sourceId:string,product:any,receipt:any,job:any;
const post=(path:string,body:object,key=randomUUID(),token=admin)=>request(app.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+token).set('Idempotency-Key',key).send(body);
const get=(path:string,token=admin)=>request(app.getHttpServer()).get('/v1/'+path).set('Authorization','Bearer '+token);
const frozenTables=['Supplier','SupplierSource','SupplierLocationPrefix','Product','Variant','ProductSourcing','SupplierVariantSku','DeliveryBatch','Receipt','ReceiptLine','StockLot','StockTransaction','StockMovement','StockBalance','CommandResult','LabelPrintJob','LabelPrintJobLine','LabelPrintEvent'];
async function snapshot(client:Prisma.TransactionClient|PrismaClient){const data:Record<string,unknown>={};for(const t of frozenTables)data[t]=await client.$queryRawUnsafe(`SELECT to_jsonb(t)::text AS row FROM "${t}" t ORDER BY to_jsonb(t)::text COLLATE "C"`);return JSON.stringify(data);}
beforeAll(async()=>{
 db=database(url);await db.originNode.create({data:{id:originId,mode:'SHOP'}});app=await createApp(db,originId,'SHOP');
 for(const role of ['ADMIN','MANAGER','PRODUCTION'] as const){const u=await db.user.create({data:{email:`${role.toLowerCase()}-${originId}@identity.test`,name:role,role,passwordHash:passwordHash(password)}});const r=await request(app.getHttpServer()).post('/v1/sessions').send({email:u.email,password}).expect(200);if(role==='ADMIN'){admin=r.body.token;adminId=u.id;}else if(role==='MANAGER')manager=r.body.token;else production=r.body.token;}
 const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});
 sourceId=(await post('catalogue/supplier-setups',{supplier:{name:`Identity ${originId}`},location:{registryId:registry.id}}).expect(201)).body.source.id;
 product=(await post('catalogue/product-setups',{sourceId,product:{name:'Identity notebook'},variants:[{name:'Red',suffix:'RED',attributes:[{attribute:'Colour',value:'Red'}]}]}).expect(201)).body;
 receipt=(await post('receipts',{sourceId,deliveredOn:'2020-01-01',invoiceReference:'SECRET-INVOICE',lines:[{skuId:product.skus[0].id,usableQuantity:2,damagedQuantity:1,damageReason:'SECRET damaged covers on arrival'}]},randomUUID(),manager).expect(201)).body;
 job=(await post('label-print-jobs',{kind:'INITIAL',receiptId:receipt.id,profileId:'a4-70x35-v1'}).expect(201)).body;
 await post(`label-print-jobs/${job.id}/artifacts/0`,{}).expect(201);
});
afterAll(async()=>{await app?.close();await db?.$disconnect();});

it('allocates P/L atomically on every create path and replays exact identities without changing SKU allocation',async()=>{
 expect(product.product.productCode).toMatch(/^P[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);expect(receipt.lines[0].lotCode).toMatch(/^L[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
 const key=randomUUID(),body={name:'Direct identity product'};
 const [a,b]=await Promise.all([post('catalogue/products',body,key),post('catalogue/products',body,key)]);expect(a.status).toBe(201);expect(b.body).toEqual(a.body);expect(a.body.productCode).toMatch(/^P/);
 await post('catalogue/products',{name:'Changed'},key).expect(409);
 const setupKey=randomUUID(),setup={sourceId,product:{name:'Concurrent setup'},variants:[]};const results=await Promise.all([post('catalogue/product-setups',setup,setupKey),post('catalogue/product-setups',setup,setupKey)]);expect(results.map(r=>r.status)).toEqual([201,201]);expect(results[0].body).toEqual(results[1].body);
 const before=await db.productPublicIdentity.findUniqueOrThrow({where:{productId:product.id}});
 const extension=(await post('catalogue/product-setups',{sourceId,product:{id:product.id},extendVariants:true,variants:[{name:'Green',suffix:'GREEN',attributes:[{attribute:'Colour',value:'Green'}]}]}).expect(201)).body;
 expect(extension.product.productCode).toBe(before.code);expect(extension.sourcing.baseCode).toBe(product.sourcing.baseCode);expect(await db.productPublicIdentity.findUnique({where:{productId:product.id}})).toEqual(before);
 const rKey=randomUUID(),rBody={sourceId,deliveredOn:'2020-01-01',lines:[{skuId:product.skus[0].id,usableQuantity:0,damagedQuantity:2,damageReason:'Entire pack arrived damaged'}]};const [r1,r2]=await Promise.all([post('receipts',rBody,rKey,manager),post('receipts',rBody,rKey,manager)]);expect(r1.status).toBe(201);expect(r2.body).toEqual(r1.body);await post('receipts',{...rBody,deliveredOn:'2021-01-01'},rKey,manager).expect(409);
 const separate=(await post('receipts',rBody,randomUUID(),manager).expect(201)).body;expect(separate.lines[0].lotCode).not.toBe(r1.body.lines[0].lotCode);expect(separate.lines[0].lotId).not.toBe(r1.body.lines[0].lotId);
});

async function forcedProduct(draw:()=>string,origin=originId,omit=false,fail=false){return db.$transaction(async tx=>{
 await tx.$queryRaw`SELECT id FROM "OriginNode" WHERE id=${origin}::uuid FOR UPDATE`;
 const p=await tx.product.create({data:{name:'Collision fixture',originId:origin,variants:{create:{name:'Default',combinationKey:'',originId:origin}}}}),commandId=randomUUID();
 const code=omit?null:await allocatePublicIdentity(tx,'PRODUCT',p.id,origin,commandId,draw);
 if(fail)throw Error('Injected after identity allocation');
 const node=await tx.originNode.update({where:{id:origin},data:{nextSequence:{increment:1}}}),response={id:p.id,productCode:code};
 await tx.auditEvent.create({data:{originId:origin,actorId:adminId,actorRole:'ADMIN',commandId,action:'catalogue.products.created',subjectId:p.id,snapshot:response}});
 await tx.outboxEvent.create({data:{originId:origin,originSequence:node.nextSequence,actorId:adminId,commandId,eventType:'catalogue.products.created',aggregateId:p.id,payload:response,payloadHash:'fixture'}});
 await tx.commandResult.create({data:{id:commandId,originId:origin,actorId:adminId,commandType:'products',key:randomUUID(),requestHash:'fixture',response}});return response;
});}

it('handles real database candidate collisions/concurrent origin writers and preserves same short code at another origin',async()=>{
 const first=await forcedProduct(()=> 'P22222');let n=0;const second=await forcedProduct(()=>++n===1?'P22222':'P33333');expect(n).toBe(2);expect(second.productCode).toBe('P33333');
 let count=0;const before=await snapshot(db);await expect(forcedProduct(()=>{count++;return 'P22222';})).rejects.toThrow('CODE_ALLOCATION_BUSY');expect(count).toBe(32);expect(await snapshot(db)).toBe(before);
 const other=randomUUID();await db.originNode.create({data:{id:other,mode:'SHOP'}});const independent=await forcedProduct(()=> 'P22222',other);expect(independent.id).not.toBe(first.id);
 const local=(await get('inventory/products/by-code/P22222',production).expect(200)).body;expect(local.productId).toBe(first.id);await get(`inventory/products/by-code/P22222?originId=${other}`,production).expect(404);
 const foreignApp=await createApp(db,other,'SHOP');try{const r=await request(foreignApp.getHttpServer()).get('/v1/inventory/products/by-code/P22222').set('Authorization','Bearer '+production).expect(200);expect(r.body.productId).toBe(independent.id);}finally{await foreignApp.close();}
 let draw=0;const parallel=await Promise.all([forcedProduct(()=>++draw===1?'P44444':'P55555'),forcedProduct(()=>++draw===1?'P44444':'P55555')]);expect(new Set(parallel.map(x=>x.productCode)).size).toBe(2);
});

it('rejects missing mappings/stale creation paths, illegal changes and late failures with full rollback',async()=>{
 const before=await snapshot(db),node=await db.originNode.findUniqueOrThrow({where:{id:originId}});
 await expect(forcedProduct(()=> 'P66666',originId,true)).rejects.toThrow('requires public identity');
 await expect(forcedProduct(()=> 'P66666',originId,false,true)).rejects.toThrow('Injected');expect(await snapshot(db)).toBe(before);expect((await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence).toBe(node.nextSequence);
 await expect(db.product.create({data:{name:'Old direct writer',originId}})).rejects.toThrow('requires public identity');
 await expect(db.productPublicIdentity.update({where:{productId:product.id},data:{code:'P77777'}})).rejects.toThrow();await expect(db.productPublicIdentity.delete({where:{productId:product.id}})).rejects.toThrow();
 await expect(db.lotPublicIdentity.delete({where:{lotId:receipt.lines[0].lotId}})).rejects.toThrow();await expect(db.lotPublicIdentity.update({where:{lotId:receipt.lines[0].lotId},data:{originId:randomUUID()}})).rejects.toThrow();
 await expect(db.product.update({where:{id:product.id},data:{originId:randomUUID()}})).rejects.toThrow();expect(await snapshot(db)).toBe(before);
});

it('returns exact origin-scoped allowlisted identities and keeps reads, QR and printing stock-neutral',async()=>{
 const before=await snapshot(db),commands=await db.commandResult.count(),audits=await db.auditEvent.count(),outbox=await db.outboxEvent.count();
 for(const token of [admin,manager,production]){
  const p=(await get(`inventory/products/by-code/${product.product.productCode}`,token).expect(200)).body;expect(Object.keys(p).sort()).toEqual(['kind','originId','productId','productCode','productName','dataAsOf','originSequence'].sort());
  const l=(await get(`inventory/lots/by-code/${receipt.lines[0].lotCode}`,token).expect(200)).body;expect(l).toMatchObject({kind:'LOT',lotId:receipt.lines[0].lotId,usable:'2'});expect(JSON.stringify(l)).not.toContain('SECRET');
  expect(Object.keys(l).sort()).toEqual(['kind','originId','productId','productCode','productName','dataAsOf','originSequence','lotId','lotCode','skuId','fullSku','variantId','variantName','batchId','publicBatchCode','usable',...(token===production?[]:['damaged'])].sort());
 }
 await request(app.getHttpServer()).get(`/v1/inventory/lots/by-code/${receipt.lines[0].lotCode}`).expect(401);
 await get('inventory/products/by-code/P00000').expect(400);await get('inventory/products/by-code/PZZZZZ').expect(404);await get(`inventory/products/by-code/${product.product.productCode}?invoice=true`).expect(400);await get(`inventory/products/by-code/${product.product.productCode}?originId=bad`).expect(400);
 const q=(await post('qr/resolve',{payload:encodeQr(originId,receipt.lines[0].lotId)},randomUUID(),production).expect(200)).body;expect(q.productCode).toBe(product.product.productCode);expect(q.lotCode).toBe(receipt.lines[0].lotCode);
 await get(`label-print-jobs/${job.id}`,production).expect(403);expect(await snapshot(db)).toBe(before);expect(await db.commandResult.count()).toBe(commands);expect(await db.auditEvent.count()).toBe(audits);expect(await db.outboxEvent.count()).toBe(outbox);
});

it('rolls new lot identities back with a late receiving failure and rejects forged mappings',async()=>{
 const before=await snapshot(db),identities=await db.lotPublicIdentity.count(),node=await db.originNode.findUniqueOrThrow({where:{id:originId}});
 const extended=db.$extends({query:{auditEvent:{async create(){throw Error('Forced identity receipt audit failure');}}}});
 const actor=await db.user.findUniqueOrThrow({where:{id:adminId}});
 await expect(new ReceivingService(extended as unknown as PrismaClient,originId,'SHOP').create(actor,randomUUID(),{sourceId,deliveredOn:'2020-01-01',lines:[{skuId:product.skus[0].id,usableQuantity:5,damagedQuantity:0}]})).rejects.toThrow('Forced identity receipt audit failure');
 expect(await snapshot(db)).toBe(before);expect(await db.lotPublicIdentity.count()).toBe(identities);expect((await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence).toBe(node.nextSequence);
 const prior=await db.productPublicIdentity.findUniqueOrThrow({where:{productId:product.id}});
 await expect(db.productPublicIdentity.create({data:{productId:randomUUID(),originId,code:'P88888',commandId:prior.commandId}})).rejects.toThrow();
 for(const code of [prior.code,'P00000'])await expect(forcedProduct(()=>code)).rejects.toThrow();
 const foreign=await db.originNode.findFirstOrThrow({where:{id:{not:originId},mode:'SHOP'}});
 await expect(db.$transaction(async tx=>{const p=await tx.product.create({data:{name:'Forged origin',originId}});await tx.productPublicIdentity.create({data:{productId:p.id,originId:foreign.id,code:'P99999',commandId:prior.commandId}});})).rejects.toThrow();
 expect(await snapshot(db)).toBe(before);
});

it('denies inactive users and bounds exact-lookup requests without creating metadata',async()=>{
 const actor=await db.user.findUniqueOrThrow({where:{id:adminId}}),service=new PublicIdentitiesService(db,originId),before=await db.commandResult.count();
 await expect(service.lookup({...actor,active:false},'PRODUCT',product.product.productCode,{})).rejects.toThrow();
 for(let i=0;i<120;i++)await service.lookup(actor,'PRODUCT',product.product.productCode,{});
 await expect(service.lookup(actor,'PRODUCT',product.product.productCode,{})).rejects.toThrow('RATE_LIMITED');expect(await db.commandResult.count()).toBe(before);
});

it('rehearses legacy migration and resumable mapping backfill without touching old ledger, commands or PDF bytes',async()=>{
 const pg=new Client({connectionString:url});await pg.connect();const schema='identity_rehearsal_'+randomUUID().replaceAll('-','');let isolated:PrismaClient|undefined;
 try{
  await pg.query(`CREATE SCHEMA "${schema}"`);await pg.query(`SET search_path TO "${schema}", public`);
  const migrations=(await readdir('prisma/migrations')).filter(n=>/^2026/.test(n)).sort();
  for(const name of migrations.filter(n=>n<'202611030007'))await pg.query(await readFile(`prisma/migrations/${name}/migration.sql`,'utf8'));
  await pg.query('BEGIN');
  await pg.query(`INSERT INTO "OriginNode" SELECT * FROM public."OriginNode" WHERE id=$1`,[originId]);
  await pg.query(`INSERT INTO "User" SELECT id,email,name,role::text::"Role","passwordHash",active,"createdAt" FROM public."User" WHERE email LIKE $1`,['%'+originId+'%']);
  const direct=['Supplier','SourceLocation','SupplierSource','SupplierLocationPrefix','Product','Attribute','AttributeValue','Variant','ProductSourcing','SupplierVariantSku','CommandResult','AuditEvent','OutboxEvent','DeliveryBatch','StockTransaction'];
  // Registry LG was seeded by003; all other rows are this test's synthetic origin.
  for(const t of direct){
   const columns=(await pg.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',[schema,t])).rows.map((r:any)=>r.column_name as string);
   const expressions=columns.map((c:string)=>c==='actorRole'?`"${c}"::text::"Role"`:`"${c}"`).join(',');
   await pg.query(`INSERT INTO "${t}" SELECT ${expressions} FROM public."${t}" WHERE "originId"=$1`,[originId]);
  }
  await pg.query(`INSERT INTO "VariantSelection" SELECT s.* FROM public."VariantSelection" s JOIN "Variant" v ON v.id=s."variantId"`);
  for(const t of ['Receipt','StockLot','ReceiptLine','StockMovement']){
   const cols=(await pg.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND is_generated='NEVER' ORDER BY ordinal_position",[schema,t])).rows.map((r:any)=>r.column_name as string);
   await pg.query(`INSERT INTO "${t}" (${cols.map((c:string)=>`"${c}"`).join(',')}) SELECT ${cols.map((c:string)=>`x."${c}"`).join(',')} FROM public."${t}" x JOIN "DeliveryBatch" b ON b.id=x."batchId"`);
  }
  await pg.query(`INSERT INTO "StockBalance" SELECT x.* FROM public."StockBalance" x JOIN "StockLot" l ON l.id=x."lotId"`);
  for(const t of ['LabelPrintJob','LabelPrintEvent'])await pg.query(`INSERT INTO "${t}" SELECT * FROM public."${t}" WHERE "originId"=$1`,[originId]);
  await pg.query(`INSERT INTO "LabelPrintJobLine" SELECT x.* FROM public."LabelPrintJobLine" x JOIN "LabelPrintJob" j ON j.id=x."jobId"`);
  await pg.query('COMMIT');
  const legacy=await pg.query('SELECT count(*)::int AS n FROM "StockLot"');expect(legacy.rows[0].n).toBeGreaterThan(0);
  for(const name of migrations.filter(n=>n>='202611030007'))await pg.query(await readFile(`prisma/migrations/${name}/migration.sql`,'utf8'));
  isolated=new PrismaClient({adapter:new PrismaPg({connectionString:url,options:`-c search_path=${schema},public`},{schema})});
  expect(await isolated.productPublicIdentity.count()).toBe(0);expect(await isolated.lotPublicIdentity.count()).toBe(0);
  const before=await snapshot(isolated),actor=await isolated.user.findUniqueOrThrow({where:{id:adminId}}),labels=new LabelsService(isolated,originId,'SHOP');
  const pdfBefore=(await labels.pdf(actor,job.id,'0')).bytes;const qr=encodeQr(originId,receipt.lines[0].lotId);
  const legacyLookup=await labels.resolve(actor,{payload:qr});expect(legacyLookup.productCode).toBeNull();expect(legacyLookup.lotCode).toBeNull();
  const originalTx=await isolated.stockTransaction.findUniqueOrThrow({where:{id:(await isolated.receipt.findUniqueOrThrow({where:{id:receipt.id}})).transactionId}});
  const oldCommand=await isolated.commandResult.findUniqueOrThrow({where:{id:originalTx.commandId}}),oldActor=await isolated.user.findUniqueOrThrow({where:{id:oldCommand.actorId}});
  const oldReplay=await new ReceivingService(isolated,originId,'SHOP').create(oldActor,oldCommand.key,{sourceId,deliveredOn:'2020-01-01',invoiceReference:'SECRET-INVOICE',lines:[{skuId:product.skus[0].id,usableQuantity:2,damagedQuantity:1,damageReason:'SECRET damaged covers on arrival'}]});
  expect(oldReplay).toEqual(oldCommand.response);expect(await isolated.lotPublicIdentity.count()).toBe(0);expect(await isolated.productPublicIdentity.count()).toBe(0);
  const counts=await isolated.commandResult.count();const plan=await planIdentityBackfill(isolated,'isolated-fixture',originId,adminId,'PRODUCT',1);expect(plan.ids).toHaveLength(1);expect(await isolated.commandResult.count()).toBe(counts);expect(await isolated.productPublicIdentity.count()).toBe(0);
  const [one,replay]=await Promise.all([applyIdentityBackfill(isolated,'isolated-fixture',plan),applyIdentityBackfill(isolated,'isolated-fixture',plan)]);expect(replay).toEqual(one);
  await expect(applyIdentityBackfill(isolated,'isolated-fixture',{...plan,kind:'LOT'})).rejects.toThrow('Idempotency');
  for(const kind of ['PRODUCT','LOT'] as const){for(;;){const p=await planIdentityBackfill(isolated,'isolated-fixture',originId,adminId,kind,2);if(!p.ids.length)break;await applyIdentityBackfill(isolated,'isolated-fixture',p);}}
  expect(await isolated.productPublicIdentity.count()).toBe(await isolated.product.count());expect(await isolated.lotPublicIdentity.count()).toBe(await isolated.stockLot.count());
  // Compare old command rows separately; the only added commands are audited identity.backfill metadata.
  const oldCommands=await isolated.commandResult.findMany({where:{commandType:{not:'identity.backfill'}},orderBy:{id:'asc'}});const originalCommands=await db.commandResult.findMany({where:{originId},orderBy:{id:'asc'}});expect(oldCommands).toEqual(originalCommands);
  const after=JSON.parse(await snapshot(isolated)),baseline=JSON.parse(before);delete after.CommandResult;delete baseline.CommandResult;expect(after).toEqual(baseline);
  const pdfAfter=(await labels.pdf(actor,job.id,'0')).bytes;expect(pdfAfter.equals(pdfBefore)).toBe(true);expect(encodeQr(originId,receipt.lines[0].lotId)).toBe(qr);
  await mkdir('test-results/phase-1',{recursive:true});await writeFile('test-results/phase-1/backfill-rehearsal.json',JSON.stringify({isolatedFixturesOnly:true,legacyLots:legacy.rows[0].n,products:await isolated.product.count(),lotMappings:await isolated.lotPublicIdentity.count(),oldRowsUnchanged:true,originalCommandsUnchanged:true,qrUnchanged:true,pdfSha256:createHash('sha256').update(pdfAfter).digest('hex'),pdfByteIdentical:true},null,2));
 }finally{await isolated?.$disconnect();await pg.query('ROLLBACK');await pg.query('SET search_path TO public');await pg.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pg.end();}
},60000);
