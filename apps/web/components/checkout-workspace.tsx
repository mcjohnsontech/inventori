'use client';
import { LIST_PAGE_SIZE } from '@dayari/contracts';
import { confirmAction } from './ui/confirm';
import { useEffect, useRef, useState } from 'react';
import { checkoutReasonLabels, checkoutSchema, resolveCheckoutLines, type CheckoutCandidate, type CheckoutInput, type CheckoutView, type UnitIdentityLookup } from '@dayari/contracts';
import { api, useApiRead } from '../lib/api';
import { useCheckoutDraft } from '../lib/checkout-draft';
import { useQrPresentation } from '../lib/qr-presentation';
import { formatDateTime, plural } from '../lib/format';
import { CodesOnly } from '../lib/role';
import { ReasonField as Reason } from './reason-field';
import { UnitCameraInput } from './unit-camera-input';
import { Add01Icon, ArrowRight01Icon, Camera01Icon, QrCodeIcon } from '@hugeicons/core-free-icons';
import { Button, Code, DataTable, DetailSkeleton, EmptyState, ErrorNotice, Field, Icon, Input, LinkButton, Page, PageHeader, Pager, Panel, WarningNotice } from './ui';

type Config = { originId: string; limit: number; writeEnabled: boolean };
type History = { page: number; pageSize: number; total: number; checkouts: { id: string; acceptedAt: string; actorName: string; totalUnits: number; outstandingReasonCount: number }[] };
function Accepted({ receipt }: { receipt: CheckoutView }) {
  const [page, setPage] = useState(1);
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => {
    result.current?.scrollIntoView({ block: 'start' });
    const heading = result.current?.querySelector('h2');
    heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
  }, []);
  return <div ref={result} className="scroll-mt-36 lg:scroll-mt-24"><Panel title="Accepted checkout"><div className="space-y-4"><p className="text-sm">{receipt.totalUnits} physical items · {formatDateTime(receipt.acceptedAt)} · {receipt.actor.name}</p>
    <p className="break-all text-xs text-grey-2">Transaction <Code>{receipt.transactionId}</Code></p>
    {receipt.outstandingReasonCount ? <WarningNotice>{receipt.outstandingReasonCount} items require Manager reason reconciliation. Stock was deducted once at checkout.</WarningNotice> : null}
    <DataTable label="Accepted checkout units" rows={receipt.lines.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE)} rowKey={line => line.id} emptyMessage="No units." mobileStack columns={[
      { key: 'code', label: 'Item', cell: line => <Code>{line.unit.unitCode}</Code> },
      { key: 'item', label: 'Product / variant', cell: line => <>{line.unit.productName} · {line.unit.variantName}<CodesOnly><Code className="block">{line.unit.fullSku}</Code></CodesOnly></> },
      { key: 'lot', label: 'Lot / batch', codesOnly: true, cell: line => <>{line.unit.lotCode ?? '—'}<span className="block text-xs text-grey-2">{line.unit.publicBatchCode}</span></> },
      { key: 'reason', label: 'Reason / Order ID', cell: line => <>{line.reason ? checkoutReasonLabels[line.reason.code] : line.reconciliationStatus === 'RESOLVED' ? 'Originally missing · reason added' : 'Manager follow-up required'}{line.reason?.note ? <span className="block break-words text-xs">{line.reason.note}</span> : null}<span className="block break-words text-xs text-grey-2">{line.orderReference ?? 'No Order ID'}</span></> },
    ]} />
    <Pager page={page} pageCount={Math.ceil(receipt.lines.length / LIST_PAGE_SIZE)} total={receipt.lines.length} onChange={setPage} />
    {receipt.exceptionStatusAsOf ? <p className="text-xs text-grey-2">Reason follow-up status refreshed {formatDateTime(receipt.exceptionStatusAsOf)}. Original employee reasons are preserved.</p> : null}
    <p className="text-xs text-grey-2">This is the recorded acceptance result. Balances in that result reflect acceptance time; use stock availability for current quantities. Order IDs are unverified grouping references.</p>
  </div></Panel></div>;
}

function CheckoutBody({ actorId, config }: { actorId: string; config: Config }) {
  const { draft, ready, busy, update, send } = useCheckoutDraft(actorId, config.originId);
  const presentation = useQrPresentation();
  const [input, setInput] = useState(''), [error, setError] = useState(''), [review, setReview] = useState(false), [adding, setAdding] = useState(false);
  const [camera, setCamera] = useState(false), [announcement, setAnnouncement] = useState('');
  const scanForm = useRef<HTMLFormElement>(null), returnFocus = useRef(false);
  const [units, setUnits] = useState<CheckoutCandidate[]>([]), [previewError, setPreviewError] = useState(''), [previewBusy, setPreviewBusy] = useState(false), [revision, setRevision] = useState(0);
  const [historyInput, setHistoryInput] = useState(''), [historyQuery, setHistoryQuery] = useState('');
  const [page, setPage] = useState(1), [historyPage, setHistoryPage] = useState(1), [selected, setSelected] = useState(''), [overrides, setOverrides] = useState<string[]>([]);
  const mounted = useRef(true), addingLatch = useRef(false), request = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => { if (!adding && returnFocus.current && !review) { returnFocus.current = false; scanForm.current?.querySelector('input')?.focus(); } }, [adding, review]);
  const ids = draft.body.lines.map(line => line.unitId), encodedIds = JSON.stringify(ids);
  useEffect(() => {
    const controller = new AbortController(); setUnits([]); setPreviewError(''); setPreviewBusy(ready && ids.length > 0);
    if (ready && ids.length) api<{ units: CheckoutCandidate[] }>('checkouts/preview', { method: 'POST', body: JSON.stringify({ unitIds: ids }), signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setUnits(result.units); }).catch(error => { if (!controller.signal.aborted) setPreviewError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setPreviewBusy(false); });
    return () => controller.abort();
  }, [ready, encodedIds, revision]);
  useEffect(() => { const timer = setTimeout(() => { setHistoryQuery(historyInput.trim()); setHistoryPage(1); }, 250); return () => clearTimeout(timer); }, [historyInput]);
  const history = useApiRead<History>(`checkouts?page=${historyPage}${historyQuery ? '&orderReference=' + encodeURIComponent(historyQuery) : ''}`);
  const accepted = useApiRead<CheckoutView>((selected || draft.acceptedId) ? `checkouts/${selected || draft.acceptedId}` : null);
  const showingSaved = Boolean(selected || draft.acceptedId) && !ids.length && !draft.pending;
  const disabled = busy || adding || Boolean(draft.pending), resolved = resolveCheckoutLines(draft.body);
  const byId = new Map(units.map(unit => [unit.unitId, unit]));
  function change(body: CheckoutInput) { try { update(body); setSelected(''); setError(''); } catch (failure) { setError((failure as Error).message); } }
  async function add(rawInput = input, method: 'CAMERA' | 'QR_INPUT' = 'QR_INPUT') {
    if (addingLatch.current || disabled || !rawInput.trim()) return;
    addingLatch.current = true; returnFocus.current = true; setAdding(true); setError(''); const abort = new AbortController(); request.current = abort;
    try {
      const value = rawInput.trim(), unit = await api<UnitIdentityLookup>(value.startsWith('DYI:') ? 'qr/resolve' : `inventory/units/by-code/${encodeURIComponent(value.toUpperCase())}`,
        value.startsWith('DYI:') ? { method: 'POST', body: JSON.stringify({ payload: value }), signal: abort.signal } : { signal: abort.signal });
      if (unit.payloadVersion !== 2 || !unit.unitId) throw Error('This is a shared batch label. Scan the label that shows this item’s own code.');
      if (value.startsWith('DYI:2:')) presentation.record({ payload: value, method });
      if (unit.availability !== 'USABLE') throw Error('This unit is not available for checkout.');
      if (ids.includes(unit.unitId)) throw Error(`${unit.unitCode} is already in this checkout.`);
      if (ids.length >= config.limit) throw Error(`Confirm at most ${config.limit} units in one checkout. Use a separate explicit checkout for more.`);
      if (mounted.current) { change({ ...draft.body, lines: [...draft.body.lines, { unitId: unit.unitId }] }); setInput(''); setAnnouncement(`Added ${unit.unitCode}. ${ids.length + 1} items selected.`); setPage(Math.ceil((ids.length + 1) / 12)); }
    } catch (failure) { if (mounted.current && !abort.signal.aborted) setError((failure as Error).message); }
    finally { addingLatch.current = false; if (mounted.current) setAdding(false); }
  }
  async function confirm() {
    setError(''); try { await send(); if (mounted.current) { setReview(false); setSelected(''); history.refresh(); } }
    catch (failure) { if (mounted.current) setError((failure as Error).message); }
  }
  const missing = resolved.filter(line => line.reason === null).length;
  const validation = checkoutSchema.safeParse(draft.body);
  const valid = validation.success && !previewBusy && !previewError && units.length === ids.length && units.every(unit => unit.eligible);
  return <div className="space-y-5">
    {showingSaved ? <><div aria-live="polite">{accepted.loading ? <DetailSkeleton rows={3} /> : accepted.error ? <ErrorNotice message={accepted.error} onRetry={accepted.refresh} /> : accepted.data ? <Accepted key={accepted.data.id} receipt={accepted.data} /> : null}</div><Button onClick={() => change({ reason: null, orderReference: null, lines: [] })}>Start another checkout</Button></> : null}
    {!ready ? <DetailSkeleton rows={4} /> : showingSaved ? null : <Panel title={review ? 'Review checkout' : 'Items to check out'}>
      <div className="space-y-5">
        {error ? <ErrorNotice message={error} /> : null}
        {presentation.state === 'error' ? <ErrorNotice message={`Item identification is available, but the scan wasn't saved to history: ${presentation.error}`} onRetry={presentation.retry} /> : null}
        {draft.pending ? <WarningNotice>We couldn't confirm your last checkout was saved. Retry it before changing anything; it won't be counted twice. <Button className="mt-2" disabled={busy} onClick={() => void confirm()}>{busy ? 'Checking confirmation…' : 'Retry saved confirmation'}</Button></WarningNotice> : null}
        {!review ? <>
          <form ref={scanForm} className="flex flex-col items-end gap-3 sm:flex-row" onSubmit={event => { event.preventDefault(); void add(); }}>
            <Field className="w-full" label="Scan or type an item code">{id => <Input id={id} value={input} disabled={disabled || adding} autoComplete="off" onChange={event => setInput(event.target.value)} placeholder="Scan a label, or type a code like A7K2M9" />}</Field>
            <Button type="submit" className="shrink-0" disabled={disabled || adding || !input.trim()}><Icon icon={Add01Icon} size={16} />{adding ? 'Finding item…' : 'Add item'}</Button>
          </form>
          <p role="status" aria-live="polite" className="text-sm text-brand">{announcement}</p>
          {camera ? <UnitCameraInput onClose={() => setCamera(false)} onRead={payload => { setCamera(false); void add(payload, 'CAMERA'); }} /> : <Button variant="secondary" disabled={disabled} onClick={() => setCamera(true)}><Icon icon={Camera01Icon} size={16} />Use camera</Button>}
          <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
            <Reason label="Checkout reason" value={draft.body.reason} disabled={disabled} onChange={reason => change({ ...draft.body, reason: reason ?? null })} />
            <Field label="Order ID (optional)" hint="Not checked against orders. The same ID can be used on other checkouts.">{id => <Input id={id} value={draft.body.orderReference ?? ''} maxLength={120} disabled={disabled} onChange={event => change({ ...draft.body, orderReference: event.target.value || null })} />}</Field>
          </div>
        </> : null}
        {previewError ? <ErrorNotice message={previewError} onRetry={() => setRevision(value => value + 1)} /> : previewBusy ? <DetailSkeleton rows={3} /> : !ids.length ? <EmptyState title="No items yet" icon={QrCodeIcon}>Scan each item's label or type its code above. Nothing leaves stock until you confirm.</EmptyState> : <>
          <p className="text-sm">{ids.length} exact physical items · {missing} without a reason</p>
          {resolved.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE).map(line => { const unit = byId.get(line.unitId); return <section key={line.unitId} className="rounded-lg border border-black/10 p-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><Code className="text-base font-semibold">{unit?.unitCode ?? 'Identity unavailable'}</Code><h3 className="mt-1 font-semibold">{unit?.productName} · {unit?.variantName}</h3><CodesOnly><Code className="block break-all text-xs">{unit?.fullSku}</Code><p className="mt-1 text-xs text-grey-2">{unit?.lotCode ? `${unit.lotCode} · ` : ''}{unit?.publicBatchCode}</p></CodesOnly></div>
              {!review ? <Button variant="ghost" disabled={disabled} onClick={() => { change({ ...draft.body, lines: draft.body.lines.filter(item => item.unitId !== line.unitId) }); setPage(1); }}>Remove {unit?.unitCode ?? 'item'}</Button> : null}</div>
            {unit && !unit.eligible ? <p role="alert" className="mt-2 text-sm text-danger">No longer usable. Remove this item before review.</p> : null}
            <p className="mt-3 break-words text-sm">{line.reason ? checkoutReasonLabels[line.reason.code] : 'Reason missing — Manager follow-up'}{line.reason?.note ? ` · ${line.reason.note}` : ''} · {line.orderReference ?? 'No Order ID'}</p>
            {!review ? <><Button variant="ghost" disabled={disabled} onClick={() => setOverrides(current => current.includes(line.unitId) ? current.filter(id => id !== line.unitId) : [...current, line.unitId])}>Edit item reference and reason</Button>
              {overrides.includes(line.unitId) ? <div className="mt-3 grid gap-4 md:grid-cols-2"><Reason inherited label={`Reason for ${unit?.unitCode ?? 'item'}`} value={draft.body.lines[line.ordinal - 1]?.reason} disabled={disabled}
                onChange={reason => change({ ...draft.body, lines: draft.body.lines.map(item => item.unitId === line.unitId ? { ...item, reason } : item) })} />
                <div className="space-y-2"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.body.lines[line.ordinal - 1]?.orderReference === undefined} disabled={disabled} onChange={event => change({ ...draft.body, lines: draft.body.lines.map(item => item.unitId === line.unitId ? { ...item, orderReference: event.target.checked ? undefined : null } : item) })} />Use session Order ID</label>
                  {draft.body.lines[line.ordinal - 1]?.orderReference !== undefined ? <Field label={`Order ID for ${unit?.unitCode ?? 'item'}`}>{id => <Input id={id} value={line.orderReference ?? ''} disabled={disabled} maxLength={120} onChange={event => change({ ...draft.body, lines: draft.body.lines.map(item => item.unitId === line.unitId ? { ...item, orderReference: event.target.value || null } : item) })} />}</Field> : null}</div></div> : null}</> : null}
          </section>; })}
          <Pager page={Math.min(page, Math.max(1, Math.ceil(ids.length / LIST_PAGE_SIZE)))} pageCount={Math.ceil(ids.length / LIST_PAGE_SIZE)} total={ids.length} onChange={setPage} />
        </>}
        {review && missing ? <WarningNotice>{missing} items have no reason. Confirmation will create Manager follow-up obligations and block daily closing until resolved.</WarningNotice> : null}
        {ids.length && !validation.success ? <p role="status" className="text-sm text-grey-2">{validation.error.issues.map(issue => issue.message).join(". ")}</p> : null}
        <div className="flex flex-wrap justify-between gap-3">
          <Button variant="secondary" disabled={disabled || !ids.length} onClick={() => { if (review) setReview(false); else void confirmAction('Discard this checkout draft? No stock has been changed.').then(ok => { if (ok) { change({ reason: null, orderReference: null, lines: [] }); setPage(1); } }); }}>{review ? 'Back to items' : 'Discard draft'}</Button>
          <Button disabled={disabled || adding || !valid} onClick={() => { if (review) void confirm(); else { setReview(true); setPage(1); } }}>{busy ? 'Confirming…' : review ? `Confirm checkout of ${ids.length} items` : 'Review checkout'}</Button>
        </div>
        {!ids.length && !review ? <p className="text-right text-xs text-grey-3">Add at least one item to review the checkout.</p> : null}
        <p className="text-xs text-grey-2">Your draft is kept in this browser until you confirm or discard it. Confirming checks out all listed items together.</p>
      </div>
    </Panel>}
    {!showingSaved ? accepted.loading ? <DetailSkeleton rows={3} /> : accepted.error ? <ErrorNotice message={accepted.error} onRetry={accepted.refresh} /> : accepted.data ? <Accepted key={accepted.data.id} receipt={accepted.data} /> : null : null}
    <Panel title="Recent checkouts" action={<a href="#checkoutHistory" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline">All checkout history<Icon icon={ArrowRight01Icon} size={14} strokeWidth={2} /></a>}>{history.loading ? <DetailSkeleton rows={4} /> : history.error ? <ErrorNotice message={history.error} onRetry={history.refresh} /> : history.data ? <>
      <DataTable label="Checkout history" rows={history.data.checkouts} rowKey={row => row.id} emptyMessage="No checkouts yet." mobileStack columns={[
        { key: 'date', label: 'Received', cell: row => formatDateTime(row.acceptedAt) }, { key: 'actor', label: 'Confirmed by', cell: row => row.actorName },
        { key: 'count', label: 'Items', cell: row => row.outstandingReasonCount ? `${plural(row.totalUnits, 'item')} · ${row.outstandingReasonCount} need a reason` : plural(row.totalUnits, 'item') },
        { key: 'open', label: '', cell: row => <LinkButton aria-label="View checkout" onClick={() => setSelected(row.id)}>Details<Icon icon={ArrowRight01Icon} size={14} strokeWidth={2} /></LinkButton> },
      ]} /><Pager page={historyPage} pageCount={Math.ceil(history.data.total / history.data.pageSize)} total={history.data.total} onChange={setHistoryPage} />
    </> : null}</Panel>
  </div>;
}

export function CheckoutWorkspace({ actorId }: { actorId: string }) {
  const config = useApiRead<Config>('checkout-config');
  return <Page className="space-y-6"><PageHeader title="Product checkout" description="" />{config.loading ? <DetailSkeleton rows={4} /> : config.error ? <ErrorNotice message={config.error} onRetry={config.refresh} /> : config.data?.writeEnabled ? <CheckoutBody actorId={actorId} config={config.data} /> : <EmptyState title="Checkout isn't available here">Checkouts can only be recorded on the shop server.</EmptyState>}</Page>;
}

export { Accepted as CheckoutAcceptance };
