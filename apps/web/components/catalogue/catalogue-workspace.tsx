'use client';
import { ArrowLeft01Icon, ArrowRight01Icon, Building03Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useState } from 'react';
import type { Catalogue, Role } from '@dayari/contracts';

import { cn } from '../../lib/cn';
import {
  Badge,
  Breadcrumb,
  Button,
  CardGrid,
  Code,
  type Column,
  CopyButton,
  DataTable,
  EmptyState,
  Footnote,
  Icon,
  LinkButton,
  Page,
  PageHeader,
  Pager,
  Panel,
  SearchInput,
  Stack,
  Tabs,
  card,
  cardInteractive,
} from '../ui';
import { IdentityLookup } from '../identity-lookup';

const PER_PAGE = 18;

type Tab = 'products' | 'suppliers' | 'skus';

export function CatalogueWorkspace({
  catalogue,
  role,
  onProduct,
  onSupplier,
  onStock,
  initialProductId = '',
  onSelect,
}: {
  initialProductId?: string;
  onSelect: (id: string) => void;
  catalogue: Catalogue;
  role: Role;
  onProduct: (id?: string) => void;
  onSupplier: (id?: string) => void;
  onStock: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('products');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(initialProductId);

  useEffect(() => setSelected(initialProductId), [initialProductId]);

  function selectProduct(id: string) {
    setSelected(id);
    onSelect(id);
  }

  function changeTab(next: Tab) {
    setTab(next);
    setPage(1);
  }

  const query = search.trim().toLowerCase();
  const product = catalogue.products.find((item) => item.id === selected);

  const products = useMemo(
    () =>
      catalogue.products.filter((item) =>
        `${item.name} ${item.productCode ?? ''} ${item.description} ${item.variants
          .map((variant) => variant.name)
          .join(' ')}`
          .toLowerCase()
          .includes(query),
      ),
    [catalogue.products, query],
  );

  const skus = useMemo(
    () =>
      catalogue.skus.filter((item) =>
        `${item.fullCode} ${item.variant.product.name} ${item.variant.name} ${item.sourcing.source.supplier.name} ${item.sourcing.source.name}`
          .toLowerCase()
          .includes(query),
      ),
    [catalogue.skus, query],
  );

  const suppliers = useMemo(
    () =>
      catalogue.suppliers.filter((item) =>
        `${item.name} ${item.code}`.toLowerCase().includes(query),
      ),
    [catalogue.suppliers, query],
  );

  if (product) {
    const variantIds = new Set(product.variants.map((item) => item.id));
    const savedSkus = catalogue.skus.filter((item) => variantIds.has(item.variantId));
    const variants = product.variants.filter(
      (item) => !product.attributes.length || item.combinationKey,
    );

    const sourcingColumns: Column<(typeof savedSkus)[number]>[] = [
      {
        key: 'sku',
        label: 'Saved SKU',
        cell: (row) => (
          <span className="flex items-start gap-2">
            <Code tone="brand">{row.fullCode}</Code>
            <CopyButton value={row.fullCode} label="saved SKU" />
          </span>
        ),
      },
      { key: 'variant', label: 'Variant', cell: (row) => row.variant.name },
      {
        key: 'source',
        label: 'Supplier / source',
        cell: (row) => (
          <>
            {row.sourcing.source.supplier.name}
            <span className="mt-0.5 block font-sans text-xs text-grey-3">
              {row.sourcing.source.name}
            </span>
          </>
        ),
      },
    ];

    return (
      <Page>
        <Breadcrumb>
          <LinkButton onClick={() => selectProduct('')}>
            <Icon icon={ArrowLeft01Icon} size={15} strokeWidth={2} />
            Back to catalogue
          </LinkButton>
        </Breadcrumb>

        <PageHeader
          eyebrow={product.productCode ?? 'Code not assigned'}
          title={product.name}
          description={
            product.description ||
            'Shared parent product. Variants keep their identity across supplier sources.'
          }
          actions={
            <>
              {role === 'ADMIN' ? (
                <Button onClick={() => onProduct(product.id)}>
                  <Icon icon={PlusSignIcon} size={16} strokeWidth={2} />
                  Add variants or source
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => onStock(product.id)}>
                View stock lots
              </Button>
            </>
          }
        />

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Badge tone="brand">Product</Badge>
          <Icon icon={ArrowRight01Icon} size={14} className="text-grey-3" />
          <Badge>{variants.length} variants</Badge>
          <Icon icon={ArrowRight01Icon} size={14} className="text-grey-3" />
          <Badge>{savedSkus.length} supplier SKUs</Badge>
          <Icon icon={ArrowRight01Icon} size={14} className="text-grey-3" />
          <LinkButton onClick={() => onStock(product.id)}>Stock lots</LinkButton>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel
            title="Registered variants"
            description="Each variant keeps its own identity and stock."
            action={<Badge tone="usable">Identity preserved</Badge>}
            flush
          >
            {!variants.length ? (
              <EmptyState title="Configure the first variant">
                Use Add variants or source to set up attribute combinations and explicit SKU
                suffixes.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-black/[0.06]">
                {variants.map((variant) => {
                  const variantSkus = savedSkus.filter((sku) => sku.variantId === variant.id);

                  return (
                    <li key={variant.id} className="px-5 py-4">
                      <h3 className="font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
                        {variant.name}
                      </h3>
                      <p className="mt-1 font-sans text-xs tracking-[-0.02em] text-grey-3">
                        {variantSkus.length} saved supplier SKU
                        {variantSkus.length === 1 ? '' : 's'} · Registered variant; stock shown
                        separately
                      </p>
                      {variantSkus.length ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {variantSkus.map((sku) => (
                            <Badge key={sku.id} className="font-mono">
                              {sku.fullCode}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Attribute configuration">
            <Stack gap="tight">
              {product.attributes.length ? (
                product.attributes.map((attribute) => (
                  <div key={attribute.id}>
                    <h3 className="font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
                      {attribute.name}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {attribute.values.map((value) => (
                        <Badge key={value.id}>{value.label}</Badge>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="font-sans text-sm tracking-[-0.02em] text-grey-2">
                  Standard product without configured options.
                </p>
              )}
              <Footnote>
                Extension adds combinations through the existing reviewed command. Existing
                variants, attributes and saved SKUs are not renamed.
              </Footnote>
            </Stack>
          </Panel>
        </div>

        <div className="mt-4">
          <Panel title="Supplier sourcing" description="Every saved SKU for this product." flush>
            {savedSkus.length ? (
              <DataTable
                bare
                columns={sourcingColumns}
                rows={savedSkus}
                rowKey={(row) => row.id}
                emptyMessage="No saved supplier SKUs."
              />
            ) : (
              <EmptyState title="No saved supplier SKUs" icon={Building03Icon}>
                Connect this parent product to an existing supplier source.
              </EmptyState>
            )}
          </Panel>
        </div>
      </Page>
    );
  }

  const rows = tab === 'products' ? products : tab === 'suppliers' ? suppliers : skus;
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;

  const supplierColumns: Column<(typeof suppliers)[number]>[] = [
    { key: 'name', label: 'Supplier', cell: (row) => row.name },
    {
      key: 'code',
      label: 'Code',
      cell: (row) => (
        <span className="flex items-start gap-2">
          <Code tone="brand">{row.code}</Code>
          <CopyButton value={row.code} label="supplier code" />
        </span>
      ),
    },
    {
      key: 'sources',
      label: 'Source locations',
      wide: true,
      cell: (row) => (
        <>
          <span className="block">
            {row.sources.map((source) => source.name).join(', ') || (
              <span className="text-grey-3">None registered</span>
            )}
          </span>
          {role === 'ADMIN' ? (
            <LinkButton className="mt-1.5" onClick={() => onSupplier(row.id)}>
              Set up location
            </LinkButton>
          ) : null}
        </>
      ),
    },
  ];

  const skuColumns: Column<(typeof skus)[number]>[] = [
    {
      key: 'sku',
      label: 'Saved SKU',
      cell: (row) => (
        <span className="flex items-start gap-2">
          <Code tone="brand">{row.fullCode}</Code>
          <CopyButton value={row.fullCode} label="saved SKU" />
        </span>
      ),
    },
    {
      key: 'product',
      label: 'Product / variant',
      wide: true,
      cell: (row) => (
        <>
          <LinkButton
            onClick={() =>
              selectProduct(
                catalogue.products.find((item) =>
                  item.variants.some((variant) => variant.id === row.variantId),
                )?.id ?? '',
              )
            }
          >
            {row.variant.product.name}
          </LinkButton>
          <span className="mt-0.5 block font-sans text-xs text-grey-3">{row.variant.name}</span>
        </>
      ),
    },
    {
      key: 'source',
      label: 'Supplier / source',
      cell: (row) => (
        <>
          {row.sourcing.source.supplier.name}
          <span className="mt-0.5 block font-sans text-xs text-grey-3">
            {row.sourcing.source.name}
          </span>
        </>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Inventory foundation"
        title="Product catalogue"
        description="Register once. Keep variants, supplier SKUs and stock lots connected."
        actions={
          role === 'ADMIN' ? (
            <>
              <Button variant="secondary" onClick={() => onSupplier()}>
                <Icon icon={Building03Icon} size={16} />
                Add supplier
              </Button>
              <Button onClick={() => onProduct()}>
                <Icon icon={PlusSignIcon} size={16} strokeWidth={2} />
                Add product
              </Button>
            </>
          ) : undefined
        }
      />

      <section className={cn(card, 'mt-8 overflow-hidden')}>
        <div className="flex flex-col gap-3 border-b border-black/[0.06] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            label="Catalogue view"
            value={tab}
            onChange={changeTab}
            tabs={[
              { value: 'products', label: 'Products', count: catalogue.products.length },
              { value: 'suppliers', label: 'Suppliers', count: catalogue.suppliers.length },
              { value: 'skus', label: 'Supplier SKUs', count: catalogue.skus.length },
            ]}
          />
          <SearchInput
            label="Search catalogue"
            value={search}
            placeholder="Name, code, variant or SKU…"
            className="w-full lg:w-[320px]"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
        </div>

        {!total ? (
          <EmptyState
            title={search ? 'No matching catalogue entries' : 'Start with your first product'}
          >
            {search
              ? 'Try a product name, Product Code, variant or saved SKU.'
              : 'Create a shared parent product and its supplier-specific variants.'}
          </EmptyState>
        ) : tab === 'products' ? (
          <CardGrid>
            {products.slice(start, start + PER_PAGE).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectProduct(item.id)}
                className={cn(card, cardInteractive, 'flex flex-col p-5')}
              >
                <Code tone="brand">{item.productCode ?? 'Code not assigned'}</Code>
                <span className="mt-2.5 block font-sans text-[15px] leading-snug font-semibold tracking-[-0.03em] break-words text-ink">
                  {item.name}
                </span>
                <span className="mt-1.5 line-clamp-2 block font-sans text-xs leading-[1.6] tracking-[-0.02em] text-grey-3">
                  {item.description || 'Shared parent product'}
                </span>
                <span className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone="brand">
                    {
                      item.variants.filter(
                        (variant) => !item.attributes.length || variant.combinationKey,
                      ).length
                    }{' '}
                    variants
                  </Badge>
                  <span className="font-sans text-xs tracking-[-0.02em] text-grey-3">
                    {item.attributes.map((attribute) => attribute.name).join(' · ') || 'Standard'}
                  </span>
                </span>
                <span className="mt-4 flex items-center gap-1.5 font-sans text-[13px] font-semibold tracking-[-0.02em] text-brand">
                  View product
                  <Icon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
                </span>
              </button>
            ))}
          </CardGrid>
        ) : tab === 'suppliers' ? (
          <DataTable
            bare
            columns={supplierColumns}
            rows={suppliers.slice(start, start + PER_PAGE)}
            rowKey={(row) => row.id}
            emptyMessage="No suppliers match this search."
          />
        ) : (
          <DataTable
            bare
            columns={skuColumns}
            rows={skus.slice(start, start + PER_PAGE)}
            rowKey={(row) => row.id}
            emptyMessage="No supplier SKUs match this search."
          />
        )}

        <Pager page={current} pageCount={pageCount} total={total} onChange={setPage} />
      </section>

      <div className="mt-4">
        <IdentityLookup />
      </div>

      <Footnote className="mt-5">
        Catalogue registration does not add stock. Receive an accepted delivery to create stock
        lots.
      </Footnote>
    </Page>
  );
}
