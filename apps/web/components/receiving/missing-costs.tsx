'use client';
import { useRef, useState } from 'react';
import { purchaseCostEntrySchema, type MissingCostLine, type MissingCostsPage } from '@dayari/contracts';
import { api, useApiRead } from '../../lib/api';
import { formatDate, plural } from '../../lib/format';
import { MoneyOnly } from '../../lib/role';
import { money } from '../financial';
import { Button, ErrorNotice, Field, Input, Pager, Panel, SuccessNotice, Textarea } from '../ui';

/**
 * Owner decision 26 Nov 2026: Managers receive without costs; an Admin adds the cost per
 * delivery line afterwards, prefilled with that option's last cost. Saved costs can't be edited.
 */
export function MissingCosts({ onSaved }: { onSaved?: () => void }) {
  return <MoneyOnly><MissingCostsPanel onSaved={onSaved} /></MoneyOnly>;
}

function MissingCostsPanel({ onSaved }: { onSaved?: () => void }) {
  const [page, setPage] = useState(1), [open, setOpen] = useState(''), [notice, setNotice] = useState('');
  const read = useApiRead<MissingCostsPage>(`financial/missing-costs?page=${page}`, { refreshOnFocus: true });
  if (!read.data?.total && !read.error && !notice) return null;
  const data = read.data;
  return (
    <div className="mb-6">
      <Panel label="Missing purchase costs" title={data ? `Needing a cost (${data.total})` : 'Needing a cost'}>
        <div className="space-y-4">
          <p className="text-sm text-grey-2">These deliveries were received without a cost price. Add what was paid per item. Once saved, a cost can’t be changed.</p>
          {notice ? <SuccessNotice message={notice} /> : null}
          {read.error ? <ErrorNotice message={read.error} onRetry={read.refresh} /> : null}
          {data?.rows.length ? (
            <ul aria-label="Deliveries needing a cost" className="divide-y divide-black/[0.06] rounded-xl border border-black/10">
              {data.rows.map((row) => (
                <li key={row.receiptLineId} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{row.productName} · {row.variantName}</p>
                      <p className="text-sm text-grey-2 break-words">{plural(Number(row.receivedQuantity), 'item')} from {row.supplierName} · delivered {formatDate(row.deliveredOn)} · {row.batchCode}</p>
                    </div>
                    {open !== row.receiptLineId ? <Button variant="secondary" size="compact" aria-label={`Add cost for ${row.productName} ${row.variantName} ${row.batchCode}`} onClick={() => { setOpen(row.receiptLineId); setNotice(''); }}>Add cost</Button> : null}
                  </div>
                  {open === row.receiptLineId ? (
                    <CostForm row={row} onCancel={() => setOpen('')} onSaved={(amount) => { setOpen(''); setNotice(`Cost saved: ${money(amount)} per item for ${row.productName} · ${row.variantName}.`); read.refresh(); onSaved?.(); }} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {data ? <Pager page={page} pageCount={Math.ceil(data.total / data.pageSize)} total={data.total} onChange={setPage} /> : null}
        </div>
      </Panel>
    </div>
  );
}

function CostForm({ row, onSaved, onCancel }: { row: MissingCostLine; onSaved: (amount: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(row.lastCost ?? ''), [zeroReason, setZeroReason] = useState(''), [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), lock = useRef(false);
  const body = () => ({ receiptLineId: row.receiptLineId, amount: amount.trim(), currency: 'NGN' as const, zeroReason: zeroReason.trim() });
  const zero = /^0(\.0{1,2})?$/.test(amount.trim());
  async function save() {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const data = purchaseCostEntrySchema.parse(body()), fingerprint = JSON.stringify(data), storageKey = `dayari_cost_${row.receiptLineId}`;
      const prior = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'), key = prior?.fingerprint === fingerprint ? prior.key : crypto.randomUUID();
      sessionStorage.setItem(storageKey, JSON.stringify({ key, fingerprint }));
      await api('financial/purchase-costs', { method: 'POST', headers: { 'Idempotency-Key': key }, body: fingerprint });
      sessionStorage.removeItem(storageKey); onSaved(data.amount);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The cost could not be saved. Try again.'); }
    finally { setBusy(false); lock.current = false; }
  }
  if (review) return (
    <div className="space-y-3 rounded-lg bg-surface-muted p-4">
      {error ? <ErrorNotice message={error} /> : null}
      <p>Save <strong>{money(amount.trim())}</strong> per item for {plural(Number(row.receivedQuantity), 'item')} of {row.productName} · {row.variantName}?</p>
      {zero ? <p className="text-sm break-words">Reason: {zeroReason}</p> : null}
      <p className="text-xs text-grey-2">This cost can’t be changed later.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Confirm cost'}</Button><Button variant="secondary" disabled={busy} onClick={() => setReview(false)}>Back</Button></div>
    </div>
  );
  return (
    <form className="space-y-3 rounded-lg bg-surface-muted p-4" onSubmit={(event) => { event.preventDefault(); const result = purchaseCostEntrySchema.safeParse(body()); if (result.success) { setError(''); setReview(true); } else setError(result.error.issues.map((issue) => issue.message).join('. ')); }}>
      {error ? <ErrorNotice message={error} /> : null}
      <Field label="Cost per item (NGN)" hint={row.lastCost ? `Filled in with the last cost for this option (${money(row.lastCost)}). Change it if the price was different.` : 'What was paid for each item, including any that arrived damaged.'}>{(id) => <Input id={id} required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />}</Field>
      {zero ? <Field label="Why was it free?" hint="At least 10 characters, for example a supplier gift.">{(id) => <Textarea id={id} required minLength={10} maxLength={2000} value={zeroReason} onChange={(event) => setZeroReason(event.target.value)} />}</Field> : null}
      <div className="flex flex-wrap gap-2"><Button type="submit">Review cost</Button><Button variant="secondary" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
