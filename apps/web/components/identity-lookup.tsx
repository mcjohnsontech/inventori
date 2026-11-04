'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { publicCodeSchema, type PublicIdentityLookup } from '@dayari/contracts';

import { notifyAuthFailure } from '../lib/api';
import { formatDateTime } from '../lib/format';
import {
  Badge,
  Button,
  Code,
  ErrorNotice,
  Field,
  Footnote,
  Input,
  Panel,
} from './ui';

export function IdentityLookup({ initialCode = '' }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PublicIdentityLookup | null>(null);

  const working = useRef(false);
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);

  useEffect(
    () => () => {
      revision.current += 1;
      request.current?.abort();
    },
    [],
  );

  function clearPending() {
    revision.current += 1;
    request.current?.abort();
    working.current = false;
    setBusy(false);
    setResult(null);
    setError('');
  }

  useEffect(() => {
    clearPending();
    setCode(initialCode);
    // clearPending only touches refs and setState, so it is stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working.current) return;

    setResult(null);
    setError('');

    const kind = code.trim().toUpperCase().startsWith('L') ? 'LOT' : 'PRODUCT';
    const parsed = publicCodeSchema(kind).safeParse(code);
    if (!parsed.success) {
      setError('Enter a six-character Product Code (P…) or Lot Code (L…).');
      return;
    }

    working.current = true;
    setBusy(true);

    const ticket = ++revision.current;
    const controller = new AbortController();
    request.current = controller;

    try {
      const response = await fetch(
        `/api/inventory/${kind === 'PRODUCT' ? 'products' : 'lots'}/by-code/${parsed.data}`,
        { cache: 'no-store', signal: controller.signal },
      );
      notifyAuthFailure(response);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? 'Code not found in this shop. Check the printed code and shop location.'
            : response.status === 503
              ? 'Shop service unavailable. Reconnect and retry.'
              : 'Code lookup unavailable. Check your session and try again.',
        );
      }
      if (ticket === revision.current) setResult(data);
    } catch (failure) {
      if (ticket === revision.current && !controller.signal.aborted) {
        setError((failure as Error).message);
      }
    } finally {
      if (ticket === revision.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <Panel
      label="Exact code lookup"
      title="Find by Product or Lot Code"
      description="Codes identify a shared product or one exact delivery lot. Lookup never changes stock."
      action={<Badge>Exact lookup · this shop</Badge>}
    >
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Product or Lot Code" className="min-w-0 flex-1">
          {(id) => (
            <Input
              id={id}
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              value={code}
              placeholder="P7K2M9 or L8M4Q2"
              onChange={(event) => {
                clearPending();
                setCode(event.target.value);
              }}
            />
          )}
        </Field>
        <Button disabled={busy} className="shrink-0">
          {busy ? 'Looking up…' : 'Find code'}
        </Button>
      </form>

      {error ? <ErrorNotice message={error} className="mt-4" /> : null}

      {result ? (
        <div
          role="status"
          aria-label="Code lookup result"
          className="mt-4 rounded-xl border border-brand/15 bg-brand-tint px-5 py-4"
        >
          <p className="font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
            {result.kind === 'PRODUCT' ? 'Shared product' : 'Delivery lot'}
          </p>
          <p className="mt-2 font-display text-xl font-semibold tracking-[-0.03em] break-words text-brand-deep">
            {result.productName}
            {result.variantName ? ` · ${result.variantName}` : ''}
          </p>
          <p className="mt-2">
            <Code className="text-sm text-ink">
              Product {result.productCode ?? 'Code not assigned'}
              {result.lotCode ? ` · Lot ${result.lotCode}` : ''}
            </Code>
          </p>
          {result.fullSku ? (
            <p className="mt-1.5">
              <Code className="text-ink">
                {result.fullSku} · Batch {result.publicBatchCode}
              </Code>
            </p>
          ) : null}
          <div className="mt-3 space-y-1">
            {result.usable !== undefined ? (
              <p className="font-sans text-sm font-semibold tracking-[-0.02em] text-usable">
                Usable availability: {result.usable}
              </p>
            ) : null}
            {result.damaged !== undefined ? (
              <p className="font-sans text-sm tracking-[-0.02em] text-damaged">
                Damaged lot quantity: {result.damaged}
              </p>
            ) : null}
          </div>
          <Footnote className="mt-3">
            Local data as of {formatDateTime(result.dataAsOf)}.{' '}
            {result.kind === 'PRODUCT'
              ? 'This code stays the same across suppliers and variants.'
              : 'This is a lot identity, not an individual unit serial.'}
          </Footnote>
        </div>
      ) : null}
    </Panel>
  );
}
