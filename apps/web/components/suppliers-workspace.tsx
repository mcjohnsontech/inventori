'use client';
import { Building03Icon, Location01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import type { Catalogue, Role } from '@dayari/contracts';

import { PagedItems } from './ui/paged-items';
import { cn } from '../lib/cn';
import {
  Badge,
  Button,
  Code,
  CopyButton,
  Disclosure,
  EmptyState,
  Footnote,
  Icon,
  Page,
  PageHeader,
  Panel,
  SearchInput,
  Stack,
  card,
} from './ui';

export function SuppliersWorkspace({
  catalogue,
  role,
  onSupplier,
  onProduct,
}: {
  catalogue: Catalogue;
  role: Role;
  onSupplier: (id?: string) => void;
  onProduct: (id?: string) => void;
}) {
  const [search, setSearch] = useState('');

  const suppliers = catalogue.suppliers.filter((item) =>
    `${item.name} ${item.code} ${item.sources
      .map((source) => `${source.name} ${source.code}`)
      .join(' ')}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Where your stock comes from"
        title="Suppliers & sources"
        description={
          role === 'ADMIN'
            ? 'Register suppliers once. Saved source prefixes connect every sourced product to its supplier and location.'
            : 'Inspect approved suppliers, saved source prefixes and sourced SKUs. Ask Admin to register or configure missing entries.'
        }
        actions={
          role === 'ADMIN' ? (
            <Button onClick={() => onSupplier()}>
              <Icon icon={PlusSignIcon} size={16} strokeWidth={2} />
              Add supplier
            </Button>
          ) : undefined
        }
      />

      <div className="mt-8">
        <SearchInput
          label="Search suppliers"
          value={search}
          onChange={setSearch}
          placeholder="Supplier, source or saved prefix…"
          className="w-full sm:w-[360px]"
        />
      </div>

      {!suppliers.length ? (
        <div className={cn(card, 'mt-5')}>
          <EmptyState
            title={
              search
                ? 'No matching suppliers'
                : role === 'ADMIN'
                  ? 'Add your first supplier'
                  : 'No suppliers registered'
            }
            icon={Building03Icon}
          >
            {search
              ? 'Try a supplier name, source or prefix.'
              : 'Add a name, choose a registered location and review the generated prefix.'}
          </EmptyState>
        </div>
      ) : (
        <div className={cn(card, 'mt-5 overflow-hidden')}>
          <PagedItems key={search} items={suppliers}>{page => <ul className="divide-y divide-black/[0.06]">
            {page.map(supplier => <li key={supplier.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold text-sm">{supplier.name}</h2><Code>{supplier.code}</Code></div>
                {role === 'ADMIN' && (!supplier.sources.length || supplier.sources.some(source => !source.skuPrefix)) ? <Button variant="secondary" size="compact" onClick={() => onSupplier(supplier.id)}>Set up location</Button> : null}
              </div>
              <PagedItems items={supplier.sources} size={5}>{sources => <div className="mt-2 space-y-2">{sources.map(source => {
                const skus = catalogue.skus.filter(sku => sku.sourcing.source.id === source.id);
                const products = catalogue.products.filter(product => catalogue.sourcings.some(row => row.sourceId === source.id && row.productId === product.id));
                return <div key={source.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-grey-2"><span>{source.name}</span><Code>{source.skuPrefix?.code ?? source.code}</Code><span>{products.length} products · {skus.length} SKUs</span></div>
                  {products.length ? <Disclosure summary="Products and saved SKUs" className="mt-2"><PagedItems items={products} size={6}>{entries => <ul className="mt-2 space-y-3">{entries.map(product => <li key={product.id}><span className="font-medium">{product.name}</span> <Code>{product.productCode ?? 'Code not assigned'}</Code><PagedItems items={skus.filter(sku => product.variants.some(variant => variant.id === sku.variantId))} size={6}>{rows => <div className="mt-1 flex flex-wrap gap-2">{rows.map(sku => <Code key={sku.id}>{sku.fullCode}</Code>)}</div>}</PagedItems></li>)}</ul>}</PagedItems></Disclosure> : null}
                </div>;
              })}</div>}</PagedItems>
              {!supplier.sources.length ? <p className="mt-2 text-sm text-grey-2">Location not configured.</p> : null}
            </li>)}
          </ul>}</PagedItems>
        </div>
      )}

      <Footnote className="mt-5">
        Supplier codes and allocated SKU prefixes are stable identities. Supplier financial
        accounts, purchasing, renaming and deletion are not supported in this slice.
      </Footnote>
    </Page>
  );
}
