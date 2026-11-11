'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
import {Button} from './button';
/** Native dialog keeps draft fields mounted when closed, without retaining a focus trap. */
export function TaskModal({title,open,busy=false,onClose,children}:{title:string;open:boolean;busy?:boolean;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const node=dialog.current!;if(!open){node.close();return;}const previous=document.activeElement as HTMLElement|null;node.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{node.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};},[open]);
 const close=()=>{if(!busy)onClose();};
 return <dialog ref={dialog} aria-labelledby={id} onCancel={event=>{event.preventDefault();close();}} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(980px,calc(100vw-24px))] max-w-full overflow-y-auto rounded-2xl border-0 bg-white p-0 text-ink shadow-xl backdrop:bg-black/40"><header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-black/10 bg-white p-5"><div><h2 id={id} className="text-xl font-semibold">{title}</h2><p className="mt-1 text-xs text-grey-2">Closing keeps your draft. Review before confirming.</p></div><Button variant="secondary" disabled={busy} onClick={close}>Close task</Button></header><div className="space-y-4 p-4 sm:p-6">{children}</div></dialog>;
}
