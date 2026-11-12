'use client';
import {useState} from 'react';
import {checkoutReasonLabels,type OrdersPage,type OrderDetail,type CheckoutView} from '@dayari/contracts';
import {useApiRead} from '../lib/api';
import {formatDateTime} from '../lib/format';
import {CheckoutAcceptance} from './checkout-workspace';
import {ReasonFollowupDrawer} from './reason-followup-drawer';
import {UnitTrackingDrawer} from './unit-tracking-drawer';
import {Button,Code,DataTable,DetailsDrawer,DetailSkeleton,ErrorNotice,Field,Input,Page,PageHeader,Pager,Panel} from './ui';
export function OrderDrawer({orderReference,onClose}:{orderReference:string|null;onClose:()=>void}){
 const [page,setPage]=useState(1),[session,setSession]=useState(''),[unit,setUnit]=useState(''),[reasonUnit,setReasonUnit]=useState('');
 const query=orderReference===null?'withoutOrder=true':'orderReference='+encodeURIComponent(orderReference);
 const read=useApiRead<OrderDetail>(`production/order-detail?${query}&page=${page}${session?'&checkoutId='+encodeURIComponent(session):''}`);
 return <><DetailsDrawer title={orderReference===null?'Sessions without an Order ID':`Order ${orderReference}`} onClose={onClose} active={!unit&&!reasonUnit} wide>
 {read.loading?<DetailSkeleton rows={5}/>:read.error?<ErrorNotice message={read.error} onRetry={read.refresh}/>:read.data?<div className="space-y-4">
 {read.data.summary?<p>{read.data.summary.totalUnits} units · {read.data.summary.sessions} checkout sessions · {read.data.summary.inProduction} In Production · {read.data.summary.completed} Completed · {read.data.summary.unresolvedReasons} missing reasons</p>:<p>Unlinked checkout lines retain their individual session identities.</p>}
 <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>{setSession('');setPage(1);}}>All sessions</Button><Button variant="secondary" onClick={read.refresh}>Refresh order</Button></div>
 {session?<p className="text-sm">Session <Code>{session}</Code></p>:null}
 <DataTable label="Order units" rows={read.data.rows} rowKey={r=>r.checkoutLineId} mobileStack emptyMessage="No authorized checkout lines." columns={[
 {key:'unit',label:'Unit / product',cell:r=><><button className="min-h-11 font-mono text-brand underline" onClick={()=>setUnit(r.unitId)}>{r.unitCode}</button><p>{r.productName} · {r.variantName}</p><Code>{r.fullSku}</Code><p>{r.lotCode} · {r.publicBatchCode}</p></>},
 {key:'session',label:'Checkout',cell:r=><><button className="min-h-11 text-brand underline" onClick={()=>{setSession(r.checkoutId);setPage(1);}}>Session {r.checkoutId.slice(0,8)}</button><p>{r.employeeName}</p><p>{formatDateTime(r.acceptedAt)}</p></>},
 {key:'reason',label:'Reason',cell:r=><>{r.originalReason?checkoutReasonLabels[r.originalReason]:read.data?.scope==='SHOP'?<button className="min-h-11 text-brand underline decoration-dotted" onClick={()=>setReasonUnit(r.unitCode)}>Reason not provided</button>:'Reason not provided'}{r.resolvedReason?<p>Reconciled: {checkoutReasonLabels[r.resolvedReason]}</p>:null}</>},
 {key:'status',label:'Current status',cell:r=><>{r.state==='P'?'In Production':r.state==='C'?'Completed':r.state==='D'?'Damaged':r.state==='X'?'Removed':'Unavailable'}{r.damageReported?<p>Damage reported</p>:null}{r.completionId?<p>Completion {r.completionId.slice(0,8)}</p>:null}</>},
 ]}/><Pager page={page} pageCount={Math.ceil(read.data.total/20)} total={read.data.total} onChange={setPage}/>
 <p className="text-xs text-grey-2">{read.data.scope==='OWN'?'Your checkout history only.':'Shop checkout history.'} Refreshed {formatDateTime(read.data.asOf)}. Order IDs are reusable references, never transaction identities.</p>
 </div>:null}</DetailsDrawer>{reasonUnit?<ReasonFollowupDrawer unitCode={reasonUnit} onClose={()=>{setReasonUnit('');read.refresh();}}/>:null}{unit?<UnitTrackingDrawer unitId={unit} onClose={()=>setUnit('')}/>:null}</>;
}
export function OrdersWorkspace({history=false}:{history?:boolean}){
 return history?<CheckoutHistoryWorkspace/>:<OrderListWorkspace/>;
}
function OrderListWorkspace(){
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[selected,setSelected]=useState<string|null|undefined>();
 const read=useApiRead<OrdersPage>(`production/orders?page=${page}&search=${encodeURIComponent(search)}`);
 return <Page className="space-y-5"><PageHeader title="Orders" description=""/>
 <Field label="Find Order ID">{id=><Input id={id} value={search} maxLength={120} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>}</Field>
 {read.loading?<DetailSkeleton rows={5}/>:read.error?<ErrorNotice message={read.error} onRetry={read.refresh}/>:read.data?<Panel title="Reusable Order IDs"><DataTable label="Production orders" rows={read.data.rows} rowKey={r=>r.orderReference} mobileStack emptyMessage="No orders in your authorized history." columns={[
 {key:'order',label:'Order ID',cell:r=><button className="min-h-11 text-brand font-semibold underline" onClick={()=>setSelected(r.orderReference)}>{r.orderReference}</button>},
 {key:'units',label:'Units / sessions',cell:r=><>{r.totalUnits} units · {r.sessions} sessions</>},
 {key:'state',label:'Work',cell:r=><>{r.inProduction} In Production · {r.completed} Completed</>},
 {key:'reason',label:'Follow-up',cell:r=><>{r.unresolvedReasons} missing reasons{r.reportedDamage!==undefined?<p>{r.reportedDamage} reported damaged</p>:null}</>},
 {key:'time',label:'Latest checkout',cell:r=>formatDateTime(r.latestCheckout)},
 ]}/><Pager page={page} pageCount={Math.ceil(read.data.total/20)} total={read.data.total} onChange={setPage}/></Panel>:null}
 {selected!==undefined?<OrderDrawer key={selected??'unlinked'} orderReference={selected} onClose={()=>setSelected(undefined)}/>:null}</Page>;
}


type CheckoutHistoryPage = {page:number;pageSize:number;total:number;checkouts:{id:string;acceptedAt:string;actorName:string;totalUnits:number;outstandingReasonCount:number}[]};
function CheckoutSessionDrawer({id,onClose}:{id:string;onClose:()=>void}){
 const read=useApiRead<CheckoutView>('checkouts/'+id);
 return <DetailsDrawer title="Checkout details" onClose={onClose} wide>{read.loading?<DetailSkeleton rows={5}/>:read.error?<ErrorNotice message={read.error} onRetry={read.refresh}/>:read.data?<CheckoutAcceptance receipt={read.data}/>:null}</DetailsDrawer>;
}
function CheckoutHistoryWorkspace(){
 const [filter,setFilter]=useState(''),[order,setOrder]=useState(''),[page,setPage]=useState(1),[selected,setSelected]=useState('');
 const read=useApiRead<CheckoutHistoryPage>(`checkouts?page=${page}${order?'&orderReference='+encodeURIComponent(order):''}`);
 return <Page className="space-y-5"><PageHeader title="Checkout history" description=""/>
 <Panel title="All checkout sessions"><form className="flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();setOrder(filter.trim());setPage(1);}}>
 <div className="min-w-0 flex-1"><Field label="Filter by exact Order ID">{id=><Input id={id} value={filter} maxLength={120} placeholder="All checkouts, with or without an Order ID" onChange={event=>setFilter(event.target.value)}/>}</Field></div>
 <Button type="submit">Apply filter</Button><Button variant="secondary" onClick={()=>{setFilter('');setOrder('');setPage(1);}}>Show all</Button><Button variant="secondary" onClick={read.refresh}>Refresh history</Button></form>
 <p className="my-4 text-sm text-grey-2">{order?`Exact Order ID: ${order}`:'All authorized checkout sessions, including those without an Order ID.'} Open a session to inspect its items and references.</p>
 {read.loading?<DetailSkeleton rows={5}/>:read.error?<ErrorNotice message={read.error} onRetry={read.refresh}/>:read.data?<><DataTable label="Checkout sessions" rows={read.data.checkouts} rowKey={row=>row.id} mobileStack emptyMessage="No checkout sessions match this view." columns={[
 {key:'session',label:'Checkout',cell:row=><button className="min-h-11 text-brand underline" onClick={()=>setSelected(row.id)}>Session {row.id.slice(0,8)}</button>},
 {key:'time',label:'Recorded · Lagos',cell:row=>formatDateTime(row.acceptedAt)},
 {key:'employee',label:'Employee',cell:row=>row.actorName},
 {key:'quantity',label:'Items',cell:row=>row.totalUnits},
 {key:'reasons',label:'Missing reasons',cell:row=>row.outstandingReasonCount},
 ]}/><Pager page={page} pageCount={Math.ceil(read.data.total/read.data.pageSize)} total={read.data.total} onChange={setPage}/></>:null}</Panel>
 {selected?<CheckoutSessionDrawer key={selected} id={selected} onClose={()=>setSelected('')}/>:null}</Page>;
}
