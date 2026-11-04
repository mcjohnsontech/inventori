'use client';
import { useState } from 'react';
import type { AcceptedReceipt, OperationalStock } from '@dayari/contracts';

import { useApiRead } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import {
  Badge,
  Code,
  type Column,
  CopyButton,
  DataTable,
  DetailSkeleton,
  Disclosure,
  ErrorNotice,
  Footnote,
  LinkButton,
  Panel,
  Stack,
} from '../ui';
import { LabelWorkspace } from '../labels/label-workspace';
import { Totals } from './totals';

export function ReceiptDetails({
  receipt,
  onStock,
}: {
  receipt: AcceptedReceipt;
  onStock?: (productId: string) => void;
}) {
  const [labelsOpen, setLabelsOpen] = useState(false);
  const stock = useApiRead<OperationalStock>(`stock?batchId=${receipt.batch.id}`);

  const columns: Column<(typeof receipt.lines)[number]>[] = [
    {
      key: 'product',
      label: 'Product / saved SKU',
      wide: true,
      cell: (line) => (
        <>
          <span className="block font-medium">
            {line.productName} · {line.variantName}
          </span>
          <span className="mt-1 flex items-start gap-2">
            <Code>{line.fullCode}</Code>
            <CopyButton value={line.fullCode} label="saved SKU" />
          </span>
          <span className="mt-1 block">
            <Code tone="brand">
              Product {line.productCode ?? 'Code not assigned'} · Lot{' '}
              {line.lotCode ?? 'Code not assigned'}
            </Code>
          </span>
          {onStock ? (
            <LinkButton className="mt-1.5" onClick={() => onStock(line.productId)}>
              Inspect stock lots
            </LinkButton>
          ) : null}
          {line.damageReason ? (
            <span className="mt-1.5 block font-sans text-xs leading-[1.6] text-damaged">
              {line.damageReason}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'usable',
      label: 'Usable',
      align: 'right',
      cell: (line) => <Badge tone="usable">{line.usableQuantity}</Badge>,
    },
    {
      key: 'damaged',
      label: 'Damaged',
      align: 'right',
      cell: (line) => <Badge tone="damaged">{line.damagedQuantity}</Badge>,
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      cell: (line) => <span className="font-medium">{line.totalQuantity}</span>,
    },
  ];

  return (
    <section aria-label="Accepted receipt" className="space-y-4">
      <Panel
        title={receipt.batch.publicCode}
        description={`${receipt.batch.supplierName} · ${receipt.batch.sourceName}`}
        action={<Badge tone="usable">Accepted</Badge>}
      >
        <Stack gap="tight">
          <Footnote>
            Delivered {receipt.batch.deliveredOn} · Accepted{' '}
            {formatDateTime(receipt.batch.acceptedAt)}
          </Footnote>

          {receipt.batch.invoiceReference ? (
            <p className="font-sans text-sm tracking-[-0.02em] text-ink">
              Invoice reference:{' '}
              <span className="font-medium">{receipt.batch.invoiceReference}</span>
            </p>
          ) : null}

          <Totals {...receipt.totals} />

          <Disclosure summary="Acceptance evidence" className="border-t border-black/[0.06] pt-4">
            <Footnote className="mt-3">
              <Code tone="muted" className="block">
                Origin {receipt.batch.originId}
              </Code>
              <Code tone="muted" className="mt-1 block">
                Acceptance sequence {receipt.originSequence}
              </Code>
            </Footnote>
          </Disclosure>
        </Stack>
      </Panel>

      <Panel
        level={3}
        title="Delivered lines"
        description="Usable and damaged quantities are recorded separately and never combined."
        flush
      >
        <DataTable
          bare
          columns={columns}
          rows={receipt.lines}
          rowKey={(line) => line.id}
          emptyMessage="This receipt has no lines."
        />
        <Footnote className="px-5 py-4">Accepted history is immutable.</Footnote>
      </Panel>

      <Panel level={3} label="Accepted batch balances" title="Current balances in this batch">
        {stock.loading ? (
          <DetailSkeleton rows={2} />
        ) : stock.error ? (
          <ErrorNotice message={stock.error} onRetry={stock.refresh} />
        ) : (
          <ul className="space-y-2.5">
            {stock.data?.lots.map((lot) => (
              <li key={lot.lotId} className="group flex flex-wrap items-center gap-2">
                <Code>{lot.fullCode}</Code>
                <CopyButton value={lot.fullCode} label="supplier SKU" />
                <Badge tone="usable">{lot.usable} usable</Badge>
                <Badge tone="damaged">{lot.damaged} damaged</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel level={3} title="Labels" description="Printing never changes inventory.">
        <Disclosure
          summary="Print labels for this receipt"
          onOpen={() => setLabelsOpen(true)}
        >
          {labelsOpen ? <LabelWorkspace receiptId={receipt.id} compact /> : null}
        </Disclosure>
      </Panel>
    </section>
  );
}
