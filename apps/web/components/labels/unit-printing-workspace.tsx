'use client';
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
type History={total:number;pageSize:number;jobs:{id:string;kind:string;totalLabels:number;reason:string;createdAt:string}[]};
function Body({actorId,config,initialReceiptId}:{actorId:string;config:Configuration;initialReceiptId:string}){
 const {draft,ready,busy,update,send}=useUnitLabelDraft(actorId,config.originId);
 const [query,setQuery]=useState(''),[picked,setPicked]=useState<string[]>([]),[view,setView]=useState<'inventory'|'cart'>('inventory'),[cartPage,setCartPage]=useState(1),[inspected,setInspected]=useState(0),[historyPage,setHistoryPage]=useState(1),[historyOpen,setHistoryOpen]=useState(false),[error,setError]=useState('');
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [previews,setPreviews]=useState<UnitLabelPreview[]>([]),[previewError,setPreviewError]=useState(''),[previewLoading,setPreviewLoading]=useState(false),[previewRevision,setPreviewRevision]=useState(0);
 const receiptContext=useRef('');useEffect(()=>{if(ready&&initialReceiptId&&!draft.pending&&receiptContext.current!==initialReceiptId){receiptContext.current=initialReceiptId;if(draft.receiptId!==initialReceiptId)update({receiptId:initialReceiptId,jobId:null,search:'',page:1});setHistoryOpen(true);}},[ready,initialReceiptId,draft.pending]);
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(draft.search),250);return()=>clearTimeout(timer);},[draft.search]);
 const receiptId=initialReceiptId||draft.receiptId||'';
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
 async function create(){await send<UnitLabelJob>('unit-label-jobs',{kind:'INITIAL',unitIds:draft.unitIds,profileId:draft.profileId});if(!mounted.current)return;source.refresh();history.refresh();}
 async function retry(){const previous=draft.pending;if(!previous)return;await send(previous.path,previous.body);if(mounted.current){source.refresh();jobRead.refresh();history.refresh();}}
 function discard(){if(disabled)return;if(draft.unitIds.length&&window.confirm('Discard the selected label cart? Saved units and stock will remain unchanged.')){update({unitIds:[]});setInspected(0);setCartPage(1);}}
 const sourceColumns:Column<UnitLabelOption>[]=[
  {key:'select',label:'Select',cell:unit=><label className="inline-flex min-h-11 items-center"><Checkbox aria-label={`Select ${unit.unitCode}`} checked={picked.includes(unit.unitId)||draft.unitIds.includes(unit.unitId)} disabled={disabled||draft.unitIds.includes(unit.unitId)} onChange={event=>setPicked(current=>event.target.checked?[...current,unit.unitId]:current.filter(id=>id!==unit.unitId))}/></label>},
  {key:'unit',label:'Unit Code',cell:unit=><Code className="text-sm font-semibold tracking-wider">{unit.unitCode}</Code>},
  {key:'product',label:'Product / saved SKU',wide:true,cell:unit=><><span className="block">{unit.productName} · {unit.variantName}</span><Code tone="muted">{unit.fullSku}</Code><span className="mt-1 block text-xs text-grey-2">{unit.lotCode} · {unit.publicBatchCode}</span></>},
  {key:'condition',label:'Intake',cell:unit=><Badge tone={unit.initialPurpose==='USABLE'?'usable':'damaged'}>{unit.initialPurpose==='USABLE'?'Usable':'Damaged'}</Badge>},
 ];
 const cartColumns:Column<UnitLabelPreview>[]=[
  {key:'unit',label:'Unit Code',cell:unit=><button type="button" className="min-h-11 text-left font-mono text-sm font-semibold tracking-wider text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand" onClick={()=>setInspected(previews.findIndex(item=>item.unitId===unit.unitId))}>{unit.content.unitCode}</button>},
  {key:'product',label:'Product / saved SKU',wide:true,cell:unit=><><span className="block">{unit.content.productName} · {unit.content.variantName}</span><Code tone="muted">{unit.content.fullSku}</Code></>},
  {key:'remove',label:'Cart action',cell:unit=><Button variant="ghost" disabled={disabled} onClick={()=>{update({unitIds:draft.unitIds.filter(id=>id!==unit.unitId)});setInspected(0);setCartPage(1);}} aria-label={`Remove ${unit.content.unitCode}`}>Remove</Button>},
 ];
 if(!ready)return <DetailSkeleton rows={5}/>;
 return <div className="mt-6 space-y-5">
  {error?<ErrorNotice message={error}/>:null}
  {pending?<Panel title="Previous request needs a response"><p className="mb-3 text-sm text-grey-2">Its response may have been lost. Retry the saved request before making another selection.</p><Button disabled={busy} onClick={()=>void action(retry)}>{busy?'Retrying…':'Retry previous label request'}</Button></Panel>:null}
  {draft.jobId?<>{jobRead.loading?<DetailSkeleton rows={6}/>:jobRead.error?<ErrorNotice message={jobRead.error} onRetry={jobRead.refresh}/>:jobRead.data?<UnitLabelJobView key={jobRead.data.id} job={jobRead.data} actorId={actorId} busy={busy} pending={pending} start={draft.sheetStart} onStart={sheetStart=>update({sheetStart})} onBack={()=>update({jobId:null})} onPrepare={()=>void action(()=>prepare(jobRead.data!.id))} onReprint={(lineIds,reason)=>void action(async()=>{await send<UnitLabelJob>('unit-label-jobs',{kind:'REPRINT',originalJobId:jobRead.data!.id,lineIds,reason});if(mounted.current){history.refresh();}})}/>:null}</>:<>
   <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.85fr)]">
    <div className={draft.unitIds.length?'order-2 min-w-0 xl:order-1':'order-1 min-w-0'}><Panel title="Choose physical items" label="Choose physical items" action={<div className="flex flex-wrap gap-2"><Tabs label="Unit label selection view" value={view} tabs={[{value:'inventory',label:'Inventory'},{value:'cart',label:'Print cart',count:draft.unitIds.length}]} onChange={setView}/>{view==='cart'&&draft.unitIds.length?<Button variant="ghost" disabled={disabled} onClick={discard}>Clear cart</Button>:null}</div>} flush>
     {view==='inventory'?<><div className="space-y-3 px-5 pb-4 sm:px-6"><SearchInput label="Find units for labels" placeholder="Product, variant, SKU, lot, Unit Code or batch…" value={draft.search} onChange={value=>{update({search:value,page:1});setPicked([]);}}/><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={disabled||query!==draft.search||!source.data?.units.length} onClick={()=>add(source.data!.units.map(unit=>unit.unitId))}>Add this page ({source.data?.units.length??0})</Button><Button disabled={disabled||!picked.length} onClick={()=>add(picked)}>Add selected ({picked.length})</Button></div></div>
      {source.loading?<DetailSkeleton rows={5}/>:source.error?<ErrorNotice message={source.error} onRetry={source.refresh}/>:source.data?<><DataTable columns={sourceColumns} rows={source.data.units} rowKey={unit=>unit.unitId} label="Units available for initial labels" emptyMessage="No matching units without an initial label job. Check label history for replacements." mobileStack bare/><Pager page={draft.page} pageCount={Math.ceil(source.data.total/source.data.pageSize)} total={source.data.total} onChange={page=>{update({page});setPicked([]);}}/></>:null}
     </>:previewLoading?<DetailSkeleton rows={5}/>:previewError?<ErrorNotice message={previewError} onRetry={()=>setPreviewRevision(value=>value+1)}/>:<><div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4 sm:px-6"><p className="text-sm text-grey-2">{draft.unitIds.length} exact physical items · one sticker per item</p></div><DataTable label="Unit label print cart" columns={cartColumns} rows={previews.slice((cartPage-1)*12,cartPage*12)} rowKey={unit=>unit.unitId} emptyMessage="Select saved units from inventory to start a print cart." mobileStack bare/><Pager page={cartPage} pageCount={Math.ceil(previews.length/12)} total={previews.length} onChange={setCartPage}/></>}
    </Panel></div>
    <div className={draft.unitIds.length?'order-1 min-w-0 space-y-4 xl:order-2 xl:sticky xl:top-4':'order-2 min-w-0 space-y-4 xl:sticky xl:top-4'}><Panel title="Individual label preview" label="Individual label preview" action={<Badge>{draft.unitIds.length} labels</Badge>}><div className="space-y-4">{previewLoading?<DetailSkeleton rows={3}/>:previewError?<ErrorNotice message={previewError} onRetry={()=>setPreviewRevision(value=>value+1)}/>:previews.length?<><UnitLabelCard label={previews[inspected]??previews[0]!}/><Pager page={Math.min(inspected+1,previews.length)} pageCount={previews.length} onChange={value=>setInspected(value-1)}/></>:<EmptyState title="Your print cart is empty">Add exact saved units to preview their individual labels.</EmptyState>}
      <Footnote>The preview is an individual product label. Printed size is controlled by the saved profile.</Footnote><Button variant="secondary" onClick={()=>setSettingsOpen(true)}>Print settings</Button><TaskModal title="Print settings" open={settingsOpen} busy={busy} onClose={()=>setSettingsOpen(false)}><Field label="Unit label profile">{id=><Select id={id} label="Unit label profile" value={draft.profileId} disabled={disabled} onChange={profileId=>update({profileId})} options={config.profiles.map(profile=>({value:profile.id,label:`${profile.labelWidthMm} × ${profile.labelHeightMm} mm · A4 trial`}))}/>}</Field></TaskModal>
      <p className="text-sm text-grey-2">Usable and damaged-intake labels start on separate sheets.</p><Button className="w-full" disabled={disabled||previewLoading||!!previewError||!previews.length||previews.length!==draft.unitIds.length} onClick={()=>void action(create)}>{busy?'Preparing labels…':`Review ${draft.unitIds.length} labels`}</Button>
     </div></Panel></div>
   </div>
  </>}
  <Panel title="Individual label history"><Disclosure summary="View saved unit-label jobs" onOpen={()=>setHistoryOpen(true)}>{historyOpen?(history.loading?<DetailSkeleton rows={4}/>:history.error?<ErrorNotice message={history.error} onRetry={history.refresh}/>:history.data?<><DataTable label="Individual label jobs" rows={history.data.jobs} rowKey={job=>job.id} columns={[{key:'time',label:'Created',cell:job=>formatDateTime(job.createdAt)},{key:'kind',label:'Job',cell:job=>job.kind==='INITIAL'?'Initial labels':'Selective reprint'},{key:'labels',label:'Labels',cell:job=>job.totalLabels},{key:'open',label:'Action',cell:job=><Button variant="secondary" disabled={busy||pending} onClick={()=>update({jobId:job.id})}>Open label job</Button>}]} emptyMessage="No individual label jobs yet." mobileStack/><Pager page={historyPage} pageCount={Math.ceil(history.data.total/history.data.pageSize)} total={history.data.total} onChange={setHistoryPage}/></>:null):null}</Disclosure></Panel>
 </div>;
}
export function UnitPrintingWorkspace({actorId,topContent,initialReceiptId=''}:{actorId:string;topContent:ReactNode;initialReceiptId?:string}){
 const config=useApiRead<Configuration>('unit-label-config');
 return <Page><PageHeader title="Labels & printing" description="" actions={initialReceiptId?<a className="inline-flex min-h-11 items-center rounded-lg border border-black/15 bg-white px-4 text-sm font-semibold" href={`#receipts/${initialReceiptId}`}>Back to receipt</a>:undefined}/><div className="mt-5">{topContent}</div>{config.loading?<div className="mt-6"><DetailSkeleton rows={5}/></div>:config.error?<div className="mt-6"><ErrorNotice message={config.error} onRetry={config.refresh}/></div>:config.data?<Body key={config.data.originId} actorId={actorId} config={config.data} initialReceiptId={initialReceiptId}/>:null}</Page>;
}
