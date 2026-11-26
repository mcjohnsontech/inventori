'use client';
import { formatTime } from '../lib/format';
import {useState} from 'react';
import type {AvailabilityPage,AvailableProduct} from '@dayari/contracts';
import {useApiRead} from '../lib/api';
import {Button} from './ui/button';
import {EmptyState,LoadingState,PageHeader,ReadError,SearchField} from './ui/workspace';
import {DataTable,Pager} from './ui';

/** One row per option: Production does not need to know which delivery an item came from. */
function byOption(lots:AvailabilityPage['lots']){
 const rows=new Map<string,{variantId:string;variantName:string;usable:number}>();
 for(const lot of lots){const row=rows.get(lot.variantId)??{variantId:lot.variantId,variantName:lot.variantName,usable:0};row.usable+=Number(lot.usable);rows.set(lot.variantId,row);}
 return [...rows.values()];
}
function ProductLots({productId,q,onCode}:{productId:string;q:string;onCode:(code:string)=>void}){
 const [page,setPage]=useState(1);
 const stock=useApiRead<AvailabilityPage>(`availability?${new URLSearchParams({productId,q,page:String(page)})}`);
 return <div className="border-t border-black/5 p-4">{stock.loading?<LoadingState/>:stock.error?<ReadError message={stock.error} onRetry={stock.refresh}/>:stock.data?<>
 <DataTable label="Usable stock by option" rows={byOption(stock.data.lots)} rowKey={row=>row.variantId} mobileStack emptyMessage="No usable stock matches." columns={[
 {key:'variant',label:'Option',cell:row=>row.variantName},
 {key:'quantity',label:'Usable',cell:row=>row.usable}
 ]}/><Pager page={page} pageCount={Math.ceil(stock.data.total/stock.data.pageSize)} total={stock.data.total} onChange={setPage}/></>:null}</div>;
}
function ProductRow({product,q,onCode}:{product:AvailableProduct;q:string;onCode:(code:string)=>void}){
 const [open,setOpen]=useState(false);
 return <section className="surface overflow-hidden"><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)} className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand">
 <span><span className="block font-semibold">{product.productName}</span></span>
 <span className="text-sm text-grey-2">{product.variantCount} {product.variantCount===1?'option':'options'} <span className="ml-3 font-semibold text-brand">{open?'Hide details −':'View variants +'}</span></span>
 </button>{open?<ProductLots productId={product.productId} q={q} onCode={onCode}/>:null}</section>;
}
export function ProductionWorkspace({onScan,onCode,onCheckout}:{onScan:()=>void;onCode:(code:string)=>void;onCheckout:()=>void}){
 const [q,setQ]=useState(''),[page,setPage]=useState(1);
 const stock=useApiRead<AvailabilityPage>(`availability?${new URLSearchParams({view:'products',q,page:String(page)})}`);
 return <div className="page"><PageHeader title="Usable stock" description="" actions={<div className="flex flex-wrap gap-2"><Button onClick={onCheckout}>Checkout items</Button><Button variant="secondary" onClick={onScan}>Scan a label</Button></div>}/>
 <div className="mb-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><SearchField label="Search usable stock" value={q} onChange={value=>{setQ(value);setPage(1);}} placeholder="Product name or option…"/><Button variant="outline" onClick={stock.refresh}>Refresh availability</Button></div>
 {stock.loading?<LoadingState/>:stock.error?<ReadError message={stock.error} onRetry={stock.refresh}/>:!stock.data?.products?.length?<EmptyState title="No usable stock matches">Try another product name or option.</EmptyState>:<><p className="mb-4 text-xs text-stone-500">{stock.data.total} matching products · As of {formatTime(stock.data.dataAsOf)}</p><div className="space-y-3">{stock.data.products.map(product=><ProductRow key={`${q}:${page}:${product.productId}`} product={product} q={q} onCode={onCode}/>)}</div><Pager page={page} pageCount={Math.ceil(stock.data.total/stock.data.pageSize)} total={stock.data.total} onChange={setPage}/></>}
 </div>;
}
