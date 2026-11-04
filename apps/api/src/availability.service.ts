import {BadRequestException} from '@nestjs/common';
import {Prisma,type PrismaClient,type User} from '@prisma/client';
import {availabilityQuery,type AvailableLot,type AvailabilityPage} from '@dayari/contracts';
import {requireCapability} from './permissions.js';
export class AvailabilityService{
 constructor(readonly db:PrismaClient,readonly originId:string){}
 async list(user:User,input:unknown):Promise<AvailabilityPage>{
  requireCapability(user,'IDENTIFY');const parsed=availabilityQuery.safeParse(input);if(!parsed.success)throw new BadRequestException('Invalid availability filters');const q=parsed.data;
  // Query only usable projections. No damaged, invoice, audit or print rows enter this read model.
  const from=Prisma.sql`FROM "StockLot" l
   JOIN "StockBalance" u ON u."lotId"=l.id AND u.state='U' AND u.quantity>0
   JOIN "DeliveryBatch" b ON b.id=l."batchId" AND b."originId"=l."originId" AND b."sourceId"=l."sourceId"
   JOIN "SupplierVariantSku" s ON s.id=l."skuId" AND s."originId"=l."originId"
   JOIN "Product" p ON p.id=s."productId" AND p."originId"=l."originId"
   JOIN "Variant" v ON v.id=s."variantId" AND v."productId"=p.id
   LEFT JOIN "ProductPublicIdentity" pi ON pi."productId"=p.id AND pi."originId"=l."originId"
   LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id AND li."originId"=l."originId"
   WHERE l."originId"=${this.originId}::uuid
   ${q.productId?Prisma.sql`AND p.id=${q.productId}::uuid`:Prisma.empty}
   ${q.lotId?Prisma.sql`AND l.id=${q.lotId}::uuid`:Prisma.empty}
   ${q.q?Prisma.sql`AND position(lower(${q.q}) in lower(concat_ws(' ',p.name,v.name,s."fullCode",b."publicCode",pi.code,li.code)))>0`:Prisma.empty}`;
  return this.db.$transaction(async tx=>{
   const counts=await tx.$queryRaw<{total:bigint}[]>(Prisma.sql`SELECT count(*) AS total ${from}`);
   const lots=await tx.$queryRaw<AvailableLot[]>(Prisma.sql`SELECT l.id AS "lotId",li.code AS "lotCode",p.id AS "productId",pi.code AS "productCode",p.name AS "productName",v.id AS "variantId",v.name AS "variantName",s.id AS "skuId",s."fullCode" AS "fullSku",b.id AS "batchId",b."publicCode" AS "publicBatchCode",u.quantity::text AS usable ${from} ORDER BY p.name,v.name,s."fullCode",b."acceptedAt" DESC,l.id LIMIT 20 OFFSET ${(q.page-1)*20}`);
   return {lots,total:Number(counts[0]!.total),page:q.page,pageSize:20,originId:this.originId,dataAsOf:new Date().toISOString()};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
}
