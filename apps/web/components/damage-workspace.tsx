'use client';
import { useEffect, useRef, useState } from 'react';
import { damageReportSchema, damageReviewSchema, type DamageCandidate, type DamageView, type UnitIdentityLookup } from '@dayari/contracts';
import { api, useApiRead } from '../lib/api';
import { useDamageDraft } from '../lib/damage-draft';
import { useQrPresentation } from '../lib/qr-presentation';
import { formatDateTime } from '../lib/format';
import { Badge, Button, Code, DataTable, DetailSkeleton, EmptyState, ErrorNotice, Field, Input, Page, PageHeader, Panel, Select, Textarea, WarningNotice } from './ui';
import { Pager } from './ui/pager';
import { DetailsDrawer } from './ui/details-drawer';
import { UnitTrackingDrawer } from './unit-tracking-drawer';
import { UnitCameraInput } from './unit-camera-input';

type Config = { originId: string; limit: number; canReport: boolean; canReview: boolean; ownIssuedOnly: boolean; canViewReviews: boolean };
const outcomes = [{ value: 'HELD', label: 'Held — remains damaged' }, { value: 'REWORKED', label: 'Reworked — remains damaged' },
  { value: 'DISCARDED', label: 'Discarded — remove from stock' }, { value: 'RETURNED_TO_VENDOR', label: 'Returned to vendor — remove from stock' }];
const stateNames: Record<string, string> = { U: 'Usable', P: 'In Production', D: 'Damaged', X: 'Removed' };
type History = { page: number; pageSize: number; total: number; rows: { id: string; recordedAt: string; actorName: string; unitCount: number; cause?: string; outcome?: string }[] };
function Recorded({ value, onTrack }: { value: DamageView; onTrack: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null), [page, setPage] = useState(1);
  useEffect(() => { root.current?.scrollIntoView({ block: 'start' }); const h = root.current?.querySelector('h2'); h?.setAttribute('tabindex', '-1'); h?.focus({ preventScroll: true }); }, []);
  return <div ref={root} className="scroll-mt-36 lg:scroll-mt-24"><Panel title={value.kind === 'BAD' ? 'BAD report recorded' : 'Damage review recorded'}><div className="space-y-4">
    <p className="break-all text-xs text-grey-2">Record {value.id}</p><p>{value.actor.name} · {formatDateTime(value.recordedAt)}</p>
    <p className="font-semibold">{value.kind === 'BAD' ? value.cause : outcomes.find(outcome => outcome.value === value.outcome)?.label}</p><p className="break-words text-sm">{value.description}</p>
    <p className="text-sm">{value.transactionId ? value.kind === 'BAD' ? 'At acceptance, selected items moved to Damaged. Items already issued were not deducted from usable stock again.' : 'At acceptance, selected damaged items moved to Removed. This workflow cannot restore them.' : 'This review left items in Damaged without changing stock quantities. Open unit history for current status.'}</p>
    <DataTable label="Recorded damage units" mobileStack rows={value.lines.slice((page - 1) * 12, page * 12)} rowKey={line => line.id} emptyMessage="No units." columns={[
      { key: 'unit', label: 'Unit / product', cell: line => <><button className="min-h-11 font-mono font-semibold text-brand underline" onClick={() => onTrack(line.unit.unitId)}>{line.unit.unitCode}</button><span className="block text-sm">{line.unit.productName} · {line.unit.variantName}</span><Code className="block text-xs">{line.unit.fullSku}</Code></> },
      { key: 'lot', label: 'Lot / batch', cell: line => <><Code>{line.unit.lotCode ?? 'Historical lot'}</Code><span className="block text-xs">{line.unit.publicBatchCode}</span></> },
      { key: 'source', label: 'Original reference', cell: line => <><span>{line.checkoutId ? 'Issued unit' : 'Intake stock'}</span><span className="block break-words text-xs">{line.orderReference ?? 'No Order ID'}</span></> },
      { key: 'state', label: 'Recorded outcome', cell: line => <span className="text-sm">{line.movementId ? `${stateNames[line.fromState] ?? line.fromState} → ${stateNames[line.toState] ?? line.toState}` : 'Stayed Damaged — no stock movement'}</span> },
    ]} /><Pager page={page} pageCount={Math.ceil(value.lines.length / 12)} total={value.lines.length} onChange={setPage} />
  </div></Panel></div>;
}
function DamageDetail({ id, review, onClose, onTrack }: { id: string; review: boolean; onClose: () => void; onTrack: (id: string) => void }) {
  const result = useApiRead<DamageView>(`${review ? 'damage-reviews' : 'damage-reports'}/${id}`);
  return <DetailsDrawer title={review ? 'Damage review' : 'BAD report'} onClose={onClose}>{result.loading ? <DetailSkeleton rows={4} /> : result.error ? <ErrorNotice message={result.error} onRetry={result.refresh} /> : result.data ? <Recorded value={result.data} onTrack={onTrack} /> : null}</DetailsDrawer>;
}
function Workflow({ actorId, config, review }: { actorId: string; config: Config; review: boolean }) {
  const { saved, ready, busy, update, send, route } = useDamageDraft(actorId, config.originId, review, config.ownIssuedOnly);
  const presentation = useQrPresentation();
  const [input, setInput] = useState(''), [error, setError] = useState(''), [adding, setAdding] = useState(false), [camera, setCamera] = useState(false), [announcement, setAnnouncement] = useState('');
  const [confirming, setConfirming] = useState(false), [page, setPage] = useState(1), [historyPage, setHistoryPage] = useState(1), [tracking, setTracking] = useState(''), [detail, setDetail] = useState('');
  const [units, setUnits] = useState<DamageCandidate[]>([]), [previewError, setPreviewError] = useState(''), [previewBusy, setPreviewBusy] = useState(false), [revision, setRevision] = useState(0);
  const mounted = useRef(true), latch = useRef(false), form = useRef<HTMLFormElement>(null), request = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => { if (saved.pending) setConfirming(true); }, [saved.pending]);
  const ids = JSON.stringify(saved.body.unitIds), accepted = useApiRead<DamageView>(saved.acceptedId ? `${route}/${saved.acceptedId}` : null);
  const history = useApiRead<History>(`${route}?page=${historyPage}`), canWrite = review ? config.canReview : config.canReport;
  useEffect(() => {
    const controller = new AbortController(); setUnits([]); setPreviewError(''); setPreviewBusy(ready && saved.body.unitIds.length > 0);
    if (ready && saved.body.unitIds.length) api<{ units: DamageCandidate[] }>(`${route}/preview`, { method: 'POST', body: JSON.stringify({ unitIds: saved.body.unitIds }), signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setUnits(value.units); }).catch(failure => { if (!controller.signal.aborted) setPreviewError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setPreviewBusy(false); });
    return () => controller.abort();
  }, [ids, ready, revision, route]);
  const disabled = busy || adding || Boolean(saved.pending), showingSaved = Boolean(saved.acceptedId) && !saved.body.unitIds.length && !saved.pending;
  function change(body: typeof saved.body) { try { update(body); setError(''); } catch (failure) { setError((failure as Error).message); } }
  async function add(value = input, method: 'CAMERA' | 'QR_INPUT' = 'QR_INPUT') {
    if (disabled || latch.current || !value.trim()) return; latch.current = true; setAdding(true); setError(''); const abort = new AbortController(); request.current = abort;
    try {
      const code = value.trim(), identity = await api<UnitIdentityLookup>(code.startsWith('DYI:') ? 'qr/resolve' : `inventory/units/by-code/${encodeURIComponent(code.toUpperCase())}`,
        code.startsWith('DYI:') ? { method: 'POST', body: JSON.stringify({ payload: code }), signal: abort.signal } : { signal: abort.signal });
      if (identity.payloadVersion !== 2 || !identity.unitId) throw Error('Use an individual-unit QR or six-character Unit Code. A shared lot label cannot identify this item.');
      if (code.startsWith('DYI:2:')) presentation.record({ payload: code, method });
      if (saved.body.unitIds.includes(identity.unitId)) throw Error(`${identity.unitCode} is already selected.`);
      if (saved.body.unitIds.length >= config.limit) throw Error(`Confirm at most ${config.limit} exact units per command.`);
      const result = await api<{ units: DamageCandidate[] }>(`${route}/preview`, { method: 'POST', body: JSON.stringify({ unitIds: [identity.unitId] }), signal: abort.signal });
      if (!result.units[0]?.eligible) throw Error(review ? 'Only currently damaged units can be reviewed.' : 'This unit is not eligible for BAD reporting.');
      if (mounted.current) { change({ ...saved.body, unitIds: [...saved.body.unitIds, identity.unitId] }); setInput(''); setAnnouncement(`Added ${identity.unitCode}.`); setPage(Math.ceil((saved.body.unitIds.length + 1) / 12)); }
    } catch (failure) { if (mounted.current && !abort.signal.aborted) setError((failure as Error).message); }
    finally { latch.current = false; if (mounted.current) { setAdding(false); requestAnimationFrame(() => form.current?.querySelector('input')?.focus()); } }
  }
  async function confirm() {
    setError(''); try { await send(); if (mounted.current) { setConfirming(false); history.refresh(); setRevision(value => value + 1); } }
    catch (failure) { if (mounted.current) { setError((failure as Error).message); setRevision(value => value + 1); } }
  }
  const valid = review ? damageReviewSchema.safeParse({ unitIds: saved.body.unitIds, outcome: saved.body.outcome, note: saved.body.note })
    : damageReportSchema.safeParse({ unitIds: saved.body.unitIds, cause: saved.body.cause, description: saved.body.description });
  const canConfirm = valid.success && !previewBusy && !previewError && units.length === saved.body.unitIds.length && units.every(unit => unit.eligible);
  return <div className="space-y-5">
    {showingSaved ? accepted.loading ? <DetailSkeleton rows={4} /> : accepted.error ? <ErrorNotice message={accepted.error} onRetry={accepted.refresh} /> : accepted.data ? <><Recorded value={accepted.data} onTrack={setTracking} />{canWrite ? <Button variant="secondary" onClick={() => change({ ...saved.body, unitIds: [] })}>Start another {review ? 'review' : 'BAD report'}</Button> : null}</> : null : null}
    {canWrite && !showingSaved && ready ? <Panel title={confirming ? review ? 'Review disposition' : 'Review BAD report' : review ? 'Review damaged items' : 'Report an item as BAD'}><div className="space-y-4">
      {error ? <ErrorNotice message={error} /> : null}{presentation.state === 'error' ? <ErrorNotice message={`Identification is available, but QR presentation evidence was not confirmed: ${presentation.error}`} onRetry={presentation.retry} /> : null}{saved.pending && !busy ? <WarningNotice>The response is unresolved. Retry this saved request with the same key.<Button disabled={busy} className="mt-2" onClick={() => void confirm()}>Retry saved damage command</Button></WarningNotice> : null}
      {!confirming ? <>
        <form ref={form} onSubmit={event => { event.preventDefault(); void add(); }} className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><Field label="Scan individual QR or enter Unit Code">{id => <Input id={id} value={input} disabled={disabled} maxLength={200} placeholder="DYI:2 or six characters" onChange={event => setInput(event.target.value)} />}</Field></div><Button type="submit" disabled={disabled || !input.trim()}>{adding ? 'Checking…' : 'Add item'}</Button><Button variant="secondary" disabled={disabled} onClick={() => setCamera(value => !value)}>Use camera</Button></form>
        <p role="status" aria-live="polite" className="text-sm">{announcement}</p>{camera ? <UnitCameraInput onClose={() => setCamera(false)} onRead={payload => { setCamera(false); void add(payload, 'CAMERA'); }} /> : null}
        {config.ownIssuedOnly ? <p className="text-sm text-grey-2">You may report only items from your own checkout. Reporting transfers In Production stock to Damaged; it does not deduct usable stock again.</p> : null}
        {review ? <div className="grid gap-4 md:grid-cols-2"><Field label="Disposition">{id => <Select id={id} label="Disposition" disabled={disabled} value={saved.body.outcome} options={outcomes} onChange={outcome => change({ ...saved.body, outcome: outcome as typeof saved.body.outcome })} />}</Field><Field label="Review evidence">{id => <Textarea id={id} value={saved.body.note} maxLength={2000} disabled={disabled} onChange={event => change({ ...saved.body, note: event.target.value })} />}</Field></div>
          : <div className="grid gap-4 md:grid-cols-2"><Field label="Damage cause">{id => <Input id={id} value={saved.body.cause} maxLength={2000} disabled={disabled} onChange={event => change({ ...saved.body, cause: event.target.value })} />}</Field><Field label="What happened" hint="At least ten meaningful characters.">{id => <Textarea id={id} value={saved.body.description} maxLength={2000} disabled={disabled} onChange={event => change({ ...saved.body, description: event.target.value })} />}</Field></div>}
      </> : <div className="space-y-2"><p className="font-semibold">{review ? outcomes.find(outcome => outcome.value === saved.body.outcome)?.label : saved.body.cause}</p><p className="break-words text-sm">{review ? saved.body.note : saved.body.description}</p></div>}
      {previewBusy ? <DetailSkeleton rows={3} /> : previewError ? <div className="space-y-3"><ErrorNotice message={previewError} onRetry={() => setRevision(value => value + 1)} />{!confirming && !saved.pending ? <><p className="text-sm">Remove an unavailable selection or retry verification. Other draft evidence is preserved.</p>{saved.body.unitIds.slice((page - 1) * 12, page * 12).map((id, index) => <div key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3"><Code className="break-all text-xs">{id}</Code><Button variant="secondary" disabled={disabled} onClick={() => { change({ ...saved.body, unitIds: saved.body.unitIds.filter(value => value !== id) }); setPage(1); }}>Remove selection {(page - 1) * 12 + index + 1}</Button></div>)}<Pager page={page} pageCount={Math.ceil(saved.body.unitIds.length / 12)} total={saved.body.unitIds.length} onChange={setPage} /></> : null}</div> : units.length ? <><DataTable label="Selected damage units" rows={units.slice((page - 1) * 12, page * 12)} rowKey={row => row.unit.unitId} mobileStack emptyMessage="No units." columns={[
        { key: 'unit', label: 'Exact unit', cell: row => <><Code>{row.unit.unitCode}</Code><span className="block text-sm">{row.unit.productName} · {row.unit.variantName}</span><Code className="block text-xs">{row.unit.fullSku}</Code></> },
        { key: 'source', label: 'Provenance', cell: row => <><span className="block text-sm">{row.checkoutId ? row.holder?.name ?? 'Original checkout retained' : 'Accepted intake stock'}</span><span className="block break-words text-xs">{row.orderReference ?? 'No Order ID'}</span><span className="text-xs">{row.unit.publicBatchCode}</span></> },
        { key: 'state', label: 'Current state', cell: row => <Badge tone="neutral">{row.eligible ? row.state === 'P' ? 'In Production' : row.state === 'D' ? 'Damaged' : 'Usable' : 'No longer eligible'}</Badge> },
        ...(!confirming ? [{ key: 'remove', label: 'Selection', cell: (row: DamageCandidate) => <Button variant="ghost" disabled={disabled} onClick={() => { change({ ...saved.body, unitIds: saved.body.unitIds.filter(id => id !== row.unit.unitId) }); setPage(1); }}>Remove {row.unit.unitCode}</Button> }] : []),
      ]} /><Pager page={page} pageCount={Math.ceil(units.length / 12)} total={units.length} onChange={setPage} /></> : <EmptyState title="No items selected">Scan or enter an exact Unit Code.</EmptyState>}
      {review ? <p className="text-sm text-grey-2">Held and Reworked remain damaged. Discarded and Returned to vendor remove the selected items. Recovery requires future cloud authorization and is not available here.</p> : <p className="text-sm text-grey-2">Confirmation records damage for every selected item atomically. Original receiving and checkout evidence remains unchanged.</p>}
      <div className="flex flex-wrap justify-between gap-3"><Button variant="secondary" disabled={disabled} onClick={() => { if (confirming) setConfirming(false); else if (window.confirm('Discard this damage draft? Saved inventory history will remain unchanged.')) change({ unitIds: [], cause: '', description: '', outcome: 'HELD', note: '' }); }}>{confirming ? 'Back to items' : 'Discard draft'}</Button><Button disabled={disabled || !canConfirm} onClick={() => { if (confirming) void confirm(); else { setConfirming(true); setPage(1); } }}>{busy ? 'Recording…' : confirming ? `Confirm ${review ? 'review' : 'BAD report'} for ${units.length} ${units.length === 1 ? 'item' : 'items'}` : 'Review selected items'}</Button></div>
    </div></Panel> : null}
    {review && !config.canReview ? <p className="text-sm text-grey-2">Read-only disposition history. Only Inventory Managers confirm damage outcomes.</p> : null}
    {!confirming ? <Panel title={review ? 'Disposition history' : config.ownIssuedOnly ? 'Your BAD reports' : 'BAD report history'}><div className="space-y-4">{history.loading ? <DetailSkeleton rows={4} /> : history.error ? <ErrorNotice message={history.error} onRetry={history.refresh} /> : history.data ? <><DataTable label="Damage history" rows={history.data.rows} rowKey={row => row.id} mobileStack emptyMessage="No recorded damage commands." columns={[
      { key: 'record', label: 'Recorded', cell: row => <><span>{formatDateTime(row.recordedAt)}</span><span className="block text-xs">{row.actorName}</span></> },
      { key: 'cause', label: review ? 'Disposition' : 'Cause', cell: row => row.cause ?? outcomes.find(outcome => outcome.value === row.outcome)?.label },
      { key: 'count', label: 'Exact items', cell: row => row.unitCount }, { key: 'open', label: 'Evidence', cell: row => <Button variant="secondary" onClick={() => setDetail(row.id)}>View record</Button> },
    ]} /><Pager page={historyPage} pageCount={Math.ceil(history.data.total / 20)} total={history.data.total} onChange={setHistoryPage} /></> : null}</div></Panel> : null}
    {detail && !tracking ? <DamageDetail id={detail} review={review} onClose={() => setDetail('')} onTrack={setTracking} /> : null}{tracking ? <UnitTrackingDrawer key={tracking} unitId={tracking} onClose={() => setTracking('')} /> : null}
  </div>;
}
export function DamageWorkspace({ actorId }: { actorId: string }) {
  const config = useApiRead<Config>('damage-config'), [review, setReview] = useState(false);
  return <Page className="space-y-6"><PageHeader title="Damage & BAD reports" description="" />{config.loading ? <DetailSkeleton rows={5} /> : config.error ? <ErrorNotice message={config.error} onRetry={config.refresh} /> : config.data ? <>
    {config.data.canViewReviews ? <div className="flex flex-wrap gap-2"><Button variant={review ? 'secondary' : 'primary'} onClick={() => setReview(false)}>BAD reports</Button><Button variant={review ? 'primary' : 'secondary'} onClick={() => setReview(true)}>Manager dispositions</Button></div> : null}
    <Workflow key={String(review)} actorId={actorId} config={config.data} review={review} />
  </> : null}</Page>;
}
