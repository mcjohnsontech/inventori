import type { PrismaClient } from '@prisma/client';
import { LabelsService } from '../../apps/api/src/labels.service.js';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import request from 'supertest';
import { createCanvas } from '@napi-rs/canvas';
import jsQrModule from 'jsqr';
const jsQR=jsQrModule as unknown as (rgba:Uint8ClampedArray,width:number,height:number)=>{data:string}|null;
import { encodeQr,type LabelJob } from '@dayari/contracts';
import { createApp } from '../../apps/api/src/app.js';
import { database } from '../../apps/api/src/database.js';
import { passwordHash } from '../../apps/api/src/security.js';
import { renderLabelPdf,rendererVersion } from '../../apps/api/src/label-pdf.js';
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Local *_test database required');
describe('QR lookup, A4 labels and immutable stock isolation',()=>{
 const originId=randomUUID(),password=randomUUID();let db:ReturnType<typeof database>,app:Awaited<ReturnType<typeof createApp>>;let admin:string,manager:string,production:string;let receipt:any,zeroReceipt:any,job:LabelJob,artifact:any;
 const post=(path:string,body:object,key=randomUUID(),token=admin)=>request(app.getHttpServer()).post('/v1/'+path).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
 const get=(path:string,token=admin)=>request(app.getHttpServer()).get('/v1/'+path).set('Authorization',`Bearer ${token}`);
 async function stockSnapshot(){const result:Record<string,unknown>={};for(const name of ['deliveryBatch','receipt','receiptLine','stockLot','stockTransaction','stockMovement','stockBalance'] as const)result[name]=await (db[name] as any).findMany({orderBy:name==='stockBalance'?[{lotId:'asc'},{state:'asc'}]:{id:'asc'}});result.commands=await db.commandResult.findMany({where:{commandType:'receiving.receipts.create'},orderBy:{id:'asc'}});return JSON.stringify(result,(_,value)=>typeof value==='bigint'?value.toString():value);}
 beforeAll(async()=>{
  db=database(url);await db.originNode.create({data:{id:originId,mode:'SHOP'}});app=await createApp(db,originId,'SHOP');
  for(const role of ['ADMIN','MANAGER','PRODUCTION'] as const){const user=await db.user.create({data:{email:`${role.toLowerCase()}-${originId}@qr.test`,name:role,role,passwordHash:passwordHash(password),membership:{create:{originId}}}});const result=await request(app.getHttpServer()).post('/v1/sessions').send({email:user.email,password}).expect(200);if(role==='ADMIN')admin=result.body.token;else if(role==='MANAGER')manager=result.body.token;else production=result.body.token;}
  const registry=await db.locationRegistry.findUniqueOrThrow({where:{code:'LG'}});const supplier=(await post('catalogue/supplier-setups',{supplier:{name:`Labels ${originId}`},location:{registryId:registry.id}}).expect(201)).body;
  const notebook=(await post('catalogue/product-setups',{sourceId:supplier.source.id,product:{name:'A5 Maple Leatherbound Notebook'},variants:['Red','Brown'].map(name=>({name,suffix:name.toUpperCase(),attributes:[{attribute:'Colour',value:name}]}))}).expect(201)).body;
  const pen=(await post('catalogue/product-setups',{sourceId:supplier.source.id,product:{name:'Pen'},variants:[]}).expect(201)).body;
  receipt=(await post('receipts',{sourceId:supplier.source.id,deliveredOn:'2020-01-01',lines:[{skuId:notebook.skus[0].id,usableQuantity:30,damagedQuantity:2,damageReason:'Damaged covers during transit'},{skuId:notebook.skus[1].id,usableQuantity:20,damagedQuantity:0},{skuId:pen.skus[0].id,usableQuantity:12,damagedQuantity:1,damageReason:'Barrel cracked during transit'}]}).expect(201)).body;
  zeroReceipt=(await post('receipts',{sourceId:supplier.source.id,deliveredOn:'2020-01-01',lines:[{skuId:pen.skus[0].id,usableQuantity:0,damagedQuantity:2,damageReason:'Entire box arrived broken'}]}).expect(201)).body;
 });
 afterAll(async()=>{await app?.close();await db?.$disconnect();});
 it('resolves exact local origin/lot with minimal Production fields and no write effects',async()=>{
  const before=await stockSnapshot(),commands=await db.commandResult.count(),audits=await db.auditEvent.count(),events=await db.outboxEvent.count();
  const payload=encodeQr(originId,receipt.lines[0].lotId);const result=(await post('qr/resolve',{payload},randomUUID(),production).expect(200)).body;expect(result).toMatchObject({lotId:receipt.lines[0].lotId,skuId:receipt.lines[0].skuId,usable:'30'});expect(Object.keys(result).sort()).toEqual(['productCode','lotCode','payloadVersion','originId','lotId','skuId','fullSku','batchId','publicBatchCode','productId','productName','variantId','variantName','usable','dataAsOf'].sort());
  expect((await post('qr/resolve',{payload},randomUUID(),manager).expect(200)).body.damaged).toBe('2');
  expect((await post('qr/resolve',{payload:encodeQr(originId,zeroReceipt.lines[0].lotId)},randomUUID(),production).expect(200)).body.usable).toBe('0');
  await request(app.getHttpServer()).post('/v1/qr/resolve').send({payload}).expect(401);
  await post('qr/resolve',{payload:payload+' '}).expect(400);await post('qr/resolve',{payload:payload.replace('DYI:1','DYI:2')}).expect(422);await post('qr/resolve',{payload:encodeQr(randomUUID(),receipt.lines[0].lotId)}).expect(404);await post('qr/resolve',{payload:encodeQr(originId,randomUUID())}).expect(404);
  const lot=await db.stockLot.findUniqueOrThrow({where:{id:receipt.lines[0].lotId}}),source=await db.supplierSource.findUniqueOrThrow({where:{id:lot.sourceId}});
  expect((await post('qr/manual',{sourceId:source.id,originId,fullSku:receipt.lines[0].fullCode,publicBatchCode:receipt.batch.publicCode},randomUUID(),production).expect(200)).body.lotId).toBe(lot.id);
  await post('qr/manual',{sourceId:source.id,originId,fullSku:receipt.lines[0].fullCode+'X',publicBatchCode:receipt.batch.publicCode},randomUUID(),production).expect(404);
  await post('qr/manual',{sourceId:source.id.toUpperCase(),originId:originId.toUpperCase(),fullSku:receipt.lines[0].fullCode,publicBatchCode:receipt.batch.publicCode},randomUUID(),production).expect(200);
  await get('qr/manual-sources',production).expect(200);expect(await stockSnapshot()).toBe(before);expect(await db.commandResult.count()).toBe(commands);expect(await db.auditEvent.count()).toBe(audits);expect(await db.outboxEvent.count()).toBe(events);
 });
 it('creates one full manifest under concurrent replay, retains all receipt quantities and denies Production administration',async()=>{
  const before=await stockSnapshot(),key=randomUUID(),body={kind:'INITIAL',receiptId:receipt.id,profileId:'a4-70x35-v1'};
  const results=await Promise.all([post('label-print-jobs',body,key,manager),post('label-print-jobs',body,key,manager)]);expect(results.map(x=>x.status)).toEqual([201,201]);expect(results[0].body).toEqual(results[1].body);job=results[0].body;
  expect(job.totalCopies).toBe('65');expect(job.lines).toHaveLength(5);expect(new Set(job.lines.map(l=>l.payload)).size).toBe(3);expect(job.lines.filter(l=>l.purpose==='DAMAGED_INTAKE').reduce((n,l)=>n+BigInt(l.copies),0n)).toBe(3n);
  await post('label-print-jobs',body).expect(409);await post('label-print-jobs',{...body,profileId:'a4-90x45-v1'},key,manager).expect(409);
  for(const path of ['label-print-jobs',`label-print-jobs/${job.id}`,`receipts/${receipt.id}/label-plan`])await get(path,production).expect(403);
  await post('label-print-jobs',body,randomUUID(),production).expect(403);await get(`label-print-jobs/${job.id}/artifacts/0.pdf`,production).expect(403);
  await get(`receipts/${receipt.id}/label-plan`,manager).expect(200);expect(await stockSnapshot()).toBe(before);
 });
 it('renders a deterministic four-page A4 PDF and independently decodes every cell from final raster pages',async()=>{
  const before=await stockSnapshot();artifact=(await post(`label-print-jobs/${job.id}/artifacts/0`,{}).expect(201)).body;expect(artifact).toMatchObject({copies:'65',pages:4});
  const file=await get(`label-print-jobs/${job.id}/artifacts/0.pdf`).expect(200);expect(file.headers['content-type']).toContain('application/pdf');const bytes=Buffer.isBuffer(file.body)?file.body:Buffer.from(file.text,'binary');const again=await renderLabelPdf(job,'0');expect(bytes.equals(again)).toBe(true);
  await mkdir('test-results/qr-labels',{recursive:true});await writeFile('test-results/qr-labels/receipt-65-labels.pdf',bytes);
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:false});const pdf=await loading.promise;expect(pdf.numPages).toBe(4);const decoded:string[]=[];let damaged=0;
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
   const page=await pdf.getPage(pageNo);expect(page.view[2]!*25.4/72).toBeCloseTo(210,2);expect(page.view[3]!*25.4/72).toBeCloseTo(297,2);
   const text=(await page.getTextContent()).items.filter((x:any)=>'str' in x).map((x:any)=>x.str).join(' ');damaged+=(text.match(/DAMAGED INTAKE/g)??[]).length;
   const viewport=page.getViewport({scale:300/72}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),ctx=canvas.getContext('2d');await page.render({canvasContext:ctx as unknown as CanvasRenderingContext2D,viewport,canvas:canvas as unknown as HTMLCanvasElement}).promise;
   const count=Math.min(21,65-(pageNo-1)*21);for(let cell=0;cell<count;cell++){const x=Math.round(((cell%3)*70+3)*300/25.4),y=Math.round((26+Math.floor(cell/3)*35+1)*300/25.4),size=Math.round(23*300/25.4);const image=ctx.getImageData(x,y,size,size);const code=jsQR(image.data,size,size);expect(code,`page ${pageNo} cell ${cell}`).not.toBeNull();decoded.push(code!.data);}
   if(pageNo===1)await writeFile('test-results/qr-labels/receipt-first-page.png',await canvas.encode('png'));if(pageNo===2)await writeFile('test-results/qr-labels/receipt-damaged-page.png',await canvas.encode('png'));
  }
  expect(decoded).toHaveLength(65);expect(new Set(decoded).size).toBe(3);expect(damaged).toBe(3);await loading.destroy();expect(await stockSnapshot()).toBe(before);
 },90000);
 it('records explicit handoff, unknown output and operator report, with idempotency and no automatic output',async()=>{
  const before=await stockSnapshot(),attemptId=randomUUID(),key=randomUUID();const body={kind:'HANDOFF_REQUESTED',chunk:'0',attemptId,note:'Explicit operator action'};
  const first=(await post(`label-print-jobs/${job.id}/events`,body,key).expect(201)).body;expect(first.copies).toBe('65');expect((await post(`label-print-jobs/${job.id}/events`,body,key).expect(201)).body).toEqual(first);
  await post(`label-print-jobs/${job.id}/events`,{...body,note:'different'},key).expect(409);
  await post(`label-print-jobs/${job.id}/events`,{kind:'OUTCOME_UNKNOWN',chunk:'0',attemptId,note:'Print dialog cancelled; verify output'}).expect(201);
  await post(`label-print-jobs/${job.id}/events`,{kind:'CANCELLED_BEFORE_HANDOFF',chunk:'0',attemptId}).expect(409);
  await post(`label-print-jobs/${job.id}/events`,{kind:'OPERATOR_REPORTED_PRINTED',chunk:'0',attemptId,copies:'66'}).expect(400);
  await post(`label-print-jobs/${job.id}/events`,{kind:'OPERATOR_REPORTED_PRINTED',chunk:'0',attemptId,copies:'65'}).expect(201);
  await post(`label-print-jobs/${job.id}/events`,{kind:'FAILED',chunk:'0',attemptId}).expect(409);
  await post(`label-print-jobs/${job.id}/events`,{kind:'CANCELLED_BEFORE_HANDOFF',chunk:'0',attemptId:randomUUID()}).expect(201);
  await post('label-print-jobs/not-a-uuid/events',body).expect(400);
  await post(`label-print-jobs/${job.id}/events`,body,randomUUID(),production).expect(403);expect(await stockSnapshot()).toBe(before);
 });
 it('requires explicit bounded reprints, retains payload/content, chunks at 500 and preserves all stock',async()=>{
  const before=await stockSnapshot(),line=job.lines[0]!,body={kind:'REPRINT',originalJobId:job.id,reason:'Labels spoiled during printer jam',lines:[{lotId:line.lotId,purpose:line.purpose,copies:'501'}]};
  const reprint=(await post('label-print-jobs',body).expect(201)).body as LabelJob;expect(reprint.totalCopies).toBe('501');expect(reprint.chunks).toBe('2');expect(reprint.lines[0]!.payload).toBe(line.payload);expect(reprint.lines[0]!.content).toEqual(line.content);
  expect(reprint.totalSheets).toBe('25');
  expect((await post(`label-print-jobs/${reprint.id}/artifacts/0`,{}).expect(201)).body).toMatchObject({copies:'500',pages:24});
  const partFile=await get(`label-print-jobs/${reprint.id}/artifacts/0.pdf`).expect(200);const bytes=Buffer.isBuffer(partFile.body)?partFile.body:Buffer.from(partFile.text,'binary');const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:new Uint8Array(bytes),useSystemFonts:false});const pdf=await loading.promise;expect(pdf.numPages).toBe(24);let printedCodes=0;for(let n=1;n<=pdf.numPages;n++){const text=await(await pdf.getPage(n)).getTextContent();printedCodes+=text.items.filter((item:any)=>item.str===line.content.fullCode).length;}expect(printedCodes).toBe(500);await loading.destroy();await writeFile('test-results/qr-labels/reprint-501-part-1.pdf',bytes);

  expect((await post(`label-print-jobs/${reprint.id}/artifacts/1`,{}).expect(201)).body).toMatchObject({copies:'1',pages:1});await post(`label-print-jobs/${reprint.id}/artifacts/2`,{}).expect(400);
  await post('label-print-jobs',{...body,reason:''}).expect(400);await post('label-print-jobs',{...body,lines:[{lotId:randomUUID(),purpose:'USABLE',copies:'1'}]}).expect(400);await post('label-print-jobs',{...body,lines:[...body.lines,...body.lines]}).expect(400);expect(await stockSnapshot()).toBe(before);
 },90000);
 it('previews v2 offsets without writes, then freezes the exact same PDF and keeps stock unchanged',async()=>{
  const before=await stockSnapshot();const native=(await post('label-print-jobs',{kind:'REPRINT',originalJobId:job.id,reason:'Legacy layout reproduction trial',lines:[{lotId:job.lines[0]!.lotId,purpose:'USABLE',copies:'2'}]}).expect(201)).body as LabelJob;
  // Existing v1 jobs keep their original geometry, regardless of the new UI.
  await post(`label-print-jobs/${native.id}/preview`,{chunk:'0',layout:{startSlot:1,damagedStartSlot:0}}).expect(400);
  const source=(await db.stockLot.findUniqueOrThrow({where:{id:receipt.lines[0].lotId}})).sourceId;
  const delivered=(await post('receipts',{sourceId:source,deliveredOn:'2020-01-01',lines:[{skuId:receipt.lines[0].skuId,usableQuantity:21,damagedQuantity:2,damageReason:'Damaged covers on arrival'}]}).expect(201)).body;
  const current=(await post('label-print-jobs',{kind:'INITIAL',receiptId:delivered.id,profileId:'a4-70x35-v2'}).expect(201)).body as LabelJob;
  const stockAfterReceipt=await stockSnapshot(),counts=await Promise.all([db.commandResult.count(),db.auditEvent.count(),db.outboxEvent.count(),db.labelPrintEvent.count()]);
  const layout={startSlot:5,damagedStartSlot:3};const draft=await post(`label-print-jobs/${current.id}/preview`,{chunk:'0',layout}).expect(200);
  await post(`label-print-jobs/${current.id}/preview`,{chunk:'0',layout},randomUUID(),production).expect(403);
  expect(await Promise.all([db.commandResult.count(),db.auditEvent.count(),db.outboxEvent.count(),db.labelPrintEvent.count()])).toEqual(counts);
  const key=randomUUID(),prepared=(await post(`label-print-jobs/${current.id}/artifacts/0`,layout,key).expect(201)).body;
  expect(prepared).toMatchObject({pages:3,layout,copies:'23'});expect(prepared.artifactHash).toBe(draft.headers['x-artifact-sha256']);
  expect((await post(`label-print-jobs/${current.id}/artifacts/0`,layout,key).expect(201)).body).toEqual(prepared);
  await post(`label-print-jobs/${current.id}/artifacts/0`,{startSlot:6,damagedStartSlot:3}).expect(409);
  const saved=await get(`label-print-jobs/${current.id}/artifacts/0.pdf`).expect(200);const bytes=(r:typeof saved)=>Buffer.isBuffer(r.body)?r.body:Buffer.from(r.text,'binary');expect(bytes(saved)).toEqual(bytes(draft));
  const reopened=(await post(`label-print-jobs/${current.id}/artifacts/0`,{}).expect(201)).body;expect(reopened.layout).toEqual(layout);expect(reopened.artifactHash).toBe(prepared.artifactHash);
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:new Uint8Array(bytes(saved)),useSystemFonts:false});try{const pdf=await loading.promise;expect(pdf.numPages).toBe(3);for(let page=1;page<=3;page++){const text=(await(await pdf.getPage(page)).getTextContent()).items.filter((i:any)=>'str'in i).map((i:any)=>i.str).join(' ');expect(text.includes('DAMAGED INTAKE')).toBe(page===3);}}finally{await loading.destroy();}
  expect(await stockSnapshot()).toBe(stockAfterReceipt);expect(before).not.toBe(stockAfterReceipt); // Only the explicit fixture receipt changed stock.
 });
 it('reconstructs retained PDF bytes using the accepted manifest clock despite a changed read timezone',async()=>{
  const actor=await db.user.findFirstOrThrow({where:{role:'ADMIN',membership:{originId}}});
  const shifted=db.$extends({query:{labelPrintJob:{async findUnique({args,query}){const value=await query(args);if(value?.createdAt instanceof Date)value.createdAt=new Date(value.createdAt.valueOf()+3600000);return value;}}}});
  const baseline=await new LabelsService(db,originId,'SHOP').pdf(actor,job.id,'0');
  const after=await new LabelsService(shifted as unknown as PrismaClient,originId,'SHOP').pdf(actor,job.id,'0');
  expect(after.hash).toBe(baseline.hash);expect(after.bytes).toEqual(baseline.bytes);
 });
 it('rejects immutable print evidence edits/deletion and late manifest supplementation',async()=>{
  for(const table of ['LabelPrintJob','LabelPrintJobLine','LabelPrintEvent']){const rows=await db.$queryRawUnsafe<{id:string}[]>(`SELECT id FROM "${table}" LIMIT 1`);await expect(db.$executeRawUnsafe(`UPDATE "${table}" SET id=id WHERE id=$1::uuid`,rows[0]!.id)).rejects.toThrow();await expect(db.$executeRawUnsafe(`DELETE FROM "${table}" WHERE id=$1::uuid`,rows[0]!.id)).rejects.toThrow();}
  const line=await db.labelPrintJobLine.findFirstOrThrow({where:{jobId:job.id}});await expect(db.labelPrintJobLine.create({data:{...line,content:JSON.parse(JSON.stringify(line.content)),id:randomUUID(),ordinal:99}})).rejects.toThrow();
 });
 it('rolls back print metadata and origin ordering on late audit failure without changing inventory',async()=>{
  const actor=await db.user.findFirstOrThrow({where:{role:'ADMIN',email:{contains:originId}}});const before=await stockSnapshot();const evidence=async()=>Promise.all([db.labelPrintJob.count(),db.labelPrintJobLine.count(),db.labelPrintEvent.count(),db.commandResult.count(),db.auditEvent.count(),db.outboxEvent.count(),db.originNode.findUniqueOrThrow({where:{id:originId}})]);const prior=await evidence();
  const extended=db.$extends({query:{auditEvent:{async create({args,query}){if(args.data.action==='labels.job.created')throw new Error('Forced label audit failure');return query(args);}}}});
  await expect(new LabelsService(extended as unknown as PrismaClient,originId,'SHOP').create(actor,randomUUID(),{kind:'INITIAL',receiptId:zeroReceipt.id,profileId:'a4-70x35-v1'})).rejects.toThrow('Forced label audit failure');expect(await evidence()).toEqual(prior);expect(await stockSnapshot()).toBe(before);
 });
 it('rejects unprintable critical codes before saving an initial manifest or any metadata',async()=>{
  const source=(await db.stockLot.findUniqueOrThrow({where:{id:receipt.lines[0].lotId}})).sourceId;
  const product=(await post('catalogue/products',{name:'Unprintable legacy-code trial'}).expect(201)).body;
  const sku=(await post('catalogue/skus',{sourceId:source,variantId:product.variants[0].id,baseCode:'X'.repeat(120)+randomUUID().replaceAll('-',''),suffix:'Y'.repeat(160)}).expect(201)).body;
  const received=(await post('receipts',{sourceId:source,deliveredOn:'2020-01-01',lines:[{skuId:sku.id,usableQuantity:1,damagedQuantity:0}]}).expect(201)).body;
  const before=await stockSnapshot(),count=await db.labelPrintJob.count(),key=randomUUID();const response=await post('label-print-jobs',{kind:'INITIAL',receiptId:received.id,profileId:'a4-70x35-v1'},key).expect(422);expect(response.body.message).toContain('Full SKU');expect(await db.labelPrintJob.count()).toBe(count);expect(await db.commandResult.count({where:{originId,key}})).toBe(0);expect(await stockSnapshot()).toBe(before);
 });
 it('renders supported multilingual descriptors, rejects overlong critical codes, and never clips to fit',async()=>{
  const before=await stockSnapshot(),copy={...job,rendererVersion:rendererVersion(),totalCopies:'1',lines:[{...job.lines[0]!,copies:'1',content:{...job.lines[0]!.content,productName:'Àkọ́kọ́ Café — Ελληνικά'}}]};expect((await renderLabelPdf(copy,'0')).length).toBeGreaterThan(1000);
  await expect(renderLabelPdf({...copy,lines:[{...copy.lines[0]!,content:{...copy.lines[0]!.content,fullCode:'X'.repeat(350)}}]},'0')).rejects.toThrow('Full SKU');expect(await stockSnapshot()).toBe(before);
 });
});
