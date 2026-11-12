import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect} from 'vitest';
import request from 'supertest';
import {lagosDate} from '@dayari/contracts';
import {database} from '../../apps/api/src/database.js';
import {createApp} from '../../apps/api/src/app.js';
import {ClosingService} from '../../apps/api/src/closing.service.js';
import {shopToken} from './shop-fixture.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Isolated test database only');
const db=database(url),originId=randomUUID(),day=lagosDate(new Date());
let app:Awaited<ReturnType<typeof createApp>>,admin:string,manager:string,production:string,sourceId:string,skuId:string,lotId:string,unitIds:string[],checkout:any,close:any;
const get=(path:string,token=manager)=>request(app.getHttpServer()).get('/v1/'+path).set('Authorization','Bearer '+token);
const post=(path:string,body:object,key=randomUUID(),token=manager)=>request(app.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+token).set('Idempotency-Key',key).send(body);
const preview=async()=> (await get('daily-closings/preview?businessDate='+day).expect(200)).body;
const quantities=async()=> (await db.stockBalance.findMany({where:{lotId},orderBy:{state:'asc'}})).map(r=>({state:r.state,quantity:r.quantity.toString()}));
beforeAll(async()=>{
 await db.originNode.create({data:{id:originId,mode:'SHOP'}});app=await createApp(db,originId,'SHOP');admin=await shopToken(db,app,originId);manager=await shopToken(db,app,originId,'MANAGER');production=await shopToken(db,app,originId,'PRODUCTION');
 const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});
 sourceId=(await post('catalogue/supplier-setups',{supplier:{name:'Closing '+originId},location:{registryId:registry.id}},randomUUID(),admin).expect(201)).body.source.id;
 skuId=(await post('catalogue/product-setups',{sourceId,product:{name:'Closing notebook'},variants:[]},randomUUID(),admin).expect(201)).body.skus[0].id;
 const receipt=(await post('receipts',{sourceId,deliveredOn:'2020-01-01',lines:[{skuId,usableQuantity:8,damagedQuantity:1,damageReason:'Damaged intake evidence'}]}).expect(201)).body;
 lotId=receipt.lines[0].lotId;unitIds=(await db.stockUnit.findMany({where:{lotId,initialState:'U'},orderBy:{id:'asc'}})).map(u=>u.id);
});
afterAll(async()=>{await app?.close();await db.$disconnect();});
it('enforces Manager confirmation, Admin review, Production denial and actual Lagos dates',async()=>{
 expect((await get('closing-config',admin).expect(200)).body.canConfirm).toBe(false);
 expect((await get('closing-config').expect(200)).body.today).toBe(day);
 for(const token of [admin,production])await post('daily-closings',{businessDate:day},randomUUID(),token).expect(403);
 for(const path of ['closing-config','daily-closings','daily-closings/preview?businessDate='+day])await get(path,production).expect(403);
 await request(app.getHttpServer()).get('/v1/daily-closings').expect(401);
 for(const businessDate of ['2025-02-29','0000-01-01','2999-01-01'])await post('daily-closings',{businessDate}).expect(400);
 await get('daily-closings/preview?businessDate='+day+'&override=true').expect(400);
 const p=await preview();expect(p.snapshot.blockers).toEqual([]);expect(p.snapshot.transactions).toHaveLength(1);
 expect(p.snapshot.balances.find((r:any)=>r.state==='U')).toMatchObject({opening:'0',incoming:'8',closing:'8'});
 expect((await get('daily-closings/preview?businessDate=2020-01-01').expect(200)).body.snapshot.transactions).toEqual([]);
 const actors=await db.user.findMany({where:{membership:{originId},role:{in:['ADMIN','MANAGER']}}});
 for(const actor of actors)await expect(db.$transaction(async tx=>{
  const origin=await tx.originNode.update({where:{id:originId},data:{nextSequence:{increment:1}}});
  const [prepared]=await tx.$queryRaw<{snapshot:any;hash:string}[]>`WITH x AS(SELECT dayari_closing_snapshot(${originId}::uuid,${day}::date,clock_timestamp(),${origin.nextSequence-1n}) snapshot) SELECT snapshot,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') hash FROM x`;
  await tx.$executeRaw`INSERT INTO "DailyClose"(id,"originId","businessDate","actorId","commandId","recordedAt","originSequence","cutoffSequence",snapshot,"snapshotHash") VALUES(${randomUUID()}::uuid,${originId}::uuid,${day}::date,${actor.id}::uuid,${randomUUID()}::uuid,${prepared!.snapshot.cutoffAt}::timestamptz,${origin.nextSequence},${origin.nextSequence-1n},${JSON.stringify(prepared!.snapshot)}::jsonb,${prepared!.hash})`;
  await tx.$executeRawUnsafe('SET CONSTRAINTS close_complete IMMEDIATE');
 })).rejects.toThrow();
 expect(await db.dailyClose.count({where:{originId}})).toBe(0);
});
it('blocks missing reasons, then permits immutable Admin classification without moving stock',async()=>{
 checkout=(await post('checkouts',{reason:null,orderReference:'REUSABLE-CLOSING',lines:unitIds.slice(0,3).map(unitId=>({unitId}))},randomUUID(),production).expect(201)).body;
 expect((await preview()).snapshot.blockers.filter((r:any)=>r.kind==='MISSING_REASON')).toHaveLength(3);
 const reference='closing-issues/MISSING_REASON/'+checkout.lines[0].exceptionId;
 expect((await get(reference,admin).expect(200)).body.unitCode).toBe(checkout.lines[0].unit.unitCode);
 await get(reference,production).expect(403);await get('closing-issues/MISSING_REASON/'+randomUUID()).expect(404);await get('closing-issues/UNKNOWN/'+randomUUID()).expect(400);
 const sequence=(await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence;
 await post('daily-closings',{businessDate:day}).expect(409);expect((await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence).toBe(sequence);
 await post('reason-reconciliations',{exceptionIds:checkout.lines.map((r:any)=>r.exceptionId),reason:{code:'PRODUCTION_USE'}},randomUUID(),admin).expect(201);
 expect((await preview()).snapshot.blockers).toEqual([]);
});
it('carries certified In Production and held damage, and does not execute pending recovery',async()=>{
 await post('completions',{unitIds:[unitIds[0]]}).expect(201);
 await post('damage-reports',{unitIds:[unitIds[1]],cause:'Broken cover',description:'Cover damaged during production handling'},randomUUID(),production).expect(201);
 await post('damage-reviews',{unitIds:[unitIds[1]],outcome:'HELD',note:'Held pending authorized disposition'}).expect(201);
 const before=await quantities();
 await post('authorization-requests',{kind:'RECOVERY',unitIds:[unitIds[1]],reason:'Request inspected stock recovery',evidence:'Recorded inspection evidence for held item'}).expect(201);
 expect(await quantities()).toEqual(before);
 const p=await preview();expect(p.snapshot.blockers).toEqual([]);expect(p.snapshot.carryForward.find((r:any)=>r.state==='P').closing).toBe('1');expect(p.snapshot.carryForward.find((r:any)=>r.state==='D').closing).toBe('2');expect(p.snapshot.evidence.pendingRecoveries).toHaveLength(1);
});
it('requires initiated count evidence, preserves mismatches and requires an explained matching recount',async()=>{
 const session=(await post('count-sessions',{lotId,state:'U',purpose:'Required selected shelf verification'}).expect(201)).body;
 expect((await preview()).snapshot.blockers.some((b:any)=>b.kind==='COUNT_REQUIRED')).toBe(true);
 const a=(await post('count-attempts',{sessionId:session.id}).expect(201)).body;
 const evidence={explanation:'Counted physical labels on selected shelf',evidence:'Physical synthetic fixture count evidence'};
 await post('count-observations',{attemptId:a.id,unitIds:unitIds.slice(3,7)}).expect(201);
 const mismatch=(await post('count-results',{attemptId:a.id,observedQuantity:'4',unidentifiedExtras:'0',...evidence}).expect(201)).body;
 expect(mismatch.status).toBe('MISMATCH');expect((await preview()).snapshot.blockers.some((b:any)=>b.kind==='COUNT_MISMATCH')).toBe(true);
 expect((await get('closing-issues/COUNT_MISMATCH/'+mismatch.id).expect(200)).body.recordId).toBe(session.id);
 const b=(await post('count-attempts',{sessionId:session.id}).expect(201)).body;
 await post('count-observations',{attemptId:b.id,unitIds:unitIds.slice(3)}).expect(201);
 const match=(await post('count-results',{attemptId:b.id,observedQuantity:'5',unidentifiedExtras:'0',...evidence}).expect(201)).body;
 expect(match.status).toBe('MATCHED');expect((await preview()).snapshot.blockers.some((b:any)=>b.kind==='COUNT_MISMATCH')).toBe(true);
 await post('count-resolutions',{resultId:mismatch.id,matchingResultId:match.id,explanation:'Overlooked one label; matching recount confirms mistaken finding'}).expect(201);
 expect((await preview()).snapshot.blockers).toEqual([]);
 const progress=(await post('count-sessions',{lotId,state:'P',purpose:'In-progress production count verification'}).expect(201)).body;
 const attempt=(await post('count-attempts',{sessionId:progress.id}).expect(201)).body;
 await post('count-observations',{attemptId:attempt.id,unitIds:[unitIds[2]]}).expect(201);
 await post('completions',{unitIds:[unitIds[2]]}).expect(201);
 expect((await post('count-results',{attemptId:attempt.id,observedQuantity:'1',unidentifiedExtras:'0',...evidence}).expect(201)).body.status).toBe('STALE');
 expect((await preview()).snapshot.blockers.some((b:any)=>b.kind==='COUNT_REQUIRED')).toBe(true);
 const fresh=(await post('count-attempts',{sessionId:progress.id}).expect(201)).body;
 expect((await post('count-results',{attemptId:fresh.id,observedQuantity:'0',unidentifiedExtras:'0',...evidence}).expect(201)).body.status).toBe('MATCHED');
 expect((await preview()).snapshot.blockers).toEqual([]);
});
it('detects projection anomalies and missing mandatory evidence inside rolled-back synthetic transactions',async()=>{
 await expect(db.$transaction(async tx=>{
  await tx.stockBalance.update({where:{lotId_state:{lotId,state:'U'}},data:{quantity:{increment:1}}});
  const [r]=await tx.$queryRaw<{snapshot:any}[]>`SELECT dayari_closing_snapshot(${originId}::uuid,${day}::date,clock_timestamp(),999999999::bigint) snapshot`;
  expect(r!.snapshot.blockers.some((b:any)=>b.kind==='BALANCE_MISMATCH')).toBe(true);throw Error('Rollback anomaly fixture');
 })).rejects.toThrow('Rollback anomaly fixture');
 await expect(db.$transaction(async tx=>{
  const actor=await tx.user.findFirstOrThrow({where:{role:'MANAGER',membership:{originId}}});
  const sequence=(await tx.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence+1n;
  await tx.stockTransaction.create({data:{id:randomUUID(),originId,commandId:randomUUID(),originSequence:sequence,type:'ISSUE',actorId:actor.id,actorRole:'MANAGER',recordedAt:new Date()}});
  const [r]=await tx.$queryRaw<{snapshot:any}[]>`SELECT dayari_closing_snapshot(${originId}::uuid,${day}::date,clock_timestamp(),${sequence}) snapshot`;
  expect(r!.snapshot.blockers.some((b:any)=>b.kind==='MOVEMENT_EVIDENCE')).toBe(true);throw Error('Rollback evidence fixture');
 })).rejects.toThrow('Rollback evidence fixture');
 expect((await preview()).snapshot.blockers).toEqual([]);
});
it('rolls back a late failure including closing, audit, outbox, sequence and command result',async()=>{
 const before={quantity:await quantities(),sequence:(await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence,closes:await db.dailyClose.count({where:{originId}}),audit:await db.auditEvent.count({where:{originId}}),outbox:await db.outboxEvent.count({where:{originId}})},key=randomUUID();
 const name='fixture_close_fail_'+originId.replaceAll('-','');
 await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."originId"='${originId}'::uuid AND NEW."eventType"='inventory.day.closed' THEN RAISE EXCEPTION 'Synthetic closing failure'; END IF;RETURN NEW;END $$`);
 await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
 try{await post('daily-closings',{businessDate:day},key).expect(500);}finally{await db.$executeRawUnsafe(`DROP TRIGGER ${name} ON "OutboxEvent"`);await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`);}
 expect({quantity:await quantities(),sequence:(await db.originNode.findUniqueOrThrow({where:{id:originId}})).nextSequence,closes:await db.dailyClose.count({where:{originId}}),audit:await db.auditEvent.count({where:{originId}}),outbox:await db.outboxEvent.count({where:{originId}})}).toEqual(before);
 expect(await db.commandResult.count({where:{originId,key}})).toBe(0);
});
it('concurrent same-key confirmation, lost-response replay and conflicting dates preserve immutable evidence',async()=>{
 const key=randomUUID(),before=await quantities(),body={businessDate:day};const replies=await Promise.all([post('daily-closings',body,key),post('daily-closings',body,key)]);
 expect(replies.map(r=>r.status)).toEqual([201,201]);expect(replies[1].body).toEqual(replies[0].body);close=replies[0].body;
 expect((await post('daily-closings',body,key).expect(201)).body).toEqual(close);
 await post('daily-closings',{businessDate:'2020-01-01'},key).expect(409);await post('daily-closings',body).expect(409);
 expect(await quantities()).toEqual(before);expect((await get('daily-closings/'+close.id,admin).expect(200)).body).toEqual(close);
 expect(await db.stockTransaction.count({where:{commandId:(await db.dailyClose.findUniqueOrThrow({where:{id:close.id}})).commandId}})).toBe(0);
 await expect(db.dailyClose.update({where:{id:close.id},data:{snapshotHash:'changed'}})).rejects.toThrow();await expect(db.dailyClose.delete({where:{id:close.id}})).rejects.toThrow();
});
it('later same-day transactions and reused Order IDs never rewrite closing or completed histories',async()=>{
 await post('checkouts',{reason:{code:'SAMPLE'},orderReference:'REUSABLE-CLOSING',lines:[{unitId:unitIds[3]}]},randomUUID(),production).expect(201);
 expect((await get('daily-closings/'+close.id).expect(200)).body).toEqual(close);
 expect((await get('daily-closings/'+close.id+'/post-close').expect(200)).body.subsequentSameDayTransactions).toBe(1);
 expect((await db.unitState.findUniqueOrThrow({where:{unitId:unitIds[0]}})).state).toBe('C');
 expect((await preview()).snapshot.blockers.some((b:any)=>b.kind==='COUNT_REQUIRED')).toBe(false);
});
it('scopes reports by origin and denies cloud confirmation',async()=>{
 const otherId=randomUUID();await db.originNode.create({data:{id:otherId,mode:'SHOP'}});const other=await createApp(db,otherId,'SHOP');try{const token=await shopToken(db,other,otherId,'MANAGER');await request(other.getHttpServer()).get('/v1/daily-closings/'+close.id).set('Authorization','Bearer '+token).expect(404);}finally{await other.close();}
 const actor=await db.user.findFirstOrThrow({where:{role:'MANAGER',membership:{originId}}});await expect(new ClosingService(db,originId,'CLOUD').confirm(actor,randomUUID(),{businessDate:day})).rejects.toThrow('Only the shop Inventory Manager');
});
it('pending correction approval blocks certification while remaining stock-neutral',async()=>{
 const before=await quantities();await post('authorization-requests',{kind:'CORRECTION',lotId,state:'U',observedQuantity:'3',reviewedLedgerQuantity:'4',reviewedProjectionQuantity:'4',reason:'Physical discrepancy needs approved correction',evidence:'Actual count evidence for deferred authorization'}).expect(201);
 const p=await preview();expect(p.snapshot.blockers.some((b:any)=>b.kind==='CERTIFICATION_APPROVAL')).toBe(true);expect(await quantities()).toEqual(before);
});
it('serializes a stock-changing checkout against confirmation and permits only one different-key close',async()=>{
 const origin=randomUUID();await db.originNode.create({data:{id:origin,mode:'SHOP'}});const other=await createApp(db,origin,'SHOP');
 try{
  const a=await shopToken(db,other,origin),m=await shopToken(db,other,origin,'MANAGER'),p=await shopToken(db,other,origin,'PRODUCTION');
  const send=(path:string,body:object,token=m)=>request(other.getHttpServer()).post('/v1/'+path).set('Authorization','Bearer '+token).set('Idempotency-Key',randomUUID()).send(body);
  const registry=await db.locationRegistry.findFirstOrThrow({where:{code:'LG'}});
  const source=(await send('catalogue/supplier-setups',{supplier:{name:'Close race '+origin},location:{registryId:registry.id}},a).expect(201)).body.source;
  const product=(await send('catalogue/product-setups',{sourceId:source.id,product:{name:'Race stock'},variants:[]},a).expect(201)).body;
  const received=(await send('receipts',{sourceId:source.id,deliveredOn:'2020-01-01',lines:[{skuId:product.skus[0].id,usableQuantity:2,damagedQuantity:0}]}).expect(201)).body;
  const unit=await db.stockUnit.findFirstOrThrow({where:{lotId:received.lines[0].lotId}});
  const [closing,issued]=await Promise.all([send('daily-closings',{businessDate:day}),send('checkouts',{reason:null,orderReference:'RACE',lines:[{unitId:unit.id}]},p)]);
  expect(issued.status).toBe(201);expect([201,409]).toContain(closing.status);
  const tx=await db.stockTransaction.findUniqueOrThrow({where:{id:issued.body.transactionId}});
  if(closing.status===201){expect(BigInt(closing.body.originSequence)).toBeLessThan(tx.originSequence);expect(closing.body.snapshot.balances.find((r:any)=>r.state==='U').closing).toBe('2');}
  else expect(await db.dailyClose.count({where:{originId:origin}})).toBe(0);
  expect((await db.stockBalance.findUniqueOrThrow({where:{lotId_state:{lotId:received.lines[0].lotId,state:'U'}}})).quantity).toBe(1n);
  const competing=await Promise.all([send('daily-closings',{businessDate:'2001-01-01'}),send('daily-closings',{businessDate:'2001-01-01'})]);
  expect(competing.map(r=>r.status).sort()).toEqual([201,409]);
 }finally{await other.close();}
});
