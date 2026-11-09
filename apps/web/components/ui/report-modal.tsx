'use client';
import * as Dialog from '@radix-ui/react-dialog';
import type {ReactNode} from 'react';
import {Button} from './button';
export function ReportModal({open,onClose,busy,children}:{open:boolean;onClose:()=>void;busy:boolean;children:ReactNode}){
 return <Dialog.Root open={open} onOpenChange={value=>{if(!value&&!busy)onClose();}}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40"/><Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[92dvh] w-[min(960px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white shadow-xl"><header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-black/10 bg-white p-5"><div><Dialog.Title className="text-xl font-semibold">Report damaged / BAD items</Dialog.Title><Dialog.Description className="mt-1 text-sm text-grey-2">Closing keeps your draft. Stock changes only after confirmation.</Dialog.Description></div><Button variant="ghost" disabled={busy} onClick={onClose}>Close report</Button></header><div className="p-4 sm:p-6">{children}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
