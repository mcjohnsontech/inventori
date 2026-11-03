import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700', {
  variants: { variant: { default: 'bg-emerald-900 text-white hover:bg-emerald-800', outline: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100' }, size: { default: 'min-h-10 px-4 py-2', small: 'min-h-8 px-3 py-1.5' } },
  defaultVariants: { variant: 'default', size: 'default' },
});
// shadcn/ui pattern: the component lives in the repository and can be edited locally.
export function Button({ className, variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={twMerge(clsx(buttonVariants({ variant, size }), className))} {...props} />;
}
