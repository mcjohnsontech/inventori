'use client';
import { ArrowLeft01Icon, ArrowRight01Icon, Invoice01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import type { AcceptedReceipt } from '@dayari/contracts';

import { cn } from '../../lib/cn';
import { useApiRead } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { ReceiptSummary } from '../dashboard';
import {
  Badge,
  Breadcrumb,
  Button,
  Code,
  DetailSkeleton,
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

const PER_PAGE = 12;

export function ReceiptsWorkspace({
  initialReceiptId = '',
  onStock,
  onSelect,
  onReceive,
}: {
  initialReceiptId?: string;
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
    setId(next);
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
        eyebrow="Accepted operational evidence"
        title="Receipts & activity"
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

      {id ? (
        <div className="mt-8">
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
            <ReceiptDetails key={receipt.data.id} receipt={receipt.data} onStock={onStock} />
          ) : null}
        </div>
      ) : (
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
            Latest 100 accepted deliveries. Filters apply to this recent-history window.
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
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-surface-muted/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto]"
                  >
                    <span className="min-w-0">
                      <Code tone="brand" className="block font-medium">
                        {row.publicCode}
                      </Code>
                      <span className="mt-0.5 block truncate font-sans text-xs tracking-[-0.02em] text-grey-3">
                        {row.supplierName} · {row.sourceName}
                      </span>
                    </span>
                    <span className="col-span-2 font-sans text-xs leading-[1.7] tracking-[-0.02em] text-grey-3 md:col-span-1">
                      Delivered {row.deliveredOn}
                      <br />
                      Accepted {formatDateTime(row.acceptedAt)}
                    </span>
                    <Badge tone="usable" className="justify-self-start">
                      Accepted
                    </Badge>
                    <span className="flex items-center gap-1.5 justify-self-end font-sans text-[13px] font-semibold tracking-[-0.02em] text-brand">
                      <span className="hidden sm:inline">View receipt</span>
                      <Icon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Pager page={current} pageCount={pageCount} total={rows.length} onChange={setPage} />
        </section>
      )}

      <Footnote className="mt-5">
        Receipt and lot movement summaries are operational evidence. Security logs and unrestricted
        audit snapshots are not exposed here.
      </Footnote>
    </Page>
  );
}
