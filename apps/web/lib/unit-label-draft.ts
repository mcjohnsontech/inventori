'use client';
import { useEffect,useRef,useState } from 'react';
import { idempotencyKeySchema,sheetStartSchema,unitLabelJobSchema,unitLabelProfileSchema,type SheetStart } from '@dayari/contracts';
import { api,ApiError } from './api';
type Pending={path:string;body:unknown;key:string};
export type UnitLabelDraft={unitIds:string[];receiptId:string|null;profileId:string;jobId:string|null;search:string;page:number;sheetStart:SheetStart;pending:Pending|null};
const empty:UnitLabelDraft={unitIds:[],receiptId:null,profileId:'unit-a4-70x35-v2',jobId:null,search:'',page:1,sheetStart:{startSlot:0,damagedStartSlot:0},pending:null};
function commandBody(path:string,body:unknown){
 if(path==='unit-label-jobs')return unitLabelJobSchema.parse(body);
 if(/^unit-label-jobs\/[0-9a-f-]{36}\/artifact$/.test(path))return sheetStartSchema.parse(body);
 throw Error('Unknown label command');
}
function restore(raw:string|null):UnitLabelDraft{
 if(!raw||raw.length>80000)return {...empty};const d=JSON.parse(raw);
 if(!Array.isArray(d.unitIds)||d.unitIds.length>500||d.unitIds.some((id:unknown)=>!idempotencyKeySchema.safeParse(id).success)||new Set(d.unitIds).size!==d.unitIds.length)throw Error('Invalid label draft');
 const pending=d.pending?{path:d.pending.path,body:commandBody(d.pending.path,d.pending.body),key:idempotencyKeySchema.parse(d.pending.key)}:null;
 return {unitIds:d.unitIds,receiptId:d.receiptId?idempotencyKeySchema.parse(d.receiptId):null,profileId:unitLabelProfileSchema.parse(d.profileId),jobId:d.jobId?idempotencyKeySchema.parse(d.jobId):null,search:typeof d.search==='string'?d.search.slice(0,120):'',page:Number.isInteger(d.page)&&d.page>=1&&d.page<=1000000?d.page:1,sheetStart:sheetStartSchema.parse(d.sheetStart??{}),pending};
}
export function useUnitLabelDraft(actorId:string,originId:string){
 const storage=`dayari_unit_labels_${actorId}_${originId}`,[draft,setDraft]=useState<UnitLabelDraft>({...empty}),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const current=useRef(draft),latch=useRef(false),controller=useRef<AbortController|null>(null),mounted=useRef(true);
 function update(patch:Partial<UnitLabelDraft>){const next={...current.current,...patch};current.current=next;sessionStorage.setItem(storage,JSON.stringify(next));setDraft(next);}
 useEffect(()=>{mounted.current=true;try{const value=restore(sessionStorage.getItem(storage));current.current=value;setDraft(value);}catch{sessionStorage.removeItem(storage);}setReady(true);return()=>{mounted.current=false;controller.current?.abort();};},[storage]);
 async function send<T extends {id:string}>(path:string,bodyInput:unknown):Promise<T>{
  if(latch.current)throw Error('A label request is already running');const body=commandBody(path,bodyInput),prior=current.current.pending;
  if(prior&&(prior.path!==path||JSON.stringify(prior.body)!==JSON.stringify(body)))throw Error('Retry the previous label request before starting another. Its response may have been lost.');
  const pending=prior??{path,body,key:crypto.randomUUID()};latch.current=true;setBusy(true);update({pending});const abort=new AbortController();controller.current=abort;
  try{const result=await api<T>(path,{method:'POST',headers:{'Idempotency-Key':pending.key},body:JSON.stringify(body),signal:abort.signal});const patch={pending:null,jobId:result.id,...(path==='unit-label-jobs'&&'kind' in body&&body.kind==='INITIAL'?{unitIds:[]}: {})};if(mounted.current)update(patch);else sessionStorage.setItem(storage,JSON.stringify({...current.current,...patch}));return result;}
  catch(error){if(error instanceof ApiError&&[400,404,409,422].includes(error.status)&&mounted.current)update({pending:null});throw error;}
  finally{latch.current=false;if(mounted.current)setBusy(false);}
 }
 return {draft,ready,busy,update,send};
}
