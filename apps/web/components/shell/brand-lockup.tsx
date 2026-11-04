import { Layers01Icon } from '@hugeicons/core-free-icons';

import { Icon } from '../ui/icon';

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-brand-deep">
      <Icon icon={Layers01Icon} size={compact ? 24 : 26} strokeWidth={2} />
      {compact ? (
        <span className="sr-only">Dayari Inventory</span>
      ) : (
        <>
          <span className="font-display text-[26px] leading-none font-semibold tracking-[-0.04em]">
            dayari<span className="text-brand">.</span>
          </span>
          <span className="mt-1 font-sans text-[8px] font-semibold tracking-[0.16em] text-grey-3 uppercase">
            Inventory
          </span>
        </>
      )}
    </span>
  );
}
