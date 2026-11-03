import { HugeiconsIcon } from '@hugeicons/react';

import { cn } from '../../lib/cn';

export type IconSpec = Parameters<typeof HugeiconsIcon>[0]['icon'];

/** Every icon in the app renders through here, so stroke weight never drifts. */
export function Icon({
  icon,
  size = 18,
  className,
  strokeWidth = 1.75,
}: {
  icon: IconSpec;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden
      className={cn('shrink-0', className)}
    />
  );
}
