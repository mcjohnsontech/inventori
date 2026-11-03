import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/** The page container. Every workspace opens with this. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10', className)}>
      {children}
    </div>
  );
}

/** Vertical rhythm between a page's sections — one spacing value, used everywhere. */
export function Stack({
  children,
  className,
  gap = 'default',
}: {
  children: ReactNode;
  className?: string;
  gap?: 'default' | 'tight';
}) {
  return (
    <div className={cn(gap === 'tight' ? 'space-y-4' : 'space-y-6', className)}>{children}</div>
  );
}

/** Filters and search above a table or grid. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-black/[0.06] px-5 py-4 sm:flex-row sm:flex-wrap sm:items-end',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Responsive card grid. Incomplete rows leave no gaps or stray background. */
export function CardGrid({
  children,
  className,
  columns = 3,
}: {
  children: ReactNode;
  className?: string;
  columns?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        'grid gap-4 p-5',
        columns === 3 ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A back link above a detail view. */
export function Breadcrumb({ children }: { children: ReactNode }) {
  return <div className="mb-5">{children}</div>;
}
