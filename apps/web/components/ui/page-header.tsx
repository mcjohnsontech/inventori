import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-l-2 border-brand pl-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div>
        {eyebrow ? (
          <p className="font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1
          tabIndex={-1}
          className="mt-2 font-display text-[34px] leading-[1.02] font-semibold tracking-[-0.03em] text-ink outline-none lg:text-[42px]"
        >
          {title}
        </h1>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-[1.6] tracking-[-0.02em] text-grey-2 sm:text-[15px]">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}
