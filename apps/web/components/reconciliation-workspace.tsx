'use client';
import { useEffect, useRef, useState } from 'react';
import { checkoutReasonLabels, reconcileReasonsSchema, type CheckoutView, type ReasonQueue, type ReasonQueueRow, type ReasonReconciliationDraft, type ReasonResolutionView } from '@dayari/contracts';
import { api, useApiRead } from '../lib/api';
import { useReconciliationDraft } from '../lib/reconciliation-draft';
import { formatDateTime } from '../lib/format';
import { ReasonField } from './reason-field';
import { UnitTrackingDrawer } from './unit-tracking-drawer';
import { CheckoutAcceptance } from './checkout-workspace';
import { Badge, Button, Checkbox, Code, DataTable, DetailsDrawer, DetailSkeleton, EmptyState, ErrorNotice, Field, Input, Page, PageHeader, Pager, Panel, Select, Textarea, WarningNotice, type Column } from './ui';

type Config = { originId: string; limit: number; canResolve: boolean; employees: { id: string; name: string }[] };
function OriginalCheckout({ id, onClose }: { id: string; onClose: () => void }) {
  const read = useApiRead<CheckoutView>('checkouts/' + id);
  return <DetailsDrawer title="Original checkout" closeLabel="Close original checkout" onClose={onClose}>
    {read.loading ? <DetailSkeleton rows={5} /> : read.error ? <ErrorNotice message={read.error} onRetry={read.refresh} /> : read.data ? <CheckoutAcceptance receipt={read.data} /> : null}
  </DetailsDrawer>;
}
function AcceptedClassification({ value }: { value: ReasonResolutionView }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollIntoView({ block: 'start' }); const heading = box.current?.querySelector('h2'); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }); }, []);
  return <div ref={box} className="scroll-mt-36 lg:scroll-mt-24"><Panel title="Classification recorded"><div className="space-y-3" role="status">
    <p className="font-semibold">{value.lines.length} original exceptions reconciled · {checkoutReasonLabels[value.reason.code]}</p>
    {value.reason.note ? <p className="break-words text-sm">{value.reason.note}</p> : null}
    <p className="text-sm text-grey-2">{value.manager.name} · {formatDateTime(value.recordedAt)}</p>
    {value.remarks ? <p className="break-words text-sm">Manager remarks: {value.remarks}</p> : null}
    <p className="text-sm">Stock has not changed. Original employee reasons, timestamps and checkout records are preserved.</p>
  </div></Panel></div>;
}

function Body({ actorId, config }: { actorId: string; config: Config }) {
  const { draft, ready, busy, update, send } = useReconciliationDraft(actorId, config.originId);
  const [filters, setFilters] = useState({ status: 'UNRESOLVED', employeeId: '', orderReference: '', unitCode: '', from: '', to: '' });
  const [query, setQuery] = useState('status=UNRESOLVED'), [page, setPage] = useState(1), [review, setReview] = useState(false), [selectionPage, setSelectionPage] = useState(1);
  const [error, setError] = useState(''), [tracking, setTracking] = useState(''), [original, setOriginal] = useState('');
  const [preview, setPreview] = useState<ReasonQueueRow[]>([]), [previewError, setPreviewError] = useState(''), [previewBusy, setPreviewBusy] = useState(false), [revision, setRevision] = useState(0);
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const timer = setTimeout(() => { const params = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value.trim() && (key !== 'unitCode' || value.trim().length === 6)) params.set(key, value.trim()); setQuery(params.toString()); setPage(1); }, 250); return () => clearTimeout(timer); }, [filters]);
  const queue = useApiRead<ReasonQueue>(`checkout-reasons?${query}&page=${page}`);
  const accepted = useApiRead<ReasonResolutionView>(draft.acceptedId ? `reason-reconciliations/${draft.acceptedId}` : null);
  const selection = JSON.stringify(draft.body.exceptionIds);
  useEffect(() => { if (draft.pending) setReview(true); }, [draft.pending]);
  useEffect(() => {
    const controller = new AbortController(); setPreview([]); setPreviewError(''); setPreviewBusy(ready && draft.body.exceptionIds.length > 0);
    if (ready && draft.body.exceptionIds.length) api<{ rows: ReasonQueueRow[] }>('checkout-reasons/preview', { method: 'POST', body: JSON.stringify({ exceptionIds: draft.body.exceptionIds }), signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setPreview(value.rows); }).catch(failure => { if (!controller.signal.aborted) setPreviewError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setPreviewBusy(false); });
    return () => controller.abort();
  }, [ready, selection, revision]);
  const disabled = busy || Boolean(draft.pending) || !config.canResolve;
  function change(body: ReasonReconciliationDraft) { try { update(body); setError(''); } catch (failure) { setError((failure as Error).message); } }
  function toggle(id: string) {
    const selected = draft.body.exceptionIds.includes(id);
    if (!selected && draft.body.exceptionIds.length >= config.limit) { setError(`Select at most ${config.limit} exact obligations per confirmation.`); return; }
    change({ ...draft.body, exceptionIds: selected ? draft.body.exceptionIds.filter(value => value !== id) : [...draft.body.exceptionIds, id] }); setSelectionPage(1);
  }
  async function confirm() {
    setError(''); try { await send(); if (mounted.current) { setReview(false); queue.refresh(); setRevision(value => value + 1); } }
    catch (failure) { if (mounted.current) { setError((failure as Error).message); setRevision(value => value + 1); } }
  }
  const rowColumns: Column<ReasonQueueRow>[] = [
    ...(config.canResolve ? [{ key: 'select', label: 'Select', cell: (row: ReasonQueueRow) => <Checkbox aria-label={`Select exception for ${row.unit.unitCode}`} disabled={disabled || row.status !== 'UNRESOLVED'} checked={draft.body.exceptionIds.includes(row.exceptionId)} onChange={() => toggle(row.exceptionId)} /> }] : []),
    { key: 'unit', label: 'Unit / product', cell: row => <><button className="min-h-11 font-mono font-semibold text-brand underline" onClick={() => setTracking(row.unit.unitId)}>{row.unit.unitCode}</button><span className="block text-sm">{row.unit.productName} · {row.unit.variantName}</span><Code className="block text-xs">{row.unit.fullSku}</Code></> },
    { key: 'employee', label: 'Original checkout', cell: row => <>{row.employee.name}<span className="block text-xs text-grey-2">{formatDateTime(row.acceptedAt)}</span><span className="block break-words text-xs">{row.orderReference ?? 'No Order ID'}</span></> },
    { key: 'status', label: 'Classification', cell: row => <><Badge tone={row.status === 'RESOLVED' ? 'usable' : 'neutral'}>{row.status === 'RESOLVED' ? 'Reconciled' : 'Reason not provided'}</Badge>{row.resolution ? <div className="mt-2 space-y-1 text-xs"><p>{checkoutReasonLabels[row.resolution.reason.code]}</p><p>{row.resolution.manager.name} · {formatDateTime(row.resolution.recordedAt)}</p>{row.resolution.reason.note ? <p className="break-words">{row.resolution.reason.note}</p> : null}{row.resolution.remarks ? <p className="break-words">Remarks: {row.resolution.remarks}</p> : null}</div> : null}</> },
    { key: 'open', label: 'Evidence', cell: row => <Button variant="secondary" onClick={() => setOriginal(row.checkoutId)}>Original checkout</Button> },
  ];
  const validation = reconcileReasonsSchema.safeParse(draft.body);
  const canConfirm = validation.success && !previewBusy && !previewError && preview.length === draft.body.exceptionIds.length && preview.every(row => row.status === 'UNRESOLVED');
  return <div className="space-y-5">
    {!config.canResolve ? <p className="text-sm text-grey-2">Read-only operational review. Only Inventory Managers record missing-reason classifications.</p> : null}
    {accepted.loading ? <DetailSkeleton rows={3} /> : accepted.error ? <ErrorNotice message={accepted.error} onRetry={accepted.refresh} /> : accepted.data ? <AcceptedClassification key={accepted.data.id} value={accepted.data} /> : null}
    {!review ? <Panel title="Missing-reason queue and history" label="Reason exception queue"><div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Exception status">{id => <Select id={id} label="Exception status" value={filters.status} options={[{ value: 'UNRESOLVED', label: 'Unresolved' }, { value: 'RESOLVED', label: 'Reconciled' }, { value: 'ALL', label: 'All exceptions' }]} onChange={status => setFilters(value => ({ ...value, status }))} />}</Field>
        <Field label="Original employee">{id => <Select id={id} label="Original employee" value={filters.employeeId || 'ALL'} options={[{ value: 'ALL', label: 'All original employees' }, ...config.employees.map(employee => ({ value: employee.id, label: employee.name }))]} onChange={employeeId => setFilters(value => ({ ...value, employeeId: employeeId === 'ALL' ? '' : employeeId }))} />}</Field>
        <Field label="Exact Order ID">{id => <Input id={id} value={filters.orderReference} maxLength={120} onChange={event => setFilters(value => ({ ...value, orderReference: event.target.value }))} />}</Field>
        <Field label="Exact Unit Code" hint="Enter all six characters to apply this filter.">{id => <Input id={id} value={filters.unitCode} maxLength={6} onChange={event => setFilters(value => ({ ...value, unitCode: event.target.value.toUpperCase() }))} />}</Field>
        <Field label="Checkout date from · Lagos">{id => <Input id={id} type="date" value={filters.from} onChange={event => setFilters(value => ({ ...value, from: event.target.value }))} />}</Field>
        <Field label="Checkout date to · Lagos">{id => <Input id={id} type="date" value={filters.to} onChange={event => setFilters(value => ({ ...value, to: event.target.value }))} />}</Field>
      </div>
      <div className="flex flex-wrap justify-between gap-3"><p className="text-sm text-grey-2">Original missing-reason evidence is permanent. Reconciliation classifies it without another deduction.</p><Button variant="secondary" onClick={queue.refresh}>Refresh exceptions</Button></div>
      {queue.loading ? <DetailSkeleton rows={5} /> : queue.error ? <ErrorNotice message={queue.error} onRetry={queue.refresh} /> : queue.data ? <><DataTable label="Checkout reason exceptions" rows={queue.data.rows} columns={rowColumns} rowKey={row => row.exceptionId} emptyMessage="No exceptions match these filters." mobileStack />
        <Pager page={page} pageCount={Math.ceil(queue.data.total / queue.data.pageSize)} total={queue.data.total} onChange={setPage} /></> : null}
    </div></Panel> : null}
    {config.canResolve && ready ? <Panel label="Manager reason classification" title={review ? 'Review classification' : 'Classify selected exceptions'}><div className="space-y-4">
      {error ? <ErrorNotice message={error} /> : null}
      {draft.pending ? <WarningNotice>The classification response is unresolved. Retry the same saved request; no new stock deduction is involved.<Button className="mt-2" disabled={busy} onClick={() => void confirm()}>Retry saved classification</Button></WarningNotice> : null}
      <p className="text-sm">{draft.body.exceptionIds.length} exact obligations selected. Selection is preserved across filters and pages.</p>
      {!review ? <div className="grid gap-4 md:grid-cols-2"><ReasonField label="Manager classification" emptyLabel="Choose a classification" disabled={disabled} value={draft.body.reason} onChange={reason => change({ ...draft.body, reason: reason ?? null })} />
        <Field label="Manager remarks (optional)">{id => <Textarea id={id} disabled={disabled} value={draft.body.remarks} maxLength={2000} onChange={event => change({ ...draft.body, remarks: event.target.value })} />}</Field></div> : <div className="space-y-2"><p className="font-semibold">{draft.body.reason ? checkoutReasonLabels[draft.body.reason.code] : 'Classification required'}</p>{draft.body.reason?.note ? <p className="break-words text-sm">{draft.body.reason.note}</p> : null}{draft.body.remarks ? <p className="break-words text-sm">Remarks: {draft.body.remarks}</p> : null}</div>}
      {previewBusy ? <DetailSkeleton rows={3} /> : previewError ? <ErrorNotice message={previewError} onRetry={() => setRevision(value => value + 1)} /> : preview.length ? <><DataTable label="Selected reason obligations" rows={preview.slice((selectionPage - 1) * 12, selectionPage * 12)} rowKey={row => row.exceptionId} mobileStack emptyMessage="No selected obligations." columns={[
        { key: 'unit', label: 'Exact unit', cell: row => <><Code>{row.unit.unitCode}</Code><span className="block text-sm">{row.unit.productName} · {row.unit.variantName}</span></> },
        { key: 'original', label: 'Original evidence', cell: row => <>{row.employee.name}<span className="block break-words text-xs">{row.orderReference ?? 'No Order ID'}</span><span className="block text-xs">{row.status === 'RESOLVED' ? 'Already reconciled — remove before confirming' : 'Original reason not provided'}</span></> },
        ...(!review ? [{ key: 'remove', label: 'Selection', cell: (row: ReasonQueueRow) => <Button variant="ghost" disabled={disabled} onClick={() => toggle(row.exceptionId)}>Remove {row.unit.unitCode}</Button> }] : []),
      ]} /><Pager page={selectionPage} pageCount={Math.ceil(preview.length / 12)} total={preview.length} onChange={setSelectionPage} /></> : <EmptyState title="No obligations selected">Select unresolved exceptions from the queue.</EmptyState>}
      {draft.body.exceptionIds.length && !validation.success ? <p className="text-sm text-grey-2">{draft.body.reason === null ? 'Choose a classification before review.' : validation.error.issues.map(issue => issue.message).join('. ')}</p> : null}
      <p className="text-sm text-grey-2">Confirmation appends a Manager classification. It does not rewrite the employee's original reason, change the Order ID, move stock or complete Production work.</p>
      <div className="flex flex-wrap justify-between gap-3"><Button variant="secondary" disabled={disabled} onClick={() => { if (review) setReview(false); else if (window.confirm('Discard this reconciliation draft? Original checkout and stock records will remain unchanged.')) change({ exceptionIds: [], reason: null, remarks: '' }); }}>{review ? 'Back to classification' : 'Discard classification draft'}</Button>
        <Button disabled={disabled || !canConfirm} onClick={() => { if (review) void confirm(); else { setReview(true); setSelectionPage(1); } }}>{busy ? 'Recording classification…' : review ? `Confirm classification of ${preview.length} exceptions` : 'Review classification'}</Button></div>
    </div></Panel> : null}
    {tracking ? <UnitTrackingDrawer key={tracking} unitId={tracking} onClose={() => setTracking('')} /> : null}
    {original ? <OriginalCheckout key={original} id={original} onClose={() => setOriginal('')} /> : null}
  </div>;
}
export function ReconciliationWorkspace({ actorId }: { actorId: string }) {
  const config = useApiRead<Config>('reason-reconciliation-config');
  return <Page className="space-y-6"><PageHeader title="Reason reconciliation" description="" />{config.loading ? <DetailSkeleton rows={5} /> : config.error ? <ErrorNotice message={config.error} onRetry={config.refresh} /> : config.data ? <Body actorId={actorId} config={config.data} /> : null}</Page>;
}
