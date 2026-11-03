'use client';
import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {constructor(message:string,readonly status:number){super(message);}}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json();
  if (!response.ok) {
    if(response.status===401&&path!=='sessions'&&path!=='me')window.dispatchEvent(new Event('dayari:session-expired'));
    const detail = typeof body.message === 'string' ? body.message : body.issues?.map((issue: { message: string }) => issue.message).join('. ');
    throw new ApiError(response.status === 401 && path !== 'sessions' ? 'Your session has expired. Sign out and sign in again.' : detail || 'The shop service could not complete this request. Please retry.',response.status);
  }
  return body;
}
export function useApiRead<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(path));
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(''); setLoading(Boolean(path));
    if (path) api<T>(path, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, revision]);
  return { data, error, loading, refresh };
}
