'use client';
import { useEffect,useState } from 'react';
import { Footnote,Tabs } from '../ui';
import { LabelWorkspace } from './label-workspace';
import { UnitPrintingWorkspace } from './unit-printing-workspace';
export function PrintingWorkspace({actorId,initialLegacyJobId='',initialReceiptId=''}:{actorId:string;initialLegacyJobId?:string;initialReceiptId?:string}){
 const [mode,setMode]=useState<'units'|'lots'>(initialLegacyJobId?'lots':'units');
 useEffect(()=>{if(initialReceiptId)setMode('units');else if(initialLegacyJobId)setMode('lots');},[initialLegacyJobId,initialReceiptId]);
 const tabs=<Tabs label="Label identity type" value={mode} onChange={setMode} tabs={[{value:'units',label:'Individual items'},{value:'lots',label:'Shared lot labels'}]}/>;
 return mode==='units'?<UnitPrintingWorkspace actorId={actorId} topContent={tabs} initialReceiptId={initialReceiptId}/>:<LabelWorkspace initialJobId={initialLegacyJobId} topContent={<div className="space-y-3">{tabs}<Footnote>Shared lot labels identify a SKU and batch. Use Individual items when each physical item needs its own Unit Code and QR.</Footnote></div>}/>;
}
