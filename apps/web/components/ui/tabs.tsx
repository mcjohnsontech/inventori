'use client';
import { cn } from '../../lib/cn';
import { Icon, type IconSpec } from './icon';

export type Tab<T extends string> = { value: T; label: string; count?: number };

/**
 * Page-level section navigation (an underline tab bar). Visually distinct from
 * action buttons, used once per page at most. Each entry is a navigation button
 * marked with aria-current; on narrow screens the bar scrolls sideways instead
 * of wrapping onto several rows.
 */
export function SectionTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: { value: T; label: string; icon?: IconSpec; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('min-w-0', className)}>
      <div className="-mb-px flex min-w-0 gap-1 overflow-x-auto border-b border-black/[0.08] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(item.value)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 font-sans text-sm font-semibold tracking-[-0.02em] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
                active
                  ? 'border-brand text-brand'
                  : 'border-transparent text-grey-2 hover:border-black/15 hover:text-ink',
              )}
            >
              {item.icon ? <Icon icon={item.icon} size={16} /> : null}
              {item.label}
              {item.count !== undefined ? (
                <span
                  aria-hidden
                  className={cn(
                    'rounded-full px-1.5 font-mono text-[11px]',
                    active ? 'bg-brand-tint text-brand' : 'bg-black/5 text-grey-3',
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

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
