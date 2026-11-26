'use client';
import { LIST_PAGE_SIZE } from '@dayari/contracts';
import { ArrowLeft01Icon, ArrowRight01Icon, Invoice01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import type { AcceptedReceipt } from '@dayari/contracts';

import { cn } from '../../lib/cn';
import { useApiRead } from '../../lib/api';
import { formatDate, formatDateTime, plural } from '../../lib/format';
import type { ReceiptSummary } from '../dashboard';
import { MissingCosts } from './missing-costs';
import {
  Badge,
  Breadcrumb,
  Button,
  Code,
  DetailSkeleton,
  DetailsDrawer,
  EmptyState,
  ErrorNotice,
  Field,
  Footnote,
  Icon,
  Input,
  LinkButton,
  ListSkeleton,
  Page,
  PageHeader,
  Pager,
  SearchInput,
  card,
} from '../ui';
import { ReceiptDetails } from './receipt-details';

const PER_PAGE = LIST_PAGE_SIZE;

/** Label progress for a delivery. "Printed" means the labels were sent to the printer. */
function LabelStatus({ row }: { row: ReceiptSummary }) {
  const units = row.labelledUnits ?? 0, printed = row.labelsPrinted ?? 0;
  if (!units) return null;
  if (printed >= units) return <Badge tone="usable">Labels printed</Badge>;
  if (printed > 0) return <Badge tone="damaged">{printed} of {units} labels printed</Badge>;
  return <Badge tone="danger">Labels not printed</Badge>;
}

export function ReceiptsWorkspace({
  initialReceiptId = '',
  onUnitLabels,
  onStock,
  onSelect,
  onReceive,
}: {
  initialReceiptId?: string;
  onUnitLabels?: (receiptId:string)=>void;
  onStock: (id: string) => void;
  onSelect: (id: string) => void;
  onReceive?: () => void;
}) {
  const [id, setId] = useState(initialReceiptId);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => setId(initialReceiptId), [initialReceiptId]);

  function select(next: string) {
    onSelect(next);
  }

  const history = useApiRead<ReceiptSummary[]>('receipts');
  const receipt = useApiRead<AcceptedReceipt>(id ? `receipts/${id}` : null);

  const rows = (history.data ?? []).filter(
    (row) =>
      `${row.publicCode} ${row.supplierName} ${row.sourceName}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!date || row.deliveredOn === date),
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;

  return (
    <Page>
      <PageHeader
        eyebrow="Deliveries"
        title="Deliveries"
        description="Immutable delivery records, ordered by acceptance. Delivery dates remain separate from the time stock was recorded."
        actions={
          <>
            {onReceive ? <Button onClick={onReceive}>Receive delivery</Button> : null}
            <Button
              variant="secondary"
              onClick={() => {
                history.refresh();
                if (id) receipt.refresh();
              }}
            >
              <Icon icon={RefreshIcon} size={15} />
              Refresh receipts
            </Button>
          </>
        }
      />

      <MissingCosts onSaved={() => { if (id) receipt.refresh(); }} />

      {id ? (
        <DetailsDrawer wide title="Accepted receipt" closeLabel="Close receipt details" onClose={()=>select('')}>
          <Breadcrumb>
            <LinkButton onClick={() => select('')}>
              <Icon icon={ArrowLeft01Icon} size={15} strokeWidth={2} />
              Back to receipt history
            </LinkButton>
          </Breadcrumb>

          {receipt.loading ? (
            <div className={cn(card, 'p-6')}>
              <DetailSkeleton rows={5} />
            </div>
          ) : receipt.error ? (
            <ErrorNotice message={receipt.error} onRetry={receipt.refresh} />
          ) : receipt.data ? (
            <ReceiptDetails key={receipt.data.id} receipt={receipt.data} onStock={onStock} onUnitLabels={onUnitLabels} />
          ) : null}
        </DetailsDrawer>
      ) : null}
        <section className={cn(card, 'mt-8 overflow-hidden')}>
          <div className="flex flex-col gap-3 border-b border-black/[0.06] px-5 py-4 sm:flex-row sm:flex-wrap sm:items-end">
            <SearchInput
              label="Search receipts"
              value={search}
              placeholder="Batch, supplier or source…"
              className="w-full sm:w-[300px]"
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
            <Field label="Delivery date" className="w-full sm:w-auto">
              {(fieldId) => (
                <Input
                  id={fieldId}
                  type="date"
                  value={date}
                  className="sm:w-[180px]"
                  onChange={(event) => {
                    setDate(event.target.value);
                    setPage(1);
                  }}
                />
              )}
            </Field>
            {search || date ? (
              <Button
                variant="secondary"
                size="compact"
                className="self-start sm:mb-0.5"
                onClick={() => {
                  setSearch('');
                  setDate('');
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>

          <Footnote className="border-b border-black/[0.06] px-5 py-3">
            Showing the latest 100 deliveries. Search and date filters apply to these.
          </Footnote>

          {history.loading ? (
            <ListSkeleton rows={6} />
          ) : history.error ? (
            <div className="p-5">
              <ErrorNotice message={history.error} onRetry={history.refresh} />
            </div>
          ) : !rows.length ? (
            <EmptyState title="No receipts in this view" icon={Invoice01Icon}>
              Accepted deliveries will appear here. Try clearing filters if you expected a recent
              receipt.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {rows.slice(start, start + PER_PAGE).map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => select(row.id)}
                    aria-label={`View receipt ${row.publicCode}`}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-4 text-left transition-colors hover:bg-surface-muted/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
                        {row.supplierName} · {row.sourceName}
                      </span>
                      <Code tone="muted" className="mt-0.5 block text-xs">
                        {row.publicCode}
                      </Code>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 font-sans text-xs text-grey-2">
                        <span>{plural(Number(row.totalItems ?? 0), 'item')} received</span>
                        <LabelStatus row={row} />
                      </span>
                    </span>
                    <span className="col-span-2 row-start-2 font-sans text-xs leading-[1.7] tracking-[-0.02em] text-grey-2 md:col-span-1 md:row-start-auto">
                      Delivered {formatDate(row.deliveredOn)}
                      <span className="block text-grey-3">Received {formatDateTime(row.acceptedAt)}</span>
                    </span>
                    <Icon icon={ArrowRight01Icon} size={16} strokeWidth={2} className="row-start-1 justify-self-end text-grey-3 md:row-start-auto" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Pager page={current} pageCount={pageCount} total={rows.length} onChange={setPage} />
        </section>

      <Footnote className="mt-5">
        Accepted deliveries can't be edited. Open a receipt to see its items, lots and labels.
      </Footnote>
    </Page>
  );
}
