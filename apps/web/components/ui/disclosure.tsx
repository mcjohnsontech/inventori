import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/** A collapsible section. Secondary detail that should not crowd the page. */
export function Disclosure({
  summary,
  children,
  open = false,
  className,
  onOpen,
}: {
  summary: string;
  children: ReactNode;
  open?: boolean;
  className?: string;
  /** Fires the first time it expands, for content worth deferring. */
  onOpen?: () => void;
}) {
  return (
    <details
      open={open}
      className={cn('group', className)}
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen?.();
      }}
    >
      <summary className="inline-flex cursor-pointer items-center gap-1.5 font-sans text-[13px] font-semibold tracking-[-0.02em] text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
