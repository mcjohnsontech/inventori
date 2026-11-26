'use client';
import { useCallback, useEffect, useState } from 'react';

export function notifyAuthFailure(response:Response){if(response.status===401)window.dispatchEvent(new Event('dayari:session-expired'));}
export class ApiError extends Error {constructor(message:string,readonly status:number){super(message);}}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json();
  if (!response.ok) {
    if(path!=='sessions'&&path!=='me')notifyAuthFailure(response);
    const detail = typeof body.message === 'string' ? body.message : body.issues?.map((issue: { message: string }) => issue.message).join('. ');
    throw new ApiError(response.status === 401 && path !== 'sessions' ? 'Your session has expired. Sign out and sign in again.' : detail || 'The shop service could not complete this request. Please retry.',response.status);
  }
  return body;
}
export function useApiRead<T>(path: string | null, options: { refreshOnFocus?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(path));
  const [revision, setRevision] = useState(0);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(''); setLoading(Boolean(path));
    if (path) api<T>(path, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setData(value); setLoadedAt(new Date()); } }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, revision]);
  // Opt-in quiet refresh when staff return to the tab: keeps showing the old
  // figures until the new ones arrive, so nothing flickers or resets.
  const refreshOnFocus = Boolean(options.refreshOnFocus);
  useEffect(() => {
    if (!refreshOnFocus || !path) return;
    let controller: AbortController | null = null;
    const quiet = () => {
      if (document.visibilityState !== 'visible') return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      api<T>(path, { signal }).then(value => { if (!signal.aborted) { setData(value); setError(''); setLoadedAt(new Date()); } }).catch(() => {});
    };
    window.addEventListener('focus', quiet);
    document.addEventListener('visibilitychange', quiet);
    return () => { controller?.abort(); window.removeEventListener('focus', quiet); document.removeEventListener('visibilitychange', quiet); };
  }, [path, refreshOnFocus]);
  return { data, error, loading, refresh, loadedAt };
}
