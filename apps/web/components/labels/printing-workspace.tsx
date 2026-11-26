'use client';
import { useEffect,useState } from 'react';
import { Footnote } from '../ui';
import { LabelWorkspace } from './label-workspace';
import { UnitPrintingWorkspace } from './unit-printing-workspace';

/**
 * Owner decision, 24 Nov 2026: individual item labels are the normal way to
 * label stock. Shared lot labels stay available as an advanced option, reached
 * from a quiet link rather than a tab of equal weight.
 */
export function PrintingWorkspace({actorId,initialLegacyJobId='',initialReceiptId=''}:{actorId:string;initialLegacyJobId?:string;initialReceiptId?:string}){
 const [mode,setMode]=useState<'units'|'lots'>(initialLegacyJobId?'lots':'units');
 useEffect(()=>{if(initialReceiptId)setMode('units');else if(initialLegacyJobId)setMode('lots');},[initialLegacyJobId,initialReceiptId]);
 const link='min-h-11 text-sm font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand';
 if(mode==='units')return <UnitPrintingWorkspace actorId={actorId} initialReceiptId={initialReceiptId}
  bottomContent={<p className="text-sm text-grey-2">Need one label for a whole batch, for a shelf or box? <button type="button" className={link} onClick={()=>setMode('lots')}>Print shared batch labels (advanced)</button></p>}/>;
 return <LabelWorkspace initialJobId={initialLegacyJobId} topContent={<div className="space-y-3">
  <button type="button" className={link} onClick={()=>setMode('units')}>← Back to item labels</button>
  <Footnote>Advanced: a shared batch label shows the supplier code and batch, and every item in the batch gets the same label. For normal use, print item labels so each item has its own code.</Footnote>
 </div>}/>;
}
