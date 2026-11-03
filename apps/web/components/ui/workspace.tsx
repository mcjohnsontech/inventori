import type { ReactNode } from 'react';
import { Search, PackageOpen } from 'lucide-react';
import { Button } from './button';
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="page-description">{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
export function SearchField({ value, onChange, label = 'Search', placeholder = 'Search by name or code…' }: { value: string; onChange: (value: string) => void; label?: string; placeholder?: string }) {
  return <label className="search-field"><span className="sr-only">{label}</span><Search size={16} aria-hidden="true" /><input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>;
}
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><PackageOpen size={29} className="text-emerald-800" aria-hidden="true" /><h2>{title}</h2><p>{children}</p>{action}</div>;
}
export function ReadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="error-state"><p>{message}</p><Button variant="outline" size="small" onClick={onRetry}>Try again</Button></div>;
}
export function LoadingState() { return <div role="status" aria-label="Loading workspace" className="space-y-4 py-6">{[1, 2, 3].map(n => <div key={n} className="h-20 animate-pulse rounded-xl bg-stone-200/60" />)}<span className="sr-only">Loading…</span></div>; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'usable' | 'damaged' }) { return <span className={`data-badge badge-${tone}`}>{children}</span>; }
