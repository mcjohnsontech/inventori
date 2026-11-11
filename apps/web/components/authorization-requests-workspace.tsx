'use client';
import {TaskModal} from './ui/task-modal';
import { useEffect, useRef, useState } from 'react';
import { authorizationRequestSchema, type AuthorizationDraft, type AuthorizationPreview, type AuthorizationRequestInput, type AuthorizationRequestView, type OperationalStock, type RecoveryRequestTarget, type UnitIdentityLookup } from '@dayari/contracts';
import { api, useApiRead } from '../lib/api';
import { useAuthorizationRequestDraft } from '../lib/authorization-request-draft';
import { useQrPresentation } from '../lib/qr-presentation';
import { formatDateTime } from '../lib/format';
import { UnitCameraInput } from './unit-camera-input';
import { UnitTrackingDrawer } from './unit-tracking-drawer';
import { Badge, Button, Code, DataTable, DetailsDrawer, DetailSkeleton, EmptyState, ErrorNotice, Field, Input, Page, PageHeader, Pager, Panel, SearchInput, Select, Textarea, WarningNotice } from './ui';

type Config = { originId: string; limit: number; canSubmit: boolean; executionEnabled: false; approvalDelivery: 'DEFERRED' };
type History = { total: number; page: number; pageSize: number; rows: { id: string; kind: 'RECOVERY' | 'CORRECTION'; status: string; recordedAt: string; managerName: string; unitCount: number; requestedDelta: string | null }[] };
const stateLabels = { U: 'Usable', P: 'In Production', D: 'Damaged' };
const blank = (kind: AuthorizationDraft['kind']): AuthorizationDraft => ({ kind, unitIds: [], lotId: null, state: 'U', observedQuantity: '', reason: '', evidence: '' });
function RequestEvidence({ value, onTrack }: { value: AuthorizationRequestView; onTrack: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null), [page, setPage] = useState(1), preview = value.preview;
  useEffect(() => { root.current?.scrollIntoView({ block: 'start' }); const h = root.current?.querySelector('h2'); h?.setAttribute('tabindex', '-1'); h?.focus({ preventScroll: true }); }, []);
  return <div ref={root} className="scroll-mt-36 lg:scroll-mt-24"><Panel title="Request recorded — pending authorization"><div className="space-y-4">
    <Badge tone="neutral">{value.kind === 'RECOVERY' ? 'Recovery requested' : 'Correction requested'} · Pending cloud authorization</Badge>
    <p className="text-sm">Stock has not changed. Approval delivery is unavailable in this phase.</p><p className="break-all text-xs text-grey-2">Request {value.id}</p>
    <p className="text-sm">{value.manager.name} · {formatDateTime(value.recordedAt)}</p><p className="break-words font-medium">{value.reason}</p><p className="whitespace-pre-wrap break-words text-sm">{value.evidence}</p>
    {preview.kind === 'CORRECTION' ? <div className="space-y-3 rounded-xl border border-black/10 p-4"><p className="font-semibold">{preview.target.productName} · {preview.target.variantName}</p><Code>{preview.target.fullSku}</Code><p className="text-sm">{preview.target.lotCode ?? 'Historical lot'} · {preview.target.publicBatchCode} · {stateLabels[preview.target.state]}</p>
      <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-grey-2">Ledger quantity at request</dt><dd className="font-semibold">{preview.target.ledgerQuantity}</dd></div><div><dt className="text-grey-2">Projection at request</dt><dd className="font-semibold">{preview.target.projectionQuantity}</dd></div><div><dt className="text-grey-2">Reported observation</dt><dd className="font-semibold">{value.observedQuantity}</dd></div><div><dt className="text-grey-2">Requested difference — not applied</dt><dd className="font-semibold">{value.requestedDelta}</dd></div></dl>
      <p className="text-xs text-grey-2">This is supporting evidence for investigation, not a certified count or an executed stock correction. Extra physical items have not been assigned identities.</p>
    </div> : <><DataTable label="Requested recovery units" mobileStack rows={preview.units.slice((page - 1) * 12, page * 12)} rowKey={row => row.unit.unitId} emptyMessage="No units." columns={[
      { key: 'unit', label: 'Exact unit', cell: row => <><button className="min-h-11 font-mono font-semibold text-brand underline" onClick={() => onTrack(row.unit.unitId)}>{row.unit.unitCode}</button><span className="block text-sm">{row.unit.productName} · {row.unit.variantName}</span><Code className="block text-xs">{row.unit.fullSku}</Code></> },
      { key: 'lot', label: 'Lot / batch', cell: row => <>{row.unit.lotCode ?? 'Historical lot'}<span className="block text-xs">{row.unit.publicBatchCode}</span></> },
      { key: 'source', label: 'Original evidence', cell: row => <>{row.damageLineId ? 'BAD report retained' : 'Damaged intake'}<span className="block text-xs">Damaged at request · recovery not executed</span></> },
    ]} /><Pager page={page} pageCount={Math.ceil(preview.units.length / 12)} total={preview.units.length} onChange={setPage} /></>}
    <p className="text-xs text-grey-2">Evidence describes the request-time state. Any future authorized execution must revalidate current units, quantities and provenance.</p>
  </div></Panel></div>;
}
function RequestDetail({ id, onClose, onTrack }: { id: string; onClose: () => void; onTrack: (id: string) => void }) {
  const read = useApiRead<AuthorizationRequestView>('authorization-requests/' + id);
  return <DetailsDrawer title="Pending request evidence" eyebrow="Pending request" closeLabel="Close request details" onClose={onClose}>{read.loading ? <DetailSkeleton rows={4} /> : read.error ? <ErrorNotice message={read.error} onRetry={read.refresh} /> : read.data ? <RequestEvidence value={read.data} onTrack={onTrack} /> : null}</DetailsDrawer>;
}
function RequestHistory({ revision, onOpen }: { revision: number; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1), [kind, setKind] = useState('ALL'), read = useApiRead<History>(`authorization-requests?page=${page}${kind === 'ALL' ? '' : '&kind=' + kind}`);
  useEffect(() => { if (revision) read.refresh(); }, [revision]);
  return <Panel title="Request history"><div className="space-y-4"><div className="max-w-sm"><Field label="Request type">{id => <Select id={id} label="Request type" value={kind} options={[{ value: 'ALL', label: 'All requests' }, { value: 'RECOVERY', label: 'Recovery' }, { value: 'CORRECTION', label: 'Correction' }]} onChange={value => { setKind(value); setPage(1); }} />}</Field></div>
    {read.loading ? <DetailSkeleton rows={4} /> : read.error ? <ErrorNotice message={read.error} onRetry={read.refresh} /> : read.data ? <><DataTable label="Pending request history" rows={read.data.rows} rowKey={row => row.id} mobileStack emptyMessage="No requests match this filter." columns={[
      { key: 'recorded', label: 'Recorded', cell: row => <>{formatDateTime(row.recordedAt)}<span className="block text-xs">{row.managerName}</span></> },
      { key: 'kind', label: 'Request', cell: row => row.kind === 'RECOVERY' ? `${row.unitCount} exact ${row.unitCount === 1 ? 'unit' : 'units'} · recovery` : `Correction · difference ${row.requestedDelta}` },
      { key: 'status', label: 'Status', cell: () => <Badge tone="neutral">Pending cloud authorization</Badge> },
      { key: 'open', label: 'Evidence', cell: row => <Button variant="secondary" onClick={() => onOpen(row.id)}>View request</Button> },
    ]} /><Pager page={page} pageCount={Math.ceil(read.data.total / 20)} total={read.data.total} onChange={setPage} /></> : null}
  </div></Panel>;
}
function LotPicker({ selected, onSelect, disabled }: { selected: string | null; onSelect: (id: string) => void; disabled: boolean }) {
  const stock = useApiRead<OperationalStock>('stock'), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const rows = (stock.data?.lots ?? []).filter(lot => `${lot.productName} ${lot.variantName} ${lot.fullCode} ${lot.lotCode ?? ''} ${lot.publicCode}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="space-y-3"><SearchInput label="Find a correction lot" value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder="Product, saved SKU, Lot Code or batch…" />
    {stock.loading ? <DetailSkeleton rows={3} /> : stock.error ? <ErrorNotice message={stock.error} onRetry={stock.refresh} /> : <><DataTable label="Correction lot selection" rows={rows.slice((page - 1) * 10, page * 10)} rowKey={lot => lot.lotId} mobileStack emptyMessage="No stock lots match this search." columns={[
      { key: 'product', label: 'Product / SKU', cell: lot => <>{lot.productName} · {lot.variantName}<Code className="block text-xs">{lot.fullCode}</Code></> },
      { key: 'lot', label: 'Lot / batch', cell: lot => <>{lot.lotCode ?? 'Historical lot'}<span className="block text-xs">{lot.publicCode}</span></> },
      { key: 'choose', label: 'Selection', cell: lot => <Button variant={lot.lotId === selected ? 'primary' : 'secondary'} disabled={disabled} onClick={() => onSelect(lot.lotId)}>{lot.lotId === selected ? 'Selected' : 'Choose lot'}</Button> },
    ]} /><Pager page={page} pageCount={Math.ceil(rows.length / 10)} total={rows.length} onChange={setPage} /></>}
  </div>;
}
function ManagerRequest({ actorId, config, onRecorded, onTrack, onReviewing }: { actorId: string; config: Config; onRecorded: () => void; onTrack: (id: string) => void; onReviewing: (reviewing: boolean) => void }) {
  const [taskOpen,setTaskOpen]=useState(false);
  const { saved, ready, busy, update, send } = useAuthorizationRequestDraft(actorId, config.originId), presentation = useQrPresentation();
  const [input, setInput] = useState(''), [camera, setCamera] = useState(false), [adding, setAdding] = useState(false), [error, setError] = useState(''), [announcement, setAnnouncement] = useState('');
  const [preview, setPreview] = useState<AuthorizationPreview | null>(null), [previewBusy, setPreviewBusy] = useState(false), [previewError, setPreviewError] = useState(''), [revision, setRevision] = useState(0);
  const [reviewed, setReviewed] = useState<AuthorizationRequestInput | null>(null), [page, setPage] = useState(1), [showPicker, setShowPicker] = useState(false);
  const mounted = useRef(true), latch = useRef(false), request = useRef<AbortController | null>(null), form = useRef<HTMLFormElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const selection = saved.body.kind === 'RECOVERY' ? saved.body.unitIds.length ? { kind: 'RECOVERY', unitIds: saved.body.unitIds } : null
    : saved.body.lotId ? { kind: 'CORRECTION', lotId: saved.body.lotId, state: saved.body.state } : null;
  const selectionKey = JSON.stringify(selection), accepted = useApiRead<AuthorizationRequestView>(saved.acceptedId ? 'authorization-requests/' + saved.acceptedId : null);
  useEffect(() => {
    const abort = new AbortController(); setPreview(null); setPreviewError(''); setPreviewBusy(Boolean(selection) && ready);
    if (selection && ready) api<AuthorizationPreview>('authorization-requests/preview', { method: 'POST', body: JSON.stringify(selection), signal: abort.signal })
      .then(value => { if (!abort.signal.aborted) setPreview(value); }).catch(failure => { if (!abort.signal.aborted) setPreviewError(failure.message); }).finally(() => { if (!abort.signal.aborted) setPreviewBusy(false); });
    return () => abort.abort();
  }, [selectionKey, ready, revision]);
  const reviewing = Boolean(reviewed || saved.pending), disabled = busy || adding || Boolean(saved.pending);
  useEffect(() => { onReviewing(reviewing); }, [reviewing, onReviewing]);
  function change(body: AuthorizationDraft) { try { update(body); setError(''); setReviewed(null); } catch (failure) { setError((failure as Error).message); } }
  async function add(value = input, method: 'CAMERA' | 'QR_INPUT' = 'QR_INPUT') {
    if (disabled || latch.current || !value.trim()) return; latch.current = true; setAdding(true); setError(''); const abort = new AbortController(); request.current = abort;
    try {
      const code = value.trim(), unit = await api<UnitIdentityLookup>(code.startsWith('DYI:') ? 'qr/resolve' : `inventory/units/by-code/${encodeURIComponent(code.toUpperCase())}`,
        code.startsWith('DYI:') ? { method: 'POST', body: JSON.stringify({ payload: code }), signal: abort.signal } : { signal: abort.signal });
      if (unit.payloadVersion !== 2 || !unit.unitId) throw Error('Select an exact individual unit, not a shared lot label.');
      if (code.startsWith('DYI:2:')) presentation.record({ payload: code, method });
      if (saved.body.unitIds.includes(unit.unitId)) throw Error(`${unit.unitCode} is already selected.`);
      if (saved.body.unitIds.length >= config.limit) throw Error(`Select at most ${config.limit} exact units per request.`);
      await api('authorization-requests/preview', { method: 'POST', body: JSON.stringify({ kind: 'RECOVERY', unitIds: [unit.unitId] }), signal: abort.signal });
      if (mounted.current) { change({ ...saved.body, unitIds: [...saved.body.unitIds, unit.unitId] }); setInput(''); setAnnouncement(`Added ${unit.unitCode}.`); setPage(Math.ceil((saved.body.unitIds.length + 1) / 12)); }
    } catch (failure) { if (mounted.current && !abort.signal.aborted) setError((failure as Error).message); }
    finally { latch.current = false; if (mounted.current) { setAdding(false); requestAnimationFrame(() => form.current?.querySelector('input')?.focus()); } }
  }
  const draftInput = preview?.kind === 'RECOVERY' ? { kind: 'RECOVERY', unitIds: saved.body.unitIds, reason: saved.body.reason, evidence: saved.body.evidence }
    : preview?.kind === 'CORRECTION' ? { kind: 'CORRECTION', lotId: preview.target.lotId, state: preview.target.state, observedQuantity: saved.body.observedQuantity,
      reviewedLedgerQuantity: preview.target.ledgerQuantity, reviewedProjectionQuantity: preview.target.projectionQuantity, reason: saved.body.reason, evidence: saved.body.evidence } : null;
  const validation = authorizationRequestSchema.safeParse(draftInput), active = saved.pending?.body ?? reviewed;
  async function confirm() {
    setError(''); try { await send(active); if (mounted.current) { setReviewed(null); onRecorded(); setRevision(value => value + 1); } }
    catch (failure) { if (mounted.current) { setError((failure as Error).message); setRevision(value => value + 1); } }
  }
  useEffect(()=>{if(ready&&(saved.pending||saved.body.unitIds.length))setTaskOpen(true);},[ready]);
  if (!ready) return <DetailSkeleton rows={4} />;
  if (saved.acceptedId && !saved.pending) return <div className="space-y-4">{accepted.loading ? <DetailSkeleton rows={4} /> : accepted.error ? <ErrorNotice message={accepted.error} onRetry={accepted.refresh} /> : accepted.data ? <RequestEvidence value={accepted.data} onTrack={onTrack} /> : null}<Button variant="secondary" onClick={() => change(blank(saved.body.kind))}>Start another request</Button></div>;
  return <><Button onClick={()=>setTaskOpen(true)}>New recovery / correction request</Button><TaskModal title="Pending stock authorization request" open={taskOpen} busy={busy||adding} onClose={()=>{setCamera(false);setTaskOpen(false);}}><Panel title={reviewing ? 'Review pending request' : 'New pending request'}><div className="space-y-4">
    {error ? <ErrorNotice message={error} /> : null}{presentation.state === 'error' ? <ErrorNotice message={`QR presentation evidence was not confirmed: ${presentation.error}`} onRetry={presentation.retry} /> : null}
    {saved.pending && !busy ? <WarningNotice>The response is unresolved. Retry the saved request; no stock execution is involved.<Button className="mt-2" disabled={busy} onClick={() => void confirm()}>Retry saved pending request</Button></WarningNotice> : null}
    {!reviewing ? <><div className="max-w-sm"><Field label="New request kind">{id => <Select id={id} label="New request kind" disabled={disabled} value={saved.body.kind} options={[{ value: 'RECOVERY', label: 'Recovery of damaged units' }, { value: 'CORRECTION', label: 'Quantity discrepancy / correction' }]} onChange={kind => { change({ ...saved.body, kind: kind as AuthorizationDraft['kind'] }); setPage(1); }} />}</Field></div>
      {saved.body.kind === 'RECOVERY' ? <><form ref={form} onSubmit={event => { event.preventDefault(); void add(); }} className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><Field label="Recovery Unit Code or individual QR">{id => <Input id={id} value={input} disabled={disabled} maxLength={200} onChange={event => setInput(event.target.value)} />}</Field></div><Button type="submit" disabled={disabled || !input.trim()}>{adding ? 'Checking…' : 'Add unit'}</Button><Button variant="secondary" disabled={disabled} onClick={() => setCamera(value => !value)}>Use camera</Button></form><p role="status" className="text-sm">{announcement}</p>{camera ? <UnitCameraInput onClose={() => setCamera(false)} onRead={payload => { setCamera(false); void add(payload, 'CAMERA'); }} /> : null}</>
        : <>{!saved.body.lotId || showPicker ? <LotPicker selected={saved.body.lotId} disabled={disabled} onSelect={lotId => { change({ ...saved.body, lotId, observedQuantity: '' }); setShowPicker(false); }} /> : <Button variant="secondary" disabled={disabled} onClick={() => setShowPicker(true)}>Change selected lot</Button>}<div className="grid gap-4 md:grid-cols-2"><Field label="Stock state">{id => <Select id={id} label="Stock state" disabled={disabled} value={saved.body.state} options={Object.entries(stateLabels).map(([value, label]) => ({ value, label }))} onChange={state => change({ ...saved.body, state: state as AuthorizationDraft['state'], observedQuantity: '' })} />}</Field><Field label="Reported observed quantity" hint="A factual nonnegative whole quantity; this does not adjust stock.">{id => <Input id={id} value={saved.body.observedQuantity} inputMode="numeric" maxLength={19} disabled={disabled} onChange={event => change({ ...saved.body, observedQuantity: event.target.value })} />}</Field></div></>}
      <div className="grid gap-4 md:grid-cols-2"><Field label="Request explanation" hint="At least ten meaningful characters.">{id => <Textarea id={id} value={saved.body.reason} disabled={disabled} maxLength={2000} onChange={event => change({ ...saved.body, reason: event.target.value })} />}</Field><Field label="Supporting evidence" hint="Factual observations and record references; no uploaded files in this phase.">{id => <Textarea id={id} value={saved.body.evidence} disabled={disabled} maxLength={4000} onChange={event => change({ ...saved.body, evidence: event.target.value })} />}</Field></div>
    </> : <div className="space-y-2"><p className="font-semibold">{active?.kind === 'RECOVERY' ? 'Request return to usable — not an authorization' : 'Request quantity investigation — no correction executed'}</p><p className="break-words">{active?.reason}</p><p className="whitespace-pre-wrap break-words text-sm">{active?.evidence}</p>{active?.kind === 'CORRECTION' ? <p className="text-sm">Reviewed ledger {active.reviewedLedgerQuantity} · projection {active.reviewedProjectionQuantity} · reported observation {active.observedQuantity}</p> : null}</div>}
    {previewBusy ? <DetailSkeleton rows={3} /> : previewError ? <div className="space-y-3"><ErrorNotice message={previewError} onRetry={() => setRevision(value => value + 1)} />{!reviewing && saved.body.kind === 'RECOVERY' ? <>{saved.body.unitIds.slice((page - 1) * 12, page * 12).map(id => <div key={id} className="flex flex-wrap gap-2"><Code className="break-all text-xs">{id}</Code><Button variant="secondary" disabled={disabled} onClick={() => { change({ ...saved.body, unitIds: saved.body.unitIds.filter(value => value !== id) }); setPage(1); }}>Remove unavailable selection</Button></div>)}<Pager page={page} pageCount={Math.ceil(saved.body.unitIds.length / 12)} total={saved.body.unitIds.length} onChange={setPage} /></> : null}</div>
      : preview?.kind === 'RECOVERY' ? <><DataTable label="Recovery request selection" mobileStack rows={preview.units.slice((page - 1) * 12, page * 12)} rowKey={row => row.unit.unitId} emptyMessage="No units." columns={[
        { key: 'unit', label: 'Exact damaged unit', cell: row => <><Code>{row.unit.unitCode}</Code><span className="block text-sm">{row.unit.productName} · {row.unit.variantName}</span><Code className="block text-xs">{row.unit.fullSku}</Code></> },
        { key: 'lot', label: 'Original provenance', cell: row => <>{row.unit.lotCode ?? 'Historical lot'}<span className="block text-xs">{row.unit.publicBatchCode} · {row.damageLineId ? 'BAD report retained' : 'Damaged intake'}</span></> },
        ...(!reviewing ? [{ key: 'remove', label: 'Selection', cell: (row: RecoveryRequestTarget) => <Button variant="ghost" disabled={disabled} onClick={() => { change({ ...saved.body, unitIds: saved.body.unitIds.filter(id => id !== row.unit.unitId) }); setPage(1); }}>Remove {row.unit.unitCode}</Button> }] : []),
      ]} /><Pager page={page} pageCount={Math.ceil(preview.units.length / 12)} total={preview.units.length} onChange={setPage} /></> : preview?.kind === 'CORRECTION' ? <div className="space-y-2 rounded-xl border border-black/10 p-4"><p className="font-semibold">{preview.target.productName} · {preview.target.variantName}</p><Code>{preview.target.fullSku}</Code><p className="text-sm">{preview.target.lotCode ?? 'Historical lot'} · {preview.target.publicBatchCode} · {stateLabels[preview.target.state]}</p><p className="text-sm">Ledger {preview.target.ledgerQuantity} · projection {preview.target.projectionQuantity}</p>{preview.target.ledgerQuantity !== preview.target.projectionQuantity ? <WarningNotice>Ledger and projection disagree. This discrepancy remains unresolved; submitting a request cannot certify or change it.</WarningNotice> : null}</div>
        : <EmptyState title="Select the request target">Choose exact damaged units or one saved lot and state.</EmptyState>}
    <p className="text-sm text-grey-2">This records immutable pending evidence only. There is no local approval or stock-changing action. Quantity discrepancies remain unresolved.</p>
    {!reviewing && preview && !previewBusy && !validation.success ? <p className="text-sm text-grey-2">{[...new Set(validation.error.issues.map(issue => issue.message))].join('. ')}</p> : null}
    <div className="flex flex-wrap justify-between gap-3"><Button variant="secondary" disabled={disabled} onClick={() => { if (reviewing) setReviewed(null); else if (window.confirm('Discard this pending-request draft? Saved stock and request evidence will remain unchanged.')) change(blank(saved.body.kind)); }}>{reviewing ? 'Back to request' : 'Discard request draft'}</Button><Button disabled={disabled || (!reviewing && (!validation.success || previewBusy || Boolean(previewError)))} onClick={() => { if (reviewing) void confirm(); else if (validation.success) { setReviewed(validation.data); setPage(1); } }}>{busy ? 'Recording request…' : reviewing ? 'Record pending request' : 'Review request'}</Button></div>
  </div></Panel></TaskModal></>;
}
export function AuthorizationRequestsWorkspace({ actorId }: { actorId: string }) {
  const config = useApiRead<Config>('authorization-request-config'), [revision, setRevision] = useState(0), [detail, setDetail] = useState(''), [tracking, setTracking] = useState(''), [reviewing, setReviewing] = useState(false);
  return <Page className="space-y-6"><PageHeader title="Recovery & correction requests" description="" />{config.loading ? <DetailSkeleton rows={5} /> : config.error ? <ErrorNotice message={config.error} onRetry={config.refresh} /> : config.data ? <>
    <WarningNotice>Pending cloud authorization. Stock has not changed. Approval delivery is not available in this phase.</WarningNotice>
    {config.data.canSubmit ? <ManagerRequest actorId={actorId} config={config.data} onRecorded={() => setRevision(value => value + 1)} onTrack={setTracking} onReviewing={setReviewing} /> : <p className="text-sm text-grey-2">Read-only request evidence. Managers submit requests; local approval and execution are unavailable.</p>}
    {!reviewing ? <RequestHistory revision={revision} onOpen={setDetail} /> : null}
    {detail && !tracking ? <RequestDetail id={detail} onClose={() => setDetail('')} onTrack={setTracking} /> : null}{tracking ? <UnitTrackingDrawer key={tracking} unitId={tracking} onClose={() => setTracking('')} /> : null}
  </> : null}</Page>;
}
