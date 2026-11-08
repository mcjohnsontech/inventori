'use client';
import { encodeUnitQr,type UnitIdentityLookup } from '@dayari/contracts';
import { Badge,Code,Footnote,card } from '../ui';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { UnitQrSymbol } from './unit-label-card';
export function UnitIdentityResult({unit}:{unit:UnitIdentityLookup}){
 return <section aria-label="Resolved individual unit" className={cn(card,'p-5 sm:p-6')}><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-semibold tracking-widest text-grey-2 uppercase">Individual unit</p><h2 className="mt-2 font-mono text-3xl font-bold tracking-[0.08em]">{unit.unitCode}</h2><p className="mt-2 text-lg font-semibold break-words">{unit.productName} · {unit.variantName}</p><div className="mt-3 flex flex-wrap gap-2"><Badge tone={unit.availability==='USABLE'?'usable':'neutral'}>{unit.availability==='USABLE'?'Available for checkout':'Unavailable for checkout'}</Badge>{unit.condition==='DAMAGED'?<Badge tone="damaged">Damaged</Badge>:null}</div></div><div className="w-28 shrink-0"><UnitQrSymbol payload={encodeUnitQr(unit.originId,unit.unitId)} code={unit.unitCode}/></div></div>
  <dl className="mt-5 grid gap-4 border-t border-black/10 pt-4 sm:grid-cols-2"><div><dt className="text-xs text-grey-2">Saved supplier SKU</dt><dd className="mt-1"><Code className="text-sm">{unit.fullSku}</Code></dd></div><div><dt className="text-xs text-grey-2">Batch</dt><dd className="mt-1"><Code>{unit.publicBatchCode}</Code></dd></div><div><dt className="text-xs text-grey-2">Product Code</dt><dd className="mt-1"><Code>{unit.productCode??'Not assigned'}</Code></dd></div><div><dt className="text-xs text-grey-2">Lot Code</dt><dd className="mt-1"><Code>{unit.lotCode??'Not assigned'}</Code></dd></div></dl>
  {unit.supplierName?<p className="mt-4 text-sm text-grey-2">{unit.supplierName} · {unit.sourceName}</p>:null}{unit.receivedAt?<p className="mt-1 text-xs text-grey-2">Received {formatDateTime(unit.receivedAt)} Lagos</p>:null}
  <Footnote className="mt-4">Saved identity lookup as of {formatDateTime(unit.dataAsOf)} Lagos. Scanning identifies this item; it does not check it out or verify physical attachment.</Footnote>
 </section>;
}
