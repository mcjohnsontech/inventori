'use client';
import { encodeUnitQr, type UnitIdentityLookup } from '@dayari/contracts';
import { Badge, Code, Footnote, card } from '../ui';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { UnitQrSymbol } from './unit-label-card';

export function UnitIdentityResult({ unit, compact = false }: { unit: UnitIdentityLookup; compact?: boolean }) {
  return <section aria-label="Resolved individual unit" className={cn(card, compact ? 'border-0 bg-transparent p-0 shadow-none' : 'p-5 sm:p-6')}>
    <div className={cn('gap-4', compact ? 'grid grid-cols-[minmax(0,1fr)_72px]' : 'flex flex-wrap items-start justify-between')}>
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-widest text-grey-2 uppercase">Individual unit</p>
        <h2 className={cn('mt-2 font-mono font-bold tracking-[0.08em]', compact ? 'text-2xl' : 'text-3xl')}>{unit.unitCode}</h2>
        <p className={cn('mt-2 font-semibold break-words', compact ? 'text-sm' : 'text-lg')}>{unit.productName} · {unit.variantName}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={unit.availability === 'USABLE' ? 'usable' : 'neutral'}>{unit.availability === 'USABLE' ? 'Available for checkout' : 'Unavailable for checkout'}</Badge>
          {unit.state === 'P' ? <Badge>In Production</Badge> : null}
          {unit.state === 'X' ? <Badge>Removed</Badge> : null}
          {unit.condition === 'DAMAGED' ? <Badge tone="damaged">Damaged</Badge> : null}
        </div>
      </div>
      <div className={compact ? 'w-[72px] shrink-0' : 'w-28 shrink-0'}><UnitQrSymbol payload={encodeUnitQr(unit.originId, unit.unitId)} code={unit.unitCode}/></div>
    </div>
    <dl className={cn('mt-5 grid gap-4 border-t border-black/10 pt-4', compact ? 'grid-cols-2' : 'sm:grid-cols-2')}>
      <div><dt className="text-xs text-grey-2">Saved supplier SKU</dt><dd className="mt-1"><Code className="text-sm">{unit.fullSku}</Code></dd></div>
      <div><dt className="text-xs text-grey-2">Batch</dt><dd className="mt-1"><Code>{unit.publicBatchCode}</Code></dd></div>
      <div><dt className="text-xs text-grey-2">Product Code</dt><dd className="mt-1"><Code>{unit.productCode ?? 'Not assigned'}</Code></dd></div>
      <div><dt className="text-xs text-grey-2">Lot Code</dt><dd className="mt-1"><Code>{unit.lotCode ?? 'Not assigned'}</Code></dd></div>
    </dl>
    {unit.supplierName ? <p className="mt-4 text-sm break-words text-grey-2">{unit.supplierName} · {unit.sourceName}</p> : null}
    {unit.receivedAt ? <p className="mt-1 text-xs text-grey-2">Receipt recorded {formatDateTime(unit.receivedAt)}</p> : null}
    <Footnote className="mt-3">Updated {formatDateTime(unit.dataAsOf)}. Identification does not deduct stock or verify label attachment.</Footnote>
  </section>;
}
