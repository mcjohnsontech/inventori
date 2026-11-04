'use client';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { ErrorNotice } from '../ui/status';

export function WizardShell({
  title,
  subtitle,
  eyebrow = 'Catalogue setup',
  steps,
  step,
  setStep,
  busy,
  error,
  dirty,
  onClose,
  onFinish,
  nextLabel = 'Continue',
  finishLabel,
  children,
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
  steps: string[];
  step: number;
  setStep: (step: number) => void;
  busy: boolean;
  error: string;
  dirty: boolean;
  onClose: () => void;
  onFinish: () => void;
  nextLabel?: string;
  finishLabel: string;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [discarding, setDiscarding] = useState(false);

  function requestClose() {
    if (busy) return;
    if (dirty) setDiscarding(true);
    else onClose();
  }

  // Warn before a browser-level navigation drops an unsaved draft.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The workspace dispatches this before changing hash routes.
  useEffect(() => {
    const guard = (event: Event) => {
      if (busy) {
        event.preventDefault();
        return;
      }
      if (dirty) {
        if (window.confirm('Leave this workflow and discard its unsaved draft?')) onClose();
        else event.preventDefault();
      } else {
        onClose();
      }
    };

    window.addEventListener('dayari:before-navigate', guard);
    return () => window.removeEventListener('dayari:before-navigate', guard);
  }, [dirty, busy, onClose]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    body.current?.scrollTo({ top: 0 });
  }, [step]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (step < steps.length - 1) setStep(step + 1);
    else onFinish();
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            requestClose();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed inset-0 z-50 m-auto flex h-dvh w-full flex-col bg-surface-muted shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:w-[min(780px,calc(100%-32px))] sm:rounded-2xl"
        >
          <div className="shrink-0 border-b border-black/[0.06] bg-white px-5 pt-5 pb-5 sm:rounded-t-2xl sm:px-8 sm:pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
                  {eyebrow}
                </p>
                <Dialog.Title className="mt-2 font-display text-[26px] leading-tight font-semibold tracking-[-0.03em] text-ink">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="mt-2 font-sans text-sm leading-[1.6] tracking-[-0.02em] text-grey-2">
                  {subtitle}
                </Dialog.Description>
              </div>
              <button
                type="button"
                aria-label="Close setup"
                onClick={requestClose}
                disabled={busy}
                className="grid size-9 shrink-0 place-items-center rounded-lg text-grey-3 transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              >
                <Icon icon={Cancel01Icon} size={19} />
              </button>
            </div>

            <ol aria-label="Setup progress" className="mt-6 flex gap-2">
              {steps.map((label, index) => (
                <li
                  key={label}
                  aria-current={index === step ? 'step' : undefined}
                  className="min-w-0 flex-1"
                >
                  <div
                    className={cn(
                      'mb-2 h-1 rounded-full transition-colors',
                      index <= step ? 'bg-brand' : 'bg-black/10',
                    )}
                  />
                  <span
                    className={cn(
                      'flex items-center gap-1.5 font-sans text-[11px] tracking-[-0.01em]',
                      index === step ? 'font-semibold text-brand' : 'text-grey-3',
                    )}
                  >
                    {index < step ? (
                      <Icon icon={Tick02Icon} size={13} strokeWidth={2.5} />
                    ) : (
                      `${index + 1}.`
                    )}
                    <span className="truncate">{label}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {discarding ? (
            <div className="p-6 sm:p-8">
              <h3 className="font-sans text-lg font-semibold tracking-[-0.03em] text-ink">
                Discard this draft?
              </h3>
              <p className="mt-2 font-sans text-sm leading-[1.6] tracking-[-0.02em] text-grey-2">
                Your entered details have not been saved.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button variant="secondary" onClick={() => setDiscarding(false)}>
                  Keep editing
                </Button>
                <Button variant="danger" onClick={onClose}>
                  Discard draft
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
              <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
                <h3
                  ref={heading}
                  tabIndex={-1}
                  className="font-sans text-lg font-semibold tracking-[-0.03em] text-ink outline-none"
                >
                  {steps[step]}
                </h3>
                <fieldset disabled={busy} className="mt-5 space-y-5 disabled:opacity-70">
                  {children}
                </fieldset>
                {error ? <ErrorNotice message={error} className="mt-5" /> : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] bg-white px-5 py-4 sm:rounded-b-2xl sm:px-8">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => (step ? setStep(step - 1) : requestClose())}
                >
                  <Icon icon={ArrowLeft01Icon} size={15} strokeWidth={2} />
                  {step ? 'Back' : 'Cancel'}
                </Button>
                <span className="hidden font-sans text-xs tracking-[-0.02em] text-grey-3 sm:block">
                  Step {step + 1} of {steps.length}
                </span>
                <Button disabled={busy} className="ml-auto sm:ml-0">
                  {busy ? 'Saving…' : step === steps.length - 1 ? finishLabel : nextLabel}
                  {busy ? null : <Icon icon={ArrowRight01Icon} size={15} strokeWidth={2} />}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
