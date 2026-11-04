'use client';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';

import { cn } from '../../lib/cn';
import { control } from './field';
import { Icon } from './icon';

export function SearchInput({
  value,
  onChange,
  label = 'Search',
  placeholder = 'Search by name or code…',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative h-11 self-end', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center text-grey-3">
        <Icon icon={Search01Icon} size={16} />
      </span>
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(control, 'h-11 px-10 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-grey-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        >
          <Icon icon={Cancel01Icon} size={15} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
