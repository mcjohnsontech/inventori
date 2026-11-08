'use client';
import { useEffect,useRef,useState } from 'react';
import { planUnitLabelSheets,unitLabelJobSchema,type SheetStart,type UnitLabelJob } from '@dayari/contracts';
import { useApiRead } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Badge,Button,Checkbox,Code,DataTable,DetailSkeleton,Disclosure,ErrorNotice,Field,Footnote,Pager,Panel,Textarea,type Column } from '../ui';
import { SheetStartPicker } from './sheet-start-picker';
import { UnitLabelCard } from './unit-label-card';

export function openUnitPrint(job:UnitLabelJob,actorId:string){
 if(!job.artifact)throw Error('Prepare the print document first');
 const popup=window.open('about:blank','_blank');if(!popup)throw Error('The print window was blocked. Allow popups for this shop or download the PDF fallback.');
 try{popup.sessionStorage.setItem('dayari:unitPrintIntent:'+job.artifact.id,JSON.stringify({artifactId:job.artifact.id,actorId,at:Date.now()}));popup.opener=null;popup.location.href=`/api/unit-label-jobs/${job.id}/artifacts/${job.artifact.id}.html`;}catch(error){popup.close();throw error;}
}
function RequestHistory({id}:{id:string}){
 const [page,setPage]=useState(1),read=useApiRead<{total:number;pageSize:number;events:{id:string;attemptId:string;recordedAt:string}[]}>(`unit-label-jobs/${id}/handoffs?page=${page}`);
 return read.loading?<DetailSkeleton rows={3}/>:read.error?<ErrorNotice message={read.error} onRetry={read.refresh}/>:read.data?<><DataTable label="Device print requests" rows={read.data.events} rowKey={event=>event.id} columns={[{key:'time',label:'Requested',cell:event=>formatDateTime(event.recordedAt)},{key:'state',label:'Evidence',cell:()=> 'Device dialog requested; physical output unconfirmed'}]} emptyMessage="No device print dialog has been requested through this job." mobileStack/><Pager page={page} pageCount={Math.ceil(read.data.total/read.data.pageSize)} total={read.data.total} onChange={setPage}/></>:null;
}
export function UnitLabelJobView({job,actorId,busy,pending,start,onStart,onBack,onPrepare,onReprint}:{job:UnitLabelJob;actorId:string;busy:boolean;pending:boolean;start:SheetStart;onStart:(value:SheetStart)=>void;onBack:()=>void;onPrepare:()=>void;onReprint:(lineIds:string[],reason:string)=>void}){
 const [preview,setPreview]=useState(0),[page,setPage]=useState(1),[selected,setSelected]=useState<string[]>([]),[reason,setReason]=useState(''),[requests,setRequests]=useState(false),[error,setError]=useState('');
 const storage=`dayari_unit_reprint_${actorId}_${job.originId}_${job.id}`,saved=useRef({selected:[] as string[],reason:''});
 useEffect(()=>{try{const raw=sessionStorage.getItem(storage);if(raw&&raw.length<40000){const value=JSON.parse(raw);const parsed=unitLabelJobSchema.safeParse({kind:'REPRINT',originalJobId:job.id,lineIds:value.selected,reason:'Draft selection not yet explained'});if(parsed.success&&parsed.data.kind==='REPRINT'){const ids=parsed.data.lineIds.filter(id=>job.lines.some(line=>line.id===id));setSelected(ids);setReason(typeof value.reason==='string'?value.reason.slice(0,1000):'');saved.current={selected:ids,reason:typeof value.reason==='string'?value.reason.slice(0,1000):''};}}}catch{sessionStorage.removeItem(storage);}},[storage,job.id]);
 function save(next:{selected:string[];reason:string}){saved.current=next;setSelected(next.selected);setReason(next.reason);sessionStorage.setItem(storage,JSON.stringify(next));}
 const line=job.lines[preview]??job.lines[0]!,visible=job.lines.slice((page-1)*12,page*12);
 let pages=0,layoutError='';try{pages=planUnitLabelSheets(job,start).pages;}catch(failure){layoutError=(failure as Error).message;}
 const columns:Column<UnitLabelJob['lines'][number]>[]=[
  {key:'select',label:'Replacement',cell:item=><label className="inline-flex min-h-11 items-center gap-2"><Checkbox aria-label={`Reprint ${item.content.unitCode}`} disabled={busy||pending} checked={selected.includes(item.id)} onChange={event=>save({...saved.current,selected:event.target.checked?[...saved.current.selected,item.id]:saved.current.selected.filter(id=>id!==item.id)})}/><span className="sr-only">Select replacement</span></label>},
  {key:'unit',label:'Unit Code',cell:item=><button type="button" className="min-h-11 text-left font-mono text-sm font-semibold tracking-wider text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand" onClick={()=>setPreview(job.lines.findIndex(line=>line.id===item.id))}>{item.content.unitCode}</button>},
  {key:'product',label:'Product / SKU',wide:true,cell:item=><><span className="block">{item.content.productName} · {item.content.variantName}</span><Code tone="muted">{item.content.fullSku}</Code></>},
  {key:'purpose',label:'Intake',cell:item=><Badge tone={item.purpose==='USABLE'?'usable':'damaged'}>{item.purpose==='USABLE'?'Usable':'Damaged'}</Badge>},
 ];
 return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><Button variant="secondary" onClick={onBack} disabled={busy}>Back to label selection</Button><Badge>{job.kind==='REPRINT'?'Selective reprint':'Initial unit labels'} · {job.totalLabels} labels</Badge></div>
  <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.85fr)]">
   <div className="order-2 min-w-0 space-y-5 xl:order-1"><Panel title="Exact label manifest" label="Exact label manifest" description="Select saved Unit Codes only when replacement stickers are needed." flush><DataTable label="Exact unit label manifest" rows={visible} columns={columns} rowKey={item=>item.id} emptyMessage="No labels in this manifest." mobileStack bare/><Pager page={page} pageCount={Math.ceil(job.lines.length/12)} total={job.lines.length} onChange={setPage}/></Panel>
    <Panel title="Replace selected labels"><div className="space-y-4"><Footnote>A replacement keeps the same Unit Code and QR. Remove or set aside spoiled and duplicate stickers before attaching replacements.</Footnote><Field label="Reason for replacement">{id=><Textarea id={id} maxLength={1000} value={reason} disabled={busy||pending} onChange={event=>save({...saved.current,reason:event.target.value})}/>}</Field><div className="flex flex-wrap gap-2"><Button disabled={busy||pending||!selected.length||reason.trim().length<10} onClick={()=>onReprint(selected,reason)}>{busy?'Saving…':`Review ${selected.length} replacement label${selected.length===1?'':'s'}`}</Button><Button variant="ghost" disabled={busy||pending||!selected.length} onClick={()=>{if(window.confirm('Clear the selected replacement labels?'))save({selected:[],reason:''});}}>Clear selection</Button></div></div></Panel>
    <Panel title="Print evidence"><p className="text-sm text-grey-2">{job.handoffCount} device dialog request{job.handoffCount===1?'':'s'}. Physical output and attachment are not asserted by the application.</p><Disclosure summary="View device print requests" onOpen={()=>setRequests(true)}>{requests?<RequestHistory id={job.id}/>:null}</Disclosure></Panel>
   </div>
   <div className="order-1 min-w-0 space-y-4 xl:order-2 xl:sticky xl:top-4"><Panel title="Individual label preview" label="Individual label preview" action={<Badge>{preview+1} / {job.lines.length}</Badge>}><div className="space-y-3"><UnitLabelCard label={line}/><Pager page={preview+1} pageCount={job.lines.length} onChange={value=>setPreview(value-1)}/><Footnote>Preview content for one physical item. Actual dimensions come from the selected print profile.</Footnote></div></Panel>
    <Panel title="Print settings" label="Print settings" action={<Badge>{job.artifact?'Prepared':'Not yet prepared'}</Badge>}><div className="space-y-4"><p className="text-sm font-medium">{job.profile.labelWidthMm} × {job.profile.labelHeightMm} mm · A4 trial · {job.artifact?.pages??pages} sheet{(job.artifact?.pages??pages)===1?'':'s'}</p>{job.artifact?<Footnote>The prepared layout is saved. Downloading or printing again keeps the same identities.</Footnote>:<Disclosure summary="Reuse a partly used sheet"><SheetStartPicker profile={job.profile} value={start} onChange={onStart} disabled={busy||pending} hasDamaged={job.lines.some(line=>line.purpose==='DAMAGED_INTAKE')}/></Disclosure>}
      {layoutError?<ErrorNotice message={layoutError}/>:null}{error?<ErrorNotice message={error}/>:null}
      {!job.artifact?<Button className="w-full" disabled={busy||pending||!!layoutError} onClick={onPrepare}>{busy?'Preparing…':'Prepare print document'}</Button>:<><Button className="w-full" disabled={busy||pending} onClick={()=>{setError('');try{openUnitPrint(job,actorId);}catch(error){setError((error as Error).message);}}}>Print {job.totalLabels} individual label{job.totalLabels===1?'':'s'}</Button><a className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline" href={`/api/unit-label-jobs/${job.id}/artifacts/${job.artifact.id}.pdf`} download>Download PDF fallback</a></>}
      <Footnote>Use actual size / 100%. Test alignment on ordinary paper before using label sheets. Printer/media approval is still required.</Footnote>
     </div></Panel>
   </div>
  </div>
 </div>;
}
