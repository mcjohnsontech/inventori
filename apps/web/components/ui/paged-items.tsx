'use client';
import { useState, type ReactNode } from 'react';
import { Pager } from './pager';

/** Small read-only collections share the same bounded, accessible page controls. */
export function PagedItems<T>({ items, size = 12, children }: {
  items: readonly T[];
  size?: number;
  children: (items: readonly T[]) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const count = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, count);
  return <>{children(items.slice((current - 1) * size, current * size))}<Pager page={current} pageCount={count} total={items.length} onChange={setPage} /></>;
}
