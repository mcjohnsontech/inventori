import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'default' | 'compact';
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-btn font-sans font-semibold tracking-[-0.02em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const variants = {
  primary: 'bg-brand text-white hover:bg-brand-dark focus-visible:outline-brand',
  secondary:
    'border border-black/15 bg-white text-ink hover:border-black/25 hover:bg-surface-muted focus-visible:outline-brand',
  ghost: 'text-grey-2 hover:bg-surface-muted hover:text-ink focus-visible:outline-brand',
  danger: 'bg-danger text-white hover:bg-danger-dark focus-visible:outline-danger',
};

const sizes = {
  default: 'h-11 px-5 text-sm',
  compact: 'h-9 px-3.5 text-[13px]',
};

export function Button({ variant = 'primary', size = 'default', className, ...props }: Props) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
