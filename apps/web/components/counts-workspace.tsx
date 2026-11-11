'use client';
import {TaskModal} from './ui/task-modal';
import { useEffect, useRef, useState } from 'react';
import type { CountView, OperationalStock, UnitIdentityLookup } from '@dayari/contracts';
import { api, useApiRead, ApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Badge, Button, Code, DataTable, DetailSkeleton, ErrorNotice, Field, Input, Page, PageHeader, Pager, Panel, Select, WarningNotice } from './ui';
type Pending = {
    path: string;
    body: object;
    key: string;
};
export function CountsWorkspace({ actorId }: {
    actorId: string;
}) {
    const config = useApiRead<{
        originId: string;
        canCount: boolean;
    }>('count-config');
    return <Page className="space-y-6"><PageHeader title="Targeted physical counts" description=""/>{config.loading ? <DetailSkeleton /> : config.error ? <ErrorNotice message={config.error} onRetry={config.refresh}/> : config.data ? <Content actorId={actorId} config={config.data}/> : null}</Page>;
}
function Content({ actorId, config }: {
    actorId: string;
    config: {
        originId: string;
        canCount: boolean;
    };
}) {
    const [page, setPage] = useState(1), [selected, setSelected] = useState(''), [lotId, setLotId] = useState(''), [state, setState] = useState('U'), [purpose, setPurpose] = useState(''), [code, setCode] = useState(''), [quantity, setQuantity] = useState('0'), [extras, setExtras] = useState('0'), [explanation, setExplanation] = useState(''), [evidence, setEvidence] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [observationPage, setObservationPage] = useState(1), [attemptPage, setAttemptPage] = useState(1);
    const [taskOpen,setTaskOpen]=useState(false);
    const key = `dayari-count-${config.originId}-${actorId}`, pending = useRef<Pending | null>(null), controller = useRef<AbortController | null>(null);
    const history = useApiRead<{
        rows: CountView[];
        total: number;
        pageSize: number;
    }>(`counts?page=${page}`), detail = useApiRead<CountView>(selected ? 'counts/' + selected : null), stock = useApiRead<OperationalStock>(config.canCount ? 'stock' : null);
    useEffect(() => { try {
        const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
        if (saved) {
            setSelected(saved.selected ?? '');if(saved.selected||saved.pending||saved.purpose)setTaskOpen(true);
            setLotId(saved.lotId ?? '');
            setState(saved.state ?? 'U');
            setPurpose(saved.purpose ?? '');
            setQuantity(saved.quantity ?? '0');
            setExtras(saved.extras ?? '0');
            setExplanation(saved.explanation ?? '');
            setEvidence(saved.evidence ?? '');
            pending.current = saved.pending ?? null;
            if (pending.current)
                setError('An earlier request may have been accepted. Retry it with its saved key.');
        }
    }
    catch { } setReady(true); return () => controller.current?.abort(); }, [key]);
    useEffect(() => { if (ready)
        sessionStorage.setItem(key, JSON.stringify({ selected, lotId, state, purpose, quantity, extras, explanation, evidence, pending: pending.current })); }, [ready, key, selected, lotId, state, purpose, quantity, extras, explanation, evidence, busy, error]);
    useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (pending.current || purpose || explanation || evidence) {
        e.preventDefault();
    } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [purpose, explanation, evidence]);
    async function send(p: Pending) { controller.current?.abort(); const abort = new AbortController(); controller.current = abort; pending.current = p; sessionStorage.setItem(key, JSON.stringify({ selected, lotId, state, purpose, quantity, extras, explanation, evidence, pending: p })); setBusy(true); setError(''); try {
        const value = await api<{
            id: string;
            status?: string;
        }>(p.path, { method: 'POST', headers: { 'Idempotency-Key': p.key }, body: JSON.stringify(p.body), signal: abort.signal });
        if (abort.signal.aborted)
            return;
        pending.current = null;
        if (p.path === 'count-sessions') {
            setSelected(value.id);
            setPurpose('');
        }
        if(p.path==='count-results'){setQuantity('0');setExtras('0');setExplanation('');setEvidence('');}
        if (p.path === 'count-attempts') {
            setQuantity('0');
            setExtras('0');
            setExplanation('');
            setEvidence('');
            setObservationPage(1);
        }
        setCode('');
        detail.refresh();
        history.refresh();
    }
    catch (e) {
        if (!abort.signal.aborted) {
            if (e instanceof ApiError && e.status >= 400 && e.status < 500)
                pending.current = null;
            setError((e as Error).message);
        }
    }
    finally {
        if (!abort.signal.aborted)
            setBusy(false);
    } }
    function write(path: string, body: object) { if (!pending.current)
        void send({ path, body, key: crypto.randomUUID() }); }
    function chooseCount(id:string){if(blocked)return;if(id===selected){setTaskOpen(true);return;}if(id!==selected&&(purpose||explanation||evidence||extras!=='0'||quantity!=='0')&&!window.confirm('Discard these unsaved count form fields? Saved count evidence is preserved.'))return;setTaskOpen(true);setSelected(id);setObservationPage(1);setAttemptPage(1);setPurpose('');setExplanation('');setEvidence('');setExtras('0');setQuantity('0');}
    async function observe() { if (!attempt || pending.current || busy)
        return; setBusy(true); setError(''); const abort = new AbortController(); controller.current = abort; try {
        const value = code.trim(), u = await api<UnitIdentityLookup>(value.startsWith('DYI:') ? 'qr/resolve' : 'inventory/units/by-code/' + encodeURIComponent(value.toUpperCase()), value.startsWith('DYI:') ? { method: 'POST', body: JSON.stringify({ payload: value }), signal: abort.signal } : { signal: abort.signal });
        if (!u.unitId)
            throw Error('Use an individual unit label, not a shared lot QR.');
        if (u.lotId !== detail.data?.lotId)
            throw Error('This item belongs to another lot. It was not added.');
        if (!abort.signal.aborted)
            await send({ path: 'count-observations', body: { attemptId: attempt.id, unitIds: [u.unitId] }, key: crypto.randomUUID() });
    }
    catch (e) {
        if (!abort.signal.aborted) {
            if (e instanceof ApiError && e.status >= 400 && e.status < 500)
                pending.current = null;
            setError((e as Error).message);
        }
    }
    finally {
        if (!abort.signal.aborted)
            setBusy(false);
    } }
    const attempts = detail.data?.attempts ?? [], attempt = attempts.at(-1), native = attempt?.snapshot.mode === 'NATIVE', blocked = busy || !!pending.current || !ready;
    return <div className="space-y-6">{!taskOpen && error ? <ErrorNotice message={error}/> : null}{!taskOpen && pending.current ? <Button disabled={busy} onClick={() => void send(pending.current!)}>Retry saved count request</Button> : null}
 <Button variant="secondary" disabled={busy} onClick={()=>{detail.refresh();history.refresh();}}>Refresh count evidence</Button><WarningNotice>Counts record physical evidence only. They never adjust stock. Unresolved count evidence or discrepancies block closing. A relevant stock movement requires recounting.</WarningNotice>
 {config.canCount?<Button disabled={blocked} onClick={()=>setTaskOpen(true)}>Count stock</Button>:null}
 <TaskModal title="Physical stock count" open={taskOpen} busy={busy} onClose={()=>setTaskOpen(false)}>
 {error?<ErrorNotice message={error}/>:null}{pending.current?<Button disabled={busy} onClick={()=>void send(pending.current!)}>Retry saved count request</Button>:null}
 {config.canCount && !selected ? <Panel title="Select a count scope"><div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>*]:min-w-0"><Field label="Delivery lot">{id=><Select id={id} label="Delivery lot" value={lotId} onChange={setLotId} options={(stock.data?.lots ?? []).map(l => ({ value: l.lotId, label: `${l.productName} / ${l.variantName} / ${l.fullCode} / ${l.lotCode ?? l.publicCode}` }))}/>}</Field><Field label="Count state">{id=><Select id={id} label="Count state" value={state} onChange={setState} options={[['U', 'Usable'], ['P', 'In Production'], ['D', 'Damaged'], ['C', 'Completed'], ['X', 'Removed']].map(([value, label]) => ({ value: value!, label: label! }))}/>}</Field><Field label="Count purpose">{id => <Input id={id} value={purpose} onChange={e => setPurpose(e.target.value)} maxLength={1000}/>}</Field><Button disabled={blocked || !lotId || purpose.trim().length < 10} onClick={() => write('count-sessions', { lotId, state, purpose })}>Start targeted count</Button></div></Panel> : null}
 {config.canCount&&selected?<Button variant="secondary" disabled={blocked} onClick={()=>chooseCount('')}>New targeted count</Button>:null}{detail.error ? <ErrorNotice message={detail.error} onRetry={detail.refresh}/> : null}{detail.loading ? <DetailSkeleton /> : detail.data ? <Panel title="Count evidence"><div className="space-y-4"><p className="text-sm">{detail.data.purpose} / State {detail.data.state}</p><div className="space-y-1"><p className="font-semibold">{detail.data.productName} / {detail.data.variantName}</p><p className="break-words text-sm"><Code>{detail.data.fullSku}</Code> / <Code>{detail.data.lotCode??detail.data.publicBatchCode}</Code></p></div>
 {config.canCount && (!attempt || attempt.result) ? <Button disabled={blocked} onClick={() => write('count-attempts', { sessionId: selected })}>{attempt ? 'Start explicit recount' : 'Begin count attempt'}</Button> : null}
 {attempt ? <><Badge tone="neutral">{attempt.snapshot.mode} / {attempt.result?.status ?? 'IN PROGRESS'}</Badge><p className="text-sm">Ledger {attempt.snapshot.ledgerQuantity} / Projection {attempt.snapshot.projectionQuantity}. Recorded {formatDateTime(attempt.recordedAt)}.</p>
 {config.canCount && !attempt.result ? <>{native ? <form onSubmit={e => { e.preventDefault(); void observe(); }} className="flex flex-wrap items-end gap-3"><Field label="Scan QR or enter Unit Code">{id => <Input id={id} value={code} onChange={e => setCode(e.target.value)} autoComplete="off"/>}</Field><Button type="submit" disabled={blocked || !code.trim()}>Record observed item</Button></form> : <p className="text-sm">Historical quantity count. No individual units are created or inferred.</p>}
 <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>*]:min-w-0">{native ? <Field label="Unidentified extra items">{id => <Input id={id} type="number" min="0" step="1" value={extras} onChange={e => setExtras(e.target.value)}/>}</Field> : <Field label="Observed quantity">{id => <Input id={id} type="number" min="0" step="1" value={quantity} onChange={e => setQuantity(e.target.value)}/>}</Field>}<Field label="Count explanation">{id => <Input id={id} value={explanation} onChange={e => setExplanation(e.target.value)} maxLength={2000}/>}</Field><Field label="Supporting evidence">{id => <Input id={id} value={evidence} onChange={e => setEvidence(e.target.value)} maxLength={2000}/>}</Field></div>
 <p className="text-sm">Review before confirming: {native ? attempt.observations.length + ' distinct saved items plus ' + extras + ' unidentified extras' : quantity + ' items'}. Evidence is permanent; mistakes require a new attempt.</p><Button disabled={blocked || explanation.trim().length < 10 || evidence.trim().length < 10 || !/^\d+$/.test(native ? extras : quantity)} onClick={() => { if (window.confirm('Confirm this physical count evidence? It cannot be edited and does not change stock.'))
                    write('count-results', { attemptId: attempt.id, observedQuantity: native ? (BigInt(attempt.observations.length) + BigInt(extras)).toString() : quantity, unidentifiedExtras: native ? extras : '0', explanation, evidence }); }}>Confirm count evidence</Button></> : null}
 <DataTable label="Observed count items" mobileStack rows={attempt.observations.slice((observationPage - 1) * 20, observationPage * 20)} rowKey={r => r.id} emptyMessage="No individual observations recorded" columns={[{ key: 'unit', label: 'Unit Code', cell: r => <Code>{r.unitCode}</Code> }]}/><Pager page={observationPage} pageCount={Math.ceil(attempt.observations.length / 20)} onChange={setObservationPage}/></> : null}
 {attempts.slice((attemptPage - 1) * 10, attemptPage * 10).map(a => <section key={a.id} className="space-y-2 border-t border-black/10 pt-4"><p className="text-sm">{formatDateTime(a.recordedAt)} / {a.result?.status ?? 'IN PROGRESS'}</p>{a.result ? <><p className="text-sm">Observed {a.result.observedQuantity}. {a.result.explanation}</p><p className="text-sm text-grey-2">{a.result.evidence}</p>{a.result.resolution ? <p className="text-sm">Mistaken finding resolved by matching recount: {a.result.resolution.explanation}</p> : config.canCount && a.result.status === 'MISMATCH' && attempt?.result?.status === 'MATCHED' && a.id !== attempt.id ? <Button variant="secondary" disabled={blocked} onClick={() => { const note = window.prompt('Explain why the earlier finding was mistaken. Genuine discrepancies must remain pending correction.'); if (note && note.trim().length >= 10)
            write('count-resolutions', { resultId: a.result!.id, matchingResultId: attempt.result!.id, explanation: note }); }}>Resolve mistaken finding with matching recount</Button> : null}</> : null}</section>)}<Pager page={attemptPage} pageCount={Math.ceil(attempts.length / 10)} onChange={setAttemptPage}/>
 </div></Panel> : null}
 </TaskModal>
 <Panel title="Count history"><DataTable label="Targeted count history" mobileStack rows={history.data?.rows ?? []} rowKey={r => r.id} loading={history.loading} emptyMessage="No targeted counts recorded" columns={[{ key: 'purpose', label: 'Count scope', mobileFullWidth: true, cell: r => <><p>{r.purpose}</p><p>{r.productName} / {r.variantName}</p><Code>{r.lotCode??r.publicBatchCode}</Code></> }, { key: 'state', label: 'State', cell: r => r.state }, { key: 'recorded', label: 'Started', cell: r => formatDateTime(r.recordedAt) }, { key: 'open', label: 'Details', cell: r => <Button variant="secondary" onClick={() => { chooseCount(r.id); }}>Open count</Button> }]}/>{history.error ? <ErrorNotice message={history.error} onRetry={history.refresh}/> : null}<Pager page={page} pageCount={Math.ceil((history.data?.total ?? 0) / 20)} onChange={setPage}/></Panel>
 </div>;
}
