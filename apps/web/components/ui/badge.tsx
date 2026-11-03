import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

const tones = {
  neutral: 'bg-black/5 text-grey-2',
  brand: 'bg-brand-tint text-brand',
  usable: 'bg-usable-tint text-usable',
  damaged: 'bg-damaged-tint text-damaged',
  danger: 'bg-danger-tint text-danger',
};

export type Tone = keyof typeof tones;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 font-sans text-xs font-semibold tracking-[-0.01em] whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
