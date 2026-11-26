'use client';
import { LIST_PAGE_SIZE } from '@dayari/contracts';
import {useEffect,useRef,useState} from 'react';
import {closeDaySchema,idempotencyKeySchema,type ClosingPreview,type ClosingSnapshot,type DailyCloseView,type ClosingBlocker,type ClosingIssueView} from '@dayari/contracts';
import {api,ApiError,useApiRead} from '../lib/api';
import {formatDate,formatDateTime,isPositive} from '../lib/format';
import {TaskModal} from './ui/task-modal';
import {ReasonFollowupDrawer} from './reason-followup-drawer';
import {Badge,Button,Checkbox,Code,DataTable,DetailsDrawer,DetailSkeleton,ErrorNotice,Field,Input,Page,PageHeader,Pager,Panel,SuccessNotice,WarningNotice,InfoNotice} from './ui';
import type {Workspace} from './shell/destinations';
const states:Record<string,string>={U:'Usable',P:'Checked out',D:'Damaged',C:'Finished',X:'Removed'};
const stateOrder=['U','P','D','C','X'] as const;
type Balance=ClosingSnapshot['balances'][number];
/** One row per lot with every state as a column, instead of five rows per lot. */
function lotRows(balances:Balance[]){
 const rows=new Map<string,{key:string;first:Balance;states:Partial<Record<string,Balance>>;active:boolean}>();
 for(const b of balances){
  const row=rows.get(b.lotId)??{key:b.lotId,first:b,states:{},active:false};
  row.states[b.state]=b;
  if([b.opening,b.incoming,b.outgoing,b.closing].some(isPositive))row.active=true;
  rows.set(b.lotId,row);
 }
 return [...rows.values()];
}
function StateCell({value}:{value?:Balance}){
 if(!value||![value.opening,value.incoming,value.outgoing,value.closing].some(isPositive))return <span className="text-grey-3">0</span>;
 const moved=isPositive(value.incoming)||isPositive(value.outgoing);
 return <><span className="font-semibold text-ink">{value.closing}</span>{moved?<span className="block text-[11px] text-grey-3">from {value.opening} · +{value.incoming} −{value.outgoing}</span>:null}</>;
}
function Snapshot({value,navigate,onIssue}:{value:ClosingSnapshot;navigate?:(workspace:Workspace)=>void;onIssue?:(issue:ClosingBlocker)=>void}){
  const [page,setPage]=useState(1),[blockPage,setBlockPage]=useState(1),[carryPage,setCarryPage]=useState(1),[showEmpty,setShowEmpty]=useState(false);
  const allRows=lotRows(value.balances),rows=showEmpty?allRows:allRows.filter(r=>r.active);
  const counts=[['RECEIPT','Receipts'],['ISSUE','Checkouts'],['DAMAGE','Damage reports'],['COMPLETE','Finished'],['DISPOSITION','Damage decisions'],['RECOVERY','Put back into stock'],['CORRECTION','Marked missing']] as const;
  return <div className="space-y-5">
  {value.blockers.length?<Panel title={`Must be resolved before closing · ${value.blockers.length}`}><div className="space-y-3">{value.blockers.slice((blockPage - 1) * LIST_PAGE_SIZE, blockPage * LIST_PAGE_SIZE).map(b=><div key={b.kind+b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-damaged/25 bg-damaged-tint p-3"><div className="min-w-0"><p className="font-semibold text-ink">{b.message}</p><Code tone="muted" className="block break-all text-xs">{b.id}</Code></div>{onIssue?<Button variant="secondary" size="compact" onClick={()=>onIssue(b)}>Open details</Button>:navigate?<Button variant="secondary" size="compact" onClick={()=>navigate(b.workspace)}>Open {b.workspace==='reconciliation'?'reason follow-up':b.workspace}</Button>:null}</div>)}<Pager page={blockPage} pageCount={Math.ceil(value.blockers.length / LIST_PAGE_SIZE)} total={value.blockers.length} onChange={setBlockPage}/></div></Panel>:<SuccessNotice message="No issues block closing this day."/>}
  <Panel title="Today's activity"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{counts.map(([type,label])=><div key={type} className="rounded-xl bg-surface-muted px-4 py-3"><p className="text-xs text-grey-2">{label}</p><p className="mt-1 font-display text-xl font-semibold text-ink">{value.transactions.filter(t=>t.type===type).length}</p></div>)}<div className="rounded-xl bg-surface-muted px-4 py-3"><p className="text-xs text-grey-2">Count results</p><p className="mt-1 font-display text-xl font-semibold text-ink">{value.evidence.countResults.length}</p></div></div><p className="mt-3 text-xs text-grey-2">Number of transactions, not item quantities.</p></Panel>
  <Panel title="Stock by lot at end of day" action={<label className="flex items-center gap-2 text-sm text-grey-2"><Checkbox checked={showEmpty} onChange={e=>{setShowEmpty(e.target.checked);setPage(1);}}/>Show lots with no stock or movement</label>}><p className="mb-3 text-xs text-grey-2">Each figure is the closing quantity. Where stock moved today, the opening quantity and movements are shown underneath.</p><DataTable label="Certified lot balances" mobileStack rows={rows.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE)} rowKey={r=>r.key} emptyMessage={allRows.length?'No lot had stock or movement on this day.':'No stock accepted by this day.'} columns={[
  {key:'stock',label:'Product / lot',wide:true,mobileFullWidth:true,cell:r=><><span className="font-medium text-ink">{r.first.productName} · {r.first.variantName}</span><Code tone="muted" className="block text-xs">{r.first.fullSku}</Code><span className="block text-xs text-grey-3">{r.first.lotCode??'Legacy lot'} · {r.first.publicBatchCode}</span></>},
  ...stateOrder.map(state=>({key:state,label:states[state]??state,align:'right' as const,cell:(r:typeof rows[number])=><StateCell value={r.states[state]}/>})),
  ]}/><Pager page={page} pageCount={Math.ceil(rows.length / LIST_PAGE_SIZE)} total={rows.length} onChange={setPage}/></Panel>
  <Panel title="Still held at end of day"><p className="mb-3 text-sm text-grey-2">Items in production or damaged carry over to the next day. They don't stop you closing.</p><DataTable label="Closing carry-forward" mobileStack rows={value.carryForward.slice((carryPage - 1) * LIST_PAGE_SIZE, carryPage * LIST_PAGE_SIZE)} rowKey={r=>r.lotId+r.state} emptyMessage="Nothing is carried over." columns={[{key:'item',label:'Item',wide:true,cell:r=><><span className="font-medium text-ink">{r.productName} · {r.variantName}</span><Code tone="muted" className="block text-xs">{r.fullSku}</Code><span className="block text-xs text-grey-3">{r.lotCode??r.publicBatchCode}</span></>},{key:'state',label:'Status',cell:r=><Badge tone={r.state==='D'?'damaged':'neutral'}>{states[r.state]}</Badge>},{key:'quantity',label:'Quantity',align:'right',cell:r=>r.closing}]}/><Pager page={carryPage} pageCount={Math.ceil(value.carryForward.length / LIST_PAGE_SIZE)} total={value.carryForward.length} onChange={setCarryPage}/></Panel>
  <p className="text-xs text-grey-3">Snapshot of {formatDate(value.businessDate)} (Lagos time) · record #{value.cutoffSequence}</p>
  </div>;
}
function ClosingIssueDrawer({issue,onClose,navigate}:{issue:ClosingBlocker;onClose:()=>void;navigate:(workspace:Workspace)=>void}){
 const read=useApiRead<ClosingIssueView>(`closing-issues/${issue.kind}/${encodeURIComponent(issue.id)}`),[reasonOpen,setReasonOpen]=useState(false);
 return <><DetailsDrawer title="Issue details" closeLabel="Close issue details" active={!reasonOpen} onClose={onClose}>
 {read.loading?<DetailSkeleton/>:read.error?<ErrorNotice message={read.error} onRetry={read.refresh}/>:read.data?<div className="space-y-4"><h3 className="font-semibold">{read.data.title}</h3><dl className="space-y-3">{read.data.facts.map(f=><div key={f.label}><dt className="text-xs text-grey-2">{f.label}</dt><dd className="break-words text-sm">{f.value}</dd></div>)}</dl>{issue.kind==='COUNT_MISMATCH'?<InfoNotice>A later count that matches doesn't erase the original difference. Record a recount with an explanation to resolve it.</InfoNotice>:null}{read.data.unitCode?<Button onClick={()=>setReasonOpen(true)}>View reason details</Button>:null}<Button variant="secondary" onClick={()=>{onClose();navigate(read.data!.workspace);}}>Open resolution workspace</Button><p className="text-xs text-grey-2">After fixing the issue, press Check again on the Close day page.</p></div>:null}
 </DetailsDrawer>{reasonOpen&&read.data?.unitCode?<ReasonFollowupDrawer unitCode={read.data.unitCode} onClose={()=>{setReasonOpen(false);read.refresh();}}/>:null}</>;
}
export function ClosingReportDrawer({id,onClose}:{id:string;onClose:()=>void}){
 const read=useApiRead<DailyCloseView>('daily-closings/'+id),late=useApiRead<{subsequentSameDayTransactions:number;asOf:string}>(`daily-closings/${id}/post-close`);
 return <DetailsDrawer title="End-of-day report" closeLabel="Close closing report" onClose={onClose} wide>{read.loading?<DetailSkeleton/>:read.error?<ErrorNotice message={read.error} onRetry={read.refresh}/>:read.data?<div className="space-y-5"><p>Confirmed by {read.data.manager.name} · {formatDateTime(read.data.recordedAt)}</p><p className="break-all text-xs">Report fingerprint <Code>{read.data.snapshotHash}</Code></p>{late.data?<WarningNotice>{late.data.subsequentSameDayTransactions} later same-day stock transactions as of {formatDateTime(late.data.asOf)}. These are separate evidence and do not rewrite this snapshot. Current stock may differ.</WarningNotice>:late.error?<ErrorNotice message={late.error} onRetry={late.refresh}/>:null}<Snapshot value={read.data.snapshot}/></div>:null}</DetailsDrawer>;
}
type Config={originId:string;today:string;canConfirm:boolean};
export function ClosingWorkspace({actorId,navigate}:{actorId:string;navigate:(workspace:Workspace)=>void}){
 const config=useApiRead<Config>('closing-config');
 return <Page className="space-y-5"><PageHeader title="End of day" description=""/>{config.loading?<DetailSkeleton/>:config.error?<ErrorNotice message={config.error} onRetry={config.refresh}/>:config.data?<Content actorId={actorId} config={config.data} navigate={navigate}/>:null}</Page>;
}
function Content({actorId,config,navigate}:{actorId:string;config:Config;navigate:(workspace:Workspace)=>void}){
 const [day,setDay]=useState(config.today),[review,setReview]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[page,setPage]=useState(1),[ready,setReady]=useState(false),[issue,setIssue]=useState<ClosingBlocker|null>(null);
 const pending=useRef<{key:string;businessDate:string}|null>(null),latch=useRef(false),mounted=useRef(true);
 const storage=`dayari-closing-${config.originId}-${actorId}`;
 const preview=useApiRead<ClosingPreview>(`daily-closings/preview?businessDate=${encodeURIComponent(day)}`);
 const history=useApiRead<{rows:{id:string;businessDate:string;managerName:string;recordedAt:string}[];total:number;pageSize:number}>(`daily-closings?page=${page}`);
 useEffect(()=>{mounted.current=true;try{const saved=JSON.parse(sessionStorage.getItem(storage)??'null');if(saved){pending.current={key:idempotencyKeySchema.parse(saved.key),businessDate:closeDaySchema.parse({businessDate:saved.businessDate}).businessDate};setDay(pending.current.businessDate);}}catch{sessionStorage.removeItem(storage);}setReady(true);return()=>{mounted.current=false;};},[storage]);
 useEffect(()=>{const guard=(e:Event)=>{if(latch.current)e.preventDefault();};window.addEventListener('dayari:before-navigate',guard);window.addEventListener('beforeunload',guard);return()=>{window.removeEventListener('dayari:before-navigate',guard);window.removeEventListener('beforeunload',guard);};},[]);
 async function confirm(){if(latch.current||!ready)return;latch.current=true;setBusy(true);setError('');try{
  const request=pending.current??{key:crypto.randomUUID(),businessDate:day};sessionStorage.setItem(storage,JSON.stringify(request));pending.current=request;
  const saved=await api<DailyCloseView>('daily-closings',{method:'POST',headers:{'Idempotency-Key':request.key},body:JSON.stringify({businessDate:request.businessDate})});
  sessionStorage.removeItem(storage);pending.current=null;if(mounted.current){setReview(false);setSelected(saved.id);preview.refresh();history.refresh();}
 }catch(failure){if(failure instanceof ApiError&&[400,403,404,409,422].includes(failure.status)){pending.current=null;sessionStorage.removeItem(storage);}if(mounted.current){setError((failure as Error).message);preview.refresh();}}
 finally{latch.current=false;if(mounted.current)setBusy(false);}}
 const blocked=!preview.data||preview.loading||!!preview.error||preview.data.snapshot.blockers.length>0||!!preview.data.existingId;
 return <div className="space-y-5">{error?<ErrorNotice message={error}/>:null}
 {pending.current?<WarningNotice>We couldn't confirm the last closing was saved. Retry it before starting another; it won't be recorded twice.<Button className="mt-2" disabled={busy} onClick={()=>void confirm()}>Retry saved closing</Button></WarningNotice>:null}
 <div className="flex flex-wrap items-end gap-3"><Field label="Day (Lagos time)">{id=><Input id={id} type="date" max={config.today} value={day} disabled={busy||!!pending.current} onChange={e=>setDay(e.target.value)}/>}</Field><Button variant="secondary" disabled={busy} onClick={preview.refresh}>Check again</Button></div>
  <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.08] bg-white px-5 py-4 shadow-pop lg:bottom-4">
   <div className="min-w-0"><p className="font-semibold text-ink">{preview.loading?'Checking '+formatDate(day)+'…':preview.data?.existingId?formatDate(day)+' is already closed':preview.data?.snapshot.blockers.length?`${preview.data.snapshot.blockers.length} ${preview.data.snapshot.blockers.length===1?'issue':'issues'} to resolve before closing ${formatDate(day)}`:preview.data?`${formatDate(day)} is ready to close`:'Closing checks unavailable'}</p>{!config.canConfirm?<p className="text-sm text-grey-2">You can view this day. Closing is done by an Admin or Inventory Manager on the shop server.</p>:null}</div>
   {preview.data?.existingId?<Button variant="secondary" onClick={()=>setSelected(preview.data!.existingId!)}>Open finalized report</Button>:config.canConfirm?<Button disabled={!ready||busy||blocked||!!pending.current} onClick={()=>setReview(true)}>Review daily closing</Button>:null}
  </div>
 {preview.loading?<DetailSkeleton rows={5}/>:preview.error?<ErrorNotice message={preview.error} onRetry={preview.refresh}/>:preview.data?<><Snapshot value={preview.data.snapshot} navigate={navigate} onIssue={setIssue}/></>:null}
 <Panel title="Past end-of-day reports">{history.loading?<DetailSkeleton/>:history.error?<ErrorNotice message={history.error} onRetry={history.refresh}/>:history.data?<><DataTable label="Daily closing history" mobileStack rows={history.data.rows} rowKey={r=>r.id} emptyMessage="No days have been closed yet." columns={[{key:'date',label:'Business date',cell:r=><button className="min-h-11 text-brand underline" onClick={()=>setSelected(r.id)}>{formatDate(r.businessDate)}</button>},{key:'manager',label:'Confirmed by',cell:r=>r.managerName},{key:'time',label:'Recorded',cell:r=>formatDateTime(r.recordedAt)}]}/><Pager page={page} pageCount={Math.ceil(history.data.total / LIST_PAGE_SIZE)} total={history.data.total} onChange={setPage}/></>:null}</Panel>
 <TaskModal title="Confirm daily closing" open={review} busy={busy} onClose={()=>setReview(false)}><div className="space-y-4"><p>Close {formatDate(day)}? The checks run once more before the report is saved.</p><p>The report is permanent. It doesn't move stock or complete open production work.</p>{error?<ErrorNotice message={error}/>:null}<div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={()=>setReview(false)}>Cancel</Button><Button disabled={busy||blocked} onClick={()=>void confirm()}>{busy?'Confirming…':'Confirm daily closing'}</Button></div></div></TaskModal>
 {selected?<ClosingReportDrawer id={selected} onClose={()=>setSelected('')}/>:null}
 {issue?<ClosingIssueDrawer issue={issue} navigate={navigate} onClose={()=>{setIssue(null);preview.refresh();}}/>:null}
 </div>;
}
