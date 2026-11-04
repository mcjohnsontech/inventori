import type { ReactNode } from 'react';

import { EmptyState } from './status';
import { ErrorNotice } from './status';
import { ListSkeleton } from './skeleton';
import { SearchInput } from './search-input';

/**
 * Compatibility surface for screens written against the pre-design-system API.
 * Each name maps onto a real primitive, so these screens pick up the tokens and
 * type scale. Port call sites to the primitives directly and this can go.
 */
export { Badge } from './badge';
export { PageHeader } from './page-header';
export { EmptyState };

export function SearchField({
  value,
  onChange,
  label = 'Search',
  placeholder = 'Search by name or code…',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <SearchInput value={value} onChange={onChange} label={label} placeholder={placeholder} />
  );
}

export function ReadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorNotice message={message} onRetry={onRetry} />;
}

export function LoadingState(): ReactNode {
  return <ListSkeleton rows={3} />;
}
