import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { database } from '../apps/api/src/database.js';
import { isolatedBackfillUrl } from '../apps/api/src/identity-backfill.js';

// Deliberately has no apply mode. A balance is not evidence of physical verification.
const args=process.argv.slice(2);
const options=z.object({origin:z.uuid(),out:z.string().min(1),after:z.uuid().optional()}).strict().parse(Object.fromEntries(args.reduce<string[][]>((pairs,value,index)=>index%2===0?[...pairs,[value.replace(/^--/,''),args[index+1]??'']]:pairs,[])));
const url=isolatedBackfillUrl(process.env.HISTORICAL_UNIT_PLAN_DATABASE_URL);
const db=database(url.toString());
try {
 const plan=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const lots=await tx.$queryRaw<{lotId:string;sku:string;batch:string;usable:string;damaged:string;assigned:string}[]>`
   SELECT l.id AS "lotId",s."fullCode" AS sku,b."publicCode" AS batch,
    COALESCE((SELECT quantity FROM "StockBalance" WHERE "lotId"=l.id AND state='U'),0)::text AS usable,
    COALESCE((SELECT quantity FROM "StockBalance" WHERE "lotId"=l.id AND state='D'),0)::text AS damaged,
    (SELECT count(*) FROM "StockUnit" WHERE "lotId"=l.id)::text AS assigned
   FROM "StockLot" l JOIN "LotSerialization" p ON p."lotId"=l.id AND p.mode='LEGACY'
   JOIN "SupplierVariantSku" s ON s.id=l."skuId" JOIN "DeliveryBatch" b ON b.id=l."batchId"
   WHERE l."originId"=${options.origin}::uuid AND (${options.after??null}::uuid IS NULL OR l.id>${options.after??null}::uuid)
   ORDER BY l.id LIMIT 101`;
  return {version:1,dryRun:true,originId:options.origin,recordedAt:new Date().toISOString(),lots:lots.slice(0,100).map(lot=>({...lot,physicalCount:null,discrepancy:'UNRESOLVED_NOT_COUNTED',verified:false})),nextCursor:lots.length>100?lots[99]!.lotId:null};
 },{isolationLevel:'RepeatableRead'});
 await writeFile(options.out,JSON.stringify(plan,null,2),{flag:'wx'});
 console.info(JSON.stringify({dryRun:true,lots:plan.lots.length,nextCursor:plan.nextCursor,message:'No units, events, stock changes or physical verification created.'}));
} finally {await db.$disconnect();}
