import { cn } from '../../lib/cn';
import { card, cardInteractive } from './card';
import { Icon, type IconSpec } from './icon';

export function Stat({
  label,
  value,
  hint,
  icon,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: IconSpec;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="font-sans text-xs font-semibold tracking-[0.08em] text-grey-3 uppercase">
          {label}
        </p>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
          <Icon icon={icon} size={18} />
        </span>
      </div>
      <p className="mt-3 font-display text-[38px] leading-none font-semibold tracking-[-0.03em] text-brand-deep">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 font-sans text-xs tracking-[-0.02em] text-grey-3">{hint}</p>
      ) : null}
    </>
  );

  if (!onClick) {
    return <div className={cn(card, 'px-5 py-5')}>{body}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={cn(card, cardInteractive, 'px-5 py-5')}>
      {body}
    </button>
  );
}
