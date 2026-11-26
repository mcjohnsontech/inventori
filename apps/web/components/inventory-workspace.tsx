'use client';
import { LIST_PAGE_SIZE } from '@dayari/contracts';
import { FinancialSummary } from './financial';
import { MoneyOnly } from '../lib/role';
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
import { formatDate, formatDateTime, formatTime, isPositive, plural, sumQuantities } from '../lib/format';
import {
  Badge,
  Breadcrumb,
  Button,
  ListSkeleton,
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
import { PagedItems } from './ui/paged-items';
import { ExactUnitMatch } from './exact-unit-match';
import { UnitTrackingDrawer } from './unit-tracking-drawer';

const PER_PAGE = LIST_PAGE_SIZE;

type Group = 'products' | 'lots' | 'sku';

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
  const [group, setGroup] = useState<Group>('products');
  const [selected, setSelected] = useState(initialLotId);
  const [page, setPage] = useState(1);
  const [unitSelected, setUnitSelected] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const details = useRef<HTMLElement>(null);

  useEffect(() => setProductId(initialProductId), [initialProductId]);
  useEffect(() => {
    setSelected(initialLotId);
    if (initialLotId) {
      // An explicit lot link must resolve even when the previous view filtered
      // out its supplier or variant. Ordinary drawer opens retain draft filters.
      setSourceId('');
      setSearch('');
      setState('all');
      setPage(1);
    }
  }, [initialLotId]);

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
  const products=[...new Map(lots.map(row=>[row.productId,{id:row.productId,name:row.productName,code:row.productCode}])).values()];
  const total = group === 'products' ? products.length : group === 'lots' ? lots.length : skus.length;
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
          {row.productCode ? (
            <Code tone="brand" className="mt-0.5 block">
              {row.productCode}
            </Code>
          ) : null}
        </>
      ),
    },
    {
      key: 'sku',
      label: 'Supplier code / source',
      wide: true,
      cell: (row) => (
        <>
          <span className="flex items-start gap-2">
            <Code>{row.fullCode}</Code>
            <CopyButton value={row.fullCode} label="supplier code" />
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
          {row.lotCode ? (
            <Code tone="brand" className="block">
              {row.lotCode}
            </Code>
          ) : null}
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
      label: 'Supplier code / variant',
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
              <CopyButton value={row.fullCode} label="supplier code" />
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
      label: 'Delivery lots',
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
        title="All stock"
        description="Find products, compare supplier codes and check each delivery lot."
        actions={
          <Button variant="secondary" onClick={stock.refresh}>
            <Icon icon={RefreshIcon} size={15} />
            Refresh stock
          </Button>
        }
      />

      <ExactUnitMatch query={search} onOpen={setUnitSelected} />

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
            placeholder="Product, variant, supplier code, item code, lot or batch…"
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
              { value: 'products', label: 'Products' },
              { value: 'lots', label: 'Delivery lots' },
              { value: 'sku', label: 'By supplier code' },
            ]}
          />
          <span className="font-sans text-xs tracking-[-0.02em] text-grey-3">
            {stock.data ? `As of ${formatTime(stock.data.asOf)}` : 'Loading…'}
          </span>
        </div>

        {group === 'sku' ? (
          <Footnote className="border-b border-black/[0.06] px-5 py-3">
            Totals include every delivery lot for each supplier code. Search and
            availability filters pick whole supplier codes, not part quantities.
          </Footnote>
        ) : null}

        {stock.loading ? (
          <div className="p-5"><ListSkeleton rows={6} /></div>
        ) : stock.error ? (
          <div className="p-5">
            <ErrorNotice message={stock.error} onRetry={stock.refresh} />
          </div>
        ) : !total ? (
          <EmptyState title="No stock matches this view" icon={BoxesIcon}>
            Try another filter. Registered catalogue variants appear here after an accepted
            delivery.
          </EmptyState>
        ) : group === 'products' ? <div className="divide-y divide-black/5">{products.slice(start,start+PER_PAGE).map(product=>{
            const productLots=lots.filter(lot=>lot.productId===product.id);
            const usable=sumQuantities(productLots.map(lot=>lot.usable));
            const damaged=sumQuantities(productLots.map(lot=>lot.damaged));
            const variants=new Set(productLots.map(lot=>lot.skuId)).size;
            return <details key={product.id} className="group [&[open]_summary_.chevron]:rotate-90">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:px-5 [&::-webkit-details-marker]:hidden">
                <Icon icon={ArrowRight01Icon} size={16} strokeWidth={2} className="chevron text-grey-3 transition-transform" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-sans text-[15px] font-semibold tracking-[-0.02em] text-ink">{product.name}</span>
                    {product.code?<Code tone="muted" className="text-xs">{product.code}</Code>:null}
                  </span>
                  <span className="mt-0.5 block font-sans text-xs text-grey-3">{plural(variants,'Supplier code')} · {plural(productLots.length,'delivery lot')}</span>
                </span>
                <span className="ml-8 flex flex-wrap items-center gap-2 sm:ml-0">
                  {isPositive(usable)?<Badge tone="usable">{usable} usable</Badge>:<Badge tone="danger">Out of stock</Badge>}
                  {isPositive(damaged)?<Badge tone="damaged">{damaged} damaged</Badge>:null}
                </span>
              </summary>
              <div className="px-4 pb-5 sm:px-5"><PagedItems items={productLots}>{items=><DataTable label={`Variants and lots for ${product.name}`} columns={lotColumns} rows={[...items]} rowKey={lot=>lot.lotId} mobileStack emptyMessage="No matching lots."/>}</PagedItems></div>
            </details>;})}</div> : group === 'lots' ? (
          <DataTable
            bare
            label="Inventory delivery lots"
            mobileStack
            columns={lotColumns}
            rows={lots.slice(start, start + PER_PAGE)}
            rowKey={(row) => row.lotId}
            emptyMessage="No delivery lots match this view."
          />
        ) : (
          <DataTable
            bare
            label="Totals by supplier code"
            mobileStack
            columns={skuColumns}
            rows={skus.slice(start, start + PER_PAGE)}
            rowKey={(row) => row.skuId}
            emptyMessage="No supplier code totals match this view."
          />
        )}

        <Pager page={current} pageCount={pageCount} total={total} onChange={setPage} />
      </section>

      {lot ? (
        <DetailsDrawer
          title={`${lot.productName} · ${lot.variantName}`}
          onClose={() => setSelected('')}
        >
          <MoneyOnly><FinancialSummary key={lot.lotId} lotId={lot.lotId}/></MoneyOnly>
          <section aria-label="Where this lot came from">
            <p className="font-sans text-sm tracking-[-0.02em] text-grey-2">
              {lot.supplierName} · {lot.sourceName}
            </p>
            <p className="mt-2 font-sans text-sm tracking-[-0.02em] text-ink">
              Product {lot.productCode ?? '—'} · Lot{' '}
              {lot.lotCode ?? '—'} · Batch {lot.publicCode}
            </p>
            <div className="mt-4">
            <Stack gap="tight">
              <span className="flex items-start gap-2">
                <Code className="text-sm">{lot.fullCode}</Code>
                <CopyButton value={lot.fullCode} label="supplier code" />
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
                    Delivered {formatDate(evidence.data.deliveredOn)} · Accepted{' '}
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

              <Disclosure summary="Technical identifiers" className="border-t border-black/[0.06] pt-4">
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



      <Footnote className="mt-5">
        Quantities update automatically from every receipt, checkout and report. Printing labels
        or looking up a code never changes stock.
      </Footnote>
      {unitSelected ? <UnitTrackingDrawer key={unitSelected} unitId={unitSelected} onClose={()=>setUnitSelected('')} /> : null}
    </Page>
  );
}
