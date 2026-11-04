import { cn } from '../../lib/cn';
import { card } from './card';

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block animate-pulse rounded-md bg-black/[0.07] motion-reduce:animate-none',
        className,
      )}
    />
  );
}

export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn('block space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3', index === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </span>
  );
}

export function StatSkeleton() {
  return (
    <div className={cn(card, 'px-5 py-5')}>
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="size-9 rounded-xl" />
      </div>
      <Skeleton className="mt-4 h-9 w-16" />
      <Skeleton className="mt-3 h-2.5 w-32" />
    </div>
  );
}

/** Mirrors the shape of a divided list so the page does not jump when rows land. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-black/[0.06]">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-5 py-4">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-2 h-2.5 w-48" />
          </div>
          <Skeleton className="h-2.5 w-16" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={cn(card, 'p-5')}>
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-3 h-4 w-40" />
          <Skeleton className="mt-3 h-2.5 w-full" />
          <Skeleton className="mt-4 h-6 w-24 rounded-full" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function DetailSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index}>
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-2 h-3.5 w-full" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
