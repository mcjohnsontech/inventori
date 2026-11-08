'use client';
import { useEffect, useRef, useState } from 'react';
import type { UnitObservationResult } from '@dayari/contracts';
import { api } from './api';

type Attempt = { body: { payload: string; method: 'CAMERA' | 'QR_INPUT' }; key: string };
export function useQrPresentation() {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const pending = useRef<Attempt | null>(null), request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function cancel() { request.current?.abort(); pending.current = null; setState('idle'); setError(''); }
  async function send(attempt: Attempt) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setState('saving'); setError('');
    try {
      await api<UnitObservationResult>('unit-observations', { method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body: JSON.stringify(attempt.body), signal: controller.signal });
      if (!controller.signal.aborted) { pending.current = null; setState('saved'); }
    } catch (failure) {
      if (!controller.signal.aborted) { setError((failure as Error).message); setState('error'); }
    }
  }
  function record(body: Attempt['body']) {
    const attempt = { body, key: crypto.randomUUID() }; pending.current = attempt; void send(attempt);
  }
  function retry() { if (pending.current) void send(pending.current); }
  return { state, error, record, retry, cancel };
}
