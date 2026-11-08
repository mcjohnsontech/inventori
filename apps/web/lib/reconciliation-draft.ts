'use client';
import { useEffect, useRef, useState } from 'react';
import { idempotencyKeySchema, reasonReconciliationDraftSchema, reconcileReasonsSchema, type ReasonReconciliationDraft, type ReasonReconciliationInput, type ReasonResolutionView } from '@dayari/contracts';
import { api, ApiError } from './api';

type Draft = { body: ReasonReconciliationDraft; pending: { key: string; body: ReasonReconciliationInput } | null; acceptedId: string | null };
const empty = (): Draft => ({ body: { exceptionIds: [], reason: null, remarks: '' }, pending: null, acceptedId: null });
function restore(raw: string | null): Draft {
  if (!raw) return empty();
  if (raw.length > 200_000) throw Error('Invalid reconciliation draft');
  const saved = JSON.parse(raw), body = reasonReconciliationDraftSchema.parse(saved.body);
  const pending = saved.pending ? { key: idempotencyKeySchema.parse(saved.pending.key), body: reconcileReasonsSchema.parse(saved.pending.body) } : null;
  return { body: pending?.body ?? body, pending, acceptedId: saved.acceptedId ? idempotencyKeySchema.parse(saved.acceptedId) : null };
}
export function useReconciliationDraft(actorId: string, originId: string) {
  const storage = `dayari_reason_reconciliation_${actorId}_${originId}`;
  const [draft, setDraft] = useState<Draft>(empty), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const current = useRef(draft), mounted = useRef(true), latch = useRef(false), request = useRef<AbortController | null>(null);
  function save(value: Draft) { sessionStorage.setItem(storage, JSON.stringify(value)); current.current = value; if (mounted.current) setDraft(value); }
  useEffect(() => {
    mounted.current = true;
    try { const saved = restore(sessionStorage.getItem(storage)); current.current = saved; setDraft(saved); }
    catch { sessionStorage.removeItem(storage); }
    setReady(true);
    return () => { mounted.current = false; request.current?.abort(); };
  }, [storage]);
  useEffect(() => {
    const guard = (event: Event) => { if (latch.current) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { if (current.current.body.exceptionIds.length || current.current.body.reason || current.current.body.remarks || current.current.pending) event.preventDefault(); };
    window.addEventListener('dayari:before-navigate', guard); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('dayari:before-navigate', guard); window.removeEventListener('beforeunload', unload); };
  }, []);
  function update(body: ReasonReconciliationDraft) {
    if (latch.current || current.current.pending) throw Error('Retry the saved classification before changing this draft.');
    save({ body: reasonReconciliationDraftSchema.parse(body), pending: null, acceptedId: null });
  }
  async function send(): Promise<ReasonResolutionView> {
    if (latch.current) throw Error('Classification is already running.');
    const pending = current.current.pending ?? { key: crypto.randomUUID(), body: reconcileReasonsSchema.parse(current.current.body) };
    save({ ...current.current, pending }); latch.current = true; setBusy(true);
    const abort = new AbortController(); request.current = abort;
    try {
      const accepted = await api<ReasonResolutionView>('reason-reconciliations', { method: 'POST', headers: { 'Idempotency-Key': pending.key }, body: JSON.stringify(pending.body), signal: abort.signal });
      save({ ...empty(), acceptedId: accepted.id }); return accepted;
    } catch (failure) {
      if (failure instanceof ApiError && [400, 404, 409, 422].includes(failure.status)) save({ ...current.current, pending: null });
      throw failure;
    } finally { latch.current = false; if (mounted.current) setBusy(false); }
  }
  return { draft, ready, busy, update, send };
}
