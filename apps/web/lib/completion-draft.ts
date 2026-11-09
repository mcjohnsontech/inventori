'use client';
import { useEffect, useRef, useState } from 'react';
import { completionDraftSchema, completionSchema, idempotencyKeySchema, type CompletionView } from '@dayari/contracts';
import { api, ApiError } from './api';
type Saved = {
    body: {
        unitIds: string[];
    };
    pending: {
        key: string;
        body: {
            unitIds: string[];
        };
    } | null;
    acceptedId: string | null;
};
const empty = (): Saved => ({ body: { unitIds: [] }, pending: null, acceptedId: null });
export function useCompletionDraft(actorId: string, originId: string) {
    const storage = `dayari_completion_${actorId}_${originId}_manager`;
    const [saved, setSaved] = useState<Saved>(empty), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
    const current = useRef(saved), mounted = useRef(true), latch = useRef(false), request = useRef<AbortController | null>(null);
    function save(value: Saved) { sessionStorage.setItem(storage, JSON.stringify(value)); current.current = value; if (mounted.current)
        setSaved(value); }
    useEffect(() => {
        mounted.current = true;
        try {
            const raw = sessionStorage.getItem(storage);
            let restored = empty();
            if (raw) {
                if (raw.length > 200000)
                    throw Error('Invalid request draft');
                const value = JSON.parse(raw);
                restored = { body: completionDraftSchema.parse(value.body), pending: value.pending ? { key: idempotencyKeySchema.parse(value.pending.key), body: completionSchema.parse(value.pending.body) } : null,
                    acceptedId: value.acceptedId ? idempotencyKeySchema.parse(value.acceptedId) : null };
            }
            current.current = restored;
            setSaved(restored);
        }
        catch {
            sessionStorage.removeItem(storage);
            const value = empty();
            current.current = value;
            setSaved(value);
        }
        setReady(true);
        return () => { mounted.current = false; request.current?.abort(); };
    }, [storage]);
    useEffect(() => {
        const guard = (event: Event) => { if (latch.current)
            event.preventDefault(); };
        const unload = (event: BeforeUnloadEvent) => { const value = current.current; if (value.pending || value.body.unitIds.length)
            event.preventDefault(); };
        window.addEventListener('dayari:before-navigate', guard);
        window.addEventListener('beforeunload', unload);
        return () => { window.removeEventListener('dayari:before-navigate', guard); window.removeEventListener('beforeunload', unload); };
    }, []);
    function update(body: {
        unitIds: string[];
    }) {
        if (latch.current || current.current.pending)
            throw Error('Retry the saved request before changing this draft.');
        save({ body: completionDraftSchema.parse(body), pending: null, acceptedId: null });
    }
    async function send(input?: unknown): Promise<CompletionView> {
        if (latch.current)
            throw Error('Request is already being recorded.');
        const pending = current.current.pending ?? { key: crypto.randomUUID(), body: completionSchema.parse(input) };
        save({ ...current.current, pending });
        latch.current = true;
        setBusy(true);
        const abort = new AbortController();
        request.current = abort;
        try {
            const accepted = await api<CompletionView>('completions', { method: 'POST', headers: { 'Idempotency-Key': pending.key }, body: JSON.stringify(pending.body), signal: abort.signal });
            save({ ...empty(), acceptedId: accepted.id });
            return accepted;
        }
        catch (failure) {
            if (failure instanceof ApiError && [400, 404, 409, 422].includes(failure.status))
                save({ ...current.current, pending: null });
            throw failure;
        }
        finally {
            latch.current = false;
            if (mounted.current)
                setBusy(false);
        }
    }
    return { saved, ready, busy, update, send };
}
