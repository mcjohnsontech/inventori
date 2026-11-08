import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaClient, User } from '@prisma/client';
import { z } from 'zod';
import { unitExactCodeSchema, type UnitIdentityLookup } from '@dayari/contracts';
import { requireCapability } from './permissions.js';
import { hasUnitSchema } from './unit-receiving.js';

export class UnitsService {
 private readonly reads=new Map<string,{at:number;count:number}>();
 constructor(readonly db:PrismaClient,readonly originId:string){}
 private allow(user:User){
  requireCapability(user,'IDENTIFY');const now=Date.now();
  if(this.reads.size>10000)for(const [id,row] of this.reads)if(now-row.at>60000)this.reads.delete(id);
  const prior=this.reads.get(user.id),row=prior&&now-prior.at<60000?prior:{at:now,count:0};
  if(++row.count>120)throw new HttpException('Too many lookup requests; try again shortly',429);this.reads.set(user.id,row);
 }
 async byCode(user:User,input:unknown,query:unknown={}){
  this.allow(user);
  const code=unitExactCodeSchema.safeParse(input),scope=z.object({originId:z.uuid().transform(value=>value.toLowerCase()).optional()}).strict().safeParse(query);
  if(!code.success||!scope.success)throw new BadRequestException('Enter exactly six readable Unit Code characters and a valid shop scope');
  return this.lookup(user,scope.data.originId??this.originId,null,code.data);
 }
 async byId(user:User,originId:string,id:string){this.allow(user);if(!z.uuid().safeParse(id).success)throw new BadRequestException('Invalid unit identity');return this.lookup(user,originId,id,null);}
 private async lookup(user:User,originId:string,id:string|null,code:string|null):Promise<UnitIdentityLookup>{
  if(originId!==this.originId)throw new NotFoundException('UNIT_NOT_AVAILABLE');
  if(!await hasUnitSchema(this.db))throw new ServiceUnavailableException('Unit identity lookup requires the separately approved database upgrade');
  const rows=await this.db.$queryRaw<(Omit<UnitIdentityLookup,'payloadVersion'|'availability'|'dataAsOf'|'receivedAt'> & {state:string;condition:string;receivedAt:Date})[]>`
   SELECT u.id AS "unitId",u."unitCode",u."originId",u."lotId",li.code AS "lotCode",p.id AS "productId",pi.code AS "productCode",p.name AS "productName",
    v.id AS "variantId",v.name AS "variantName",s.id AS "skuId",s."fullCode" AS "fullSku",b.id AS "batchId",b."publicCode" AS "publicBatchCode",
    state.state,state.condition,u."recordedAt" AS "receivedAt",b.snapshot->>'supplierName' AS "supplierName",b.snapshot->>'sourceName' AS "sourceName"
   FROM "StockUnit" u JOIN "UnitState" state ON state."unitId"=u.id AND state."originId"=u."originId" AND state."lotId"=u."lotId"
   JOIN "StockLot" l ON l.id=u."lotId" AND l."originId"=u."originId" JOIN "DeliveryBatch" b ON b.id=l."batchId"
   JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "Product" p ON p.id=s."productId" JOIN "Variant" v ON v.id=s."variantId"
   LEFT JOIN "ProductPublicIdentity" pi ON pi."productId"=p.id LEFT JOIN "LotPublicIdentity" li ON li."lotId"=l.id
   WHERE u."originId"=${originId}::uuid AND (u.id=${id}::uuid OR u."unitCode"=${code}::text)`;
  const row=rows[0];if(!row)throw new NotFoundException('UNIT_NOT_AVAILABLE');
  const result:UnitIdentityLookup={payloadVersion:2,originId:row.originId,unitId:row.unitId,unitCode:row.unitCode,lotId:row.lotId,lotCode:row.lotCode??null,
   productId:row.productId,productCode:row.productCode??null,productName:row.productName,variantId:row.variantId,variantName:row.variantName,skuId:row.skuId,
   fullSku:row.fullSku,batchId:row.batchId,publicBatchCode:row.publicBatchCode,availability:row.state==='U'?'USABLE':'UNAVAILABLE',dataAsOf:new Date().toISOString()};
  if(user.role!=='PRODUCTION'){result.state=row.state;result.condition=row.condition;result.supplierName=row.supplierName;result.sourceName=row.sourceName;result.receivedAt=row.receivedAt.toISOString();}
  return result;
 }
}
