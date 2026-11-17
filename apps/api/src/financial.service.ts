import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { financialQuerySchema, sellingPriceSchema, idempotencyKeySchema, lagosDate, valueInventory, type FinancialLot, type FinancialReport, type PricePoint } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { canonical, digest } from './security.js';
export async function hasFinancialSchema(db:Prisma.TransactionClient){const [row]=await db.$queryRaw<{ready:boolean}[]>`SELECT to_regclass('"PurchaseCost"') IS NOT NULL AND to_regclass('"SellingPrice"') IS NOT NULL AS ready`;return row!.ready;}
function parse<T>(schema:{safeParse:(v:unknown)=>{success:boolean;data?:T;error?:{issues:{message:string}[]}}},v:unknown):T {const r=schema.safeParse(v);if(!r.success)throw new BadRequestException(r.error!.issues.map(i=>i.message).join('. '));return r.data!;}
export class FinancialService {
 constructor(readonly db:PrismaClient,readonly originId:string,readonly mode:string){}
 private async ready(user:User,write=false){requireCapability(user,write?'SELLING_PRICE_WRITE':'FINANCIAL_READ');if(!await hasFinancialSchema(this.db))throw new ServiceUnavailableException('Pricing requires the separately approved financial database upgrade.');}
 async setPrice(user:User,keyInput:unknown,input:unknown){
  await this.ready(user,true);if(this.mode!=='SHOP')throw new ForbiddenException('Pricing belongs to the shop authority');
  const key=parse<string>(idempotencyKeySchema,keyInput),data=parse<import('zod').infer<typeof sellingPriceSchema>>(sellingPriceSchema,input),hash=digest(canonical(data)),commandType='financial.selling-price';
  return this.db.$transaction(async tx=>{
   const nodes=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "OriginNode" WHERE id=${this.originId}::uuid AND mode='SHOP' FOR UPDATE`;
   if(!nodes.length)throw new ForbiddenException('Shop origin is not provisioned');
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;
   const current=await tx.user.findUniqueOrThrow({where:{id:user.id}});requireCapability(current,'SELLING_PRICE_WRITE');
   if(current.authVersion!==user.authVersion||(await tx.shopMembership.findUnique({where:{userId:user.id}}))?.originId!==this.originId)throw new ForbiddenException();
   const prior=await tx.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:this.originId,actorId:user.id,commandType,key}}});
   if(prior){if(prior.requestHash!==hash)throw new ConflictException('Idempotency key reused with different price');return prior.response;}
   if(!await tx.variant.findFirst({where:{id:data.variantId,originId:this.originId}}))throw new BadRequestException('Choose a variant from this shop');
   const [last]=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "SellingPrice" WHERE "originId"=${this.originId}::uuid AND "variantId"=${data.variantId}::uuid ORDER BY "originSequence" DESC LIMIT 1`;
   if((last?.id??null)!==data.previousPriceId)throw new ConflictException('Selling price changed. Refresh and review the latest price.');
   const id=randomUUID(),commandId=randomUUID(),node=await tx.originNode.update({where:{id:this.originId},data:{nextSequence:{increment:1}}});
   const [row]=await tx.$queryRaw<{id:string;amount:string;recordedAt:Date}[]>`INSERT INTO "SellingPrice" (id,"originId","variantId",amount,currency,reason,"previousPriceId","commandId","actorId","originSequence","recordedAt") VALUES (${id}::uuid,${this.originId}::uuid,${data.variantId}::uuid,${data.amount}::numeric,'NGN',${data.reason},${data.previousPriceId}::uuid,${commandId}::uuid,${user.id}::uuid,${node.nextSequence},clock_timestamp()) RETURNING id,amount::text,"recordedAt"`;
   const response={id,variantId:data.variantId,amount:row!.amount,currency:'NGN',recordedAt:row!.recordedAt.toISOString()},payload={...response,reason:data.reason,previousPriceId:data.previousPriceId,actorId:user.id,actorRole:current.role,commandId};
   await tx.auditEvent.create({data:{originId:this.originId,actorId:user.id,actorRole:current.role,commandId,action:commandType,subjectId:id,snapshot:payload}});
   await tx.outboxEvent.create({data:{originId:this.originId,originSequence:node.nextSequence,eventType:commandType,aggregateId:id,commandId,actorId:user.id,payload,payloadHash:digest(canonical(payload))}});
   await tx.commandResult.create({data:{id:commandId,originId:this.originId,actorId:user.id,commandType,key,requestHash:hash,response}});
   return response;
  },{timeout:15000,maxWait:10000});
 }
 async report(user:User,input:unknown):Promise<FinancialReport>{
  await this.ready(user);const q=parse<import('zod').infer<typeof financialQuerySchema>>(financialQuerySchema,input);
  if(q.to&&q.to>lagosDate()||q.from&&q.from>lagosDate())throw new BadRequestException('Financial report dates cannot be in the future');
  return this.db.$transaction(async tx=>{
   const [clock]=await tx.$queryRaw<{now:Date}[]>`SELECT statement_timestamp() AS now`;
   const cutoff=q.to?Prisma.sql`LEAST(${clock!.now}::timestamptz,((${q.to}::date+1)::timestamp AT TIME ZONE 'Africa/Lagos'))`:Prisma.sql`${clock!.now}::timestamptz`;
   const scope=Prisma.sql`l."originId"=${this.originId}::uuid ${q.productId?Prisma.sql`AND s."productId"=${q.productId}::uuid`:Prisma.empty} ${q.variantId?Prisma.sql`AND s."variantId"=${q.variantId}::uuid`:Prisma.empty} ${q.supplierId?Prisma.sql`AND sup.id=${q.supplierId}::uuid`:Prisma.empty} ${q.lotId?Prisma.sql`AND l.id=${q.lotId}::uuid`:Prisma.empty}`;
   // One row per lot. Ledger quantities are authoritative for BOTH legacy and serialized lots;
   // StockUnit rows are never added to the same quantities.
   const lots=await tx.$queryRaw<FinancialLot[]>(Prisma.sql`
    SELECT l.id AS "lotId",li.code AS "lotCode",rl.id AS "receiptLineId",r.id AS "receiptId",s.id AS "skuId",s."fullCode",p.id AS "productId",p.name AS "productName",v.id AS "variantId",v.name AS "variantName",sup.id AS "supplierId",sup.name AS "supplierName",b."publicCode" AS "batchCode",to_char(b."deliveredOn",'YYYY-MM-DD') AS "deliveredOn",b."acceptedAt"::text AS "acceptedAt",
    coalesce(bal.u,0)::text AS usable,coalesce(bal.d,0)::text AS damaged,c.amount::text AS "unitCost",c."zeroReason",price.amount::text AS "sellingPrice"
    FROM "StockLot" l JOIN "ReceiptLine" rl ON rl."lotId"=l.id JOIN "Receipt" r ON r.id=rl."receiptId" JOIN "DeliveryBatch" b ON b.id=l."batchId"
    JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "Variant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=s."productId"
    JOIN "SupplierSource" src ON src.id=l."sourceId" JOIN "Supplier" sup ON sup.id=src."supplierId" LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id LEFT JOIN "PurchaseCost" c ON c."receiptLineId"=rl.id
    LEFT JOIN LATERAL(SELECT sum((CASE WHEN m."toState"='U' THEN m.quantity ELSE 0 END)-(CASE WHEN m."fromState"='U' THEN m.quantity ELSE 0 END)) AS u,
    sum((CASE WHEN m."toState"='D' THEN m.quantity ELSE 0 END)-(CASE WHEN m."fromState"='D' THEN m.quantity ELSE 0 END)) AS d
    FROM "StockMovement" m JOIN "StockTransaction" t ON t.id=m."transactionId" WHERE m."lotId"=l.id AND t."recordedAt"<${cutoff}) bal ON true
    LEFT JOIN LATERAL(SELECT amount FROM "SellingPrice" sp WHERE sp."variantId"=v.id AND sp."originId"=l."originId" AND sp."recordedAt"<${cutoff} ORDER BY sp."originSequence" DESC LIMIT 1) price ON true
    WHERE ${scope} AND b."acceptedAt"<${cutoff} ORDER BY b."acceptedAt" DESC,l.id`);
   const priceHistory=await tx.$queryRaw<PricePoint[]>(Prisma.sql`SELECT sp.id,sp."variantId",p.id AS "productId",p.name AS "productName",v.name AS "variantName",sp.amount::text AS amount,sp.currency,sp.reason,sp."recordedAt"::text AS "recordedAt",u.name AS "actorName" FROM "SellingPrice" sp JOIN "Variant" v ON v.id=sp."variantId" JOIN "Product" p ON p.id=v."productId" JOIN "User" u ON u.id=sp."actorId" WHERE sp."originId"=${this.originId}::uuid AND sp."recordedAt"<${cutoff} ${q.from?Prisma.sql`AND sp."recordedAt">=(${q.from}::date::timestamp AT TIME ZONE 'Africa/Lagos')`:Prisma.empty} ${q.productId?Prisma.sql`AND p.id=${q.productId}::uuid`:Prisma.empty} ${q.variantId?Prisma.sql`AND v.id=${q.variantId}::uuid`:Prisma.empty} ${(q.supplierId||q.lotId)?Prisma.sql`AND v.id IN (SELECT s."variantId" FROM "StockLot" l JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "SupplierSource" src ON src.id=l."sourceId" JOIN "Supplier" sup ON sup.id=src."supplierId" WHERE ${scope})`:Prisma.empty} ORDER BY sp."originSequence" DESC`);
   const received=await tx.receiptLine.findMany({where:{id:{in:lots.map(l=>l.receiptLineId)}},select:{id:true,totalQuantity:true}});
   const fromTime=q.from?new Date(`${q.from}T00:00:00+01:00`).getTime():0;
   const purchaseHistory=lots.filter(l=>new Date(l.acceptedAt).getTime()>=fromTime).map(l=>({...l,receivedQuantity:received.find(r=>r.id===l.receiptLineId)!.totalQuantity.toString()}));
   const [end]=await tx.$queryRaw<{end:Date}[]>(Prisma.sql`SELECT ${cutoff} AS "end"`);
   return {asOf:clock!.now.toISOString(),cutoff:end!.end.toISOString(),currency:'NGN',lots,summary:valueInventory(lots),priceHistory,purchaseHistory};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000,maxWait:10000});
 }
}
