'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { Button } from '../ui/button';

export function WizardShell({ title, subtitle, steps, step, setStep, busy, error, dirty, onClose, onFinish, nextLabel = 'Continue', finishLabel, children, eyebrow = 'Catalogue setup' }: {
  title: string; subtitle: string; steps: string[]; step: number; setStep: (step: number) => void;
  busy: boolean; error: string; dirty: boolean; onClose: () => void; onFinish: () => void;
  eyebrow?: string; nextLabel?: string; finishLabel: string; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [discard, setDiscard] = useState(false);
  function close() { if (!busy) { if (dirty) setDiscard(true); else onClose(); } }
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  useEffect(() => {
    const guard = (event: Event) => {
      if (busy) { event.preventDefault(); return; }
      if (dirty) {
        if (window.confirm('Leave this workflow and discard its unsaved draft?')) onClose();
        else event.preventDefault();
      } else onClose();
    };
    window.addEventListener('dayari:before-navigate', guard);
    return () => window.removeEventListener('dayari:before-navigate', guard);
  }, [dirty, busy, onClose]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); dialog.current?.scrollTo({ top: 0 }); }, [step]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (step < steps.length - 1) setStep(step + 1); else onFinish();
  }
  return <dialog ref={dialog} aria-labelledby="wizard-title" onCancel={event => { event.preventDefault(); close(); }} className="wizard-dialog fixed inset-0 m-auto max-h-[96dvh] w-[min(760px,calc(100%_-_24px))] overflow-y-auto rounded-2xl border-0 bg-[#fafbf7] p-0 text-stone-800 shadow-2xl backdrop:bg-black/35 max-sm:max-h-dvh max-sm:min-h-dvh max-sm:w-full max-sm:rounded-none">
    <div className="border-b border-stone-200 p-6 sm:px-8"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-800">{eyebrow}</p><h2 id="wizard-title" className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-2 text-sm leading-6 text-stone-500">{subtitle}</p></div><button type="button" aria-label="Close setup" onClick={close} disabled={busy} className="rounded-lg p-2 hover:bg-stone-100"><X size={19} /></button></div>
      <ol aria-label="Setup progress" className="mt-6 flex gap-2">{steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className="min-w-0 flex-1"><div className={`mb-2 h-1 rounded-full ${index <= step ? 'bg-emerald-800' : 'bg-stone-200'}`} /><span className={`flex items-center gap-1.5 text-[11px] ${index === step ? 'font-semibold text-emerald-900' : 'text-stone-400'}`}>{index < step ? <Check size={13} /> : `${index + 1}.`} {label}</span></li>)}</ol>
    </div>
    {discard ? <div className="p-8"><h3 className="text-lg font-semibold">Discard this draft?</h3><p className="mt-2 text-sm text-stone-500">Your entered details have not been saved.</p><div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button><Button onClick={onClose}>Discard draft</Button></div></div> : <form onSubmit={submit}>
      <div className="space-y-6 p-6 sm:p-8"><h3 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">{steps[step]}</h3><fieldset disabled={busy} className="space-y-5">{children}</fieldset>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}</div>
      <div className="wizard-footer sticky bottom-0 flex items-center justify-between gap-3 border-t border-stone-200 bg-[#fafbf7] p-5 sm:px-8"><Button variant="outline" type="button" onClick={() => step ? setStep(step - 1) : close()} disabled={busy}><ArrowLeft size={15} />{step ? 'Back' : 'Cancel'}</Button><span className="hidden text-[11px] text-stone-400 sm:block">Step {step + 1} of {steps.length}</span><Button disabled={busy}>{busy ? 'Saving…' : step === steps.length - 1 ? finishLabel : nextLabel}{!busy && <ArrowRight size={15} />}</Button></div>
    </form>}
  </dialog>;
}
