'use client';
import { notifyAuthFailure } from '../lib/api';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { publicCodeSchema, type PublicIdentityLookup } from '@dayari/contracts';
import { Button } from './ui/button';

export function IdentityLookup({initialCode=''}:{initialCode?:string}) {
  const [code,setCode]=useState(initialCode),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [result,setResult]=useState<PublicIdentityLookup|null>(null), working=useRef(false);
  const request = useRef<AbortController | null>(null), revision = useRef(0);
  useEffect(()=>{clearPending();setCode(initialCode);},[initialCode]);
  useEffect(() => () => { revision.current++; request.current?.abort(); }, []);
  function clearPending() { revision.current++; request.current?.abort(); working.current=false;setBusy(false);setResult(null);setError(''); }
  async function submit(e:FormEvent){
    e.preventDefault();if(working.current)return;setResult(null);setError('');
    const kind=code.trim().toUpperCase().startsWith('L')?'LOT':'PRODUCT', parsed=publicCodeSchema(kind).safeParse(code);
    if(!parsed.success){setError('Enter a six-character Product Code (P…) or Lot Code (L…).');return;}
    working.current=true;setBusy(true);const ticket=++revision.current;const controller=new AbortController();request.current=controller;
    try{
      const response=await fetch(`/api/inventory/${kind==='PRODUCT'?'products':'lots'}/by-code/${parsed.data}`,{cache:'no-store',signal:controller.signal});
      notifyAuthFailure(response);const data=await response.json();if(!response.ok)throw new Error(response.status===404?'Code not found in this shop. Check the printed code and shop location.':response.status===503?'Shop service unavailable. Reconnect and retry.':'Code lookup unavailable. Check your session and try again.');
      if(ticket===revision.current)setResult(data);
    }catch(e){if(ticket===revision.current&&!controller.signal.aborted)setError((e as Error).message);}finally{if(ticket===revision.current){working.current=false;setBusy(false);}}
  }
  return <section aria-label="Exact code lookup" className="my-6 rounded-xl border border-stone-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Find by Product or Lot Code</h2><span className="text-xs text-stone-500">Exact lookup · this shop</span></div>
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1">Product or Lot Code<input autoComplete="off" spellCheck={false} maxLength={12} value={code} onChange={e=>{clearPending();setCode(e.target.value);}} placeholder="P7K2M9 or L8M4Q2" /></label><Button disabled={busy}>{busy?'Looking up…':'Find code'}</Button></form>
    <p className="mt-2 text-xs leading-5 text-stone-500">Codes identify a shared product or one exact delivery lot. Lookup never changes stock.</p>
    {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {result&&<div aria-label="Code lookup result" role="status" className="mt-4 space-y-2 rounded-lg bg-emerald-50 p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">{result.kind==='PRODUCT'?'Shared product':'Delivery lot'}</p>
      <p className="break-words text-lg font-semibold">{result.productName}{result.variantName&&` · ${result.variantName}`}</p>
      <p className="font-mono">Product {result.productCode??'Code not assigned'}{result.lotCode&&` · Lot ${result.lotCode}`}</p>
      {result.fullSku&&<p className="break-all font-mono text-xs">{result.fullSku} · Batch {result.publicBatchCode}</p>}
      {result.usable!==undefined&&<p className="font-semibold">Usable availability: {result.usable}</p>}
      {result.damaged!==undefined&&<p className="text-amber-800">Damaged lot quantity: {result.damaged}</p>}
      <p className="text-xs text-stone-500">Local data as of {new Date(result.dataAsOf).toLocaleString('en-GB',{timeZone:'Africa/Lagos'})} (Lagos). {result.kind==='PRODUCT'?'This code stays the same across suppliers and variants.':'This is a lot identity, not an individual unit serial.'}</p>
    </div>}
  </section>;
}
