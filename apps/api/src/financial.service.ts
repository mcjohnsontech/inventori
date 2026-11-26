import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { financialQuerySchema, sellingPriceSchema, productPriceSchema, purchaseCostEntrySchema, missingCostsQuerySchema, idempotencyKeySchema, lagosDate, valueInventory, LIST_PAGE_SIZE, type Capability, type FinancialLot, type FinancialReport, type PricePoint, type MissingCostLine, type MissingCostsPage, type ProductPrices, type PurchaseCostEntryResult } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { canonical, digest } from './security.js';
export async function hasFinancialSchema(db:Prisma.TransactionClient){const [row]=await db.$queryRaw<{ready:boolean}[]>`SELECT to_regclass('"PurchaseCost"') IS NOT NULL AND to_regclass('"SellingPrice"') IS NOT NULL AS ready`;return row!.ready;}
/** Migration 036 (owner decisions 26 Nov 2026): product prices, variant overrides and later Admin costs. */
export async function hasPricingUpgrade(db:Prisma.TransactionClient){const [row]=await db.$queryRaw<{ready:boolean}[]>`SELECT to_regclass('"ProductSellingPrice"') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='PurchaseCost' AND column_name='enteredLater') AS ready`;return row!.ready;}
function parse<T>(schema:{safeParse:(v:unknown)=>{success:boolean;data?:T;error?:{issues:{message:string}[]}}},v:unknown):T {const r=schema.safeParse(v);if(!r.success)throw new BadRequestException(r.error!.issues.map(i=>i.message).join('. '));return r.data!;}
type Tx=Prisma.TransactionClient;
type CommandContext={tx:Tx;actor:User;commandId:string;sequence:bigint};
export class FinancialService {
 constructor(readonly db:PrismaClient,readonly originId:string,readonly mode:string){}
 private async ready(user:User,capability:Capability='FINANCIAL_READ'){
  requireCapability(user,capability);
  if(!await hasFinancialSchema(this.db)||!await hasPricingUpgrade(this.db))throw new ServiceUnavailableException('Pricing requires the separately approved financial database upgrade.');
 }
 /**
  * One Admin money command: shop lock, fresh actor check, idempotent replay, then the
  * caller's append-only insert, followed by audit, outbox and command result together.
  */
 private async command<R extends object>(user:User,keyInput:unknown,data:object,commandType:string,capability:Capability,run:(context:CommandContext)=>Promise<{subjectId:string;response:R;payload?:object}>):Promise<R>{
  await this.ready(user,capability);if(this.mode!=='SHOP')throw new ForbiddenException('Prices and costs can only be changed on the shop server.');
  const key=parse<string>(idempotencyKeySchema,keyInput),hash=digest(canonical(data));
  try{
   return await this.db.$transaction(async tx=>{
    const nodes=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "OriginNode" WHERE id=${this.originId}::uuid AND mode='SHOP' FOR UPDATE`;
    if(!nodes.length)throw new ForbiddenException('This shop server hasn’t been set up yet.');
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;
    const actor=await tx.user.findUniqueOrThrow({where:{id:user.id}});requireCapability(actor,capability);
    if(actor.authVersion!==user.authVersion||(await tx.shopMembership.findUnique({where:{userId:user.id}}))?.originId!==this.originId)throw new ForbiddenException();
    const prior=await tx.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:this.originId,actorId:user.id,commandType,key}}});
    if(prior){if(prior.requestHash!==hash)throw new ConflictException('Idempotency key reused with a different request');return prior.response as R;}
    const commandId=randomUUID(),node=await tx.originNode.update({where:{id:this.originId},data:{nextSequence:{increment:1}}});
    const {subjectId,response,payload:extra}=await run({tx,actor,commandId,sequence:node.nextSequence});
    const payload={...response,...extra,actorId:user.id,actorRole:actor.role,commandId};
    await tx.auditEvent.create({data:{originId:this.originId,actorId:user.id,actorRole:actor.role,commandId,action:commandType,subjectId,snapshot:payload}});
    await tx.outboxEvent.create({data:{originId:this.originId,originSequence:node.nextSequence,eventType:commandType,aggregateId:subjectId,commandId,actorId:user.id,payload,payloadHash:digest(canonical(payload))}});
    await tx.commandResult.create({data:{id:commandId,originId:this.originId,actorId:user.id,commandType,key,requestHash:hash,response:response as Prisma.InputJsonValue}});
    return response;
   },{timeout:15000,maxWait:10000});
  }catch(error){
   if(error instanceof Prisma.PrismaClientKnownRequestError&&['P2002','P2010'].includes(error.code)&&/PurchaseCost_pkey|duplicate key/.test(String(error.meta?.driverAdapterError??error.message)))throw new ConflictException('This delivery line already has a cost. Refresh the list.');
   throw error;
  }
 }
 /** Variant's own price, or (amount null) removal of that override. */
 async setPrice(user:User,keyInput:unknown,input:unknown){
  const data=parse<import('zod').infer<typeof sellingPriceSchema>>(sellingPriceSchema,input);
  return this.command(user,keyInput,data,'financial.selling-price','SELLING_PRICE_WRITE',async({tx,commandId,sequence})=>{
   if(!await tx.variant.findFirst({where:{id:data.variantId,originId:this.originId}}))throw new BadRequestException('Choose a variant from this shop');
   const [last]=await tx.$queryRaw<{id:string;amount:string|null}[]>`SELECT id,amount::text AS amount FROM "SellingPrice" WHERE "originId"=${this.originId}::uuid AND "variantId"=${data.variantId}::uuid ORDER BY "originSequence" DESC LIMIT 1`;
   if((last?.id??null)!==data.previousPriceId)throw new ConflictException('Selling price changed. Refresh and review the latest price.');
   if(data.amount===null&&last?.amount==null)throw new BadRequestException('This option has no price of its own to remove.');
   const id=randomUUID();
   const [row]=await tx.$queryRaw<{amount:string|null;recordedAt:Date}[]>`INSERT INTO "SellingPrice" (id,"originId","variantId",amount,currency,reason,"previousPriceId","commandId","actorId","originSequence","recordedAt") VALUES (${id}::uuid,${this.originId}::uuid,${data.variantId}::uuid,${data.amount}::numeric,'NGN',${data.reason},${data.previousPriceId}::uuid,${commandId}::uuid,${user.id}::uuid,${sequence},clock_timestamp()) RETURNING amount::text,"recordedAt"`;
   return {subjectId:id,response:{id,variantId:data.variantId,amount:row!.amount,currency:'NGN',recordedAt:row!.recordedAt.toISOString()},payload:{reason:data.reason,previousPriceId:data.previousPriceId}};
  });
 }
 /** One price per product; covers every variant without a price of its own. */
 async setProductPrice(user:User,keyInput:unknown,input:unknown){
  const data=parse<import('zod').infer<typeof productPriceSchema>>(productPriceSchema,input);
  return this.command(user,keyInput,data,'financial.product-price','SELLING_PRICE_WRITE',async({tx,commandId,sequence})=>{
   if(!await tx.product.findFirst({where:{id:data.productId,originId:this.originId}}))throw new BadRequestException('Choose a product from this shop');
   const [last]=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "ProductSellingPrice" WHERE "originId"=${this.originId}::uuid AND "productId"=${data.productId}::uuid ORDER BY "originSequence" DESC LIMIT 1`;
   if((last?.id??null)!==data.previousPriceId)throw new ConflictException('Selling price changed. Refresh and review the latest price.');
   const id=randomUUID();
   const [row]=await tx.$queryRaw<{amount:string;recordedAt:Date}[]>`INSERT INTO "ProductSellingPrice" (id,"originId","productId",amount,currency,reason,"previousPriceId","commandId","actorId","originSequence","recordedAt") VALUES (${id}::uuid,${this.originId}::uuid,${data.productId}::uuid,${data.amount}::numeric,'NGN',${data.reason},${data.previousPriceId}::uuid,${commandId}::uuid,${user.id}::uuid,${sequence},clock_timestamp()) RETURNING amount::text,"recordedAt"`;
   return {subjectId:id,response:{id,productId:data.productId,amount:row!.amount,currency:'NGN',recordedAt:row!.recordedAt.toISOString()},payload:{reason:data.reason,previousPriceId:data.previousPriceId}};
  });
 }
 /** Admin adds the purchase cost for a delivery line received without one. */
 async addPurchaseCost(user:User,keyInput:unknown,input:unknown):Promise<PurchaseCostEntryResult>{
  const data=parse<import('zod').infer<typeof purchaseCostEntrySchema>>(purchaseCostEntrySchema,input);
  return this.command(user,keyInput,data,'financial.purchase-cost','PURCHASE_COST_WRITE',async({tx,commandId,sequence})=>{
   const [line]=await tx.$queryRaw<{id:string}[]>`SELECT rl.id FROM "ReceiptLine" rl JOIN "DeliveryBatch" b ON b.id=rl."batchId" WHERE rl.id=${data.receiptLineId}::uuid AND b."originId"=${this.originId}::uuid FOR SHARE OF rl`;
   if(!line)throw new NotFoundException('Delivery line not found in this shop');
   if(await tx.purchaseCost.findUnique({where:{receiptLineId:data.receiptLineId}}))throw new ConflictException('This delivery line already has a cost. Refresh the list.');
   const [row]=await tx.$queryRaw<{amount:string;recordedAt:Date}[]>`INSERT INTO "PurchaseCost" ("receiptLineId","originId",amount,currency,"zeroReason","commandId","actorId","recordedAt","enteredLater","originSequence") VALUES (${data.receiptLineId}::uuid,${this.originId}::uuid,${data.amount}::numeric,'NGN',${data.zeroReason},${commandId}::uuid,${user.id}::uuid,clock_timestamp(),true,${sequence}) RETURNING amount::text,"recordedAt"`;
   return {subjectId:data.receiptLineId,response:{receiptLineId:data.receiptLineId,amount:row!.amount,currency:'NGN' as const,zeroReason:data.zeroReason,recordedAt:row!.recordedAt.toISOString()}};
  });
 }
 /** Delivery lines still without a cost, newest first, with the variant's last known cost to prefill. */
 async missingCosts(user:User,input:unknown):Promise<MissingCostsPage>{
  await this.ready(user,'PURCHASE_COST_WRITE');const q=parse<{page:number}>(missingCostsQuerySchema,input??{});
  return this.db.$transaction(async tx=>{
   const where=Prisma.sql`b."originId"=${this.originId}::uuid AND NOT EXISTS(SELECT 1 FROM "PurchaseCost" c WHERE c."receiptLineId"=rl.id)`;
   const [count]=await tx.$queryRaw<{n:bigint}[]>(Prisma.sql`SELECT count(*) AS n FROM "ReceiptLine" rl JOIN "DeliveryBatch" b ON b.id=rl."batchId" WHERE ${where}`);
   const rows=await tx.$queryRaw<MissingCostLine[]>(Prisma.sql`
    SELECT rl.id AS "receiptLineId",rl."receiptId",b."publicCode" AS "batchCode",to_char(b."deliveredOn",'YYYY-MM-DD') AS "deliveredOn",b."acceptedAt"::text AS "acceptedAt",
     sup.name AS "supplierName",p.name AS "productName",v.name AS "variantName",s."fullCode",rl."totalQuantity"::text AS "receivedQuantity",
     (SELECT c2.amount::text FROM "PurchaseCost" c2 JOIN "ReceiptLine" rl2 ON rl2.id=c2."receiptLineId" JOIN "SupplierVariantSku" s2 ON s2.id=rl2."skuId"
       WHERE s2."variantId"=s."variantId" AND c2."originId"=b."originId" ORDER BY c2."recordedAt" DESC LIMIT 1) AS "lastCost"
    FROM "ReceiptLine" rl JOIN "DeliveryBatch" b ON b.id=rl."batchId" JOIN "Receipt" r ON r.id=rl."receiptId"
    JOIN "SupplierVariantSku" s ON s.id=rl."skuId" JOIN "Variant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=s."productId"
    JOIN "SupplierSource" src ON src.id=r."sourceId" JOIN "Supplier" sup ON sup.id=src."supplierId"
    WHERE ${where} ORDER BY b."acceptedAt" DESC,rl."lineNumber" LIMIT ${LIST_PAGE_SIZE} OFFSET ${(q.page-1)*LIST_PAGE_SIZE}`);
   return {total:Number(count!.n),page:q.page,pageSize:LIST_PAGE_SIZE,rows};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 /** Current product price and each variant's own or inherited price. */
 async productPrices(user:User,productInput:string):Promise<ProductPrices>{
  await this.ready(user);const productId=parse<string>(idempotencyKeySchema,productInput);
  return this.db.$transaction(async tx=>{
   const product=await tx.product.findFirst({where:{id:productId,originId:this.originId},select:{id:true}});
   if(!product)throw new NotFoundException('Product not found');
   const [productPrice]=await tx.$queryRaw<{id:string;amount:string;recordedAt:Date}[]>`SELECT id,amount::text AS amount,"recordedAt" FROM "ProductSellingPrice" WHERE "originId"=${this.originId}::uuid AND "productId"=${productId}::uuid ORDER BY "originSequence" DESC LIMIT 1`;
   const variants=await tx.$queryRaw<{variantId:string;name:string;latestRowId:string|null;ownPrice:string|null}[]>`
    SELECT v.id AS "variantId",v.name,own.id AS "latestRowId",own.amount::text AS "ownPrice" FROM "Variant" v
    LEFT JOIN LATERAL(SELECT sp.id,sp.amount FROM "SellingPrice" sp WHERE sp."variantId"=v.id AND sp."originId"=${this.originId}::uuid ORDER BY sp."originSequence" DESC LIMIT 1) own ON true
    WHERE v."productId"=${productId}::uuid AND v."originId"=${this.originId}::uuid ORDER BY v.name,v.id`;
   return {productId,productPrice:productPrice?{id:productPrice.id,amount:productPrice.amount,recordedAt:productPrice.recordedAt.toISOString()}:null,
    variants:variants.map(v=>({...v,effectivePrice:v.ownPrice??productPrice?.amount??null}))};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 async report(user:User,input:unknown):Promise<FinancialReport>{
  await this.ready(user);const q=parse<import('zod').infer<typeof financialQuerySchema>>(financialQuerySchema,input);
  if(q.to&&q.to>lagosDate()||q.from&&q.from>lagosDate())throw new BadRequestException('Financial report dates cannot be in the future');
  return this.db.$transaction(async tx=>{
   const [clock]=await tx.$queryRaw<{now:Date}[]>`SELECT statement_timestamp() AS now`;
   const cutoff=q.to?Prisma.sql`LEAST(${clock!.now}::timestamptz,((${q.to}::date+1)::timestamp AT TIME ZONE 'Africa/Lagos'))`:Prisma.sql`${clock!.now}::timestamptz`;
   const scope=Prisma.sql`l."originId"=${this.originId}::uuid ${q.productId?Prisma.sql`AND s."productId"=${q.productId}::uuid`:Prisma.empty} ${q.variantId?Prisma.sql`AND s."variantId"=${q.variantId}::uuid`:Prisma.empty} ${q.supplierId?Prisma.sql`AND sup.id=${q.supplierId}::uuid`:Prisma.empty} ${q.lotId?Prisma.sql`AND l.id=${q.lotId}::uuid`:Prisma.empty}`;
   // One row per lot. Ledger quantities are authoritative for BOTH legacy and serialized lots;
   // StockUnit rows are never added to the same quantities. A cost entered later counts from
   // when it was entered, so earlier reports are reproducible. The selling price is the
   // variant's own price if it has one, otherwise the product price (owner decision 26 Nov 2026).
   const lots=await tx.$queryRaw<FinancialLot[]>(Prisma.sql`
    SELECT l.id AS "lotId",li.code AS "lotCode",rl.id AS "receiptLineId",r.id AS "receiptId",s.id AS "skuId",s."fullCode",p.id AS "productId",p.name AS "productName",v.id AS "variantId",v.name AS "variantName",sup.id AS "supplierId",sup.name AS "supplierName",b."publicCode" AS "batchCode",to_char(b."deliveredOn",'YYYY-MM-DD') AS "deliveredOn",b."acceptedAt"::text AS "acceptedAt",
    coalesce(bal.u,0)::text AS usable,coalesce(bal.d,0)::text AS damaged,c.amount::text AS "unitCost",c."zeroReason",coalesce(c."enteredLater",false) AS "costEnteredLater",
    coalesce(vp.amount,pp.amount)::text AS "sellingPrice",CASE WHEN vp.amount IS NOT NULL THEN 'VARIANT' WHEN pp.amount IS NOT NULL THEN 'PRODUCT' END AS "priceSource"
    FROM "StockLot" l JOIN "ReceiptLine" rl ON rl."lotId"=l.id JOIN "Receipt" r ON r.id=rl."receiptId" JOIN "DeliveryBatch" b ON b.id=l."batchId"
    JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "Variant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=s."productId"
    JOIN "SupplierSource" src ON src.id=l."sourceId" JOIN "Supplier" sup ON sup.id=src."supplierId" LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id
    LEFT JOIN "PurchaseCost" c ON c."receiptLineId"=rl.id AND c."recordedAt"<${cutoff}
    LEFT JOIN LATERAL(SELECT sum((CASE WHEN m."toState"='U' THEN m.quantity ELSE 0 END)-(CASE WHEN m."fromState"='U' THEN m.quantity ELSE 0 END)) AS u,
    sum((CASE WHEN m."toState"='D' THEN m.quantity ELSE 0 END)-(CASE WHEN m."fromState"='D' THEN m.quantity ELSE 0 END)) AS d
    FROM "StockMovement" m JOIN "StockTransaction" t ON t.id=m."transactionId" WHERE m."lotId"=l.id AND t."recordedAt"<${cutoff}) bal ON true
    LEFT JOIN LATERAL(SELECT amount FROM "SellingPrice" sp WHERE sp."variantId"=v.id AND sp."originId"=l."originId" AND sp."recordedAt"<${cutoff} ORDER BY sp."originSequence" DESC LIMIT 1) vp ON true
    LEFT JOIN LATERAL(SELECT amount FROM "ProductSellingPrice" pr WHERE pr."productId"=p.id AND pr."originId"=l."originId" AND pr."recordedAt"<${cutoff} ORDER BY pr."originSequence" DESC LIMIT 1) pp ON true
    WHERE ${scope} AND b."acceptedAt"<${cutoff} ORDER BY b."acceptedAt" DESC,l.id`);
   const inScope=(q.supplierId||q.lotId)?Prisma.sql`SELECT s."variantId",s."productId" FROM "StockLot" l JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "SupplierSource" src ON src.id=l."sourceId" JOIN "Supplier" sup ON sup.id=src."supplierId" WHERE ${scope}`:null;
   const priceHistory=await tx.$queryRaw<PricePoint[]>(Prisma.sql`
    WITH h AS (
     SELECT sp.id,'VARIANT' AS scope,sp."variantId",v."productId",v.name AS "variantName",sp.amount,sp.currency,sp.reason,sp."recordedAt",sp."actorId",sp."originSequence",sp."originId" FROM "SellingPrice" sp JOIN "Variant" v ON v.id=sp."variantId"
     UNION ALL
     SELECT pr.id,'PRODUCT',NULL,pr."productId",NULL,pr.amount,pr.currency,pr.reason,pr."recordedAt",pr."actorId",pr."originSequence",pr."originId" FROM "ProductSellingPrice" pr)
    SELECT h.id,h.scope,h."variantId",h."productId",p.name AS "productName",h."variantName",h.amount::text AS amount,h.currency,h.reason,h."recordedAt"::text AS "recordedAt",u.name AS "actorName"
    FROM h JOIN "Product" p ON p.id=h."productId" JOIN "User" u ON u.id=h."actorId"
    WHERE h."originId"=${this.originId}::uuid AND h."recordedAt"<${cutoff} ${q.from?Prisma.sql`AND h."recordedAt">=(${q.from}::date::timestamp AT TIME ZONE 'Africa/Lagos')`:Prisma.empty}
    ${q.productId?Prisma.sql`AND h."productId"=${q.productId}::uuid`:Prisma.empty}
    ${q.variantId?Prisma.sql`AND (h."variantId"=${q.variantId}::uuid OR (h.scope='PRODUCT' AND h."productId"=(SELECT "productId" FROM "Variant" WHERE id=${q.variantId}::uuid)))`:Prisma.empty}
    ${inScope?Prisma.sql`AND (h."variantId" IN (SELECT "variantId" FROM (${inScope}) x) OR (h.scope='PRODUCT' AND h."productId" IN (SELECT "productId" FROM (${inScope}) y)))`:Prisma.empty}
    ORDER BY h."originSequence" DESC`);
   const received=await tx.receiptLine.findMany({where:{id:{in:lots.map(l=>l.receiptLineId)}},select:{id:true,totalQuantity:true}});
   const fromTime=q.from?new Date(`${q.from}T00:00:00+01:00`).getTime():0;
   const purchaseHistory=lots.filter(l=>new Date(l.acceptedAt).getTime()>=fromTime).map(l=>({...l,receivedQuantity:received.find(r=>r.id===l.receiptLineId)!.totalQuantity.toString()}));
   const [end]=await tx.$queryRaw<{end:Date}[]>(Prisma.sql`SELECT ${cutoff} AS "end"`);
   return {asOf:clock!.now.toISOString(),cutoff:end!.end.toISOString(),currency:'NGN',lots,summary:valueInventory(lots),priceHistory,purchaseHistory};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000,maxWait:10000});
 }
}
