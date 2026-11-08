'use client';
import { useEffect, useState } from 'react';
import { unitExactCodeSchema, type UnitIdentityLookup } from '@dayari/contracts';
import { api, ApiError } from '../lib/api';
import { Button, Code, ErrorNotice, Footnote } from './ui';

/** A typed exact match is independent of product/lot search namespaces. */
export function ExactUnitMatch({ query, onOpen }: { query: string; onOpen: (id: string) => void }) {
  const [match, setMatch] = useState<UnitIdentityLookup | null>(null);
  const [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(), parsed = unitExactCodeSchema.safeParse(query);
    setMatch(null); setError('');
    if (!parsed.success) return () => controller.abort();
    const timer = setTimeout(() => {
      api<UnitIdentityLookup>('inventory/units/by-code/' + parsed.data, { signal: controller.signal })
        .then(unit => { if (!controller.signal.aborted) setMatch(unit); })
        .catch(failure => { if (!controller.signal.aborted && !(failure instanceof ApiError && failure.status === 404)) setError(failure.message); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, revision]);
  if (error) return <div className="mt-4"><ErrorNotice message={error} onRetry={() => setRevision(value => value + 1)} /><Footnote>Product and lot results remain available below.</Footnote></div>;
  return match ? <section aria-label="Exact individual item match" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-white px-5 py-4"><div className="min-w-0"><p className="text-xs font-semibold text-grey-2">Individual item · exact Unit Code</p><p className="mt-1 break-words text-sm"><Code className="mr-2 text-sm font-semibold">{match.unitCode}</Code>{match.productName} · {match.variantName}</p></div><Button variant="secondary" onClick={() => onOpen(match.unitId)}>View unit history</Button></section> : null;
}
