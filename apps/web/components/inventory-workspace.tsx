'use client';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BoxesIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { useEffect, useRef, useState } from 'react';
import type { Catalogue, LotEvidence, OperationalStock } from '@dayari/contracts';

import { cn } from '../lib/cn';
import { useApiRead } from '../lib/api';
import { formatDateTime, formatTime, isPositive } from '../lib/format';
import {
  Badge,
  Breadcrumb,
  Button,
  CardGridSkeleton,
  Code,
  type Column,
  CopyButton,
  DataTable,
  DetailsDrawer,
  DetailSkeleton,
  Disclosure,
  EmptyState,
  ErrorNotice,
  Footnote,
  Icon,
  Field,
  LinkButton,
  Page,
  PageHeader,
  Pager,
  SearchInput,
  Select,
  Stack,
  Tabs,
  card,
} from './ui';
import { IdentityLookup } from './identity-lookup';

const PER_PAGE = 18;

type Group = 'lots' | 'sku';

export function InventoryWorkspace({
  catalogue,
  initialProductId = '',
  initialLotId = '',
  onReceipt,
  onProductDetail,
  onProductFilter,
}: {
  catalogue: Catalogue;
  initialProductId?: string;
  initialLotId?: string;
  onReceipt: (id: string) => void;
  onProductDetail: (id: string) => void;
  onProductFilter: (id: string) => void;
}) {
  const [productId, setProductId] = useState(initialProductId);
  const [sourceId, setSourceId] = useState('');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const [group, setGroup] = useState<Group>('lots');
  const [selected, setSelected] = useState(initialLotId);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const details = useRef<HTMLElement>(null);

  useEffect(() => setProductId(initialProductId), [initialProductId]);
  useEffect(() => setSelected(initialLotId), [initialLotId]);

  useEffect(() => {
    if (selected) {
      details.current?.scrollIntoView({ block: 'start' });
      details.current?.focus({ preventScroll: true });
    }
  }, [selected]);

  const params = new URLSearchParams({
    ...(productId ? { productId } : {}),
    ...(sourceId ? { sourceId } : {}),
  });

  const stock = useApiRead<OperationalStock>(`stock?${params}`);
  const evidence = useApiRead<LotEvidence>(selected ? `stock/lots/${selected}` : null);

  const lots = (stock.data?.lots ?? []).filter(
    (lot) =>
      `${lot.productName} ${lot.variantName} ${lot.fullCode} ${lot.publicCode} ${lot.productCode ?? ''} ${lot.lotCode ?? ''} ${lot.supplierName} ${lot.sourceName}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (state === 'all' ||
        (state === 'out'
          ? !isPositive(lot.usable)
          : isPositive(state === 'usable' ? lot.usable : lot.damaged))),
  );

  const skus = (stock.data?.bySku ?? []).filter((sku) =>
    lots.some((lot) => lot.skuId === sku.skuId),
  );

  const lot = stock.data?.lots.find((item) => item.lotId === selected);
  const total = group === 'lots' ? lots.length : skus.length;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;

  function reset() {
    setPage(1);
    setSelected('');
  }

  const lotColumns: Column<(typeof lots)[number]>[] = [
    {
      key: 'product',
      label: 'Product / variant',
      wide: true,
      cell: (row) => (
        <>
          <span className="block font-medium">{row.productName}</span>
          <span className="mt-0.5 block font-sans text-xs text-grey-3">{row.variantName}</span>
          <Code tone="brand" className="mt-0.5 block">
            {row.productCode ?? 'Code not assigned'}
          </Code>
        </>
      ),
    },
    {
      key: 'sku',
      label: 'Supplier SKU / source',
      wide: true,
      cell: (row) => (
        <>
          <span className="flex items-start gap-2">
            <Code>{row.fullCode}</Code>
            <CopyButton value={row.fullCode} label="supplier SKU" />
          </span>
          <span className="mt-0.5 block font-sans text-xs text-grey-3">
            {row.supplierName} · {row.sourceName}
          </span>
        </>
      ),
    },
    {
      key: 'lot',
      label: 'Lot / batch',
      cell: (row) => (
        <>
          <Code tone="brand" className="block">
            {row.lotCode ?? 'Code not assigned'}
          </Code>
          <Code tone="muted" className="mt-0.5 block">
            {row.publicCode}
          </Code>
        </>
      ),
    },
    {
      key: 'usable',
      label: 'Usable',
      align: 'right',
      cell: (row) => <Badge tone="usable">{row.usable}</Badge>,
    },
    {
      key: 'damaged',
      label: 'Damaged',
      align: 'right',
      cell: (row) => <Badge tone="damaged">{row.damaged}</Badge>,
    },
    {
      key: 'details',
      label: 'Details',
      cell: (row) => (
        <LinkButton
          aria-label={`Details for lot ${row.lotCode ?? row.publicCode}`}
          onClick={() => setSelected(row.lotId)}
        >
          Details
          <Icon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
        </LinkButton>
      ),
    },
  ];

  const skuColumns: Column<(typeof skus)[number]>[] = [
    {
      key: 'sku',
      label: 'Supplier SKU / variant',
      wide: true,
      cell: (row) => {
        const source = stock.data!.lots.find((item) => item.skuId === row.skuId)!;

        return (
          <>
            <span className="block font-medium">
              {source.productName} · {source.variantName}
            </span>
            <span className="mt-1 flex items-start gap-2">
              <Code tone="brand">{row.fullCode}</Code>
              <CopyButton value={row.fullCode} label="supplier SKU" />
            </span>
          </>
        );
      },
    },
    {
      key: 'usable',
      label: 'Usable',
      align: 'right',
      cell: (row) => <Badge tone="usable">{row.usable}</Badge>,
    },
    {
      key: 'damaged',
      label: 'Damaged',
      align: 'right',
      cell: (row) => <Badge tone="damaged">{row.damaged}</Badge>,
    },
    {
      key: 'batches',
      label: 'Batch provenance',
      cell: (row) => (
        <LinkButton
          onClick={() => {
            setSearch(row.fullCode);
            setGroup('lots');
            setPage(1);
          }}
        >
          View delivery lots
        </LinkButton>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Authoritative shop stock"
        title="Inventory"
        description="Find products, compare saved SKUs and inspect each delivery lot."
        actions={
          <Button variant="secondary" onClick={stock.refresh}>
            <Icon icon={RefreshIcon} size={15} />
            Refresh stock
          </Button>
        }
      />

      {productId ? (
        <Breadcrumb>
          <LinkButton onClick={() => onProductDetail(productId)}>
            <Icon icon={ArrowLeft01Icon} size={15} strokeWidth={2} />
            Back to{' '}
            {catalogue.products.find((product) => product.id === productId)?.name ?? 'product'}
          </LinkButton>
        </Breadcrumb>
      ) : null}

      <section className={cn(card, 'mt-8 overflow-hidden')}>
        <div className="grid gap-3 border-b border-black/[0.06] px-5 py-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] lg:items-end">
          <SearchInput
            label="Search inventory"
            value={search}
            placeholder="Product, variant, SKU, lot or batch…"
            onChange={(value) => {
              setSearch(value);
              reset();
            }}
          />

          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="stock-filters"
            onClick={() => setFiltersOpen((open) => !open)}
            className="justify-self-start font-sans text-[13px] font-semibold tracking-[-0.02em] text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:hidden"
          >
            {filtersOpen ? 'Hide stock filters' : 'Filter stock'}
            {productId || sourceId || state !== 'all' ? ' · active' : ''}
          </button>

          <div
            id="stock-filters"
            className={cn(
              'col-span-full grid gap-3 sm:grid-cols-3 lg:contents',
              !filtersOpen && 'max-sm:hidden',
            )}
          >
            <Field label="Product">
              {(id) => (
                <Select
                  id={id}
                  label="Product"
                  value={productId || 'all'}
                  onChange={(value) => {
                    const next = value === 'all' ? '' : value;
                    setProductId(next);
                    onProductFilter(next);
                    reset();
                  }}
                  options={[
                    { value: 'all', label: 'All products' },
                    ...catalogue.products.map((product) => ({
                      value: product.id,
                      label: product.name,
                    })),
                  ]}
                />
              )}
            </Field>
            <Field label="Supplier source">
              {(id) => (
                <Select
                  id={id}
                  label="Supplier source"
                  value={sourceId || 'all'}
                  onChange={(value) => {
                    setSourceId(value === 'all' ? '' : value);
                    reset();
                  }}
                  options={[
                    { value: 'all', label: 'All sources' },
                    ...catalogue.suppliers.flatMap((supplier) =>
                      supplier.sources.map((source) => ({
                        value: source.id,
                        label: `${supplier.name} · ${source.name}`,
                      })),
                    ),
                  ]}
                />
              )}
            </Field>
            <Field label="Availability">
              {(id) => (
                <Select
                  id={id}
                  label="Availability"
                  value={state}
                  onChange={(value) => {
                    setState(value);
                    reset();
                  }}
                  options={[
                    { value: 'all', label: 'All stock lots' },
                    { value: 'usable', label: 'Has usable stock' },
                    { value: 'damaged', label: 'Has damaged stock' },
                  { value: 'out', label: 'No usable stock' },
                  ]}
                />
              )}
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-black/[0.06] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            label="Stock grouping"
            value={group}
            onChange={(value) => {
              setGroup(value);
              setPage(1);
            }}
            tabs={[
              { value: 'lots', label: 'Delivery lots' },
              { value: 'sku', label: 'SKU balances' },
            ]}
          />
          <span className="font-sans text-xs tracking-[-0.02em] text-grey-3">
            {stock.data ? `As of ${formatTime(stock.data.asOf)}` : 'Loading local projection…'}
          </span>
        </div>

        {group === 'sku' ? (
          <Footnote className="border-b border-black/[0.06] px-5 py-3">
            SKU balances include all delivery batches for the selected product and source. Text and
            availability filters choose matching SKUs, not partial quantities.
          </Footnote>
        ) : null}

        {stock.loading ? (
          <CardGridSkeleton />
        ) : stock.error ? (
          <div className="p-5">
            <ErrorNotice message={stock.error} onRetry={stock.refresh} />
          </div>
        ) : !total ? (
          <EmptyState title="No stock matches this view" icon={BoxesIcon}>
            Try another filter. Registered catalogue variants appear here after an accepted
            delivery.
          </EmptyState>
        ) : group === 'lots' ? (
          <DataTable
            bare
            label="Inventory delivery lots"
            columns={lotColumns}
            rows={lots.slice(start, start + PER_PAGE)}
            rowKey={(row) => row.lotId}
            emptyMessage="No delivery lots match this view."
          />
        ) : (
          <DataTable
            bare
            label="Inventory SKU balances"
            columns={skuColumns}
            rows={skus.slice(start, start + PER_PAGE)}
            rowKey={(row) => row.skuId}
            emptyMessage="No SKU balances match this view."
          />
        )}

        <Pager page={current} pageCount={pageCount} total={total} onChange={setPage} />
      </section>

      {lot ? (
        <DetailsDrawer
          title={`${lot.productName} · ${lot.variantName}`}
          onClose={() => setSelected('')}
        >
          <section aria-label="Lot provenance">
            <p className="font-sans text-sm tracking-[-0.02em] text-grey-2">
              {lot.supplierName} · {lot.sourceName}
            </p>
            <p className="mt-2 font-sans text-sm tracking-[-0.02em] text-ink">
              Product {lot.productCode ?? 'Code not assigned'} · Lot{' '}
              {lot.lotCode ?? 'Code not assigned'} · Batch {lot.publicCode}
            </p>
            <div className="mt-4">
            <Stack gap="tight">
              <span className="flex items-start gap-2">
                <Code className="text-sm">{lot.fullCode}</Code>
                <CopyButton value={lot.fullCode} label="supplier SKU" />
              </span>
              <div className="flex flex-wrap gap-2">
                <Badge tone="usable">{lot.usable} usable</Badge>
                <Badge tone="damaged">{lot.damaged} damaged</Badge>
              </div>

              {evidence.loading ? (
                <DetailSkeleton />
              ) : evidence.error ? (
                <ErrorNotice message={evidence.error} onRetry={evidence.refresh} />
              ) : evidence.data ? (
                <>
                  <Footnote>
                    Delivered {evidence.data.deliveredOn} · Accepted{' '}
                    {formatDateTime(evidence.data.acceptedAt)} · Sequence{' '}
                    {evidence.data.originSequence}
                  </Footnote>
                  <ul className="space-y-1.5 border-t border-black/[0.06] pt-4">
                    {evidence.data.movements.map((movement) => (
                      <li
                        key={movement.id}
                        className="font-sans text-sm tracking-[-0.02em] text-ink"
                      >
                        External arrival → {movement.toState === 'U' ? 'Usable' : 'Damaged'}{' '}
                        <strong className="font-semibold">{movement.quantity}</strong>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="secondary"
                    onClick={() => onReceipt(evidence.data!.receiptId)}
                  >
                    View accepted receipt
                  </Button>
                </>
              ) : null}

              <Disclosure summary="Immutable identity details" className="border-t border-black/[0.06] pt-4">
                <Footnote className="mt-3">
                  <Code tone="muted" className="block">
                    Lot {lot.lotId}
                  </Code>
                  <Code tone="muted" className="mt-1 block">
                    Batch {lot.batchId}
                  </Code>
                  <Code tone="muted" className="mt-1 block">
                    Origin {lot.originId}
                  </Code>
                </Footnote>
              </Disclosure>
            </Stack>
            </div>
          </section>
        </DetailsDrawer>
      ) : null}

      <Disclosure summary="Exact Product or Lot Code lookup" className="mt-5">
        <IdentityLookup />
      </Disclosure>

      <Footnote className="mt-5">
        Balances are server projections of the immutable movement ledger. Printing and
        identification never change stock.
      </Footnote>
    </Page>
  );
}
