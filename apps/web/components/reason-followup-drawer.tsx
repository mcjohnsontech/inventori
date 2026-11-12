'use client';
import {useEffect,useState} from 'react';
import {checkoutReasonLabels,reconcileReasonsSchema,type ReasonQueue,type ReasonQueueRow} from '@dayari/contracts';
import {useApiRead} from '../lib/api';
import {useReconciliationDraft} from '../lib/reconciliation-draft';
import {formatDateTime} from '../lib/format';
import {ReasonField} from './reason-field';
import {TaskModal} from './ui/task-modal';
import {Button,Code,DetailsDrawer,DetailSkeleton,ErrorNotice,Field,Textarea,WarningNotice} from './ui';
export function ReasonFollowupDrawer({unitCode,onClose}:{unitCode:string;onClose:()=>void}){
 const [editing,setEditing]=useState(false);
 const read=useApiRead<ReasonQueue>(`checkout-reasons?status=ALL&unitCode=${encodeURIComponent(unitCode)}`);
 const config=useApiRead<{originId:string;canResolve:boolean}>('reason-reconciliation-config');
 const actor=useApiRead<{id:string}>('me');
 const row=read.data?.rows[0];
 return <><DetailsDrawer title="Reason details" closeLabel="Close reason details" active={!editing} onClose={onClose}>
 {read.loading?<DetailSkeleton/>:read.error?<ErrorNotice message={read.error} onRetry={read.refresh}/>:row?<div className="space-y-4">
 <Code>{row.unit.unitCode}</Code><p>{row.unit.productName} · {row.unit.variantName}</p><Code>{row.unit.fullSku}</Code><p>Order ID: {row.orderReference??'No Order ID'}</p><p>Checkout <Code>{row.checkoutId}</Code></p><p>{row.employee.name} · {formatDateTime(row.acceptedAt)}</p>
 <p>Original reason: Reason not provided</p><p>Current resolution: {row.resolution?checkoutReasonLabels[row.resolution.reason.code]:'Unresolved'}</p>
 {row.resolution?<><p>{row.resolution.reason.note}</p><p>{row.resolution.manager.name} · {formatDateTime(row.resolution.recordedAt)}</p><p>{row.resolution.remarks}</p></>:config.data?.canResolve&&actor.data?<Button onClick={()=>setEditing(true)}>Edit Reason</Button>:null}
 {config.error?<ErrorNotice message={config.error} onRetry={config.refresh}/>:null}<p className="text-sm text-grey-2">Original reason and checkout history are permanent. Reconciliation adds evidence without moving stock.</p>
 </div>:<p>No missing-reason obligation is available for this item.</p>}</DetailsDrawer>
 {row&&actor.data&&config.data?<SingleReasonEditor row={row} actorId={actor.data.id} originId={config.data.originId} open={editing} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);read.refresh();}}/>:null}</>;
}
function SingleReasonEditor({row,actorId,originId,open,onClose,onSaved}:{row:ReasonQueueRow;actorId:string;originId:string;open:boolean;onClose:()=>void;onSaved:()=>void}){
 const {draft,ready,busy,update,send}=useReconciliationDraft(actorId,originId,row.exceptionId);
 const [review,setReview]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(ready&&!draft.pending&&draft.body.exceptionIds.length===0)update({...draft.body,exceptionIds:[row.exceptionId]});},[ready]);
 const valid=reconcileReasonsSchema.safeParse(draft.body).success&&draft.body.exceptionIds.length===1&&draft.body.exceptionIds[0]===row.exceptionId;
 async function confirm(){setError('');try{await send();setReview(false);onSaved();}catch(e){setError((e as Error).message);}}
 return <TaskModal title={review?'Confirm Reconciliation':'Edit Reason'} open={open} busy={busy} onClose={onClose}><div className="space-y-4">
 <p><Code>{row.unit.unitCode}</Code> · {row.unit.productName} · {row.unit.variantName}</p><p>Order ID: {row.orderReference??'No Order ID'}</p><p>{row.employee.name} · {formatDateTime(row.acceptedAt)}</p><p>Original reason: Reason not provided</p>
 {error?<ErrorNotice message={error}/>:null}{draft.pending?<WarningNotice>The earlier response is uncertain. Retry only this saved reconciliation.<Button disabled={busy} onClick={()=>void confirm()}>Retry saved reconciliation</Button></WarningNotice>:null}
 {review?<><p>New reason: {draft.body.reason?checkoutReasonLabels[draft.body.reason.code]:'Required'}</p><p>{draft.body.reason?.note}</p><p>{draft.body.remarks}</p><p>This permanently reconciles this one selected obligation. It preserves the employee's original reason and moves no stock.</p></>:<>
 <ReasonField label="Reconciliation reason" emptyLabel="Choose a reason" value={draft.body.reason} disabled={busy||!!draft.pending} onChange={reason=>update({...draft.body,reason:reason??null})}/>
 <Field label="Reconciliation remarks (optional)">{id=><Textarea id={id} value={draft.body.remarks} maxLength={2000} disabled={busy||!!draft.pending} onChange={e=>update({...draft.body,remarks:e.target.value})}/>}</Field></>}
 <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={()=>review?setReview(false):onClose()}>Cancel</Button><Button disabled={!ready||busy||!!draft.pending||!valid} onClick={()=>review?void confirm():setReview(true)}>{review?'Confirm Reconciliation':'Save'}</Button></div>
 </div></TaskModal>;
}
