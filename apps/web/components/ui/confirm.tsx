'use client';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from './button';
import { Icon } from './icon';

type Request = {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: 'danger' | 'primary';
  resolve: (ok: boolean) => void;
};

let show: ((request: Request) => void) | null = null;

/**
 * An in-app replacement for window.confirm in click handlers. Resolves true
 * when the person confirms. Falls back to the browser prompt only if the
 * dialog host is not mounted (for example outside the signed-in shell).
 */
export function confirmAction(
  message: string,
  {
    confirmLabel = 'Discard',
    cancelLabel = 'Keep editing',
    tone = 'danger',
  }: { confirmLabel?: string; cancelLabel?: string; tone?: 'danger' | 'primary' } = {},
): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => show!({ message, confirmLabel, cancelLabel, tone, resolve }));
}

/** Mounted once in the app shell; renders the active confirmation. */
export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    show = setRequest;
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (request && !node.open) node.showModal();
    if (!request && node.open) node.close();
  }, [request]);

  const finish = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        finish(false);
      }}
      className="fixed inset-0 m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border-0 bg-white p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      {request ? (
        <div className="p-6">
          <div className="flex items-start gap-3">
            <span className={request.tone === 'danger' ? 'grid size-10 shrink-0 place-items-center rounded-xl bg-danger-tint text-danger' : 'grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand'}>
              <Icon icon={Alert02Icon} size={20} />
            </span>
            <p id={titleId} className="pt-2 font-sans text-[15px] leading-[1.55] font-semibold tracking-[-0.02em]">
              {request.message}
            </p>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2.5">
            <Button variant="secondary" autoFocus onClick={() => finish(false)}>
              {request.cancelLabel}
            </Button>
            <Button variant={request.tone === 'danger' ? 'danger' : 'primary'} onClick={() => finish(true)}>
              {request.confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
