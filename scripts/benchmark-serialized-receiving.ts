import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { cpus, totalmem, platform, release } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { database } from '../apps/api/src/database.js';
import { createApp } from '../apps/api/src/app.js';
import { passwordHash } from '../apps/api/src/security.js';
import { hasUnitSchema } from '../apps/api/src/unit-receiving.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw Error('Benchmark requires an explicitly local *_test database');
const db = database(url), originId = randomUUID();
let capture = false;
let transactionMs = 0, lockMs = 0, peakRss = 0, allocationAttempts = 0, allocated = 0;
// Instrument transaction and origin-lock boundaries without changing production behavior.
const instrumented = new Proxy(db, { get(target, property) {
  if (property === '$transaction') return async (...args: any[]) => {
    if (!capture || typeof args[0] !== 'function') return (target.$transaction as any)(...args);
    let entered = 0;
    const result = await target.$transaction(async tx => {
      entered = performance.now();
      const measured = new Proxy(tx, { get(reader, key) {
        const operation = Reflect.get(reader,key,reader);
        if (key === '$queryRaw') return async (...queryArgs: any[]) => {
          const sql = Array.isArray(queryArgs[0]) ? queryArgs[0].join(' ') : String(queryArgs[0]?.sql ?? '');
          const start = performance.now(); const value = await operation.apply(reader,queryArgs);

          if (sql.includes('OriginNode') && sql.includes('FOR UPDATE')) lockMs += performance.now()-start;
          if (sql.includes('INSERT INTO "StockUnit"')) {
            allocationAttempts += JSON.parse(queryArgs[0].values[0]).length;
            allocated += value.length;
          }
          return value;
        };
        return typeof operation === 'function' ? operation.bind(reader) : operation;
      } });
      return args[0](measured);
    }, args[1]);
    transactionMs = performance.now()-entered;
    return result;
  };
  const value = Reflect.get(target,property,target);
  return typeof value === 'function' ? value.bind(target) : value;
} }) as PrismaClient;
const results: any[] = [];
let app: Awaited<ReturnType<typeof createApp>> | undefined;
const relationBytes = async () => (await db.$queryRaw<{ bytes: string }[]>`SELECT sum(pg_total_relation_size(quote_ident(t)))::text AS bytes FROM unnest(ARRAY['StockUnit','UnitEvent','UnitState','UnitCommandManifestPage']) t`)[0]!.bytes;
try {
  if (!await hasUnitSchema(db)) throw Error('Apply reviewed migrations to the isolated test database before benchmarking');
  await db.originNode.create({ data: { id: originId, mode: 'SHOP' } });
  const password = randomUUID(), email = `${originId}@benchmark.test`;
  await db.user.create({ data: { email, name: 'Synthetic benchmark Admin', role: 'ADMIN', passwordHash: passwordHash(password), membership: { create: { originId } } } });
  app = await createApp(instrumented,originId,'SHOP',undefined);
  const token = (await request(app.getHttpServer()).post('/v1/sessions').send({email,password}).expect(200)).body.token;
  const post = (path: string, body: object) => request(app!.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+token).set('Idempotency-Key',randomUUID()).send(body);
  const registry = await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});
  const supplier = (await post('catalogue/supplier-setups',{supplier:{name:'Benchmark '+originId},location:{registryId:registry.id}}).expect(201)).body;
  // Respect the existing 30-variant setup bound; extend the same parent explicitly.
  let parentId = '';
  const skus: { id: string }[] = [];
  for (let offset=0;offset<100;offset+=30) {
    const result=(await post('catalogue/product-setups',{sourceId:supplier.source.id,product:parentId?{id:parentId}:{name:'Benchmark physical units'},...(parentId?{extendVariants:true}:{}),variants:Array.from({length:Math.min(30,100-offset)},(_,index)=>{const i=offset+index;return {name:'Variant '+i,suffix:'V'+i,attributes:[{attribute:'Index',value:String(i)}]};})}).expect(201)).body;
    parentId=result.id;skus.push(...result.skus);
  }
  const beforeBytes = await relationBytes();
  const [version] = await db.$queryRaw<{ version: string }[]>`SELECT current_setting('server_version') AS version`;
  for (const test of [{units:100,lines:1},{units:1000,lines:1},{units:10000,lines:1},{units:10000,lines:100}]) {
    const samples: any[] = [];
    const result: any = {...test,samples}; results.push(result);
    for (let run=0;run<4;run++) {
      transactionMs=0;lockMs=0;allocationAttempts=0;allocated=0;peakRss=process.memoryUsage().rss;
      const timer=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},25);
      const count=test.units/test.lines;
      const body={sourceId:supplier.source.id,deliveredOn:'2020-01-01',lines:Array.from({length:test.lines},(_,i)=>({skuId:skus[i]!.id,usableQuantity:count-1,damagedQuantity:1,damageReason:'Synthetic benchmark damaged intake'}))};
      const [before]=await db.$queryRaw<{lsn:string}[]>`SELECT pg_current_wal_lsn()::text AS lsn`;
      capture=true;const start=performance.now();const response=await post('receipts',body);const elapsedMs=performance.now()-start;capture=false;clearInterval(timer);
      const [wal]=await db.$queryRaw<{bytes:string}[]>`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),${before!.lsn}::pg_lsn)::text AS bytes`;
      const sample={run,warmup:run===0,status:response.status,elapsedMs,transactionMs,originLockMs:lockMs,peakRss,allocationAttempts,collisionRetries:allocationAttempts-allocated,clusterWalBytes:wal!.bytes,unitCount:response.body.serialization?.unitCount??null};
      samples.push(sample);
      console.info(JSON.stringify({units:test.units,lines:test.lines,...sample}));
      if(response.status!==201 || elapsedMs>=15000) throw Error('Benchmark receipt failed or exceeded the 15-second capacity budget; no capacity approval inferred');
    }
    const measured=samples.slice(1),times=measured.map(s=>s.elapsedMs).sort((a,b)=>a-b);
    Object.assign(result,{p50Ms:times[1],p95Ms:times.at(-1),maxMs:times.at(-1)});
  }
  const afterBytes=await relationBytes();
  await mkdir('artifacts/completion',{recursive:true});
  const report={recordedAt:new Date().toISOString(),syntheticOnly:true,originId,hardware:{platform:platform(),release:release(),cpu:cpus()[0]?.model,cpuCount:cpus().length,totalMemory:totalmem()},runtime:process.versions,postgres:version,chunkSize:500,results,relationGrowthBytes:(BigInt(afterBytes)-BigInt(beforeBytes)).toString(),limitations:['Development hardware, not certified shop hardware','p95 is the maximum of three measured runs; not a statistical production guarantee','Cluster WAL includes background activity','No network deployment or real stock used']};
  await writeFile('artifacts/completion/serialized-receiving-benchmark.json',JSON.stringify(report,null,2));
} catch (error) {
  await mkdir('artifacts/completion',{recursive:true});
  await writeFile('artifacts/completion/serialized-receiving-benchmark-failure.json',JSON.stringify({recordedAt:new Date().toISOString(),syntheticOnly:true,results,error:error instanceof Error?error.message:'Benchmark failed'},null,2));
  throw error;
} finally { await app?.close();await db.$disconnect(); }
