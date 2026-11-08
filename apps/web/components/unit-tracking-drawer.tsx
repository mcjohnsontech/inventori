'use client';
import { useState } from 'react';
import { checkoutReasonLabels, type UnitHistoryItem, type UnitTracking } from '@dayari/contracts';
import { useApiRead } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { UnitIdentityResult } from './labels/unit-identity-result';
import { Button, Code, DetailsDrawer, DetailSkeleton, Disclosure, EmptyState, ErrorNotice, Footnote, Pager } from './ui';

const titles: Record<UnitHistoryItem['kind'], string> = {
  BAD_REPORTED: 'Reported BAD',
  DAMAGE_REMOVED: 'Damaged item removed',
  DAMAGE_REVIEWED: 'Manager reviewed damage',
  REASON_RECONCILED: 'Missing reason classified by Manager',
  ISSUED: 'Checked out to Production',
  RECEIVED: 'Received and unit identity created',
  LABEL_REQUESTED: 'Individual label requested',
  LABEL_PREPARED: 'Print document prepared',
  PRINT_DIALOG_REQUESTED: 'Device print dialog requested',
  QR_PRESENTED: 'QR identity presented',
};
const stockStates: Record<string, string> = { E: 'External intake', U: 'Usable', P: 'In Production', D: 'Damaged', X: 'Removed' };
const stockState = (value: string) => stockStates[value] ?? value;

export function UnitTrackingDrawer({ unitId, onClose }: { unitId: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const read = useApiRead<UnitTracking>(`units/${unitId}/tracking?page=${page}`);
  const data = read.data;
  return <DetailsDrawer title={data ? `Unit ${data.unit.unitCode}` : 'Individual item'} eyebrow="Unit tracking" closeLabel="Close unit details" onClose={onClose}>
    {read.loading ? <DetailSkeleton rows={6} /> : read.error ? <ErrorNotice message={read.error} onRetry={read.refresh} /> : data ? <div className="space-y-5">
      <UnitIdentityResult unit={data.unit} compact />
      {data.historyScope === 'OPERATIONAL' ? <section aria-label="Recorded unit provenance" className="space-y-3 rounded-xl border border-black/10 p-4">
        <dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-grey-2">Initial condition</dt><dd className="mt-1 font-medium">{data.initialCondition === 'USABLE' ? 'Usable' : 'Damaged intake'}</dd></div><div><dt className="text-grey-2">Recorded custody</dt><dd className="mt-1 font-medium break-words">{data.recordedCustody === 'SHOP_STORAGE' ? 'Shop storage' : data.recordedCustody === 'ISSUED_TO_STAFF' ? 'Issued to recorded staff' : data.recordedCustody === 'REMOVED' ? 'Removed from stock' : data.recordedCustody ?? 'Not recorded'}</dd></div></dl>
        {data.deliveredOn ? <p className="text-sm">Delivery date <span className="font-medium">{formatDate(data.deliveredOn)}</span></p> : null}
        {data.receiptId ? <a href={`#receipts/${data.receiptId}`} onClick={onClose} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline">Open accepted receipt</a> : null}
        <Footnote>Recorded custody does not establish a physically verified shelf, holder or count.</Footnote>
      </section> : <Footnote>Your history shows only your own QR presentations, checkouts and BAD reports. Other operational records are restricted.</Footnote>}
      <section aria-label="Unit event timeline"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-semibold">{data.historyScope === 'OPERATIONAL' ? 'Recorded timeline' : data.historyScope === 'OWN_ACTIVITY' ? 'Your recorded activity' : 'Your QR presentations'}</h3><Button variant="ghost" onClick={read.refresh}>Refresh history</Button></div>
        {!data.timeline.events.length ? <EmptyState title="No permitted events to show">A lookup does not create a checkout or physical verification event.</EmptyState> : <ol className="ml-2 border-l border-brand/20 pl-5">
          {data.timeline.events.map(event => <li key={event.id} className="relative pb-6 last:pb-2"><span aria-hidden className="absolute top-1 -left-[25px] size-2 rounded-full bg-brand"/><p className="text-sm font-semibold">{titles[event.kind]}</p><p className="mt-1 text-xs text-grey-2">{formatDateTime(event.recordedAt)}</p><p className="mt-1 text-sm break-words">{event.actor.name}</p>
            {event.fromState && event.toState ? <p className="mt-1 text-xs text-grey-2">{stockState(event.fromState)} → {stockState(event.toState)}</p> : null}
            {event.checkoutId ? <a className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline" href="#checkout" onClick={onClose}>Open checkout history</a> : null}
            {event.checkoutId ? <p className="break-words text-xs text-grey-2">Order ID: {event.orderReference ?? 'Not provided'} · Reason: {event.reasonCode ? checkoutReasonLabels[event.reasonCode as keyof typeof checkoutReasonLabels] ?? event.reasonCode : 'Manager follow-up required'}{event.reasonNote ? ` · ${event.reasonNote}` : ''}</p> : null}
            {event.damageId ? <div className="mt-2 space-y-1 text-sm">{event.damageCause ? <p>{event.damageCause}</p> : null}{event.damageOutcome ? <p>{event.damageOutcome.replaceAll('_', ' ')}</p> : null}<p className="break-words">{event.damageDescription}</p><a href="#damage" onClick={onClose} className="inline-flex min-h-11 items-center font-semibold text-brand underline">Open damage records</a></div> : null}
            {event.kind === 'REASON_RECONCILED' ? <><Footnote>The original checkout had no reason. This classification moved no stock.</Footnote>{event.managerRemarks ? <p className="mt-1 break-words text-sm">Manager remarks: {event.managerRemarks}</p> : null}</> : null}
            {event.kind === 'PRINT_DIALOG_REQUESTED' ? <Footnote>Physical printing and attachment are not confirmed.</Footnote> : null}
            {event.kind === 'QR_PRESENTED' ? <Footnote>{event.method === 'CAMERA' ? 'Camera input' : 'Keyboard / scanner input'} · identifies the item without deducting stock.</Footnote> : null}
            <Disclosure summary="Record references"><div className="space-y-1 text-xs"><p>Acceptance sequence <Code>{event.originSequence}</Code></p><Code>{event.id}</Code>{event.movementId ? <p>Movement <Code>{event.movementId}</Code></p> : null}</div></Disclosure>
          </li>)}
        </ol>}
        <Pager page={page} pageCount={Math.ceil(data.timeline.total / data.timeline.pageSize)} total={data.timeline.total} onChange={setPage}/>
      </section>
      <Footnote>Only accepted records are shown. This view does not certify physical label attachment or stock verification.</Footnote>
    </div> : null}
  </DetailsDrawer>;
}
