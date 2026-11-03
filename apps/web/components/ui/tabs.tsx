'use client';
import { cn } from '../../lib/cn';

export type Tab<T extends string> = { value: T; label: string; count?: number };

/**
 * A filter toggle group, not an ARIA tab set: there is no tabpanel to own and
 * no roving focus, so these stay plain buttons with aria-pressed. The count is
 * decorative — the list below announces its own contents — so it is hidden from
 * assistive tech to keep each button's accessible name the bare label.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {tabs.map((tab) => {
        const active = tab.value === value;

        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 font-sans text-[13px] font-semibold tracking-[-0.02em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              active
                ? 'bg-brand-tint text-brand'
                : 'text-grey-2 hover:bg-surface-muted hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                aria-hidden
                className={cn('font-mono text-xs', active ? 'text-brand' : 'text-grey-3')}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
