import { cn } from '../../lib/cn';

/** Usable / damaged / delivered, always in that order and always separated. */
export function Totals({
  usable,
  damaged,
  delivered,
  neutral = false,
}: {
  usable: string;
  damaged: string;
  delivered: string;
  neutral?: boolean;
}) {
  const cells = [
    { label: 'Usable', value: usable, tone: 'usable' as const },
    { label: 'Damaged', value: damaged, tone: 'damaged' as const },
    { label: 'Delivered', value: delivered, tone: 'neutral' as const },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className={cn(
            'rounded-xl border px-3 py-3 sm:px-4 sm:py-4',
            neutral ? 'border-black/[0.07] bg-white' : cell.tone === 'damaged'
              ? 'border-damaged/20 bg-damaged-tint'
              : cell.tone === 'usable'
                ? 'border-usable/20 bg-usable-tint'
                : 'border-black/[0.07] bg-white',
          )}
        >
          <p
            className={cn(
              'font-sans text-xs font-semibold tracking-[0.06em] uppercase',
              neutral ? 'text-grey-2' : cell.tone === 'damaged'
                ? 'text-damaged'
                : cell.tone === 'usable'
                  ? 'text-usable'
                  : 'text-grey-3',
            )}
          >
            {cell.label}
          </p>
          <p
            className={cn(
              'mt-2 font-display text-xl font-semibold tracking-[-0.03em] break-all sm:text-2xl',
              neutral ? 'text-ink' : cell.tone === 'damaged'
                ? 'text-damaged'
                : cell.tone === 'usable'
                  ? 'text-usable'
                  : 'text-ink',
            )}
          >
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  );
}
