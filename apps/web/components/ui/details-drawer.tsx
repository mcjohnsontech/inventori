'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
export function DetailsDrawer({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const element=dialog.current!;const previous=document.activeElement as HTMLElement|null;element.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{element.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};},[]);
 return <dialog ref={dialog} aria-labelledby={id} className="details-drawer" onCancel={event=>{event.preventDefault();onClose();}}><header className="drawer-heading"><div><p className="eyebrow">Inventory details</p><h2 id={id}>{title}</h2></div><button autoFocus className="icon-button" aria-label="Close lot details" onClick={onClose}><X size={20}/></button></header><div className="drawer-body">{children}</div></dialog>;
}
