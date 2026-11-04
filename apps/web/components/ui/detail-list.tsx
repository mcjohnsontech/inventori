import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export type DetailRow = { label: string; value: ReactNode };

/** Key/value evidence rows — shop authority, receipt metadata, wizard summaries. */
export function DetailList({
  rows,
  className,
  boxed = false,
}: {
  rows: DetailRow[];
  className?: string;
  boxed?: boolean;
}) {
  return (
    <dl
      className={cn(
        boxed
          ? 'divide-y divide-black/[0.06] overflow-hidden rounded-xl border border-black/[0.07] bg-white px-5'
          : 'grid gap-4',
        className,
      )}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            boxed && 'grid gap-1 py-3.5 sm:grid-cols-[150px_1fr] sm:gap-4',
          )}
        >
          <dt className="font-sans text-xs tracking-[-0.02em] text-grey-3">{row.label}</dt>
          <dd
            className={cn(
              'font-sans text-sm font-medium tracking-[-0.02em] break-words text-ink',
              !boxed && 'mt-1.5',
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
