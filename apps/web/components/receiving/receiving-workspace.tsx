'use client';
import { TruckDeliveryIcon } from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import type { AcceptedReceipt, ReceivingOptions, Catalogue, Role } from '@dayari/contracts';

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

export function ReceivingWorkspace({
  role,
  onSupplier,
  initialReceiptId = '',
  onUnitLabels,
  onHistory,
  onInventory,
  onCatalogueChanged,
}: {
  role: Role;
  onSupplier: () => void;
  initialReceiptId?: string;
  onUnitLabels?: (receiptId:string)=>void;
  onHistory?: () => void;
  onInventory?: (id: string) => void;
  onCatalogueChanged?: (catalogue: Catalogue) => void;
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
              disabled={options.loading || Boolean(options.error) || (!options.data?.suppliers.length && role !== 'ADMIN')}
              onClick={() => options.data?.suppliers.length ? setOpen(true) : onSupplier()}
            >
              {!options.loading && !options.data?.suppliers.length && role === 'ADMIN' ? 'Add supplier' : 'Receive delivery'}
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
        ) : !options.data?.suppliers.length ? (
          <EmptyState title="No receiving suppliers configured" icon={TruckDeliveryIcon}>
            {role === 'ADMIN'
              ? 'Add your first supplier and its saved location prefix to start receiving deliveries.'
              : 'Ask an Admin to register a supplier and its location prefix first.'}
          </EmptyState>
        ) : null}

        {selected.loading ? (
          <div className={cn(card, 'p-6')}>
            <DetailSkeleton rows={5} />
          </div>
        ) : null}
        {selected.error ? (
          <ErrorNotice message={selected.error} onRetry={selected.refresh} />
        ) : null}

        {receipt ? (
          <ReceiptDetails key={receipt.id} receipt={receipt} onStock={onInventory} onUnitLabels={onUnitLabels} />
        ) : null}
      </div>

      <Footnote className="mt-5">
        Acceptance creates immutable receipt evidence. After a lost response, retry the same
        unchanged draft; Dayari preserves its submission key.
      </Footnote>

      {open && options.data ? (
        <ReceiveWizard
          options={options.data}
          onCatalogueChanged={onCatalogueChanged}
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
