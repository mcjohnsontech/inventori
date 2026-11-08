'use client';
import { useMemo,type ReactNode } from 'react';
import QRCode from 'qrcode';
import type { UnitLabelPreview } from '@dayari/contracts';
export function UnitQrSymbol({payload,code}:{payload:string;code:string}){
 const symbol=useMemo(()=>{
  const qr=QRCode.create([{data:payload,mode:'alphanumeric'}],{errorCorrectionLevel:'M'});let path='';
  for(let y=0;y<qr.modules.size;y++)for(let x=0;x<qr.modules.size;x++)if(qr.modules.get(y,x))path+=`M${x+4} ${y+4}h1v1h-1z`;
  return {size:qr.modules.size+8,path};
 },[payload]);
 return <svg role="img" aria-label={`QR for unit ${code}`} viewBox={`0 0 ${symbol.size} ${symbol.size}`} shapeRendering="crispEdges" className="aspect-square w-full"><rect width="100%" height="100%" fill="white"/><path d={symbol.path} fill="black"/></svg>;
}
export function UnitLabelCard({label,action}:{label:Pick<UnitLabelPreview,'unitId'|'payload'|'content'|'purpose'>;action?:ReactNode}){
 const c=label.content;
 return <article aria-label={`Unit label ${c.unitCode}`} className="min-w-0 rounded-xl border border-black/15 bg-white p-4 text-black shadow-sm">
  <div className="flex items-start gap-3"><div className="w-24 max-w-[36%] shrink-0"><UnitQrSymbol payload={label.payload} code={c.unitCode}/></div><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold tracking-[0.1em] text-grey-2 uppercase">Individual unit</p><p className="mt-1 font-mono text-2xl font-bold tracking-[0.06em]">{c.unitCode}</p><p className="mt-2 font-mono text-xs break-all">{c.fullSku}</p><p className="mt-1 font-mono text-xs break-words">Lot {c.lotCode??'Not assigned'}{c.productCode?' · '+c.productCode:''}</p></div></div>
  <p className="mt-3 text-sm font-semibold break-words">{c.productName} · {c.variantName}</p><p className="mt-1 text-xs break-words">{c.supplierName} / {c.sourceName}</p><p className="mt-2 font-mono text-xs break-words">Batch {c.publicBatchCode}</p>
  {label.purpose==='DAMAGED_INTAKE'?<p className="mt-3 rounded bg-black px-2 py-1.5 text-center text-[10px] font-bold tracking-wide text-white">DAMAGED INTAKE — NOT FOR PRODUCTION</p>:null}
  {action?<div className="mt-3 border-t border-black/10 pt-3">{action}</div>:null}
 </article>;
}
