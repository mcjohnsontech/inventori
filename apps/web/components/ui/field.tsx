'use client';
import { ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '../../lib/cn';
import { Icon } from './icon';

/** Shared control surface, so inputs, selects and date pickers line up exactly. */
export const control =
  'w-full rounded-lg border border-black/13 bg-white px-3 font-sans text-sm tracking-[-0.02em] text-ink outline-none transition-colors placeholder:text-grey-3 focus:border-brand disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70';

export const controlHeight = 'h-11';

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-sans text-[13px] font-semibold tracking-[-0.02em] text-ink"
    >
      {children}
      {hint ? (
        <span className="mt-0.5 block font-normal text-grey-3">{hint}</span>
      ) : null}
    </label>
  );
}

/** Label + control + optional hint, wired together with a generated id. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint ? (
        <p className="font-sans text-xs leading-[1.55] tracking-[-0.02em] text-grey-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, controlHeight, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-24 py-2.5 leading-[1.6]', className)} {...props} />;
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 shrink-0 accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        className,
      )}
      {...props}
    />
  );
}

export function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn(control, controlHeight, 'pr-12', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-grey-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        <Icon icon={visible ? ViewOffIcon : ViewIcon} size={18} />
      </button>
    </div>
  );
}
