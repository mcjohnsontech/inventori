'use client';
import { LIST_PAGE_SIZE } from '@dayari/contracts';
import { confirmAction } from '../ui/confirm';
import { useEffect,useRef,useState,type ReactNode } from 'react';
import { type LabelProfile,type UnitLabelJob,type UnitLabelOption,type UnitLabelOptions,type UnitLabelPreview } from '@dayari/contracts';
import { api,useApiRead } from '../../lib/api';
import { useUnitLabelDraft } from '../../lib/unit-label-draft';
import { formatDateTime } from '../../lib/format';
import { Badge,Button,Checkbox,Code,DataTable,DetailSkeleton,Disclosure,EmptyState,ErrorNotice,Field,Footnote,Page,PageHeader,Pager,Panel,SearchInput,Select,Tabs,type Column } from '../ui';
import {TaskModal} from '../ui/task-modal';
import { UnitLabelCard } from './unit-label-card';
import { UnitLabelJobView } from './unit-label-job-view';

type Configuration={originId:string;profiles:readonly LabelProfile[];cartLimit:number};
type DeliveryUnits={receiptId:string;batchCode:string;units:number;unlabelled:number;unitIds:string[]};
type History={total:number;pageSize:number;jobs:{id:string;kind:string;totalLabels:number;reason:string;createdAt:string}[]};
function Body({actorId,config,initialReceiptId}:{actorId:string;config:Configuration;initialReceiptId:string}){
 const {draft,ready,busy,update,send}=useUnitLabelDraft(actorId,config.originId);
 const [query,setQuery]=useState(''),[picked,setPicked]=useState<string[]>([]),[view,setView]=useState<'inventory'|'cart'>('inventory'),[cartPage,setCartPage]=useState(1),[inspected,setInspected]=useState(0),[historyPage,setHistoryPage]=useState(1),[historyOpen,setHistoryOpen]=useState(false),[error,setError]=useState('');
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [previews,setPreviews]=useState<UnitLabelPreview[]>([]),[previewError,setPreviewError]=useState(''),[previewLoading,setPreviewLoading]=useState(false),[previewRevision,setPreviewRevision]=useState(0);
 const [delivery,setDelivery]=useState<DeliveryUnits|null>(null),[deliveryError,setDeliveryError]=useState('');
 // Opening labels from a delivery prints exactly that delivery: the cart is replaced with its
 // items that have no label yet. Returning to the same delivery keeps a cart already in progress.
 const receiptContext=useRef('');useEffect(()=>{if(!ready||!initialReceiptId||draft.pending||receiptContext.current===initialReceiptId)return;receiptContext.current=initialReceiptId;setHistoryOpen(true);setDelivery(null);setDeliveryError('');
  api<DeliveryUnits>(`unit-label-options/delivery?receiptId=${initialReceiptId}`).then(found=>{if(!mounted.current||receiptContext.current!==initialReceiptId)return;setDelivery(found);
   if(draft.receiptId!==initialReceiptId||(!draft.unitIds.length&&!draft.jobId)){update({receiptId:initialReceiptId,jobId:null,search:'',page:1,unitIds:found.unitIds});setPicked([]);setInspected(0);setCartPage(1);setView(found.unitIds.length?'cart':'inventory');}
  }).catch(failure=>{if(mounted.current)setDeliveryError((failure as Error).message);});
 },[ready,initialReceiptId,draft.pending]);
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(draft.search),250);return()=>clearTimeout(timer);},[draft.search]);
 // Only a delivery opened from Deliveries filters the list; the menu's Print labels shows all stock.
 const receiptId=initialReceiptId;
 const source=useApiRead<UnitLabelOptions>(ready&&query===draft.search?`unit-label-options?query=${encodeURIComponent(query)}&page=${draft.page}${receiptId?'&receiptId='+receiptId:''}`:null);
 const history=useApiRead<History>(ready&&historyOpen?`unit-label-jobs?page=${historyPage}${receiptId?'&receiptId='+receiptId:''}`:null);
 const jobRead=useApiRead<UnitLabelJob>(ready&&draft.jobId?`unit-label-jobs/${draft.jobId}`:null);
 const ids=JSON.stringify(draft.unitIds);
 useEffect(()=>{const abort=new AbortController();setPreviews([]);setPreviewError('');setPreviewLoading(ready&&draft.unitIds.length>0);
  if(ready&&draft.unitIds.length)api<UnitLabelPreview[]>('unit-label-previews',{method:'POST',body:JSON.stringify({unitIds:draft.unitIds}),signal:abort.signal}).then(rows=>{if(!abort.signal.aborted)setPreviews(rows);}).catch(error=>{if(!abort.signal.aborted)setPreviewError(error.message);}).finally(()=>{if(!abort.signal.aborted)setPreviewLoading(false);});
  return()=>abort.abort();
 },[ready,ids,previewRevision]);
 const pending=Boolean(draft.pending),disabled=busy||pending;
 async function action(work:()=>Promise<void>){setError('');try{await work();}catch(error){if(mounted.current)setError((error as Error).message);}}
 function add(ids:string[]){if(disabled)return;const next=[...new Set([...draft.unitIds,...ids])];if(next.length>config.cartLimit){setError(`Select at most ${config.cartLimit} exact unit labels per job. Use separate jobs for a larger selection.`);return;}update({unitIds:next});setPicked([]);setView('cart');setCartPage(1);}
 async function prepare(id:string){await send(`unit-label-jobs/${id}/artifact`,draft.sheetStart);if(mounted.current)jobRead.refresh();}
 async function create(){await send<UnitLabelJob>('unit-label-jobs',{kind:'INITIAL',unitIds:draft.unitIds,profileId:draft.profileId});if(!mounted.current)return;source.refresh();history.refresh();if(initialReceiptId)void api<DeliveryUnits>(`unit-label-options/delivery?receiptId=${initialReceiptId}`).then(found=>{if(mounted.current)setDelivery(found);}).catch(()=>{});}
 async function retry(){const previous=draft.pending;if(!previous)return;await send(previous.path,previous.body);if(mounted.current){source.refresh();jobRead.refresh();history.refresh();}}
 function discard(){if(disabled)return;if(draft.unitIds.length)void confirmAction('Clear the print cart? Nothing has been printed.',{confirmLabel:'Clear cart'}).then(ok=>{if(ok){update({unitIds:[]});setInspected(0);setCartPage(1);}});}
 const cartColumns:Column<UnitLabelPreview>[]=[
  {key:'unit',label:'Item code',cell:unit=><button type="button" className="min-h-11 text-left font-mono text-sm font-semibold tracking-wider text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand" onClick={()=>setInspected(previews.findIndex(item=>item.unitId===unit.unitId))}>{unit.content.unitCode}</button>},
  {key:'product',label:'Product / supplier code',wide:true,cell:unit=><><span className="block">{unit.content.productName} · {unit.content.variantName}</span><Code tone="muted">{unit.content.fullSku}</Code></>},
  {key:'remove',label:'Cart action',cell:unit=><Button variant="ghost" disabled={disabled} onClick={()=>{update({unitIds:draft.unitIds.filter(id=>id!==unit.unitId)});setInspected(0);setCartPage(1);}} aria-label={`Remove ${unit.content.unitCode}`}>Remove</Button>},
 ];
 if(!ready)return <DetailSkeleton rows={5}/>;
 return <div className="mt-6 space-y-5">
  {initialReceiptId?<section aria-label="Selected delivery" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/15 bg-brand-tint px-4 py-3 text-sm">
   {deliveryError?<ErrorNotice message={deliveryError}/>:!delivery?<span>Loading this delivery…</span>:<span><strong className="font-semibold">Delivery {delivery.batchCode}</strong>: {delivery.units} {delivery.units===1?'item':'items'}. {delivery.unlabelled?`${delivery.unlabelled} still need a label${delivery.unlabelled>delivery.unitIds.length?` (the first ${delivery.unitIds.length} are in the print cart; print them, then come back for the rest)`:' and are in the print cart'}.`:'Every item already has a label. Use label history below to print replacements.'}</span>}
   <a href="#labels" className="font-semibold text-brand underline-offset-2 hover:underline">Show all stock instead</a>
  </section>:null}
  {error?<ErrorNotice message={error}/>:null}
  {pending?<Panel title="Previous request needs a response"><p className="mb-3 text-sm text-grey-2">Its response may have been lost. Retry the saved request before making another selection.</p><Button disabled={busy} onClick={()=>void action(retry)}>{busy?'Retrying…':'Retry previous label request'}</Button></Panel>:null}
  {draft.jobId?<>{jobRead.loading?<DetailSkeleton rows={6}/>:jobRead.error?<ErrorNotice message={jobRead.error} onRetry={jobRead.refresh}/>:jobRead.data?<UnitLabelJobView key={jobRead.data.id} job={jobRead.data} actorId={actorId} busy={busy} pending={pending} start={draft.sheetStart} onStart={sheetStart=>update({sheetStart})} onBack={()=>update({jobId:null})} onPrepare={()=>void action(()=>prepare(jobRead.data!.id))} onReprint={(lineIds,reason)=>void action(async()=>{await send<UnitLabelJob>('unit-label-jobs',{kind:'REPRINT',originalJobId:jobRead.data!.id,lineIds,reason});if(mounted.current){history.refresh();}})}/>:null}</>:<>
   <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.85fr)]">
    <div className={draft.unitIds.length?'order-2 min-w-0 xl:order-1':'order-1 min-w-0'}><Panel title="Choose items" label="Choose items" action={<div className="flex flex-wrap gap-2"><Tabs label="Unit label selection view" value={view} tabs={[{value:'inventory',label:'Stock'},{value:'cart',label:'Print cart',count:draft.unitIds.length}]} onChange={setView}/>{view==='cart'&&draft.unitIds.length?<Button variant="ghost" disabled={disabled} onClick={discard}>Clear cart</Button>:null}</div>} flush>
     {view==='inventory'?<><div className="space-y-3 px-5 pb-4 sm:px-6"><SearchInput label="Find units for labels" placeholder="Product, variant, supplier code, lot, item code or batch…" value={draft.search} onChange={value=>{update({search:value,page:1});setPicked([]);}}/><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={disabled||query!==draft.search||!source.data?.units.length} onClick={()=>add(source.data!.units.map(unit=>unit.unitId))}>Add all {source.data?.units.length??0} shown</Button><Button disabled={disabled||!picked.length} onClick={()=>add(picked)}>Add selected ({picked.length})</Button></div></div>
      {source.loading?<DetailSkeleton rows={5}/>:source.error?<ErrorNotice message={source.error} onRetry={source.refresh}/>:source.data?<><UnitGroups units={source.data.units} picked={picked} inCart={draft.unitIds} disabled={disabled} onPick={setPicked} onAdd={add}/><Pager page={draft.page} pageCount={Math.ceil(source.data.total/source.data.pageSize)} total={source.data.total} onChange={page=>{update({page});setPicked([]);}}/></>:null}
     </>:previewLoading?<DetailSkeleton rows={5}/>:previewError?<ErrorNotice message={previewError} onRetry={()=>setPreviewRevision(value=>value+1)}/>:<><div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4 sm:px-6"><p className="text-sm text-grey-2">{draft.unitIds.length} exact physical items · one sticker per item</p></div><DataTable label="Unit label print cart" columns={cartColumns} rows={previews.slice((cartPage - 1) * LIST_PAGE_SIZE, cartPage * LIST_PAGE_SIZE)} rowKey={unit=>unit.unitId} emptyMessage="Select saved units from inventory to start a print cart." mobileStack bare/><Pager page={cartPage} pageCount={Math.ceil(previews.length / LIST_PAGE_SIZE)} total={previews.length} onChange={setCartPage}/></>}
    </Panel></div>
    <div className={draft.unitIds.length?'order-1 min-w-0 space-y-4 xl:order-2 xl:sticky xl:top-4':'order-2 min-w-0 space-y-4 xl:sticky xl:top-4'}><Panel title="Individual label preview" label="Individual label preview" action={<Badge>{draft.unitIds.length} labels</Badge>}><div className="space-y-4">{previewLoading?<DetailSkeleton rows={3}/>:previewError?<ErrorNotice message={previewError} onRetry={()=>setPreviewRevision(value=>value+1)}/>:previews.length?<><UnitLabelCard label={previews[inspected]??previews[0]!}/><Pager page={Math.min(inspected+1,previews.length)} pageCount={previews.length} onChange={value=>setInspected(value-1)}/></>:<EmptyState title="Your print cart is empty">Tick items on the left, or add a whole lot, to preview their labels.</EmptyState>}
      <Footnote>The preview is an individual product label. Printed size is controlled by the saved profile.</Footnote><Button variant="secondary" onClick={()=>setSettingsOpen(true)}>Print settings</Button><TaskModal title="Print settings" open={settingsOpen} busy={busy} onClose={()=>setSettingsOpen(false)}><Field label="Unit label profile">{id=><Select id={id} label="Unit label profile" value={draft.profileId} disabled={disabled} onChange={profileId=>update({profileId})} options={config.profiles.map(profile=>({value:profile.id,label:`${profile.labelWidthMm} × ${profile.labelHeightMm} mm · A4 trial`}))}/>}</Field></TaskModal>
      <p className="text-sm text-grey-2">Usable and damaged-on-arrival labels start on separate sheets.</p><Button className="w-full" disabled={disabled||previewLoading||!!previewError||!previews.length||previews.length!==draft.unitIds.length} onClick={()=>void action(create)}>{busy?'Preparing labels…':`Review ${draft.unitIds.length} labels`}</Button>
     </div></Panel></div>
   </div>
  </>}
  <Panel title="Individual label history"><Disclosure summary="View saved unit-label jobs" onOpen={()=>setHistoryOpen(true)}>{historyOpen?(history.loading?<DetailSkeleton rows={4}/>:history.error?<ErrorNotice message={history.error} onRetry={history.refresh}/>:history.data?<><DataTable label="Individual label jobs" rows={history.data.jobs} rowKey={job=>job.id} columns={[{key:'time',label:'Created',cell:job=>formatDateTime(job.createdAt)},{key:'kind',label:'Job',cell:job=>job.kind==='INITIAL'?'Initial labels':'Selective reprint'},{key:'labels',label:'Labels',cell:job=>job.totalLabels},{key:'open',label:'Action',cell:job=><Button variant="secondary" disabled={busy||pending} onClick={()=>update({jobId:job.id})}>Open label job</Button>}]} emptyMessage="No individual label jobs yet." mobileStack/><Pager page={historyPage} pageCount={Math.ceil(history.data.total/history.data.pageSize)} total={history.data.total} onChange={setHistoryPage}/></>:null):null}</Disclosure></Panel>
 </div>;
}
/** Units grouped by delivery lot: one header per lot, compact tick boxes per unit. */
function UnitGroups({units,picked,inCart,disabled,onPick,onAdd}:{units:UnitLabelOption[];picked:string[];inCart:string[];disabled:boolean;onPick:(next:string[])=>void;onAdd:(ids:string[])=>void}){
 if(!units.length)return <EmptyState title="No units need a first label">Every matching unit already has a label job. Use label history to print replacements.</EmptyState>;
 const groups=new Map<string,UnitLabelOption[]>();
 for(const unit of units){const key=`${unit.fullSku}|${unit.publicBatchCode}|${unit.initialPurpose}`;groups.set(key,[...(groups.get(key)??[]),unit]);}
 return <section aria-label="Units available for initial labels" className="divide-y divide-black/[0.06] border-t border-black/[0.06]">{[...groups.entries()].map(([key,items])=>{
  const first=items[0]!,open=items.filter(unit=>!inCart.includes(unit.unitId)),allPicked=open.length>0&&open.every(unit=>picked.includes(unit.unitId));
  return <div key={key} className="px-5 py-4 sm:px-6">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <label className="flex min-w-0 items-start gap-3">
     <Checkbox className="mt-1" aria-label={`Select all ${open.length} units in lot ${first.lotCode??first.publicBatchCode}`} checked={allPicked} disabled={disabled||!open.length} onChange={event=>{const ids=open.map(unit=>unit.unitId);onPick(event.target.checked?[...new Set([...picked,...ids])]:picked.filter(id=>!ids.includes(id)));}}/>
     <span className="min-w-0"><span className="block font-semibold text-ink">{first.productName} · {first.variantName}</span><Code tone="muted" className="text-xs">{first.fullSku}</Code><span className="mt-0.5 block text-xs text-grey-2">Lot {first.lotCode} · {first.publicBatchCode} · {items.length} {items.length===1?'unit':'units'}</span></span>
    </label>
    <span className="flex items-center gap-2"><Badge tone={first.initialPurpose==='USABLE'?'usable':'damaged'}>{first.initialPurpose==='USABLE'?'Usable':'Damaged'}</Badge><Button variant="secondary" size="compact" disabled={disabled||!open.length} onClick={()=>onAdd(open.map(unit=>unit.unitId))}>Add lot to cart</Button></span>
   </div>
   <div className="mt-3 flex flex-wrap gap-2 pl-7">{items.map(unit=>{const added=inCart.includes(unit.unitId),checked=added||picked.includes(unit.unitId);return <label key={unit.unitId} className={'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-2.5 font-mono text-sm font-semibold tracking-wider '+(checked?'border-brand/40 bg-brand-tint text-brand':'border-black/10 bg-white text-ink hover:border-black/25')+(added?' opacity-70':'')}><Checkbox aria-label={`Select ${unit.unitCode}`} checked={checked} disabled={disabled||added} onChange={event=>onPick(event.target.checked?[...picked,unit.unitId]:picked.filter(id=>id!==unit.unitId))}/>{unit.unitCode}</label>;})}</div>
  </div>;})}</section>;
}

export function UnitPrintingWorkspace({actorId,bottomContent,initialReceiptId=''}:{actorId:string;bottomContent?:ReactNode;initialReceiptId?:string}){
 const config=useApiRead<Configuration>('unit-label-config');
 return <Page><PageHeader title="Print labels" description="" actions={initialReceiptId?<a className="inline-flex min-h-11 items-center rounded-lg border border-black/15 bg-white px-4 text-sm font-semibold" href={`#receipts/${initialReceiptId}`}>Back to receipt</a>:undefined}/>{config.loading?<div className="mt-6"><DetailSkeleton rows={5}/></div>:config.error?<div className="mt-6"><ErrorNotice message={config.error} onRetry={config.refresh}/></div>:config.data?<Body key={config.data.originId} actorId={actorId} config={config.data} initialReceiptId={initialReceiptId}/>:null}{bottomContent?<div className="mt-6">{bottomContent}</div>:null}</Page>;
}
