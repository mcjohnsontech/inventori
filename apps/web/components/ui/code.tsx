import { cn } from '../../lib/cn';

/**
 * Supplier SKUs, product codes, lot codes and batch codes. The domain is full of
 * these, so they get one consistent treatment rather than ad-hoc font-mono.
 */
export function Code({
  children,
  tone = 'default',
  className,
}: {
  children: React.ReactNode;
  tone?: 'default' | 'brand' | 'muted';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-mono text-xs tracking-[-0.01em] break-all',
        tone === 'brand' && 'text-brand',
        tone === 'muted' && 'text-grey-3',
        className,
      )}
    >
      {children}
    </span>
  );
}
