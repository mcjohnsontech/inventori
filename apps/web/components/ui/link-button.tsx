import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

/** An inline textual action — "View product", "Inspect lot provenance". */
export function LinkButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 font-sans text-[13px] font-semibold tracking-[-0.02em] text-brand underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        className,
      )}
      {...props}
    />
  );
}
