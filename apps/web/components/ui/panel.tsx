import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { card } from './card';

export function Panel({
  title,
  description,
  action,
  children,
  className,
  flush = false,
  level = 2,
  label,
}: {
  title: string;
  description?: string;
  /** Names the section as a landmark when it differs from the visible title. */
  label?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Let the body run to the card edge, for tables and divided lists. */
  flush?: boolean;
  /** Drop to 3 when the panel sits inside an already-titled region. */
  level?: 2 | 3;
}) {
  const Heading = level === 3 ? 'h3' : 'h2';

  return (
    <section aria-label={label} className={cn(card, 'overflow-hidden', className)}>
      <div
        className={cn(
          'flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pt-6',
          !description && 'sm:items-center',
        )}
      >
        <div className="min-w-0">
          <Heading className="font-sans text-base font-semibold tracking-[-0.03em] text-ink">
            {title}
          </Heading>
          {description ? (
            <p className="mt-1.5 font-sans text-sm leading-[1.6] tracking-[-0.02em] text-grey-2">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
      <div className={cn(flush ? 'mt-5' : 'px-5 pt-5 pb-5 sm:px-6 sm:pb-6')}>{children}</div>
    </section>
  );
}
