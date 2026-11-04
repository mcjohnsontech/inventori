'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { InvitationSummary } from '@dayari/contracts';
import { api, useApiRead } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/workspace';
import { Disclosure } from './ui/disclosure';
export function InvitationsPanel() {
  type Directory = { mode: 'isolated' | 'smtp'; invitations: InvitationSummary[] };
  const list = useApiRead<Directory>('admin/invitations');
  const previous = useRef<Directory | null>(null);
  const directory = list.data ?? previous.current;
  const [lastId, setLastId] = useState('');
  const latest = directory?.invitations.find(invitation => invitation.id === lastId);
  useEffect(() => { if (list.data) previous.current = list.data; }, [list.data]);
  const pendingDelivery = directory?.invitations.some(invitation => invitation.status === 'PENDING' && invitation.delivery === 'PENDING');
  useEffect(() => {
    if (!pendingDelivery || list.error) return;
    const timer = setInterval(list.refresh, 6000);
    return () => clearInterval(timer);
  }, [pendingDelivery, list.error, list.refresh]);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const pending = useRef<{ value: string; key: string } | null>(null),
    latch = useRef(false);
  useEffect(() => {
    const guard = (e: Event) => {
      if (busy || (dirty && !confirm('Discard the unsaved invitation?'))) e.preventDefault();
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty || busy) e.preventDefault();
    };
    window.addEventListener('dayari:before-navigate', guard);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('dayari:before-navigate', guard);
      window.removeEventListener('beforeunload', unload);
    };
  }, [busy, dirty]);
  async function send(e: FormEvent<HTMLFormElement>, path = 'admin/invitations') {
    e.preventDefault();
    if (latch.current) return;
    const form = e.currentTarget,
      body = Object.fromEntries(new FormData(form));
    if (path.endsWith('/revoke')) delete body.role;
    const value = JSON.stringify({ path, ...body, currentPassword: undefined });
    if (pending.current?.value !== value) pending.current = { value, key: crypto.randomUUID() };
    latch.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ id: string }>(path, {
        method: 'POST',
        headers: { 'Idempotency-Key': pending.current.key },
        body: JSON.stringify(body),
      });
      pending.current = null;
      setDirty(false);
      setOpen(false);
      form.reset();
      list.refresh();
      setLastId(result.id);
      setNotice(path.endsWith('/revoke') ? 'Invitation revoked. Its setup link no longer works.' :
        directory?.mode === 'smtp' ? 'Invitation queued for email. Delivery status will update automatically.' :
        'Test invitation saved. No real email was sent.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
      latch.current = false;
    }
  }
  return (
    <section className="surface mb-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Add staff by email</h2>
          <p className="mt-1 text-sm text-stone-500">
            {directory?.mode === 'smtp' ? 'Send a secure setup link. The employee chooses their own password; the link expires after 24 hours.' :
             'Employees choose their own password. Email delivery is not enabled in this environment.'}
          </p>
        </div>
        <Button
          disabled={busy || !directory || Boolean(list.error)}
          onClick={() => {
            if (open && dirty && !confirm('Discard the unsaved invitation?')) return;
            setOpen(!open);
            setDirty(false);
            setError('');
          }}
        >
          {' '}
          {open ? 'Close invitation' : 'Invite staff'}
        </Button>
      </div>
      {notice && (
        <p role="status" className="mt-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {latest && <p className="mt-2 text-sm text-grey-2" aria-live="polite">
        {latest.email} · {latest.status === 'ACCEPTED' ? 'Account activated' : latest.delivery === 'SENT' ?
          directory?.mode === 'smtp' ? 'Accepted by email server — awaiting staff setup' : 'Captured by test transport — no email sent' :
          latest.delivery === 'FAILED' ? 'Email delivery failed. Check mail settings, then resend the invitation.' :
          latest.delivery === 'CANCELLED' ? 'Delivery cancelled' : 'Email queued — waiting for delivery'}
      </p>}
      {open && (
        <form
          onSubmit={send}
          onChange={() => setDirty(true)}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <label>
            Staff name
            <input name="name" maxLength={160} required />
          </label>
          <label>
            Staff email
            <input name="email" type="email" maxLength={254} required />
          </label>
          <label>
            Invited role
            <select name="role" defaultValue="PRODUCTION">
              <option value="PRODUCTION">Production Staff</option>
              <option value="MANAGER">Inventory Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <label>
            Your password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              maxLength={256}
              required
            />
          </label>
          <div>
            <Button disabled={busy}>{busy ? 'Saving…' : 'Save invitation'}</Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {list.error ? (
        <div className="mt-3 text-sm text-stone-500">
          <p>{list.error}</p>
          <Button
            type="button"
            variant="outline"
            size="small"
            className="mt-2"
            onClick={list.refresh}
          >
            Retry invitation service
          </Button>
        </div>
      ) : directory?.invitations.length ? (
        <Disclosure
          summary={`Invitation history (${directory.invitations.length})`}
          className="mt-4"
        >
          <div className="max-h-96 divide-y overflow-y-auto">
            {directory.invitations.map((i) => (
              <div key={i.id} className="py-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    <strong>{i.name}</strong>
                    <span className="ml-2 break-all text-sm text-stone-500">{i.email}</span>
                  </span>
                  <span className="flex gap-2">
                    <Badge>{i.status}</Badge>
                    <Badge>{i.delivery}</Badge>
                  </span>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {i.role} · Expires {new Date(i.expiresAt).toLocaleString()}
                </p>
                {(i.status === 'PENDING' || i.status === 'EXPIRED') && (
                  <form
                    className="mt-3 flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                        'value',
                      );
                      if (
                        !confirm(
                          `${action === 'resend' ? 'Replace this invitation and invalidate its old link' : 'Revoke this invitation'}?`,
                        )
                      ) {
                        e.preventDefault();
                        return;
                      }
                      void send(e, `admin/invitations/${i.id}/${action}`);
                    }}
                  >
                    <label className="text-xs">
                      Role for replacement
                      <select name="role" defaultValue={i.role}>
                        <option value="PRODUCTION">Production Staff</option>
                        <option value="MANAGER">Inventory Manager</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </label>
                    <label className="text-xs">
                      Your password
                      <input
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        required
                        maxLength={256}
                      />
                    </label>
                    <Button variant="outline" value="resend" disabled={busy}>
                      Resend
                    </Button>
                    <Button variant="outline" value="revoke" disabled={busy}>
                      Revoke
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}
    </section>
  );
}
