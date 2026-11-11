'use client';
import {useState} from 'react';
import type {AvailabilityPage,AvailableProduct} from '@dayari/contracts';
import {useApiRead} from '../lib/api';
import {Button} from './ui/button';
import {EmptyState,LoadingState,PageHeader,ReadError,SearchField} from './ui/workspace';
import {Code,DataTable,Pager} from './ui';

function ProductLots({productId,q,onCode}:{productId:string;q:string;onCode:(code:string)=>void}){
 const [page,setPage]=useState(1);
 const stock=useApiRead<AvailabilityPage>(`availability?${new URLSearchParams({productId,q,page:String(page)})}`);
 return <div className="border-t border-black/5 p-4">{stock.loading?<LoadingState/>:stock.error?<ReadError message={stock.error} onRetry={stock.refresh}/>:stock.data?<>
 <DataTable label="Product variants and usable lots" rows={stock.data.lots} rowKey={lot=>lot.lotId} mobileStack emptyMessage="No usable lots match." columns={[
 {key:'variant',label:'Variant',cell:lot=>lot.variantName},
 {key:'sku',label:'SKU',cell:lot=><Code>{lot.fullSku}</Code>},
 {key:'lot',label:'Lot / batch',cell:lot=><><Code>{lot.lotCode??'Not assigned'}</Code><span className="block text-xs text-grey-2">{lot.publicBatchCode}</span></>},
 {key:'quantity',label:'Usable',cell:lot=>lot.usable},
 {key:'lookup',label:'Details',cell:lot=>lot.lotCode?<Button variant="outline" size="small" onClick={()=>onCode(lot.lotCode!)}>Look up {lot.lotCode}</Button>:<span className="text-xs">Scan its saved QR label</span>}
 ]}/><Pager page={page} pageCount={Math.ceil(stock.data.total/stock.data.pageSize)} total={stock.data.total} onChange={setPage}/></>:null}</div>;
}
function ProductRow({product,q,onCode}:{product:AvailableProduct;q:string;onCode:(code:string)=>void}){
 const [open,setOpen]=useState(false);
 return <section className="surface overflow-hidden"><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)} className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand">
 <span><span className="block font-semibold">{product.productName}</span>{product.productCode?<Code className="mt-1 block text-xs">{product.productCode}</Code>:null}</span>
 <span className="text-sm text-grey-2">{product.variantCount} {product.variantCount===1?'variant':'variants'} · {product.lotCount} {product.lotCount===1?'lot':'lots'} <span className="ml-3 font-semibold text-brand">{open?'Hide details −':'View variants +'}</span></span>
 </button>{open?<ProductLots productId={product.productId} q={q} onCode={onCode}/>:null}</section>;
}
export function ProductionWorkspace({onScan,onCode,onCheckout}:{onScan:()=>void;onCode:(code:string)=>void;onCheckout:()=>void}){
 const [q,setQ]=useState(''),[page,setPage]=useState(1);
 const stock=useApiRead<AvailabilityPage>(`availability?${new URLSearchParams({view:'products',q,page:String(page)})}`);
 return <div className="page"><PageHeader title="Inventory" description="" actions={<div className="flex flex-wrap gap-2"><Button onClick={onCheckout}>Checkout items</Button><Button variant="secondary" onClick={onScan}>Scan a QR label</Button></div>}/>
 <div className="mb-5 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><SearchField label="Search usable stock" value={q} onChange={value=>{setQ(value);setPage(1);}} placeholder="Product, variant, SKU, Lot Code or batch…"/><Button variant="outline" onClick={stock.refresh}>Refresh availability</Button></div>
 {stock.loading?<LoadingState/>:stock.error?<ReadError message={stock.error} onRetry={stock.refresh}/>:!stock.data?.products?.length?<EmptyState title="No usable stock matches">Try another product, variant or printed code.</EmptyState>:<><p className="mb-4 text-xs text-stone-500">{stock.data.total} matching products · As of {new Date(stock.data.dataAsOf).toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos'})} Lagos</p><div className="space-y-3">{stock.data.products.map(product=><ProductRow key={`${q}:${page}:${product.productId}`} product={product} q={q} onCode={onCode}/>)}</div><Pager page={page} pageCount={Math.ceil(stock.data.total/stock.data.pageSize)} total={stock.data.total} onChange={setPage}/></>}
 </div>;
}
