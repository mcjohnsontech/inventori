'use client';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={120} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({
  label,
  side = 'right',
  children,
}: {
  label: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={10}
          className="z-50 rounded-lg bg-ink px-3 py-1.5 font-sans text-xs tracking-[-0.02em] text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
        >
          {label}
          <RadixTooltip.Arrow className="fill-ink" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
