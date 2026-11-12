'use client';
import { useEffect, useRef, useState } from 'react';
import type { CompletionSessions, CompletionCandidate, CompletionView, UnitIdentityLookup } from '@dayari/contracts';
import { api, useApiRead } from '../lib/api';
import { useCompletionDraft } from '../lib/completion-draft';
import { useQrPresentation } from '../lib/qr-presentation';
import { formatDateTime } from '../lib/format';
import { Badge, Button, Code, DataTable, DetailsDrawer, DetailSkeleton, EmptyState, ErrorNotice, Field, Input, Page, PageHeader, Pager, Panel, SearchInput, WarningNotice } from './ui';
import { UnitCameraInput } from './unit-camera-input';
import { UnitTrackingDrawer } from './unit-tracking-drawer';
type Config = {
    originId: string;
    limit: number;
    canConfirm: boolean;
    adminUpgradeRequired?: boolean;
};
type Options = {
    page: number;
    pageSize: number;
    total: number;
    units: CompletionCandidate[];
};
type History = {
    page: number;
    pageSize: number;
    total: number;
    rows: {
        id: string;
        recordedAt: string;
        unitCount: number;
        managerName: string;
    }[];
};
function Evidence({ value, onTrack }: {
    value: CompletionView;
    onTrack: (id: string) => void;
}) {
    const [page, setPage] = useState(1), root = useRef<HTMLDivElement>(null);
    useEffect(() => { const h = root.current?.querySelector('h2'); h?.setAttribute('tabindex', '-1'); h?.focus({ preventScroll: true }); root.current?.scrollIntoView({ block: 'start' }); }, []);
    return <div ref={root} className="scroll-mt-36 max-sm:[&_td]:!block max-sm:[&_td]:before:!hidden max-sm:[&_td>div]:!text-left"><Panel title="Production completion recorded"><div className="space-y-4"><Badge tone="neutral">Completed  /  {value.lines.length} selected {value.lines.length===1?'item':'items'}</Badge><p className="text-sm">{value.manager.name}  /  {formatDateTime(value.recordedAt)}</p><p className="text-sm">These items moved from In Production to Completed. Usable stock was not deducted again.</p><p className="break-all text-xs text-grey-2">Completion {value.id}</p><DataTable label="Completed units" mobileStack rows={value.lines.slice((page - 1) * 12, page * 12)} rowKey={row => row.id} emptyMessage="No units" columns={[
            { key: 'unit', label: 'Exact item', cell: row => <><button className="min-h-11 font-mono text-brand underline" onClick={() => onTrack(row.unit.unitId)}>{row.unit.unitCode}</button><span className="block">{row.unit.productName}  /  {row.unit.variantName}</span><Code className="text-xs">{row.unit.fullSku}</Code></> },
            { key: 'checkout', label: 'Original checkout', cell: row => <><span className="block">{row.recordedHolder.name}</span><span className="block">{row.orderReference ?? 'No Order ID'}</span><span className="block break-all text-xs text-grey-2">{row.checkoutId}</span></> },
            { key: 'lot', label: 'Lot / batch', cell: row => <>{row.unit.lotCode ?? 'Historical lot'}<span className="block text-xs">{row.unit.publicBatchCode}</span></> }
        ]}/><Pager page={page} pageCount={Math.ceil(value.lines.length / 12)} total={value.lines.length} onChange={setPage}/><p className="text-xs text-grey-2">Other items under the same Order ID remain unchanged. Later checkout sessions are independent.</p></div></Panel></div>;
}
function CompletionDetail({ id, onClose, onTrack }: {
    id: string;
    onClose: () => void;
    onTrack: (id: string) => void;
}) { const read = useApiRead<CompletionView>('completions/' + id); return <DetailsDrawer title="Completion evidence" eyebrow="Production" closeLabel="Close completion details" onClose={onClose}>{read.loading ? <DetailSkeleton /> : read.error ? <ErrorNotice message={read.error} onRetry={read.refresh}/> : read.data ? <Evidence value={read.data} onTrack={onTrack}/> : null}</DetailsDrawer>; }
function Content({ actorId, config }: {
    actorId: string;
    config: Config;
}) {
    const { saved, ready, busy, update, send } = useCompletionDraft(actorId, config.originId), [review, setReview] = useState(false), [input, setInput] = useState(''), [error, setError] = useState(''), [adding, setAdding] = useState(false), [camera, setCamera] = useState(false), [query, setQuery] = useState(''), [workPage, setWorkPage] = useState(1), [historyPage, setHistoryPage] = useState(1), [selectedPage, setSelectedPage] = useState(1), [revision, setRevision] = useState(0), [detail, setDetail] = useState<string | null>(null), [tracking, setTracking] = useState<string | null>(null);
    const [session,setSession]=useState(''),[sessionPage,setSessionPage]=useState(1);
    const [confirmed,setConfirmed]=useState<CompletionView|null>(null);
    const sessions=useApiRead<CompletionSessions>(`completion-sessions?page=${sessionPage}&query=${encodeURIComponent(query)}`);
    const work = useApiRead<Options>(session?`completion-options?checkoutId=${encodeURIComponent(session)}&page=${workPage}`:null), history = useApiRead<History>(`completions?page=${historyPage}`), accepted = useApiRead<CompletionView>(saved.acceptedId && confirmed?.id!==saved.acceptedId ? 'completions/' + saved.acceptedId : null), presentation = useQrPresentation();
    const [units, setUnits] = useState<CompletionCandidate[]>([]), [previewError, setPreviewError] = useState(''), [loading, setLoading] = useState(false), mounted = useRef(true), latch = useRef(false), request = useRef<AbortController | null>(null);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
    useEffect(() => { if (saved.pending)
        setReview(true); }, [saved.pending]);
    const ids = JSON.stringify(saved.body.unitIds);
    useEffect(() => { const controller = new AbortController(); setUnits([]); setPreviewError(''); setLoading(ready && saved.body.unitIds.length > 0); if (ready && saved.body.unitIds.length)
        api<{
            units: CompletionCandidate[];
        }>('completions/preview', { method: 'POST', body: JSON.stringify(saved.body), signal: controller.signal }).then(value => { if (!controller.signal.aborted)
            setUnits(value.units); }).catch(failure => { if (!controller.signal.aborted)
            setPreviewError(failure.message); }).finally(() => { if (!controller.signal.aborted)
            setLoading(false); }); return () => controller.abort(); }, [ids, ready, revision]);
    const disabled = busy || adding || !!saved.pending, showingSaved = !!saved.acceptedId && !saved.body.unitIds.length;
    function change(unitIds: string[]) { try {
        update({ unitIds });
        setError('');
        setSelectedPage(1);
    }
    catch (failure) {
        setError((failure as Error).message);
    } }
    function select(id: string) { if (disabled)
        return; if (saved.body.unitIds.includes(id))
        return; if (saved.body.unitIds.length >= config.limit) {
        setError(`Select at most ${config.limit} items.`);
        return;
    } change([...saved.body.unitIds, id]); }
    async function add(value = input, method: 'CAMERA' | 'QR_INPUT' = 'QR_INPUT') { if (disabled || latch.current || !value.trim())
        return; latch.current = true; setAdding(true); setError(''); const controller = new AbortController(); request.current = controller; try {
        const code = value.trim(), identity = await api<UnitIdentityLookup>(code.startsWith('DYI:') ? 'qr/resolve' : `inventory/units/by-code/${encodeURIComponent(code.toUpperCase())}`, code.startsWith('DYI:') ? { method: 'POST', body: JSON.stringify({ payload: code }), signal: controller.signal } : { signal: controller.signal });
        if (identity.payloadVersion !== 2 || !identity.unitId)
            throw Error('Use an individual-unit QR or six-character Unit Code.');
        if (code.startsWith('DYI:2:'))
            presentation.record({ payload: code, method });
        if (saved.body.unitIds.includes(identity.unitId))
            throw Error('This item is already selected.');
        await api('completions/preview', { method: 'POST', body: JSON.stringify({ unitIds: [identity.unitId] }), signal: controller.signal });
        if (mounted.current) {
            select(identity.unitId);
            setInput('');
        }
    }
    catch (failure) {
        if (mounted.current && !controller.signal.aborted)
            setError((failure as Error).message);
    }
    finally {
        latch.current = false;
        if (mounted.current)
            setAdding(false);
    } }
    async function confirm() { setError(''); try {
        const result=await send(saved.body);
        if (mounted.current) {
            setConfirmed(result);
            setReview(false);
            work.refresh();
            sessions.refresh();
            history.refresh();
            setRevision(value => value + 1);
        }
    }
    catch (failure) {
        if (mounted.current) {
            setError((failure as Error).message);
            setRevision(value => value + 1);
        }
    } }
    const [taskOpen,setTaskOpen]=useState(false);
    useEffect(()=>{if(ready&&(saved.body.unitIds.length||saved.pending))setTaskOpen(true);},[ready,saved.pending]);
    const canConfirm = units.length === saved.body.unitIds.length && units.length > 0 && !loading && !previewError;
    return <div className="space-y-5 max-sm:[&_td]:!block max-sm:[&_td]:before:!hidden max-sm:[&_td>div]:!text-left">{config.adminUpgradeRequired?<WarningNotice>Admin completion requires the separately approved shop database upgrade. Manager completion remains available.</WarningNotice>:null}{error&&!taskOpen ? <ErrorNotice message={error}/> : null}{presentation.state === 'error' ? <ErrorNotice message={`QR identified; presentation evidence was not confirmed: ${presentation.error}`} onRetry={presentation.retry}/> : null}
 {showingSaved && confirmed?.id===saved.acceptedId ? <><Evidence value={confirmed} onTrack={setTracking}/>{config.canConfirm?<Button variant="secondary" onClick={()=>change([])}>Start another completion</Button>:null}</> : showingSaved ? accepted.loading ? <DetailSkeleton /> : accepted.error ? <ErrorNotice message={accepted.error} onRetry={accepted.refresh}/> : accepted.data ? <><Evidence value={accepted.data} onTrack={setTracking}/>{config.canConfirm ? <Button variant="secondary" onClick={() => change([])}>Start another completion</Button> : null}</> : null : null}
 {config.canConfirm && !showingSaved && ready ? <><div className="flex flex-wrap items-center gap-3"><Button onClick={()=>{setReview(false);setTaskOpen(true);}}>Complete production items</Button>{saved.body.unitIds.length?<Button variant="secondary" disabled={busy||(!saved.pending&&!canConfirm)} onClick={()=>{setReview(true);setTaskOpen(true);}}>Review {saved.body.unitIds.length} selected items</Button>:null}</div>{taskOpen?<DetailsDrawer title="Complete selected production units" eyebrow="Production completion" closeLabel="Close completion review" active={!tracking} onClose={()=>{if(busy||adding)return;setCamera(false);setTaskOpen(false);setReview(false);}} wide><Panel title={review ? 'Review selected completion' : 'Select items to complete'}><div className="space-y-4">{error?<ErrorNotice message={error}/>:null}
 {saved.pending && !busy ? <WarningNotice>The response is unresolved. Retry the saved selection with the same key.<Button onClick={() => void confirm()} disabled={busy}>Retry saved completion</Button></WarningNotice> : null}
 {!review ? <><form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void add(); }}><Field label="Completion Unit Code or individual QR" className="min-w-0 flex-1">{id => <Input id={id} value={input} disabled={disabled} onChange={event => setInput(event.target.value)} maxLength={100}/>}</Field><Button type="submit" disabled={disabled || !input.trim()}>Add unit</Button></form><Button variant="secondary" disabled={disabled} onClick={() => setCamera(true)}>Scan with camera</Button>{camera ? <UnitCameraInput onRead={payload => { setCamera(false); void add(payload, 'CAMERA'); }} onClose={() => setCamera(false)}/> : null}</> : <p className="text-sm">Confirm only these exact items. Other items sharing an Order ID will remain unchanged. No second usable-stock deduction.</p>}
 {loading ? <DetailSkeleton rows={3}/> : previewError ? <ErrorNotice message={previewError} onRetry={() => setRevision(value => value + 1)}/> : null}
 <DataTable label="Selected completion units" mobileStack rows={units.slice((selectedPage - 1) * 12, selectedPage * 12)} rowKey={row => row.unit.unitId} emptyMessage="Choose exact In Production items from the list or scan their labels." columns={[
                { key: 'unit', label: 'Exact item', cell: row => <><button className="min-h-11 font-mono text-brand underline" onClick={() => setTracking(row.unit.unitId)}>{row.unit.unitCode}</button><span className="block">{row.unit.productName}  /  {row.unit.variantName}</span><Code className="text-xs">{row.unit.fullSku}</Code></> },
                { key: 'context', label: 'Checkout / lot', cell: row => <><span className="block">{row.holder?.name}</span><span className="block text-xs text-grey-2">Checkout {row.checkoutId?.slice(0,8)}</span><span className="block">{row.orderReference ?? 'No Order ID'}</span><span className="block text-xs">{row.unit.lotCode ?? 'Historical lot'}  /  {row.unit.publicBatchCode}</span></> },
                { key: 'action', label: 'Selection', cell: row => <Button variant="secondary" disabled={disabled || review} onClick={() => change(saved.body.unitIds.filter(id => id !== row.unit.unitId))}>Remove {row.unit.unitCode}</Button> }
            ]}/><Pager page={selectedPage} pageCount={Math.ceil(units.length / 12)} total={units.length} onChange={setSelectedPage}/>
 {previewError && !review && !saved.pending ? saved.body.unitIds.slice((selectedPage-1)*12,selectedPage*12).map(id => <Button key={id} variant="secondary" onClick={() => change(saved.body.unitIds.filter(value => value !== id))}>Remove unavailable item {id}</Button>) : null}{previewError&&!review&&!saved.pending?<Pager page={selectedPage} pageCount={Math.ceil(saved.body.unitIds.length/12)} total={saved.body.unitIds.length} onChange={setSelectedPage}/>:null}
 <div className="flex flex-wrap gap-3">{review ? <><Button variant="secondary" disabled={disabled} onClick={() => setReview(false)}>Back to selection</Button><Button disabled={busy || (!saved.pending && !canConfirm)} onClick={() => void confirm()}>{busy ? 'Recording completion...' : 'Confirm selected completion'}</Button></> : <><Button disabled={disabled || !canConfirm} onClick={() => setReview(true)}>Review completion</Button><Button variant="secondary" disabled={disabled || !saved.body.unitIds.length} onClick={() => { if (window.confirm('Discard this completion draft?'))
            change([]); }}>Discard completion draft</Button></>}</div>
 </div></Panel></DetailsDrawer>:null}</> : null}
 {!review ? <><Panel title="Open checkout sessions"><div className="space-y-4"><SearchInput label="Find In Production items" placeholder="Product, employee, Unit Code or Order ID…" value={query} onChange={value=>{setQuery(value);setSession('');setSessionPage(1);setWorkPage(1);}}/>
 <p className="text-sm text-grey-2">Open a checkout, select the finished items, then review and confirm. Order IDs may be reused; each checkout remains separate.</p>
 {sessions.error?<ErrorNotice message={sessions.error} onRetry={sessions.refresh}/>:null}<DataTable label="Open completion sessions" mobileStack loading={sessions.loading} rows={sessions.data?.rows??[]} rowKey={row=>row.id} emptyMessage="No matching checkout sessions remain In Production." columns={[
 {key:'session',label:'Checkout',cell:row=><><Button variant="secondary" onClick={()=>{setSession(row.id);setWorkPage(1);}}>Open session {row.id.slice(0,8)}</Button><p className="text-xs text-grey-2">{formatDateTime(row.acceptedAt)}</p></>},
 {key:'employee',label:'Employee / Order ID',cell:row=><>{row.employeeName}<p className="text-sm break-words">{row.orderReferences.length?row.orderReferences.join(' · '):'No Order ID'}</p></>},
 {key:'remaining',label:'Matching In Production items',cell:row=>row.remaining},
 ]}/>{sessions.data?<Pager page={sessionPage} pageCount={Math.ceil(sessions.data.total/sessions.data.pageSize)} total={sessions.data.total} onChange={setSessionPage}/>:null}</div></Panel>
 {session?<Panel title="Items in selected checkout"><div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><Code>Session {session.slice(0,8)}</Code><Button variant="secondary" onClick={()=>setSession('')}>Back to sessions</Button></div><p className="text-sm text-grey-2">All eligible items in this checkout. Select only the finished items.</p>{work.error ? <ErrorNotice message={work.error} onRetry={work.refresh}/> : null}<DataTable label="Eligible production items" mobileStack loading={work.loading} rows={work.data?.units ?? []} rowKey={row => row.unit.unitId} emptyMessage="No eligible In Production items match." columns={[
                { key: 'item', label: 'Item', cell: row => <><button className="min-h-11 font-mono text-brand underline" onClick={() => setTracking(row.unit.unitId)}>{row.unit.unitCode}</button><span className="block">{row.unit.productName}  /  {row.unit.variantName}</span><Code className="text-xs">{row.unit.fullSku}</Code></> },
                { key: 'holder', label: 'Checkout', cell: row => <>{row.holder?.name}<span className="block">{row.orderReference ?? 'No Order ID'}</span><span className="block text-xs">{row.unit.publicBatchCode}</span></> },
                { key: 'select', label: 'Action', cell: row => config.canConfirm ? <Button variant="secondary" disabled={disabled || saved.body.unitIds.includes(row.unit.unitId)} onClick={() => select(row.unit.unitId)}>{saved.body.unitIds.includes(row.unit.unitId) ? 'Selected' : `Select ${row.unit.unitCode}`}</Button> : <Badge tone="neutral">Review only</Badge> }
            ]}/>{work.data ? <Pager page={workPage} pageCount={Math.ceil(work.data.total / work.data.pageSize)} total={work.data.total} onChange={setWorkPage}/> : null}</div></Panel>:null}
 <Panel title="Completion history">{history.error ? <ErrorNotice message={history.error} onRetry={history.refresh}/> : null}<DataTable label="Completion history" mobileStack loading={history.loading} rows={history.data?.rows ?? []} rowKey={row => row.id} emptyMessage="No completion confirmations recorded." columns={[
                { key: 'date', label: 'Recorded', cell: row => <>{formatDateTime(row.recordedAt)}<span className="block text-xs">{row.managerName}</span></> }, { key: 'count', label: 'Selected items', cell: row => row.unitCount }, { key: 'view', label: 'Evidence', cell: row => <Button variant="secondary" onClick={() => setDetail(row.id)}>View completion</Button> }
            ]}/>{history.data ? <Pager page={historyPage} pageCount={Math.ceil(history.data.total / history.data.pageSize)} total={history.data.total} onChange={setHistoryPage}/> : null}</Panel></> : null}
 {detail && !tracking ? <CompletionDetail id={detail} onClose={() => setDetail(null)} onTrack={setTracking}/> : null}{tracking ? <UnitTrackingDrawer unitId={tracking} onClose={() => setTracking(null)}/> : null}
 </div>;
}
export function CompletionWorkspace({ actorId }: {
    actorId: string;
}) { const config = useApiRead<Config>('completion-config'); return <Page className="space-y-6"><PageHeader title="Production completion" description=""/>{config.loading ? <DetailSkeleton /> : config.error ? <ErrorNotice message={config.error} onRetry={config.refresh}/> : config.data ? <Content actorId={actorId} config={config.data}/> : <EmptyState title="Completion unavailable">Reconnect and retry.</EmptyState>}</Page>; }
