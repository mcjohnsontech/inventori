'use client';
import { useEffect, useRef, useState } from 'react';
import { checkoutDraftSchema, checkoutSchema, idempotencyKeySchema, type CheckoutInput, type CheckoutView } from '@dayari/contracts';
import { api, ApiError } from './api';

type Draft = { body: CheckoutInput; pending: { key: string; body: CheckoutInput } | null; acceptedId: string | null };
const empty = (): Draft => ({ body: { reason: null, orderReference: null, lines: [] }, pending: null, acceptedId: null });
function restore(raw: string | null): Draft {
  if (!raw) return empty();
  if (raw.length > 2_000_000) throw Error('Invalid checkout draft');
  const value = JSON.parse(raw);
  const body = checkoutDraftSchema.parse(value.body);
  const pending = value.pending ? { key: idempotencyKeySchema.parse(value.pending.key), body: checkoutSchema.parse(value.pending.body) } : null;
  return { body: pending?.body ?? body, pending,
    acceptedId: value.acceptedId ? idempotencyKeySchema.parse(value.acceptedId) : null };
}

export function useCheckoutDraft(actorId: string, originId: string) {
  const storage = `dayari_checkout_${actorId}_${originId}`;
  const [draft, setDraft] = useState<Draft>(empty), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const current = useRef(draft), latch = useRef(false), mounted = useRef(true), controller = useRef<AbortController | null>(null);
  function save(next: Draft) {
    // Persist the key before any write. Storage failure must prevent a new command.
    sessionStorage.setItem(storage, JSON.stringify(next)); current.current = next;
    if (mounted.current) setDraft(next);
  }
  useEffect(() => {
    mounted.current = true;
    try { const saved = restore(sessionStorage.getItem(storage)); current.current = saved; setDraft(saved); }
    catch { sessionStorage.removeItem(storage); }
    setReady(true);
    return () => { mounted.current = false; controller.current?.abort(); };
  }, [storage]);
  useEffect(() => {
    const guard = (event: Event) => { if (latch.current) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { if (current.current.body.lines.length || current.current.pending) event.preventDefault(); };
    window.addEventListener('dayari:before-navigate', guard); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('dayari:before-navigate', guard); window.removeEventListener('beforeunload', unload); };
  }, []);
  function update(body: CheckoutInput) {
    if (latch.current || current.current.pending) throw Error('Resolve the pending confirmation before changing this checkout.');
    save({ body, pending: null, acceptedId: null });
  }
  async function send(): Promise<CheckoutView> {
    if (latch.current) throw Error('Checkout confirmation is already running.');
    const pending = current.current.pending ?? { key: crypto.randomUUID(), body: checkoutSchema.parse(current.current.body) };
    save({ ...current.current, pending }); latch.current = true; setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await api<CheckoutView>('checkouts', { method: 'POST', headers: { 'Idempotency-Key': pending.key }, body: JSON.stringify(pending.body), signal: abort.signal });
      save({ ...empty(), acceptedId: result.id }); return result;
    } catch (error) {
      // These server responses guarantee rejection of this attempt. Network/server uncertainty retains the same key.
      if (error instanceof ApiError && [400, 404, 409, 422].includes(error.status)) save({ ...current.current, pending: null });
      throw error;
    } finally { latch.current = false; if (mounted.current) setBusy(false); }
  }
  return { draft, ready, busy, update, send };
}
