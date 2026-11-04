import { AlertCircleIcon, CheckmarkCircle02Icon, PackageOpenIcon } from '@hugeicons/core-free-icons';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { Button } from './button';
import { Icon, type IconSpec } from './icon';

export function EmptyState({
  title,
  children,
  action,
  icon = PackageOpenIcon,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: IconSpec;
}) {
  return (
    <div className="grid justify-items-center gap-3 px-5 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-tint text-brand">
        <Icon icon={icon} size={24} />
      </span>
      <h2 className="font-sans text-base font-semibold tracking-[-0.03em] text-ink">{title}</h2>
      <p className="max-w-md font-sans text-sm leading-[1.65] tracking-[-0.02em] text-grey-2">
        {children}
      </p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorNotice({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger-tint px-4 py-3.5',
        className,
      )}
    >
      <p className="flex min-w-0 items-start gap-2.5 font-sans text-sm leading-[1.55] tracking-[-0.02em] text-danger">
        <Icon icon={AlertCircleIcon} size={18} className="mt-px text-danger" />
        <span className="min-w-0 break-words">{message}</span>
      </p>
      {onRetry ? (
        <Button variant="secondary" size="compact" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function SuccessNotice({ message, className }: { message: string; className?: string }) {
  return (
    <p
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-usable/20 bg-usable-tint px-4 py-3.5 font-sans text-sm leading-[1.55] tracking-[-0.02em] text-usable',
        className,
      )}
    >
      <Icon icon={CheckmarkCircle02Icon} size={18} className="mt-px" />
      <span className="min-w-0 break-words">{message}</span>
    </p>
  );
}

export function WarningNotice({
  children,
  className,
  role,
}: {
  children: ReactNode;
  className?: string;
  /** Announce it when it reports the outcome of something the user just did. */
  role?: 'status' | 'alert';
}) {
  return (
    <p
      role={role}
      className={cn(
        'rounded-xl border border-damaged/20 bg-damaged-tint px-4 py-3.5 font-sans text-sm leading-[1.6] tracking-[-0.02em] text-damaged',
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Small print under a panel — the invariants this app keeps repeating. */
export function Footnote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'font-sans text-xs leading-[1.7] tracking-[-0.02em] text-grey-3',
        className,
      )}
    >
      {children}
    </p>
  );
}
