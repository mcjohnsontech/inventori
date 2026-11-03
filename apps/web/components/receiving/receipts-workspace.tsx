'use client';
import { useEffect, useState } from 'react';
import type { AcceptedReceipt } from '@dayari/contracts';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useApiRead } from '../../lib/api';
import type { ReceiptSummary } from '../dashboard';
import { Button } from '../ui/button';
import { Badge, EmptyState, LoadingState, PageHeader, ReadError, SearchField } from '../ui/workspace';
import { ReceiptDetails } from './receiving-workspace';
export function ReceiptsWorkspace({ initialReceiptId = '', onStock, onSelect }: { initialReceiptId?: string; onStock: (id: string) => void; onSelect: (id: string) => void }) {
  const [id, setId] = useState(initialReceiptId);
  useEffect(() => { setId(initialReceiptId); }, [initialReceiptId]);
  function select(id: string) { setId(id); onSelect(id); }
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(0);
  const history = useApiRead<ReceiptSummary[]>('receipts');
  const receipt = useApiRead<AcceptedReceipt>(id ? `receipts/${id}` : null);
  const rows = (history.data ?? []).filter(row => `${row.publicCode} ${row.supplierName} ${row.sourceName}`.toLowerCase().includes(search.toLowerCase()) && (!date || row.deliveredOn === date));
  return <div className="page"><PageHeader eyebrow="Accepted operational evidence" title="Receipts & activity" description="Immutable delivery records, ordered by acceptance. Delivery dates remain separate from the time stock was recorded." actions={<Button variant="outline" onClick={() => { history.refresh(); if (id) receipt.refresh(); }}><RefreshCw size={15} />Refresh receipts</Button>} />
    {id ? <><Button variant="outline" size="small" onClick={() => select('')}><ArrowLeft size={15} />Back to receipt history</Button>{receipt.loading ? <LoadingState /> : receipt.error ? <ReadError message={receipt.error} onRetry={receipt.refresh} /> : receipt.data && <ReceiptDetails key={receipt.data.id} receipt={receipt.data} onStock={onStock} />}</> : <section className="surface"><div className="surface-heading"><SearchField label="Search receipts" value={search} onChange={value => { setSearch(value); setPage(0); }} placeholder="Batch, supplier or source…" /><label>Delivery date filter<input type="date" value={date} onChange={event => { setDate(event.target.value); setPage(0); }} /></label>{(search || date) && <Button variant="outline" size="small" onClick={() => { setSearch(''); setDate(''); setPage(0); }}>Clear filters</Button>}</div>
      <p className="px-5 pt-4 text-xs text-stone-500">Latest 100 accepted deliveries. Filters apply to this recent-history window.</p>{history.loading ? <div className="px-5"><LoadingState /></div> : history.error ? <div className="px-5"><ReadError message={history.error} onRetry={history.refresh} /></div> : !rows.length ? <EmptyState title="No receipts in this view">Accepted deliveries will appear here. Try clearing filters if you expected a recent receipt.</EmptyState> : <div className="divide-y divide-stone-100">{rows.slice(page * 12, (page + 1) * 12).map(row => <button className="receipt-row" key={row.id} onClick={() => select(row.id)}><span><strong className="block font-mono text-sm text-emerald-900">{row.publicCode}</strong><span className="mt-1 block text-xs text-stone-500">{row.supplierName} · {row.sourceName}</span></span><span className="text-xs leading-6 text-stone-500">Delivered {row.deliveredOn}<br />Accepted {new Date(row.acceptedAt).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} Lagos</span><Badge tone="usable">Accepted</Badge><span className="text-link">View receipt →</span></button>)}</div>}{rows.length > 12 && <div className="pagination"><span>{page * 12 + 1}–{Math.min((page + 1) * 12, rows.length)} of {rows.length}</span><Button size="small" variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button><Button size="small" variant="outline" disabled={(page + 1) * 12 >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div>}</section>}
    <p className="mt-5 text-xs leading-6 text-stone-500">Receipt and lot movement summaries are operational evidence. Security logs and unrestricted audit snapshots are not exposed here.</p></div>;
}
