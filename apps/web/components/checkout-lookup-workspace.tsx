'use client';
import {useState} from 'react';
import {CheckoutWorkspace} from './checkout-workspace';
import {QrWorkspace} from './labels/qr-workspace';
import {Button} from './ui';
/** Legacy QR URLs still resolve here. Only checkout confirmation changes stock. */
export function CheckoutLookupWorkspace({actorId,initialCode='',initialMode='checkout'}:{actorId:string;initialCode?:string;initialMode?:'lookup'|'checkout'}){
 const [mode,setMode]=useState(initialMode);
 function change(next:typeof mode){if(next!==mode&&window.dispatchEvent(new Event('dayari:before-navigate',{cancelable:true})))setMode(next);}
 return <div><div className="flex flex-wrap gap-2 px-4 pt-6 sm:px-6 lg:px-10" role="group" aria-label="Checkout and lookup mode"><Button variant={mode==='checkout'?'primary':'secondary'} onClick={()=>change('checkout')}>Checkout items</Button><Button variant={mode==='lookup'?'primary':'secondary'} onClick={()=>change('lookup')}>QR & code lookup</Button></div>{mode==='checkout'?<CheckoutWorkspace actorId={actorId}/>:<QrWorkspace initialCode={initialCode}/>}</div>;
}
