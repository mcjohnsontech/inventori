import type { ReactNode } from 'react';

export function PageHeader({
  title,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div data-page-header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:flex-[1_1_20rem]">
        <h1
          tabIndex={-1}
          className="font-display text-[34px] leading-[1.02] font-semibold tracking-[-0.03em] text-ink outline-none lg:text-[42px]"
        >
          {title}
        </h1>
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}
