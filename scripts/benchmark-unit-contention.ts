import 'dotenv/config';
import { readFile,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { database } from '../apps/api/src/database.js';
import { isolatedBackfillUrl } from '../apps/api/src/identity-backfill.js';
import { ReceivingService } from '../apps/api/src/receiving.service.js';
const url=isolatedBackfillUrl(process.env.TEST_DATABASE_URL),db=database(url.toString());
try {
 const fixture=JSON.parse(await readFile('artifacts/completion/serialized-receiving-benchmark.json','utf8'));
 const originId=fixture.originId;
 const actor=await db.user.findFirstOrThrow({where:{role:'ADMIN',membership:{originId}}});
 const sku=await db.supplierVariantSku.findFirstOrThrow({where:{sourcing:{source:{originId}}},include:{sourcing:true}});
 const body={sourceId:sku.sourcing.sourceId,deliveredOn:'2020-01-01',lines:[{skuId:sku.id,usableQuantity:999,damagedQuantity:1,damageReason:'Synthetic contention fixture'}]};
 const samples=[];
 for(const chunkSize of [250,500]){
  const service=new ReceivingService(db,originId,'SHOP',undefined,chunkSize),start=performance.now();
  const response=await service.create(actor,randomUUID(),body) as any;
  samples.push({kind:'chunk-comparison',units:1000,chunkSize,elapsedMs:performance.now()-start,unitCount:response.serialization.unitCount});
 }
 const service=new ReceivingService(db,originId,'SHOP'),start=performance.now();
 const replies=await Promise.all([service.create(actor,randomUUID(),body),service.create(actor,randomUUID(),body)]) as any[];
 if(new Set(replies.map(r=>r.batch.id)).size!==2||replies.some(r=>r.serialization.unitCount!=='1000'))throw Error('Contention changed accepted identities');
 samples.push({kind:'same-origin-concurrent',units:2000,chunkSize:500,elapsedMs:performance.now()-start,receipts:replies.length});
 await writeFile('artifacts/completion/unit-contention-benchmark.json',JSON.stringify({syntheticOnly:true,recordedAt:new Date().toISOString(),samples,limitations:['Single diagnostic run per case, not a statistical latency guarantee','Concurrent different keys are intentional separate receipts; origin locking serializes their commits']},null,2));
 console.info(JSON.stringify(samples));
}finally{await db.$disconnect();}
