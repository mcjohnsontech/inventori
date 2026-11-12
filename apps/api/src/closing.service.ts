import {randomUUID} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import {Prisma,type PrismaClient,type User} from '@prisma/client';
import {closeDaySchema,closingHistorySchema,idempotencyKeySchema,type ClosingSnapshot,type DailyCloseView,type ClosingIssueView} from '@dayari/contracts';
import {requireCapability} from './permissions.js';
import {canonical,digest} from './security.js';
const commandType='inventory.day.close',eventType='inventory.day.closed';
export class ClosingService {
 constructor(readonly db:PrismaClient,readonly originId:string,readonly mode:string){}
 private async allow(user:User,write=false){
  requireCapability(user,'OPERATIONAL_STOCK');
  if(write&&(user.role!=='MANAGER'||this.mode!=='SHOP'))throw new ForbiddenException('Only the shop Inventory Manager confirms daily closing.');
  const [row]=await this.db.$queryRaw<{ready:boolean}[]>`SELECT to_regclass('"DailyClose"') IS NOT NULL AS ready`;
  if(!row?.ready)throw new ServiceUnavailableException('Daily closing requires the separately approved shop database upgrade.');
 }
 private date(input:unknown){const p=closeDaySchema.safeParse(input);if(!p.success)throw new BadRequestException('Enter a real business date.');return p.data.businessDate;}
 private async boundary(tx:Prisma.TransactionClient,day:string){
  // Keep PostgreSQL microseconds: JS Date truncation could omit count evidence
  // accepted just before the origin lock in the same millisecond.
  const [row]=await tx.$queryRaw<{now:string;today:string;sequence:bigint}[]>`WITH moment AS MATERIALIZED(SELECT clock_timestamp() stamp) SELECT to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now,(stamp AT TIME ZONE 'Africa/Lagos')::date::text AS today,"nextSequence" AS sequence FROM "OriginNode" CROSS JOIN moment WHERE id=${this.originId}::uuid`;
  if(!row||day>row.today)throw new BadRequestException('Future business dates cannot be certified.');return row;
 }
 private async snapshot(tx:Prisma.TransactionClient,day:string,now:string,sequence:bigint){
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8s'");
  const [row]=await tx.$queryRaw<{snapshot:ClosingSnapshot;hash:string}[]>`WITH prepared AS MATERIALIZED(SELECT dayari_closing_snapshot(${this.originId}::uuid,${day}::date,${now}::timestamptz,${sequence}::bigint) AS snapshot) SELECT snapshot,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') AS hash FROM prepared`;
  return row!;
 }
 async configuration(user:User){await this.allow(user);const row=await this.boundary(this.db,'0001-01-01');return {originId:this.originId,today:row.today,timezone:'Africa/Lagos',canConfirm:user.role==='MANAGER'&&this.mode==='SHOP'};}
 async preview(user:User,input:unknown){
  await this.allow(user);const day=this.date(input);
  return this.db.$transaction(async tx=>{const b=await this.boundary(tx,day);const prepared=await this.snapshot(tx,day,b.now,b.sequence);const existing=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "DailyClose" WHERE "originId"=${this.originId}::uuid AND "businessDate"=${day}::date`;return {snapshot:prepared.snapshot,existingId:existing[0]?.id??null};},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:12000,maxWait:10000});
 }
 async list(user:User,input:unknown){
  await this.allow(user);const p=closingHistorySchema.safeParse(input);if(!p.success)throw new BadRequestException('Invalid closing page.');
  return this.db.$transaction(async tx=>{const [count]=await tx.$queryRaw<{n:bigint}[]>`SELECT count(*) n FROM "DailyClose" WHERE "originId"=${this.originId}::uuid`;
   const rows=await tx.$queryRaw<{id:string;businessDate:string;recordedAt:Date;managerName:string;snapshotHash:string}[]>`SELECT c.id,c."businessDate"::text,c."recordedAt",u.name AS "managerName",c."snapshotHash" FROM "DailyClose" c JOIN "User" u ON u.id=c."actorId" WHERE c."originId"=${this.originId}::uuid ORDER BY c."businessDate" DESC,c.id LIMIT 20 OFFSET ${(p.data.page-1)*20}`;
   return {page:p.data.page,pageSize:20,total:Number(count!.n),rows:rows.map(r=>({...r,recordedAt:r.recordedAt.toISOString()}))};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 async get(user:User,input:unknown){
  await this.allow(user);const id=idempotencyKeySchema.safeParse(input);if(!id.success)throw new BadRequestException('Invalid closing identity.');
  const [row]=await this.db.$queryRaw<{response:DailyCloseView}[]>`SELECT result.response FROM "DailyClose" c JOIN "CommandResult" result ON result.id=c."commandId" WHERE c.id=${id.data}::uuid AND c."originId"=${this.originId}::uuid`;
  if(!row)throw new NotFoundException('Closing not available in this shop.');return row.response;
 }
 async postClose(user:User,input:unknown){
  await this.allow(user);const id=idempotencyKeySchema.safeParse(input);if(!id.success)throw new BadRequestException('Invalid closing identity.');
  const [row]=await this.db.$queryRaw<{id:string;n:bigint}[]>`SELECT c.id,count(t.id) n FROM "DailyClose" c LEFT JOIN "StockTransaction" t ON t."originId"=c."originId" AND t."originSequence">c."originSequence" AND (t."recordedAt" AT TIME ZONE 'Africa/Lagos')::date=c."businessDate" WHERE c.id=${id.data}::uuid AND c."originId"=${this.originId}::uuid GROUP BY c.id`;
  if(!row)throw new NotFoundException('Closing not available in this shop.');return {id:row.id,subsequentSameDayTransactions:Number(row.n),asOf:new Date().toISOString()};
 }
 async issue(user:User,kind:string,input:string):Promise<ClosingIssueView>{
  await this.allow(user);const [rawId,state]=input.split(':');const id=idempotencyKeySchema.safeParse(rawId);
  if(!id.success||!['MISSING_REASON','COUNT_REQUIRED','COUNT_MISMATCH','CERTIFICATION_APPROVAL','BALANCE_MISMATCH','MOVEMENT_EVIDENCE'].includes(kind)||input.split(':').length>2||(kind==='BALANCE_MISMATCH'?!state||!['U','P','D','C','X'].includes(state):!!state))throw new BadRequestException('Invalid closing evidence reference.');
  const facts:ClosingIssueView['facts']=[];let recordId=id.data,title='',workspace:ClosingIssueView['workspace']='inventory',unitCode:string|undefined;
  if(kind==='MISSING_REASON'){
   const [r]=await this.db.$queryRaw<{code:string;employee:string;acceptedAt:Date;checkoutId:string;orderReference:string|null;resolved:string|null}[]>`SELECT cl.snapshot->>'unitCode' code,u.name employee,c."acceptedAt",c.id AS "checkoutId",cl."orderReference",r."reasonCode" resolved FROM "CheckoutException" e JOIN "CheckoutLine" cl ON cl.id=e."lineId" JOIN "Checkout" c ON c.id=cl."checkoutId" JOIN "User" u ON u.id=c."actorId" LEFT JOIN "CheckoutReasonResolution" x ON x."exceptionId"=e.id LEFT JOIN "ReasonReconciliation" r ON r.id=x."reconciliationId" WHERE e.id=${id.data}::uuid AND e."originId"=${this.originId}::uuid`;
   if(!r)throw new NotFoundException('Reason evidence not available.');title='Checkout reason obligation';workspace='reconciliation';unitCode=r.code;
   facts.push({label:'Unit Code',value:r.code},{label:'Checkout',value:r.checkoutId},{label:'Employee',value:r.employee},{label:'Accepted',value:r.acceptedAt.toISOString()},{label:'Order ID',value:r.orderReference??'No Order ID'},{label:'Original reason',value:'Reason not provided'},{label:'Current resolution',value:r.resolved??'Unresolved'});
  }else if(kind==='COUNT_REQUIRED'||kind==='COUNT_MISMATCH'){
   const [r]=await this.db.$queryRaw<{id:string;purpose:string;lotId:string;state:string;status:string|null;quantity:string|null;evidence:string|null;explanation:string|null}[]>(Prisma.sql`SELECT s.id,s.purpose,s."lotId",s.state,latest.status,latest."observedQuantity"::text quantity,latest.evidence,latest.explanation FROM "CountSession" s LEFT JOIN LATERAL(SELECT r.* FROM "CountAttempt" a LEFT JOIN "CountResult" r ON r."attemptId"=a.id WHERE a."sessionId"=s.id ORDER BY a."recordedAt" DESC,a.id DESC LIMIT 1) latest ON true WHERE s."originId"=${this.originId}::uuid AND ${kind==='COUNT_REQUIRED'?Prisma.sql`s.id=${id.data}::uuid`:Prisma.sql`EXISTS(SELECT 1 FROM "CountAttempt" a JOIN "CountResult" r ON r."attemptId"=a.id WHERE a."sessionId"=s.id AND r.id=${id.data}::uuid)`}`);
   if(!r)throw new NotFoundException('Count evidence not available.');recordId=r.id;title='Required physical count evidence';workspace='counts';facts.push({label:'Count session',value:r.id},{label:'Lot',value:r.lotId},{label:'State',value:r.state},{label:'Purpose',value:r.purpose},{label:'Latest recorded result',value:r.status??'Incomplete'},{label:'Latest observed quantity',value:r.quantity??'Not recorded'},{label:'Evidence',value:r.evidence??'Not recorded'},{label:'Explanation',value:r.explanation??'Not recorded'});
  }else if(kind==='CERTIFICATION_APPROVAL'){
   const [r]=await this.db.$queryRaw<{kind:string;status:string;reason:string;evidence:string}[]>`SELECT kind,status,reason,evidence FROM "AuthorizationRequest" WHERE id=${id.data}::uuid AND "originId"=${this.originId}::uuid`;
   if(!r)throw new NotFoundException('Request not available.');title='Pending certification authorization';workspace='requests';facts.push(...Object.entries(r).map(([label,value])=>({label,value})),{label:'Execution',value:'Deferred cloud authorization. No local approval or stock adjustment is available.'});
  }else if(kind==='MOVEMENT_EVIDENCE'){
   const [r]=await this.db.$queryRaw<{type:string;recordedAt:Date;originSequence:bigint}[]>`SELECT type,"recordedAt","originSequence" FROM "StockTransaction" WHERE id=${id.data}::uuid AND "originId"=${this.originId}::uuid`;
   if(!r)throw new NotFoundException('Movement not available.');title='Accepted movement evidence';workspace='reports';facts.push({label:'Transaction',value:id.data},{label:'Type',value:r.type},{label:'Recorded',value:r.recordedAt.toISOString()},{label:'Acceptance sequence',value:r.originSequence.toString()},{label:'Action',value:'Investigate the incomplete evidence. Closing has no override.'});
  }else{
   const [r]=await this.db.$queryRaw<{fullSku:string;ledger:string;projection:string}[]>`SELECT sku."fullCode" AS "fullSku",COALESCE((SELECT sum(CASE WHEN m."toState"=${state!} THEN m.quantity WHEN m."fromState"=${state!} THEN -m.quantity ELSE 0 END) FROM "StockMovement" m WHERE m."lotId"=l.id),0)::text ledger,COALESCE((SELECT quantity FROM "StockBalance" WHERE "lotId"=l.id AND "StockBalance".state=${state!}),0)::text projection FROM "StockLot" l JOIN "SupplierVariantSku" sku ON sku.id=l."skuId" WHERE l.id=${id.data}::uuid AND l."originId"=${this.originId}::uuid`;
   if(!r)throw new NotFoundException('Lot evidence not available.');title='Stock-to-ledger discrepancy';facts.push({label:'Lot',value:id.data},{label:'SKU',value:r.fullSku},{label:'State',value:state!},{label:'Current ledger quantity',value:r.ledger},{label:'Current projection quantity',value:r.projection});
  }
  return {kind,id:input,recordId,title,workspace,facts,...(unitCode?{unitCode}:{})};
 }
 async confirm(user:User,keyInput:unknown,input:unknown):Promise<DailyCloseView>{
  await this.allow(user,true);const day=this.date(input),key=idempotencyKeySchema.safeParse(keyInput);if(!key.success)throw new BadRequestException('A valid idempotency key is required.');
  const hash=digest(canonical({businessDate:day}));
  for(let attempt=0;;attempt++)try{return await this.db.$transaction(async tx=>{
   const [origin]=await tx.$queryRaw<{mode:string}[]>`SELECT mode FROM "OriginNode" WHERE id=${this.originId}::uuid FOR UPDATE`;if(origin?.mode!=='SHOP')throw new ForbiddenException();
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id}::uuid FOR SHARE`;const actor=await tx.user.findUniqueOrThrow({where:{id:user.id}});requireCapability(actor,'OPERATIONAL_STOCK');
   if(actor.role!=='MANAGER'||actor.authVersion!==user.authVersion||!await tx.shopMembership.findUnique({where:{userId_originId:{userId:actor.id,originId:this.originId}}}))throw new ForbiddenException('Account or shop access changed.');
   const prior=await tx.commandResult.findUnique({where:{originId_actorId_commandType_key:{originId:this.originId,actorId:actor.id,commandType,key:key.data}}});
   if(prior){if(prior.requestHash!==hash)throw new ConflictException('Idempotency key reused for a different closing.');return prior.response as unknown as DailyCloseView;}
   const existing=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "DailyClose" WHERE "originId"=${this.originId}::uuid AND "businessDate"=${day}::date`;
   if(existing.length)throw new ConflictException('This business date is already finalized. Open its immutable closing report.');
   const b=await this.boundary(tx,day),prepared=await this.snapshot(tx,day,b.now,b.sequence);
   if(prepared.snapshot.blockers.length)throw new ConflictException({message:'Closing is blocked. Resolve the listed evidence before confirming.',blockers:prepared.snapshot.blockers});
   const id=randomUUID(),commandId=randomUUID(),sequence=b.sequence+1n;
   await tx.originNode.update({where:{id:this.originId},data:{nextSequence:sequence}});
   await tx.$executeRaw`INSERT INTO "DailyClose"(id,"originId","businessDate","actorId","commandId","recordedAt","originSequence","cutoffSequence",snapshot,"snapshotHash") VALUES(${id}::uuid,${this.originId}::uuid,${day}::date,${actor.id}::uuid,${commandId}::uuid,${b.now}::timestamptz,${sequence},${b.sequence},${JSON.stringify(prepared.snapshot)}::jsonb,${prepared.hash})`;
   const response:DailyCloseView={id,originId:this.originId,businessDate:day,recordedAt:b.now,originSequence:sequence.toString(),cutoffSequence:b.sequence.toString(),snapshotHash:prepared.hash,manager:{id:actor.id,name:actor.name},snapshot:prepared.snapshot};
   const evidence={closingId:id,businessDate:day,snapshotHash:prepared.hash,cutoffSequence:b.sequence.toString()};
   await tx.auditEvent.create({data:{originId:this.originId,actorId:actor.id,actorRole:actor.role,commandId,action:eventType,subjectId:id,snapshot:evidence}});
   await tx.outboxEvent.create({data:{originId:this.originId,actorId:actor.id,commandId,originSequence:sequence,eventType,aggregateId:id,payload:evidence,payloadHash:digest(canonical(evidence))}});
   await tx.commandResult.create({data:{id:commandId,originId:this.originId,actorId:actor.id,commandType,key:key.data,requestHash:hash,response:JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue}});
   return response;
  },{timeout:20000,maxWait:15000});}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2034'&&attempt<2)continue;throw error;}
 }
}
