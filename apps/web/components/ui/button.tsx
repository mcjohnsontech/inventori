import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'default' | 'compact' | 'small';
};

const base =
  'inline-flex max-w-full items-center justify-center gap-2 rounded-btn font-sans font-semibold tracking-[-0.02em] whitespace-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed';

/* Disabled buttons turn neutral grey rather than a faded brand colour, so an
 * unavailable action never reads as a slightly paler enabled one. */
const solidDisabled = 'disabled:bg-black/[0.07] disabled:text-grey-2 disabled:shadow-none';
const outlineDisabled =
  'disabled:border-black/[0.08] disabled:bg-surface-muted disabled:text-grey-2/80';

const variants = {
  primary: cn('bg-brand text-white hover:bg-brand-dark focus-visible:outline-brand', solidDisabled),
  secondary: cn(
    'border border-black/15 bg-white text-ink hover:border-black/25 hover:bg-surface-muted focus-visible:outline-brand',
    outlineDisabled,
  ),
  ghost: 'text-grey-2 hover:bg-surface-muted hover:text-ink focus-visible:outline-brand disabled:text-grey-3 disabled:hover:bg-transparent',
  danger: cn('bg-danger text-white hover:bg-danger-dark focus-visible:outline-danger', solidDisabled),
  // Legacy alias used by screens not yet ported to the primitives.
  outline: cn(
    'border border-black/15 bg-white text-ink hover:border-black/25 hover:bg-surface-muted focus-visible:outline-brand',
    outlineDisabled,
  ),
};

const sizes = {
  default: 'min-h-11 px-5 py-2.5 text-sm',
  compact: 'min-h-9 px-3.5 py-1.5 text-[13px]',
  small: 'min-h-9 px-3.5 py-1.5 text-[13px]',
};

export function Button({ variant = 'primary', size = 'default', className, ...props }: Props) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
