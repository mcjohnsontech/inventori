'use client';
import { ArrowDown01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import * as RadixSelect from '@radix-ui/react-select';

import { cn } from '../../lib/cn';
import { Icon } from './icon';

export type Option = { value: string; label: string; disabled?: boolean };

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select',
  label,
  id,
  disabled = false,
  required = false,
  className,
  size = 'default',
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  label: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: 'default' | 'compact';
}) {
  return (
    <RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled} required={required}>
      <RadixSelect.Trigger
        id={id}
        aria-label={label}
        className={cn(
          'inline-flex w-full items-center justify-between gap-3 rounded-lg border border-black/13 bg-white font-sans tracking-[-0.02em] text-ink outline-none transition-colors',
          'data-[placeholder]:text-grey-3 hover:border-black/25 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70',
          size === 'compact' ? 'h-9 px-2.5 text-[13px]' : 'h-11 px-3 text-sm',
          className,
        )}
      >
        <span className="truncate text-left">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon>
          <Icon icon={ArrowDown01Icon} size={16} className="text-grey-3" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-pop"
        >
          <RadixSelect.Viewport className="p-1.5">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                data-value={option.value}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 font-sans text-sm tracking-[-0.02em] text-ink outline-none select-none',
                  'data-[highlighted]:bg-surface-muted data-[state=checked]:font-semibold data-[state=checked]:text-brand',
                  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                )}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                  <Icon icon={Tick02Icon} size={16} strokeWidth={2} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
