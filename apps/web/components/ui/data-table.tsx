import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { Skeleton } from './skeleton';

export type Column<T> = {
  key: string;
  label: string;
  cell: (row: T) => ReactNode;
  wide?: boolean;
  align?: 'left' | 'right';
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  loading = false,
  skeletonRows = 5,
  bare = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
  loading?: boolean;
  skeletonRows?: number;
  /** Drop the outer card when already inside a flush Panel. */
  bare?: boolean;
}) {
  return (
    <div
      tabIndex={0}
      className={cn(
        'overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
        !bare && 'rounded-2xl border border-black/[0.07] bg-white',
      )}
    >
      <table className="w-full min-w-[540px] border-collapse text-left font-sans text-sm tracking-[-0.02em] text-ink">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'border-y border-black/[0.06] bg-surface-muted px-4 py-3 font-sans text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-grey-2 uppercase',
                  column.align === 'right' && 'text-right',
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            Array.from({ length: skeletonRows }).map((_, row) => (
              <tr key={row}>
                {columns.map((column) => (
                  <td key={column.key} className="border-b border-black/[0.06] px-4 py-4">
                    <Skeleton className={cn('h-3', column.wide ? 'w-56' : 'w-24')} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-14 text-center font-sans text-sm tracking-[-0.02em] text-grey-2"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="group hover:bg-surface-muted/60">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'border-b border-black/[0.06] px-4 py-3.5 align-top',
                      column.wide ? 'min-w-[280px]' : 'whitespace-nowrap',
                      column.align === 'right' && 'text-right',
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
