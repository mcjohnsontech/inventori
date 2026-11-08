'use client';
import { useEffect, useRef, useState } from 'react';
import { damageDraftSchema, damageReportSchema, damageReviewSchema, idempotencyKeySchema, type DamageDraft, type DamageReportInput, type DamageReviewInput, type DamageView } from '@dayari/contracts';
import { api, ApiError } from './api';

type Saved = { body: DamageDraft; pending: { key: string; body: DamageReportInput | DamageReviewInput } | null; acceptedId: string | null };
const empty = (): Saved => ({ body: { unitIds: [], cause: '', description: '', outcome: 'HELD', note: '' }, pending: null, acceptedId: null });
export function useDamageDraft(actorId: string, originId: string, review: boolean, ownIssuedOnly: boolean) {
  const route = review ? 'damage-reviews' : 'damage-reports', storage = `dayari_${route}_${actorId}_${originId}_${ownIssuedOnly ? 'own-issued' : 'operational'}`;
  const [saved, setSaved] = useState<Saved>(empty), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const current = useRef(saved), mounted = useRef(true), latch = useRef(false), request = useRef<AbortController | null>(null);
  function save(value: Saved) { sessionStorage.setItem(storage, JSON.stringify(value)); current.current = value; if (mounted.current) setSaved(value); }
  useEffect(() => {
    mounted.current = true;
    try {
      const raw = sessionStorage.getItem(storage);
      if (raw) {
        if (raw.length > 200000) throw Error('Invalid damage draft');
        const value = JSON.parse(raw), body = damageDraftSchema.parse(value.body);
        const pending = value.pending ? { key: idempotencyKeySchema.parse(value.pending.key), body: (review ? damageReviewSchema : damageReportSchema).parse(value.pending.body) } : null;
        const restored = { body, pending, acceptedId: value.acceptedId ? idempotencyKeySchema.parse(value.acceptedId) : null };
        current.current = restored; setSaved(restored);
      } else { const value = empty(); current.current = value; setSaved(value); }
    } catch { sessionStorage.removeItem(storage); const value = empty(); current.current = value; setSaved(value); }
    setReady(true); return () => { mounted.current = false; request.current?.abort(); };
  }, [storage, review]);
  useEffect(() => {
    const guard = (event: Event) => { if (latch.current) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { const draft = current.current; if (draft.pending || draft.body.unitIds.length || draft.body.cause || draft.body.description || draft.body.note) event.preventDefault(); };
    window.addEventListener('dayari:before-navigate', guard); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('dayari:before-navigate', guard); window.removeEventListener('beforeunload', unload); };
  }, []);
  function update(body: DamageDraft) {
    if (latch.current || current.current.pending) throw Error('Retry the saved damage command before changing the draft.');
    save({ body: damageDraftSchema.parse(body), pending: null, acceptedId: null });
  }
  async function send(): Promise<DamageView> {
    if (latch.current) throw Error('This command is already running.');
    const draft = current.current.body;
    const body = review ? damageReviewSchema.parse({ unitIds: draft.unitIds, outcome: draft.outcome, note: draft.note })
      : damageReportSchema.parse({ unitIds: draft.unitIds, cause: draft.cause, description: draft.description });
    const pending = current.current.pending ?? { key: crypto.randomUUID(), body };
    save({ ...current.current, pending }); latch.current = true; setBusy(true);
    const abort = new AbortController(); request.current = abort;
    try {
      const accepted = await api<DamageView>(route, { method: 'POST', headers: { 'Idempotency-Key': pending.key }, body: JSON.stringify(pending.body), signal: abort.signal });
      save({ ...empty(), acceptedId: accepted.id }); return accepted;
    } catch (failure) {
      if (failure instanceof ApiError && [400, 404, 409, 422].includes(failure.status)) save({ ...current.current, pending: null });
      throw failure;
    } finally { latch.current = false; if (mounted.current) setBusy(false); }
  }
  return { saved, ready, busy, update, send, route };
}
