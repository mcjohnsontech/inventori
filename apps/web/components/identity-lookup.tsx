'use client';
import { publicCodeSchema, type PublicIdentityLookup } from '@dayari/contracts';

import { notifyAuthFailure } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { CodesOnly } from '../lib/role';
import { Code, Footnote } from './ui';

/** Thrown for a code that is well-formed but not registered in this shop. */
export class CodeNotFound extends Error {}

/**
 * Exact Product (P…) or Lot (L…) Code lookup. Returns null when the text is
 * not shaped like either code, so callers can try other code kinds.
 */
export async function lookupIdentity(
  code: string,
  signal: AbortSignal,
  kind: 'PRODUCT' | 'LOT' = code.trim().toUpperCase().startsWith('L') ? 'LOT' : 'PRODUCT',
): Promise<PublicIdentityLookup | null> {
  const parsed = publicCodeSchema(kind).safeParse(code);
  if (!parsed.success) return null;

  const response = await fetch(
    `/api/inventory/${kind === 'PRODUCT' ? 'products' : 'lots'}/by-code/${parsed.data}`,
    { cache: 'no-store', signal },
  );
  notifyAuthFailure(response);
  const data = await response.json();
  if (response.status === 404) {
    throw new CodeNotFound('Code not found in this shop. Check the printed code and try again.');
  }
  if (!response.ok) {
    throw new Error(
      response.status === 503
        ? 'Shop service unavailable. Reconnect and try again.'
        : 'Code lookup unavailable. Check your session and try again.',
    );
  }
  return data as PublicIdentityLookup;
}

export function IdentityResult({ result }: { result: PublicIdentityLookup }) {
  return (
    <div
      role="status"
      aria-label="Code lookup result"
      className="rounded-xl border border-brand/15 bg-brand-tint px-5 py-4"
    >
      <p className="font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
        {result.kind === 'PRODUCT' ? 'Product' : 'Delivery lot'}
      </p>
      <p className="mt-2 font-display text-xl font-semibold tracking-[-0.03em] break-words text-brand-deep">
        {result.productName}
        {result.variantName ? ` · ${result.variantName}` : ''}
      </p>
      <CodesOnly><p className="mt-2">
        <Code className="text-sm text-ink">
          Product {result.productCode ?? '—'}
          {result.lotCode ? ` · Lot ${result.lotCode}` : ''}
        </Code>
      </p>
      {result.fullSku ? (
        <p className="mt-1.5">
          <Code className="text-ink">
            {result.fullSku} · Batch {result.publicBatchCode}
          </Code>
        </p>
      ) : null}</CodesOnly>
      <div className="mt-3 space-y-1">
        {result.usable !== undefined ? (
          <p className="font-sans text-sm font-semibold tracking-[-0.02em] text-usable">
            Usable: {result.usable}
          </p>
        ) : null}
        {result.damaged !== undefined ? (
          <p className="font-sans text-sm tracking-[-0.02em] text-damaged">
            Damaged lot quantity: {result.damaged}
          </p>
        ) : null}
      </div>
      <Footnote className="mt-3">
        As of {formatDateTime(result.dataAsOf)}.{' '}
        {result.kind === 'PRODUCT'
          ? 'This code is shared by every supplier and variant of the product.'
          : 'This code covers the whole delivery lot, not one individual item.'}
      </Footnote>
    </div>
  );
}
