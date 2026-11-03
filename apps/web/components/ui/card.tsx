import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

/**
 * The one card recipe. Everything raised off the page background uses this —
 * stat tiles, panels, product tiles, lot tiles, dialogs. Do not re-invent it.
 */
export const card = 'rounded-2xl border border-black/[0.07] bg-white';

/** Adds the lift that marks a card as activatable. */
export const cardInteractive =
  'text-left transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(card, className)} {...props} />;
}
