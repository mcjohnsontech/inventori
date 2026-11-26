'use client';
import { useMemo, useRef, useState } from 'react';
import { decisionOutcomeLabels, type AuthorizationDecisionOptions, type AuthorizationDecisionView, type DecisionOutcome } from '@dayari/contracts';
import { api, useApiRead } from '../lib/api';
import { formatDateTime, plural } from '../lib/format';
import { Badge, Button, DetailSkeleton, ErrorNotice, Field, Panel, Textarea, WarningNotice, InfoNotice } from './ui';

/**
 * Admin decision on a recovery or correction request (owner decisions, 24 Nov 2026).
 * Approve or reject someone else's request; approval re-checks stock and writes new
 * ledger events. A shortfall correction needs the exact missing item codes ticked.
 */
const actionLabels: Record<DecisionOutcome, string> = { APPROVED: 'Approve', REJECTED: 'Reject', RECEIVE_AS_DELIVERY: 'Receive extras as a new delivery' };

export function decisionBadge(outcome: DecisionOutcome | null | undefined) {
  if (!outcome) return <Badge tone="neutral">Waiting for an Admin</Badge>;
  return <Badge tone={outcome === 'APPROVED' ? 'usable' : 'neutral'}>{decisionOutcomeLabels[outcome]}</Badge>;
}

function DecisionResult({ value }: { value: AuthorizationDecisionView }) {
  return <div className="space-y-3">
    {decisionBadge(value.outcome)}
    <p className="text-sm">{value.admin.name} · {formatDateTime(value.recordedAt)}</p>
    <p className="whitespace-pre-wrap break-words text-sm">{value.note}</p>
    {value.units.length ? <><p className="text-sm font-medium">{value.outcome === 'APPROVED' && value.units[0]!.toState === 'U' ? `${plural(value.units.length, 'item')} put back into usable stock:` : `${plural(value.units.length, 'item')} marked as missing and removed:`}</p>
      <ul className="flex flex-wrap gap-2">{value.units.map(unit => <li key={unit.unitId} className="rounded-md border border-black/10 px-2 py-1 font-mono text-xs">{unit.unitCode}</li>)}</ul></> : <p className="text-sm text-grey-2">Stock did not change.</p>}
  </div>;
}

export function RequestDecision({ requestId, onDecided }: { requestId: string; onDecided: () => void }) {
  const read = useApiRead<AuthorizationDecisionOptions>(`authorization-requests/${requestId}/decision`);
  const [outcome, setOutcome] = useState<DecisionOutcome | null>(null), [note, setNote] = useState(''), [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), key = useRef(crypto.randomUUID());
  const options = read.data;
  // Pre-tick the items the latest count did not find, up to the shortfall.
  const ticked = useMemo(() => picked ?? (options?.candidates.filter(c => c.notInLatestCount).slice(0, options.shortfall).map(c => c.unitId) ?? []), [picked, options]);
  if (read.loading) return <Panel title="Admin decision"><DetailSkeleton rows={2} /></Panel>;
  if (read.error) return <Panel title="Admin decision"><ErrorNotice message={read.error} onRetry={read.refresh} /></Panel>;
  if (!options) return null;
  if (options.decision) return <Panel title="Admin decision"><DecisionResult value={options.decision} /></Panel>;
  if (!options.canDecide) return <Panel title="Admin decision"><div className="space-y-2">{decisionBadge(null)}<p className="text-sm text-grey-2">{options.blockedReason}</p></div></Panel>;

  const picking = outcome === 'APPROVED' && options.kind === 'CORRECTION';
  const ready = outcome && note.trim().length >= 10 && (!picking || ticked.length === options.shortfall);
  const toggle = (id: string) => { setPicked(ticked.includes(id) ? ticked.filter(x => x !== id) : [...ticked, id]); key.current = crypto.randomUUID(); };
  const choose = (value: DecisionOutcome) => { setOutcome(value); setError(''); key.current = crypto.randomUUID(); };
  async function submit() {
    if (!outcome) return;
    setBusy(true); setError('');
    try {
      await api(`authorization-requests/${requestId}/decision`, { method: 'POST', headers: { 'Idempotency-Key': key.current },
        body: JSON.stringify({ outcome, note: note.trim(), unitIds: picking ? ticked : [] }) });
      read.refresh(); onDecided();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The decision could not be saved. Try again.'); }
    finally { setBusy(false); }
  }
  const explain = options.kind === 'RECOVERY'
    ? 'Approving puts these damaged items back into usable stock. Rejecting keeps them damaged.'
    : options.shortfall ? `The shelf had ${plural(options.shortfall, 'item')} fewer than the records. Approving marks the items you tick as missing and removes them from stock.`
    : options.surplus ? `The shelf had ${plural(options.surplus, 'item')} more than the records. Approval can’t create items: receive the extras as a new delivery so they get their own labels, then recount this batch.`
    : 'The count matched the records, so the only choice is to reject this request.';
  return <Panel title="Admin decision"><div className="space-y-4">
    {decisionBadge(null)}
    <p className="text-sm">{explain}</p>
    {options.stale ? <WarningNotice>Stock for these items changed after the request was made. Approval will be refused; reject it or ask for a recount and a new request.</WarningNotice> : null}
    <div className="flex flex-wrap gap-2" role="group" aria-label="Decision">
      {options.outcomes.map(value => <Button key={value} variant={outcome === value ? 'primary' : 'secondary'} aria-pressed={outcome === value} disabled={busy} onClick={() => choose(value)}>{actionLabels[value]}</Button>)}
    </div>
    {picking ? <fieldset className="space-y-2"><legend className="text-sm font-medium">Tick the {plural(options.shortfall, 'missing item')} ({ticked.length} of {options.shortfall} ticked)</legend>
      {options.candidates.some(c => c.notInLatestCount) ? <InfoNotice>Items the latest count didn’t find are ticked for you. Check them before confirming.</InfoNotice> : null}
      <ul className="grid gap-2 sm:grid-cols-2">{options.candidates.map(c => <li key={c.unitId}><label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-black/10 px-3 py-2 text-sm">
        <input type="checkbox" className="size-4" checked={ticked.includes(c.unitId)} disabled={busy || (!ticked.includes(c.unitId) && ticked.length >= options.shortfall)} onChange={() => toggle(c.unitId)} />
        <span className="font-mono font-semibold">{c.unitCode}</span><span className="text-grey-2">{c.notInLatestCount ? 'Not found in latest count' : ''}</span></label></li>)}</ul>
    </fieldset> : null}
    {outcome ? <Field label="Reason for your decision" hint="At least ten characters. This is kept with the request permanently.">{id => <Textarea id={id} value={note} maxLength={2000} disabled={busy} onChange={event => { setNote(event.target.value); key.current = crypto.randomUUID(); }} />}</Field> : null}
    {error ? <ErrorNotice message={error} /> : null}
    {outcome ? <Button disabled={!ready || busy} onClick={() => void submit()}>{busy ? 'Saving…' : `Confirm: ${actionLabels[outcome].toLowerCase()}`}</Button> : null}
  </div></Panel>;
}
