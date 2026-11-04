import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/** A collapsible section. Secondary detail that should not crowd the page. */
export function Disclosure({
  summary,
  children,
  open = false,
  className,
  onOpen,
  headingLevel,
}: {
  summary: string;
  children: ReactNode;
  open?: boolean;
  className?: string;
  /** Fires the first time it expands, for content worth deferring. */
  onOpen?: () => void;
  /** Render the summary text as a heading when it titles a real section. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : headingLevel === 3 ? 'h3' : null;
  return (
    <details
      open={open}
      className={cn('group', className)}
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen?.();
      }}
    >
      <summary className="inline-flex cursor-pointer items-center gap-1.5 font-sans text-[13px] font-semibold tracking-[-0.02em] text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        {Heading ? <Heading className="inline text-inherit">{summary}</Heading> : summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
