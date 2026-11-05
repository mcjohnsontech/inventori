'use client';
import { PagedItems } from './ui/paged-items';
import {
  ArrowUpRight01Icon,
  RefreshIcon,
  TruckDeliveryIcon,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import type { Catalogue, OperationalStock, Role } from '@dayari/contracts';

import { cn } from '../lib/cn';
import { useApiRead } from '../lib/api';
import { formatDate, isPositive } from '../lib/format';
import { stockOverview, type StockVariantRow } from '../lib/stock-overview';
import {
  Badge,
  Button,
  Code,
  type Column,
  DataTable,
  Disclosure,
  EmptyState,
  ErrorNotice,
  Field,
  Footnote,
  Icon,
  LinkButton,
  ListSkeleton,
  Page,
  PageHeader,
  Pager,
  Panel,
  SearchInput,
  Select,
  card,
} from './ui';
import type { Workspace } from './shell/destinations';

const PER_PAGE = 12;

export type ReceiptSummary = {
  id: string;
  batchId: string;
  publicCode: string;
  supplierName: string;
  sourceName: string;
  deliveredOn: string;
  acceptedAt: string;
};

const statusLabel: Record<StockVariantRow['status'], string> = {
  available: 'In stock',
  empty: 'No usable stock',
  unreceived: 'Never received',
};

export function Dashboard({
  catalogue,
  name,
  role,
  navigate,
  onReceipt,
  onLot,
  onReceive,
}: {
  catalogue: Catalogue;
  name: string;
  role: Role;
  navigate: (workspace: Workspace) => void;
  onReceipt: (id: string) => void;
  onLot: (productId: string, lotId: string) => void;
  onReceive: () => void;
}) {
  const stock = useApiRead<OperationalStock>('stock');
  const receipts = useApiRead<ReceiptSummary[]>('receipts');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState('');

  const rows = stock.data ? stockOverview(catalogue, stock.data) : [];

  const visible = rows.filter((row) => {
    const haystack = `${row.productName} ${row.variantName} ${row.productCode ?? ''} ${row.lots
      .map((lot) => `${lot.fullCode} ${lot.lotCode ?? ''} ${lot.publicCode} ${lot.supplierName}`)
      .join(' ')}`.toLowerCase();

    const matches = haystack.includes(search.toLowerCase().trim());
    const inFilter =
      filter === 'all' ||
      row.status === filter ||
      (filter === 'damaged' && isPositive(row.damaged));

    return matches && inFilter;
  });

  const damagedLots = stock.data?.lots.filter((lot) => isPositive(lot.damaged)).length ?? 0;

  const summary = [
    { label: 'Variants with usable stock', value: rows.filter((r) => r.status === 'available').length, filter: 'available' },
    { label: 'Variants without usable stock', value: rows.filter((r) => r.status === 'empty').length, filter: 'empty' },
    { label: 'Not yet received', value: rows.filter((r) => r.status === 'unreceived').length, filter: 'unreceived' },
    { label: 'Lots containing damaged stock', value: damagedLots, filter: 'damaged' },
  ];

  function changeFilter(value: string) {
    setFilter(value);
    setPage(1);
    setExpanded('');
  }

  const pageCount = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;

  const columns: Column<StockVariantRow>[] = [
    {
      key: 'product',
      label: 'Product',
      wide: true,
      cell: (row) => (
        <>
          <strong className="block font-semibold">{row.productName}</strong>
          <span className="mt-0.5 block font-sans text-xs text-grey-3">{row.variantName}</span>
          {row.productCode ? (
            <Code tone="brand" className="mt-0.5 block">
              {row.productCode}
            </Code>
          ) : null}
        </>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      cell: (row) => (
        <Badge tone={row.status === 'available' ? 'usable' : 'neutral'}>
          {statusLabel[row.status]}
        </Badge>
      ),
    },
    { key: 'usable', label: 'Usable', align: 'right', cell: (row) => row.usable },
    { key: 'damaged', label: 'Damaged', align: 'right', cell: (row) => row.damaged },
    {
      key: 'lots',
      label: 'Lots',
      cell: (row) =>
        row.lots.length ? (
          <LinkButton
            aria-expanded={expanded === row.variantId}
            aria-controls={`lots-${row.variantId}`}
            onClick={() => setExpanded(expanded === row.variantId ? '' : row.variantId)}
          >
            {row.lots.length} {row.lots.length === 1 ? 'lot' : 'lots'}{' '}
            {expanded === row.variantId ? '−' : '+'}
          </LinkButton>
        ) : (
          <span className="text-grey-3">—</span>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow={role === 'MANAGER' ? 'Inventory Manager · Stock overview' : 'Stock overview'}
        title={`Welcome, ${name.split(' ')[0]}`}
        description="What is available, what has arrived and which stock needs attention."
        actions={
          <>
            <Button variant="secondary" onClick={stock.refresh}>
              <Icon icon={RefreshIcon} size={15} />
              Refresh stock
            </Button>
            <Button onClick={onReceive}>
              Receive a delivery
              <Icon icon={ArrowUpRight01Icon} size={16} strokeWidth={2} />
            </Button>
          </>
        }
      />

      <div
        aria-label="Stock summary"
        className="stock-summary-strip mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {summary.map((item) => (
          <div
            key={item.label}
            className={cn(
              card,
              'px-5 py-4 text-left',
            )}
          >
            <span className="block font-sans text-xs font-semibold tracking-[0.07em] text-grey-3 uppercase">
              {item.label}
            </span>
            <strong className="mt-2 block font-display text-3xl leading-none font-semibold tracking-[-0.03em] text-brand-deep">
              {item.value}
            </strong>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Panel
          title="Product availability"
          description="Quantities stay separated by variant. Open lots to compare suppliers and batches."
          action={
            <Button variant="secondary" size="compact" onClick={() => navigate('inventory')}>
              Open inventory sheet
            </Button>
          }
          flush
        >
          <div className="flex flex-col gap-3 border-b border-black/[0.06] px-5 pb-4 sm:flex-row sm:items-end">
            <SearchInput
              label="Search stock overview"
              value={search}
              placeholder="Product, variant, saved SKU or code…"
              className="w-full sm:w-[320px]"
              onChange={(value) => {
                setSearch(value);
                setPage(1);
                setExpanded('');
              }}
            />
            <Field label="Stock status" className="w-full sm:w-[220px]">
              {(id) => (
                <Select
                  id={id}
                  label="Stock status"
                  value={filter}
                  onChange={changeFilter}
                  options={[
                    { value: 'all', label: 'All variants' },
                    { value: 'available', label: 'In stock' },
                    { value: 'empty', label: 'No usable stock' },
                    { value: 'unreceived', label: 'Never received' },
                    { value: 'damaged', label: 'Has damaged stock' },
                  ]}
                />
              )}
            </Field>
          </div>

          {stock.loading ? (
            <ListSkeleton rows={6} />
          ) : stock.error ? (
            <div className="p-5">
              <ErrorNotice message={stock.error} onRetry={stock.refresh} />
            </div>
          ) : !visible.length ? (
            <EmptyState title="No variants match this view">
              Try another filter or search.{' '}
              {role === 'ADMIN'
                ? 'Register products in the catalogue to get started.'
                : 'Ask Admin to register missing products.'}
            </EmptyState>
          ) : (
            <DataTable
              bare
              label="Product stock availability"
              columns={columns}
              rows={visible.slice(start, start + PER_PAGE)}
              rowKey={(row) => row.variantId}
              emptyMessage="No variants match this view."
              subRow={(row) =>
                row.variantId === expanded ? (
                  <section
                    id={`lots-${row.variantId}`}
                    aria-label={`Delivery lots for ${row.productName} ${row.variantName}`}
                    className="px-4 py-3 sm:px-5"
                  >
                    <PagedItems items={row.lots} size={6} key={row.variantId}>
                      {(pageItems) => (
                        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {pageItems.map((lot) => (
                            <li key={lot.lotId}>
                              <button
                                type="button"
                                onClick={() => onLot(row.productId, lot.lotId)}
                                className="w-full rounded-lg border border-black/[0.06] bg-white px-3 py-2 text-left transition-colors hover:border-brand/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                              >
                                <span className="flex flex-wrap items-center justify-between gap-2">
                                  <strong className="font-mono text-xs font-medium text-brand">
                                    {lot.lotCode ?? lot.publicCode}
                                  </strong>
                                  <span className="flex gap-1.5">
                                    <Badge tone="usable">{lot.usable}</Badge>
                                    <Badge tone="damaged">{lot.damaged}</Badge>
                                  </span>
                                </span>
                                <span className="mt-1 flex flex-wrap items-center gap-x-2 font-sans text-xs tracking-[-0.02em] text-grey-3">
                                  <span className="font-mono">{lot.fullCode}</span>
                                  <span>{lot.supplierName}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </PagedItems>
                  </section>
                ) : null
              }
            />
          )}

          <Pager
            page={current}
            pageCount={pageCount}
            total={visible.length}
            onChange={setPage}
          />

          <Footnote className="px-5 pb-4">
            Low-stock thresholds are not configured. Figures reflect recorded movements; physical
            counts are not verified here.
          </Footnote>
        </Panel>
      </div>



      <div className="mt-4">
        <Panel
          title="Recent receiving activity"
          description="The latest accepted deliveries, newest first."
          action={
            <Button variant="secondary" size="compact" onClick={() => navigate('receipts')}>
              View receipts
            </Button>
          }
          flush
        >
          {receipts.loading ? (
            <ListSkeleton rows={3} />
          ) : receipts.error ? (
            <div className="px-5 pb-5">
              <ErrorNotice message={receipts.error} onRetry={receipts.refresh} />
            </div>
          ) : !receipts.data?.length ? (
            <EmptyState title="Ready for your first delivery" icon={TruckDeliveryIcon}>
              Select a saved supplier and sourced product to receive stock.
            </EmptyState>
          ) : (
            <PagedItems items={receipts.data} size={5}>{pageItems => <ul className="divide-y divide-black/[0.06]">{pageItems.map((receipt) => (
                <li key={receipt.id}>
                  <button
                    type="button"
                    onClick={() => onReceipt(receipt.id)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-muted/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
                      <Icon icon={TruckDeliveryIcon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Code className="block font-medium text-ink">{receipt.publicCode}</Code>
                      <span className="mt-0.5 block truncate font-sans text-xs tracking-[-0.02em] text-grey-3">
                        {receipt.supplierName} · {receipt.sourceName}
                      </span>
                    </span>
                    <span className="shrink-0 font-sans text-xs tracking-[-0.02em] text-grey-3">
                      {formatDate(receipt.acceptedAt)}
                    </span>
                  </button>
                </li>
              ))}</ul>}</PagedItems>
          )}
        </Panel>
      </div>
    </Page>
  );
}
