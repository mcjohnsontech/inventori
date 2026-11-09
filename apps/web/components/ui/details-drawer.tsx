'use client';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Icon } from './icon';

/**
 * A right-hand modal drawer for inspecting one record without losing the list
 * behind it. Native <dialog>, so focus trapping and the backdrop come free.
 */
export function DetailsDrawer({
  title,
  eyebrow = 'Inventory details',
  onClose,
  children,
  closeLabel = 'Close lot details',
  active = true,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
  /** Keep record state mounted while a drilldown temporarily owns the modal. */
  active?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    if (!active) return;
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;

    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [active]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-[min(520px,100vw)] max-w-full overflow-y-auto border-0 border-l border-black/[0.07] bg-white p-0 text-ink shadow-[-12px_0_60px_rgba(21,62,49,0.13)] backdrop:bg-black/40"
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-black/[0.06] bg-white px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <p className="font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
            {eyebrow}
          </p>
          <h2
            id={id}
            className="mt-1.5 font-display text-xl font-semibold tracking-[-0.03em] break-words text-ink"
          >
            {title}
          </h2>
        </div>
        <button
          autoFocus
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-grey-3 transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Icon icon={Cancel01Icon} size={19} />
        </button>
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </dialog>
  );
}
