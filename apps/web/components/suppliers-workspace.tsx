'use client';
import { Building03Icon, Location01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import type { Catalogue, Role } from '@dayari/contracts';

import { cn } from '../lib/cn';
import {
  Badge,
  Button,
  Code,
  CopyButton,
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
        description="Register suppliers once. Saved source prefixes connect every sourced product to its supplier and location."
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
            title={search ? 'No matching suppliers' : 'Add your first supplier'}
            icon={Building03Icon}
          >
            {search
              ? 'Try a supplier name, source or prefix.'
              : 'Add a name, choose a registered location and review the generated prefix.'}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {suppliers.map((supplier) => (
            <Panel
              key={supplier.id}
              title={supplier.name}
              action={<Badge tone="brand">{supplier.sources.length} sources</Badge>}
            >
              <Stack gap="tight">
                <span className="flex items-center gap-2">
                  <Code tone="brand">{supplier.code}</Code>
                  <CopyButton value={supplier.code} label="supplier code" />
                </span>

                {supplier.sources.length ? (
                  supplier.sources.map((source) => {
                    const skus = catalogue.skus.filter(
                      (sku) => sku.sourcing.source.id === source.id,
                    );
                    const products = catalogue.products.filter((product) =>
                      catalogue.sourcings.some(
                        (sourcing) =>
                          sourcing.sourceId === source.id && sourcing.productId === product.id,
                      ),
                    );

                    return (
                      <div
                        key={source.id}
                        className="rounded-xl border border-black/[0.07] bg-surface-muted/60 p-4"
                      >
                        <h3 className="flex items-center gap-2 font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
                          <Icon icon={Location01Icon} size={15} className="text-brand" />
                          {source.name}
                        </h3>
                        <p className="mt-2 flex flex-wrap items-center gap-1.5 font-sans text-xs tracking-[-0.02em] text-grey-3">
                          Saved source code
                          <Code tone="brand">{source.code}</Code>
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge>{products.length} sourced products</Badge>
                          <Badge>{skus.length} supplier SKUs</Badge>
                          <Badge tone={source.skuPrefix ? 'usable' : 'damaged'}>
                            {source.skuPrefix
                              ? `Prefix ${source.skuPrefix.code}`
                              : 'Prefix setup needed'}
                          </Badge>
                        </div>

                        {products.length ? (
                          <details className="group mt-3">
                            <summary className="cursor-pointer font-sans text-[13px] font-semibold tracking-[-0.02em] text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                              Products and saved SKUs
                            </summary>
                            <ul className="mt-3 space-y-3">
                              {products.map((product) => (
                                <li key={product.id}>
                                  <p className="font-sans text-sm font-medium tracking-[-0.02em] text-ink">
                                    {product.name}{' '}
                                    <Code tone="muted">
                                      {product.productCode ?? 'Code not assigned'}
                                    </Code>
                                  </p>
                                  <p className="mt-1">
                                    <Code tone="brand">
                                      {skus
                                        .filter((sku) =>
                                          product.variants.some(
                                            (variant) => variant.id === sku.variantId,
                                          ),
                                        )
                                        .map((sku) => sku.fullCode)
                                        .join(' · ')}
                                    </Code>
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="font-sans text-sm tracking-[-0.02em] text-grey-2">
                    No source locations registered yet.
                  </p>
                )}

                {role === 'ADMIN' ? (
                  <div className="flex flex-wrap gap-2 border-t border-black/[0.06] pt-4">
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() => onSupplier(supplier.id)}
                    >
                      Set up location for {supplier.name}
                    </Button>
                    <Button variant="secondary" size="compact" onClick={() => onProduct()}>
                      Source a product
                    </Button>
                  </div>
                ) : null}
              </Stack>
            </Panel>
          ))}
        </div>
      )}

      <Footnote className="mt-5">
        Supplier codes and allocated SKU prefixes are stable identities. Supplier financial
        accounts, purchasing, renaming and deletion are not supported in this slice.
      </Footnote>
    </Page>
  );
}
