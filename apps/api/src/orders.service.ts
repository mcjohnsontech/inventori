import {BadRequestException} from '@nestjs/common';
import {Prisma,type PrismaClient,type User} from '@prisma/client';
import {ordersQuerySchema,type OrdersPage,type OrderDetail,type OrderSummary,type OrderUnit} from '@dayari/contracts';
import {requireCapability} from './permissions.js';
export class OrdersService {
 constructor(readonly db:PrismaClient,readonly originId:string){}
 async read(user:User,input:unknown,detail=false):Promise<OrdersPage|OrderDetail>{
  requireCapability(user,'CHECKOUT');
  const parsed=ordersQuerySchema.safeParse(input);if(!parsed.success)throw new BadRequestException('Invalid Order ID, session or page.');
  const q=parsed.data;if(detail&&!q.orderReference&&!q.withoutOrder)throw new BadRequestException('Choose an exact Order ID or unlinked session history.');
  const own=user.role==='PRODUCTION';
  return this.db.$transaction(async tx=>{
   const scope=Prisma.sql`cl."originId"=${this.originId}::uuid AND c."originId"=${this.originId}::uuid ${own?Prisma.sql`AND c."actorId"=${user.id}::uuid`:Prisma.empty}`;
   const from=Prisma.sql`FROM "CheckoutLine" cl JOIN "Checkout" c ON c.id=cl."checkoutId" JOIN "UnitState" state ON state."unitId"=cl."unitId" AND state."originId"=cl."originId" LEFT JOIN "CheckoutReasonResolution" resolution ON resolution."checkoutLineId"=cl.id LEFT JOIN "ReasonReconciliation" reconciled ON reconciled.id=resolution."reconciliationId"`;
   const orderScope=Prisma.sql`${scope} AND cl."orderReference" IS NOT NULL ${q.search?Prisma.sql`AND strpos(lower(cl."orderReference"),lower(${q.search}))>0`:Prisma.empty} ${q.orderReference?Prisma.sql`AND cl."orderReference"=${q.orderReference}`:Prisma.empty}`;
   const summaries=await tx.$queryRaw<(Omit<OrderSummary,'latestCheckout'>&{latestCheckout:Date})[]>(Prisma.sql`SELECT cl."orderReference",count(*)::integer AS "totalUnits",count(DISTINCT c.id)::integer AS sessions,count(*) FILTER(WHERE state.state='P')::integer AS "inProduction",count(*) FILTER(WHERE state.state='C')::integer AS completed,count(*) FILTER(WHERE cl."reasonCode" IS NULL AND resolution.id IS NULL)::integer AS "unresolvedReasons",${own?Prisma.empty:Prisma.sql`count(*) FILTER(WHERE EXISTS(SELECT 1 FROM "DamageLine" d WHERE d."checkoutLineId"=cl.id))::integer AS "reportedDamage",`} max(c."acceptedAt") AS "latestCheckout" ${from} WHERE ${orderScope} GROUP BY cl."orderReference" ORDER BY max(c."acceptedAt") DESC,cl."orderReference" LIMIT ${detail?1:20} OFFSET ${detail?0:(q.page-1)*20}`);
   const rows=summaries.map(r=>({...r,latestCheckout:r.latestCheckout.toISOString()}));
   const fresh={asOf:new Date().toISOString(),scope:own?'OWN' as const:'SHOP' as const,page:q.page,pageSize:20};
   if(!detail){const [count]=await tx.$queryRaw<{n:bigint}[]>(Prisma.sql`SELECT count(DISTINCT cl."orderReference") n ${from} WHERE ${orderScope}`);return {...fresh,total:Number(count!.n),rows};}
   const where=Prisma.sql`${scope} ${q.withoutOrder?Prisma.sql`AND cl."orderReference" IS NULL`:Prisma.sql`AND cl."orderReference"=${q.orderReference!}`} ${q.checkoutId?Prisma.sql`AND c.id=${q.checkoutId}::uuid`:Prisma.empty}`;
   const [count]=await tx.$queryRaw<{n:bigint}[]>(Prisma.sql`SELECT count(*) n ${from} WHERE ${where}`);
   const units=await tx.$queryRaw<(Omit<OrderUnit,'acceptedAt'>&{acceptedAt:Date})[]>(Prisma.sql`SELECT c.id AS "checkoutId",cl.id AS "checkoutLineId",c."acceptedAt",employee.name AS "employeeName",cl."unitId",cl.snapshot->>'unitCode' AS "unitCode",cl.snapshot->>'productName' AS "productName",cl.snapshot->>'variantName' AS "variantName",cl.snapshot->>'fullSku' AS "fullSku",cl.snapshot->>'lotCode' AS "lotCode",cl.snapshot->>'publicBatchCode' AS "publicBatchCode",${own?Prisma.sql`CASE WHEN state.state IN ('P','C') THEN state.state ELSE 'UNAVAILABLE' END`:Prisma.sql`state.state`} AS state,cl."reasonCode" AS "originalReason",reconciled."reasonCode" AS "resolvedReason",e.id AS "exceptionId",done."completionId" ${own?Prisma.empty:Prisma.sql`,EXISTS(SELECT 1 FROM "DamageLine" d WHERE d."checkoutLineId"=cl.id) AS "damageReported"`} ${from} JOIN "User" employee ON employee.id=c."actorId" LEFT JOIN "CheckoutException" e ON e."lineId"=cl.id LEFT JOIN "ProductionCompletionLine" done ON done."checkoutLineId"=cl.id WHERE ${where} ORDER BY c."acceptedAt" DESC,c.id DESC,cl.ordinal LIMIT 20 OFFSET ${(q.page-1)*20}`);
   return {...fresh,total:Number(count!.n),summary:q.withoutOrder?null:rows[0]??null,rows:units.map(r=>({...r,acceptedAt:r.acceptedAt.toISOString()}))};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
}
