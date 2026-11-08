import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { afterAll,beforeAll,expect,it } from 'vitest';
import request from 'supertest';
import { createCanvas } from '@napi-rs/canvas';
import jsQrModule from 'jsqr';
import { encodeUnitQr,type UnitLabelJob } from '@dayari/contracts';
import { database } from '../../apps/api/src/database.js';
import { createApp } from '../../apps/api/src/app.js';
import { shopToken } from './shop-fixture.js';
import { unitSheetPlan } from '../../apps/api/src/unit-label-render.js';
import type { Prisma,PrismaClient } from '@prisma/client';
import { UnitLabelsService } from '../../apps/api/src/unit-labels.service.js';
const jsQR=jsQrModule as unknown as (rgba:Uint8ClampedArray,width:number,height:number)=>{data:string}|null;
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Isolated local test database required');
const db=database(url),originId=randomUUID();let app:Awaited<ReturnType<typeof createApp>>,admin:string,manager:string,production:string,receipt:any,units:any[],job:UnitLabelJob;
const post=(path:string,body:object,key=randomUUID(),token=admin)=>request(app.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+token).set('Idempotency-Key',key).send(body);
const get=(path:string,token=admin)=>request(app.getHttpServer()).get('/v1/'+path).set('Authorization','Bearer '+token);
async function stock(){const result:Record<string,string>={};for(const table of ['DeliveryBatch','Receipt','ReceiptLine','StockLot','StockTransaction','StockMovement','StockBalance','StockUnit','UnitEvent','UnitState','UnitCommandManifestPage']){const scope=table==='StockBalance'?`t."lotId" IN (SELECT id FROM "StockLot" WHERE "originId"=$1::uuid)`:['Receipt','ReceiptLine','StockMovement'].includes(table)?`t."batchId" IN (SELECT id FROM "DeliveryBatch" WHERE "originId"=$1::uuid)`:`t."originId"=$1::uuid`;const [row]=await db.$queryRawUnsafe<{value:string}[]>(`SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''),'UTF8')),'hex') AS value FROM "${table}" t WHERE ${scope}`,originId);result[table]=row!.value;}return result;}
beforeAll(async()=>{
 await db.originNode.create({data:{id:originId,mode:'SHOP'}});app=await createApp(db,originId,'SHOP');admin=await shopToken(db,app,originId);manager=await shopToken(db,app,originId,'MANAGER');production=await shopToken(db,app,originId,'PRODUCTION');
 const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});
 const source=(await post('catalogue/supplier-setups',{supplier:{name:'Unit labels '+originId},location:{registryId:registry.id}}).expect(201)).body.source;
 const notebooks=(await post('catalogue/product-setups',{sourceId:source.id,product:{name:'A5 Maple Notebook'},variants:['Red','Brown'].map(name=>({name,suffix:name.toUpperCase(),attributes:[{attribute:'Colour',value:name}]}))}).expect(201)).body;
 const pen=(await post('catalogue/product-setups',{sourceId:source.id,product:{name:'Pen <script>alert(1)</script>'},variants:[]}).expect(201)).body;
 receipt=(await post('receipts',{sourceId:source.id,deliveredOn:'2020-01-01',lines:[{skuId:notebooks.skus[0].id,usableQuantity:30,damagedQuantity:2,damageReason:'Synthetic damaged covers'},{skuId:notebooks.skus[1].id,usableQuantity:20,damagedQuantity:0},{skuId:pen.skus[0].id,usableQuantity:12,damagedQuantity:1,damageReason:'Synthetic damaged barrel'}]}).expect(201)).body;
 units=await db.stockUnit.findMany({where:{originId},orderBy:{unitCode:'asc'}});
});
afterAll(async()=>{await app?.close();await db.$disconnect();});
it('accepts 65 exact unit labels under concurrent idempotent replay while retaining independent lot-label semantics',async()=>{
 const before=await stock(),key=randomUUID(),body={kind:'INITIAL',unitIds:units.map(unit=>unit.id),profileId:'unit-a4-70x35-v2'};
 const [a,b]=await Promise.all([post('unit-label-jobs',body,key,manager),post('unit-label-jobs',body,key,manager)]);
 expect(a.status).toBe(201);expect(b.body).toEqual(a.body);job=a.body;
 expect(job.totalLabels).toBe(65);expect(job.lines).toHaveLength(65);expect(new Set(job.lines.map(line=>line.payload)).size).toBe(65);
 expect(await db.unitLabelClaim.count({where:{jobId:job.id}})).toBe(65);
 for(const line of job.lines)expect(line.payload).toBe(encodeUnitQr(originId,line.unitId));
 await post('unit-label-jobs',body).expect(409);await post('unit-label-jobs',{...body,unitIds:body.unitIds.slice(1)},key,manager).expect(409);
 const legacy=(await post('label-print-jobs',{kind:'INITIAL',receiptId:receipt.id,profileId:'a4-70x35-v1'}).expect(201)).body;
 expect(legacy.totalCopies).toBe('65');expect(new Set(legacy.lines.map((line:any)=>line.payload)).size).toBe(3);
 expect(await stock()).toEqual(before);
});
it('prepares immutable escaped HTML/PDF from the same exact membership and decodes every final PDF QR',async()=>{
 const before=await stock(),key=randomUUID(),prepared=(await post(`unit-label-jobs/${job.id}/artifact`,{},key).expect(201)).body;
 expect((await post(`unit-label-jobs/${job.id}/artifact`,{},key).expect(201)).body).toEqual(prepared);expect(prepared.pages).toBe(4);
 const html=await get(`unit-label-jobs/${job.id}/artifacts/${prepared.artifactId}.html`).expect(200);
 expect(html.headers['content-security-policy']).toContain("frame-ancestors 'none'");expect(html.headers['content-security-policy']).toContain("'sha256-");
 expect(html.text).toContain('data:font/ttf;base64,');expect(html.text).not.toContain('Pen <script>');expect(html.text).toContain('&lt;script&gt;');
 expect((html.text.match(/data-unit-code=/g)??[])).toHaveLength(65);
 const file=await get(`unit-label-jobs/${job.id}/artifacts/${prepared.artifactId}.pdf`).expect(200),bytes=Buffer.isBuffer(file.body)?file.body:Buffer.from(file.text,'binary');
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:false}),pdf=await loading.promise;
 const plan=unitSheetPlan(job),decoded:string[]=[];
 for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
  const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale:300/72}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),ctx=canvas.getContext('2d');
  await page.render({canvasContext:ctx as unknown as CanvasRenderingContext2D,viewport,canvas:canvas as unknown as HTMLCanvasElement}).promise;
  for(const cell of plan.labels.filter(cell=>cell.sheet===pageNumber-1)){
   const x=Math.round((cell.x+3)*300/25.4),y=Math.round((cell.y+2)*300/25.4),size=Math.ceil(21*300/25.4),image=ctx.getImageData(x,y,size,size);
   const qr=jsQR(image.data,size,size);expect(qr,`unit ${cell.line.id}`).not.toBeNull();expect(qr!.data).toBe(cell.line.payload);decoded.push(qr!.data);
  }
 }
 expect(decoded).toHaveLength(65);expect(new Set(decoded).size).toBe(65);await loading.destroy();
 const ready=(await get(`unit-label-jobs/${job.id}`).expect(200)).body;expect(ready.artifact.id).toBe(prepared.artifactId);expect(ready.handoffCount).toBe(0);
 await post(`unit-label-jobs/${job.id}/artifact`,{startSlot:1}).expect(409);expect(await stock()).toEqual(before);
},90000);
it('records only explicit handoff requests and reprints selected saved identities without creating or changing units',async()=>{
 const before=await stock(),attemptId=randomUUID(),key=randomUUID(),body={attemptId};
 const first=(await post(`unit-label-jobs/${job.id}/handoffs`,body,key).expect(201)).body;
 expect(first.physicalOutcome).toBe('NOT_CONFIRMED');expect((await post(`unit-label-jobs/${job.id}/handoffs`,body,key).expect(201)).body).toEqual(first);
 await post(`unit-label-jobs/${job.id}/handoffs`,{attemptId:randomUUID()},key).expect(409);
 await post(`unit-label-jobs/${job.id}/handoffs`,{...body,printed:true}).expect(400);
 const selected=[job.lines[1]!,job.lines[64]!],reprint=(await post('unit-label-jobs',{kind:'REPRINT',originalJobId:job.id,lineIds:selected.map(line=>line.id),reason:'Replace two spoiled stickers after checking output'}).expect(201)).body as UnitLabelJob;
 expect(reprint.totalLabels).toBe(2);for(const line of reprint.lines){const original=selected.find(item=>item.unitId===line.unitId)!;expect(line.payload).toBe(original.payload);expect(line.content).toEqual(original.content);expect(line.originalLineId).toBe(original.id);}
 expect(await db.unitLabelClaim.count({where:{jobId:job.id}})).toBe(65);expect(await db.unitLabelClaim.count({where:{jobId:reprint.id}})).toBe(0);
 expect((await get(`unit-label-jobs/${job.id}`).expect(200)).body.handoffCount).toBe(1);expect(await stock()).toEqual(before);
});
it('denies Production printing and rejects immutable history edits and malformed membership',async()=>{
 for(const path of ['unit-label-options','unit-label-jobs',`unit-label-jobs/${job.id}`])await get(path,production).expect(403);
 await post('unit-label-jobs',{kind:'INITIAL',unitIds:[units[0].id],profileId:'unit-a4-70x35-v2'},randomUUID(),production).expect(403);
 await post(`unit-label-jobs/${job.id}/artifact`,{},randomUUID(),production).expect(403);await post(`unit-label-jobs/${job.id}/handoffs`,{attemptId:randomUUID()},randomUUID(),production).expect(403);
 const ready=(await get(`unit-label-jobs/${job.id}`).expect(200)).body;
 for(const ext of ['html','pdf'])await get(`unit-label-jobs/${job.id}/artifacts/${ready.artifact.id}.${ext}`,production).expect(403);
 await expect(db.unitLabelJob.update({where:{id:job.id},data:{reason:'Changed history'}})).rejects.toThrow();
 await expect(db.unitLabelLine.update({where:{id:job.lines[0]!.id},data:{payload:job.lines[1]!.payload}})).rejects.toThrow();
 await expect(db.unitLabelClaim.delete({where:{unitId:units[0].id}})).rejects.toThrow();
 await expect(db.unitLabelArtifact.delete({where:{jobId:job.id}})).rejects.toThrow();
 await expect(db.unitLabelJob.delete({where:{id:job.id}})).rejects.toThrow();
 const savedLine=await db.unitLabelLine.findUniqueOrThrow({where:{id:job.lines[0]!.id}});
 await expect(db.unitLabelLine.create({data:{...savedLine,content:savedLine.content as Prisma.InputJsonValue,id:randomUUID(),ordinal:999}})).rejects.toThrow();
 const evidence=await db.unitLabelEvent.findFirstOrThrow({where:{jobId:job.id}});
 await expect(db.unitLabelEvent.update({where:{id:evidence.id},data:{kind:'HANDOFF_REQUESTED'}})).rejects.toThrow();
 await post('unit-label-jobs',{kind:'INITIAL',unitIds:[units[0].id,units[0].id],profileId:'unit-a4-70x35-v2'}).expect(400);
 await post('unit-label-jobs',{kind:'INITIAL',unitIds:[randomUUID()],profileId:'unit-a4-70x35-v2'}).expect(404);
 await post('unit-label-jobs',{kind:'REPRINT',originalJobId:job.id,lineIds:[randomUUID()],reason:'Invalid original line selection'}).expect(400);
});
it('provides scoped paged configuration, preview and history reads without creating print or stock evidence',async()=>{
 const before=await stock(),sequence=(await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence;
 const config=(await get('unit-label-config',manager).expect(200)).body;expect(config.cartLimit).toBe(500);expect(config.originId).toBe(originId);
 await get('unit-label-config',production).expect(403);
 const options=(await get('unit-label-options?mode=REPRINT&receiptId='+receipt.id,manager).expect(200)).body;
 expect(options.total).toBe(65);expect(options.units).toHaveLength(50);
 const second=(await get('unit-label-options?mode=REPRINT&receiptId='+receipt.id+'&page=2').expect(200)).body;
 expect(second.units).toHaveLength(15);expect(new Set([...options.units,...second.units].map((unit:any)=>unit.unitId)).size).toBe(65);
 const previews=(await post('unit-label-previews',{unitIds:[units[0].id]},randomUUID(),manager).expect(200)).body;
 expect(previews[0].payload).toBe(encodeUnitQr(originId,units[0].id));
 await post('unit-label-previews',{unitIds:[units[0].id]},randomUUID(),production).expect(403);
 await post('unit-label-previews',{unitIds:[randomUUID()]}).expect(404);
 expect((await get('unit-label-jobs?receiptId='+randomUUID()).expect(200)).body.total).toBe(0);
 expect((await get('unit-label-jobs?receiptId='+receipt.id).expect(200)).body.total).toBe(2);
 const requests=(await get(`unit-label-jobs/${job.id}/handoffs`).expect(200)).body;expect(requests.total).toBe(1);
 expect(await stock()).toEqual(before);expect((await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence).toBe(sequence);
});
it('rolls failed print metadata back without changing any accepted unit or stock',async()=>{
 const actor=await db.user.findFirstOrThrow({where:{role:'ADMIN',membership:{originId}}});
 const count=async()=>({sequence:(await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence,
  jobs:await db.unitLabelJob.count({where:{originId}}),lines:await db.unitLabelLine.count({where:{jobId:{in:(await db.unitLabelJob.findMany({where:{originId},select:{id:true}})).map(job=>job.id)}}}),
  events:await db.unitLabelEvent.count({where:{originId}}),commands:await db.commandResult.count({where:{originId}}),
  audit:await db.auditEvent.count({where:{originId}}),outbox:await db.outboxEvent.count({where:{originId}})});
 const before=await count(),stockBefore=await stock();
 for(const model of ['AuditEvent','OutboxEvent','CommandResult']){
  const extended=db.$extends({query:{$allModels:{async create({model:current,args,query}){if(current===model)throw Error('Injected print evidence failure');return query(args);}}}});
  await expect(new UnitLabelsService(extended as unknown as PrismaClient,originId,'SHOP').create(actor,randomUUID(),{kind:'REPRINT',originalJobId:job.id,lineIds:[job.lines[0]!.id],reason:'Synthetic rollback replacement'})).rejects.toThrow('Injected print evidence failure');
  expect(await count()).toEqual(before);
 }
 await expect(new UnitLabelsService(db,originId,'CLOUD').create(actor,randomUUID(),{kind:'REPRINT',originalJobId:job.id,lineIds:[job.lines[0]!.id],reason:'Cloud writes are prohibited'})).rejects.toThrow('shop');
 expect(await stock()).toEqual(stockBefore);
});
it('rejects an incomplete initial claim group at database commit',async()=>{
 const accepted=(await post('receipts',{sourceId:(await db.receipt.findUniqueOrThrow({where:{id:receipt.id}})).sourceId,deliveredOn:'2020-01-01',lines:[{skuId:receipt.lines[0].skuId,usableQuantity:1,damagedQuantity:0}]}).expect(201)).body;
 const unit=await db.stockUnit.findFirstOrThrow({where:{lotId:accepted.lines[0].lotId}});
 const actor=await db.user.findFirstOrThrow({where:{role:'ADMIN',membership:{originId}}});
 const before=await stock(),sequence=(await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence,key=randomUUID();
 const extended=db.$extends({query:{unitLabelClaim:{async createMany(){return {count:0};}}}});
 await expect(new UnitLabelsService(extended as unknown as PrismaClient,originId,'SHOP').create(actor,key,{kind:'INITIAL',unitIds:[unit.id],profileId:'unit-a4-70x35-v2'})).rejects.toThrow();
 expect(await db.unitLabelClaim.count({where:{unitId:unit.id}})).toBe(0);
 expect(await db.unitLabelLine.count({where:{unitId:unit.id}})).toBe(0);
 expect(await db.commandResult.count({where:{originId,key}})).toBe(0);
 expect((await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence).toBe(sequence);expect(await stock()).toEqual(before);
});
it('accepts the full 500-unit cart and artifact without changing authoritative inventory',async()=>{
 const sourceId=(await db.receipt.findUniqueOrThrow({where:{id:receipt.id}})).sourceId;
 const accepted=(await post('receipts',{sourceId,deliveredOn:'2020-01-01',lines:[{skuId:receipt.lines[0].skuId,usableQuantity:490,damagedQuantity:10,damageReason:'Synthetic large-cart damage fixture'}]}).expect(201)).body;
 const exact=await db.stockUnit.findMany({where:{lotId:accepted.lines[0].lotId},select:{id:true}});
 const before=await stock(),start=performance.now();
 const full=(await post('unit-label-jobs',{kind:'INITIAL',unitIds:exact.map(unit=>unit.id),profileId:'unit-a4-70x35-v2'}).expect(201)).body;
 const acceptedMs=performance.now()-start,renderStart=performance.now();
 const artifact=(await post(`unit-label-jobs/${full.id}/artifact`,{startSlot:5,damagedStartSlot:2}).expect(201)).body;
 const artifactMs=performance.now()-renderStart;
 expect(full.lines).toHaveLength(500);expect(new Set(full.lines.map((line:any)=>line.payload)).size).toBe(500);expect(artifact.pages).toBe(25);
 expect(await stock()).toEqual(before);
 await mkdir('artifacts/completion',{recursive:true});
 await writeFile('artifacts/completion/unit-label-api-capacity.json',JSON.stringify({syntheticOnly:true,units:500,acceptedMs,artifactMs,pages:artifact.pages,stockUnchanged:true,limitations:['One isolated API rehearsal, not a statistical or shop-hardware guarantee']},null,2));
},60000);
