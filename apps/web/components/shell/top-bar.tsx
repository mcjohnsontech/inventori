'use client';
import { useEffect } from 'react';

import { roleLabel } from '../../lib/format';
import { destinations, type Workspace } from './destinations';

export function TopBar({
  workspace,
  account,
}: {
  workspace: Workspace;
  account: { name: string; role: string };
}) {
  const title = destinations[workspace].label;

  useEffect(() => {
    document.title = `${title} · Dayari Inventory`;
  }, [title]);

  return (
    <div className="sticky top-[68px] z-20 border-b border-black/[0.06] bg-white/85 backdrop-blur lg:top-0">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:h-16 lg:px-10">
        <p className="min-w-0 truncate font-sans text-sm tracking-[-0.02em] text-grey-3">
          <span className="hidden lg:inline">
            Shop workspace
            <span className="mx-2 text-black/15">/</span>
          </span>
          <span className="font-semibold text-ink">{title}</span>
        </p>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-2 font-sans text-xs tracking-[-0.02em] text-grey-3 sm:flex">
            <span className="size-1.5 rounded-full bg-usable" aria-hidden />
            Local authority
            <span className="hidden md:inline">· Cloud sync not configured</span>
          </span>
          <div className="hidden text-right lg:block">
            <p className="font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
              {account.name}
            </p>
            <p className="font-sans text-xs tracking-[-0.02em] text-grey-3">
              {roleLabel(account.role)}
            </p>
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-tint font-sans text-sm font-bold text-brand lg:hidden xl:grid">
            {account.name.slice(0, 1).toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
