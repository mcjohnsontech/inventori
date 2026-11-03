'use client';
import { TruckDeliveryIcon } from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import type { AcceptedReceipt, ReceivingOptions } from '@dayari/contracts';

import { cn } from '../../lib/cn';
import { useApiRead } from '../../lib/api';
import {
  Badge,
  Button,
  DetailSkeleton,
  EmptyState,
  ErrorNotice,
  Footnote,
  Page,
  PageHeader,
  Panel,
  card,
} from '../ui';
import { ReceiptDetails } from './receipt-details';
import { ReceiveWizard } from './receive-wizard';

export { ReceiptDetails } from './receipt-details';

const guide = [
  { step: '1. Choose the source', detail: 'One supplier location for the entire delivery.' },
  { step: '2. Add delivered variants', detail: 'Use saved SKUs across multiple products.' },
  { step: '3. Review and accept', detail: 'All lines, batch and movements commit together.' },
];

export function ReceivingWorkspace({
  initialReceiptId = '',
  onHistory,
  onInventory,
}: {
  initialReceiptId?: string;
  onHistory?: () => void;
  onInventory?: (id: string) => void;
}) {
  const options = useApiRead<ReceivingOptions>('receiving/options');
  const selected = useApiRead<AcceptedReceipt>(
    initialReceiptId ? `receipts/${initialReceiptId}` : null,
  );

  const [receipt, setReceipt] = useState<AcceptedReceipt | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selected.data) setReceipt(selected.data);
  }, [selected.data]);

  return (
    <Page>
      <PageHeader
        eyebrow="Local stock operations"
        title="Receiving"
        description="Accept one supplier delivery with all its products and variants. Usable and damaged arrivals are recorded separately."
        actions={
          <>
            {onHistory ? (
              <Button variant="secondary" onClick={onHistory}>
                Receipt history
              </Button>
            ) : null}
            <Button
              disabled={options.loading || !options.data?.skus.length}
              onClick={() => setOpen(true)}
            >
              Receive delivery
            </Button>
          </>
        }
      />

      <div className="mt-8 space-y-4">
        {options.loading ? (
          <div className={cn(card, 'p-6')}>
            <DetailSkeleton rows={3} />
          </div>
        ) : options.error ? (
          <ErrorNotice message={options.error} onRetry={options.refresh} />
        ) : (
          <Panel
            title="Ready to receive"
            description="How a delivery is accepted into the ledger."
            action={
              <Badge tone="brand">
                {options.data?.suppliers.length ?? 0} suppliers with sourced SKUs
              </Badge>
            }
          >
            <ol className="grid gap-5 sm:grid-cols-3">
              {guide.map((item) => (
                <li key={item.step}>
                  <strong className="block font-sans text-sm font-semibold tracking-[-0.02em] text-brand">
                    {item.step}
                  </strong>
                  <span className="mt-2 block font-sans text-xs leading-[1.7] tracking-[-0.02em] text-grey-2">
                    {item.detail}
                  </span>
                </li>
              ))}
            </ol>

            {!options.data?.skus.length ? (
              <div className="mt-4 border-t border-black/[0.06]">
                <EmptyState title="Complete catalogue setup first" icon={TruckDeliveryIcon}>
                  Ask Admin to register a supplier source and its product SKUs before receiving.
                </EmptyState>
              </div>
            ) : null}
          </Panel>
        )}

        {selected.loading ? (
          <div className={cn(card, 'p-6')}>
            <DetailSkeleton rows={5} />
          </div>
        ) : null}
        {selected.error ? (
          <ErrorNotice message={selected.error} onRetry={selected.refresh} />
        ) : null}

        {receipt ? (
          <ReceiptDetails key={receipt.id} receipt={receipt} onStock={onInventory} />
        ) : null}
      </div>

      <Footnote className="mt-5">
        Acceptance creates immutable receipt evidence. After a lost response, retry the same
        unchanged draft; Dayari preserves its submission key.
      </Footnote>

      {open && options.data ? (
        <ReceiveWizard
          options={options.data}
          onClose={() => setOpen(false)}
          onSaved={(result) => {
            setOpen(false);
            setReceipt(result);
          }}
        />
      ) : null}
    </Page>
  );
}
