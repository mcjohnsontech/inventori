'use client';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';

import { cn } from '../../lib/cn';
import { Icon } from './icon';

const WINDOW = 2;
const ALL_PAGES_UP_TO = 20;

function pagesToShow(current: number, total: number): (number | 'gap')[] {
  if (total <= ALL_PAGES_UP_TO) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const wanted = new Set<number>([1, total]);
  for (let page = current - WINDOW; page <= current + WINDOW; page += 1) {
    if (page > 1 && page < total) wanted.add(page);
  }

  const ordered = [...wanted].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];

  ordered.forEach((page, index) => {
    const previous = ordered[index - 1];
    if (previous !== undefined && page - previous > 1) out.push('gap');
    out.push(page);
  });

  return out;
}

/** `page` is 1-based. */
export function Pager({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total?: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const step = (to: number) => onChange(Math.min(pageCount, Math.max(1, to)));

  return (
    <div className="border-t border-black/[0.06] px-5 py-4">
      <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => step(page - 1)}
          className="grid size-9 place-items-center rounded-lg border border-black/10 text-grey-2 transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
        </button>

        {pagesToShow(page, pageCount).map((entry, index) =>
          entry === 'gap' ? (
            <span key={`gap-${index}`} className="px-1 font-sans text-sm text-grey-3">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-label={`Page ${entry}`}
              aria-current={entry === page ? 'page' : undefined}
              onClick={() => step(entry)}
              className={cn(
                'h-9 min-w-9 rounded-lg px-2.5 font-sans text-sm font-semibold transition-colors',
                entry === page
                  ? 'bg-brand text-white'
                  : 'border border-black/10 text-grey-2 hover:bg-surface-muted hover:text-ink',
              )}
            >
              {entry}
            </button>
          ),
        )}

        <button
          type="button"
          aria-label="Next page"
          disabled={page === pageCount}
          onClick={() => step(page + 1)}
          className="grid size-9 place-items-center rounded-lg border border-black/10 text-grey-2 transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon icon={ArrowRight01Icon} size={16} strokeWidth={2} />
        </button>
      </nav>
      {total !== undefined ? (
        <p className="mt-2 text-center font-sans text-xs tracking-[-0.02em] text-grey-3">
          {total} in total
        </p>
      ) : null}
    </div>
  );
}
