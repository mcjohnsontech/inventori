'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
import {Button} from './button';
/**
 * Native dialog, like TaskModal, so a confirmation opened from inside (for example
 * "Discard this damage draft?") stacks on top and stays clickable and reachable.
 * A Radix dialog here hid the shared confirm dialog and blocked its buttons.
 * Content renders only while open, matching the previous behaviour.
 */
export function ReportModal({open,onClose,busy,children}:{open:boolean;onClose:()=>void;busy:boolean;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId(),descriptionId=useId();
 useEffect(()=>{const node=dialog.current!;if(!open){node.close();return;}const previous=document.activeElement as HTMLElement|null;node.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{node.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};},[open]);
 const close=()=>{if(!busy)onClose();};
 return <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event=>{event.preventDefault();close();}} className="fixed inset-0 m-auto max-h-[92dvh] w-[min(960px,calc(100vw-24px))] max-w-full overflow-y-auto rounded-2xl border-0 bg-white p-0 text-ink shadow-xl backdrop:bg-black/40">{open?<><header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-black/10 bg-white p-5"><div><h2 id={titleId} className="text-xl font-semibold">Report damaged items</h2><p id={descriptionId} className="mt-1 text-sm text-grey-2">You can close this and come back later. Nothing changes until you confirm.</p></div><Button variant="ghost" disabled={busy} onClick={close}>Close report</Button></header><div className="p-4 sm:p-6">{children}</div></>:null}</dialog>;
}
