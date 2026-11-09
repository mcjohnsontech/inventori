import { Fragment, type ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { Skeleton } from './skeleton';

export type Column<T> = {
  key: string;
  label: string;
  cell: (row: T) => ReactNode;
  wide?: boolean;
  /** Give long item descriptions the full mobile row while retaining labels for quantities. */
  mobileFullWidth?: boolean;
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
  label,
  mobileStack = false,
  subRow,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
  loading?: boolean;
  skeletonRows?: number;
  /** Drop the outer card when already inside a flush Panel. */
  bare?: boolean;
  /** Names the table for assistive tech when the page has more than one. */
  label?: string;
  /** Keep every field and action visible in narrow inventory rows. */
  mobileStack?: boolean;
  /** Render an expansion row directly beneath the row it belongs to. */
  subRow?: (row: T) => ReactNode | null;
}) {
  return (
    <div
      tabIndex={0}
      className={cn(
        'overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
        !bare && 'rounded-2xl border border-black/[0.07] bg-white',
      )}
    >
      <table
        role="table"
        aria-label={label}
        className={cn(
          'w-full min-w-[540px] border-collapse text-left font-sans text-sm tracking-[-0.02em] text-ink',
          mobileStack && 'max-sm:block max-sm:min-w-0',
        )}
      >
        <thead role="rowgroup" className={mobileStack ? 'max-sm:sr-only' : undefined}>
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
        <tbody role="rowgroup" className={mobileStack ? 'max-sm:block' : undefined}>
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
            rows.map((row) => {
              const expansion = subRow?.(row);

              return (
                <Fragment key={rowKey(row)}>
                  <tr
                    role="row"
                    className={cn(
                      'group hover:bg-surface-muted/60',
                      mobileStack &&
                        'max-sm:block max-sm:border-b max-sm:border-black/[0.06] max-sm:py-3',
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        role="cell"
                        data-label={column.label}
                        className={cn(
                          'border-b border-black/[0.06] px-4 py-3.5 align-top',
                          column.wide ? 'min-w-[280px]' : 'whitespace-nowrap',
                          column.align === 'right' && 'text-right',
                          mobileStack &&
                            'max-sm:flex max-sm:min-w-0 max-sm:items-start max-sm:justify-between max-sm:gap-3 max-sm:border-0 max-sm:px-5 max-sm:py-2 max-sm:whitespace-normal max-sm:before:w-20 max-sm:before:shrink-0 max-sm:before:text-left max-sm:before:text-xs max-sm:before:text-grey-2 max-sm:before:content-[attr(data-label)]',
                          mobileStack && column.mobileFullWidth && 'max-sm:block max-sm:before:hidden',
                        )}
                      >
                        {mobileStack ? (
                          <div className={cn('min-w-0 max-sm:flex-1 max-sm:text-right max-sm:break-words', column.mobileFullWidth && 'max-sm:text-left')}>
                            {column.cell(row)}
                          </div>
                        ) : (
                          column.cell(row)
                        )}
                      </td>
                    ))}
                  </tr>
                  {expansion ? (
                    <tr role="row" className="bg-surface-muted/60">
                      <td
                        role="cell"
                        colSpan={columns.length}
                        className="border-b border-black/[0.06] p-0 align-top"
                      >
                        {expansion}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
