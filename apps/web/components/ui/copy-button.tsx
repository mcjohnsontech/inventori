'use client';
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';

import { Icon } from './icon';

/** Reveals on hover of the enclosing `group`. Codes here are meant to be copied. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="grid size-6 shrink-0 place-items-center rounded-md text-grey-3 opacity-0 transition hover:bg-surface-muted hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand group-hover:opacity-100"
    >
      <Icon
        icon={copied ? Tick02Icon : Copy01Icon}
        size={14}
        strokeWidth={2}
        className={copied ? 'text-brand' : undefined}
      />
    </button>
  );
}
