'use client';
import { Delete02Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { useEffect, useRef, useState } from 'react';
import {
  nextSupplierCode,
  type Catalogue,
  type ProductSetupInput,
  type SupplierSetupInput,
} from '@dayari/contracts';

import { cn } from '../../lib/cn';
import {
  Badge,
  Button,
  Checkbox,
  Code,
  type Column,
  DataTable,
  Field,
  Footnote,
  Icon,
  Input,
  Select,
  Textarea,
  WarningNotice,
  card,
} from '../ui';
import { Summary } from '../wizard/summary';
import { WizardShell } from '../wizard/wizard-shell';

async function saveSetup(type: string, body: unknown) {
  // Reuse the submission key for an unchanged body so a lost response cannot double-post.
  const fingerprint = JSON.stringify(body);
  const storageKey = `dayari_pending_${type}`;
  const prior = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as {
    fingerprint: string;
    key: string;
  } | null;
  const key = prior?.fingerprint === fingerprint ? prior.key : crypto.randomUUID();

  sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));

  const response = await fetch(`/api/catalogue/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: fingerprint,
  });
  const result = await response.json();

  if (!response.ok) {
    const message =
      result.message ?? result.issues?.map((issue: { message: string }) => issue.message).join('. ');
    throw new Error(
      typeof message === 'string' ? message : 'Check the entered details and try again.',
    );
  }

  sessionStorage.removeItem(storageKey);
  return result;
}

type Props = {
  catalogue: Catalogue;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
};

export function SupplierWizard({
  catalogue,
  onClose,
  onSaved,
  initialSupplierId = '',
}: Props & { initialSupplierId?: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [registryId, setRegistryId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [keepPrefix, setKeepPrefix] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submitting = useRef(false);

  const supplierId = initialSupplierId;
  const supplier = catalogue.suppliers.find((row) => row.id === supplierId);
  const registry = catalogue.locations.find((row) => row.id === registryId);
  const source = supplier?.sources.find((row) => row.id === sourceId);

  const supplierCode =
    supplier?.code ?? nextSupplierCode(name, catalogue.suppliers.map((row) => row.code));
  const prefix =
    source && keepPrefix ? source.code : `${supplierCode}${registry?.code ?? locationCode}`;

  async function finish() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');

    const body: SupplierSetupInput = {
      supplier: supplier ? { id: supplier.id } : { name },
      location: registry
        ? { registryId: registry.id }
        : { name: locationName, code: locationCode },
      ...(source ? { existingSourceId: source.id } : {}),
      ...(!source && sourceName.trim() ? { sourceName: sourceName.trim() } : {}),
      useExistingPrefix: Boolean(source && keepPrefix),
    };

    try {
      const result = await saveSetup('supplier-setups', body);
      await onSaved(`Supplier location ready. Prefix: ${result.prefix.code}`);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const unprefixedSources = supplier?.sources.filter((row) => !row.skuPrefix) ?? [];

  return (
    <WizardShell
      title={initialSupplierId ? 'Set up supplier location' : 'Add supplier'}
      subtitle="Set up a supplier and location once. Select them whenever you add a product."
      steps={['Supplier', 'Location', 'Review prefix']}
      step={step}
      setStep={(value) => {
        setError('');
        setStep(value);
      }}
      busy={busy}
      error={error}
      dirty={Boolean(name || supplierId || registryId)}
      onClose={onClose}
      onFinish={finish}
      finishLabel="Save supplier location"
    >
      {step === 0 ? (
        <>
          {supplier ? (
            <Summary rows={[{ label: 'Supplier', value: supplier.name }]} />
          ) : (
            <Field label="Supplier name">
              {(id) => (
                <Input
                  id={id}
                  required
                  maxLength={160}
                  placeholder="Chioma Ventures"
                  value={name}
                  onChange={(changeEvent) => setName(changeEvent.target.value)}
                />
              )}
            </Field>
          )}

          <Summary
            rows={[
              {
                label: supplier ? 'Saved code' : 'Suggested code',
                value: supplierCode ? (
                  <Code tone="brand" className="text-sm">
                    {supplierCode}
                  </Code>
                ) : (
                  'Enter a supplier name'
                ),
              },
            ]}
          />

          <Footnote>
            {supplier
              ? 'Set up another location for this supplier. Its saved supplier code stays the same.'
              : 'Enter the new supplier’s name. Its code is generated automatically; you’ll add its location next.'}
          </Footnote>
        </>
      ) : null}

      {step === 1 ? (
        <>
          {unprefixedSources.length ? (
            <Field label="Supplier location">
              {(id) => (
                <Select
                  id={id}
                  label="Supplier location"
                  value={sourceId || 'new'}
                  onChange={(value) => {
                    setSourceId(value === 'new' ? '' : value);
                    setKeepPrefix(true);
                  }}
                  options={[
                    { value: 'new', label: 'Add a new location' },
                    ...unprefixedSources.map((row) => ({
                      value: row.id,
                      label: `${row.name} · existing code ${row.code}`,
                    })),
                  ]}
                />
              )}
            </Field>
          ) : null}

          <Field label="Location registry">
            {(id) => (
              <Select
                id={id}
                required
                label="Location registry"
                placeholder="Select location"
                value={registryId}
                onChange={setRegistryId}
                options={[
                  ...catalogue.locations.map((row) => ({
                    value: row.id,
                    label: `${row.name} (${row.code})`,
                  })),
                  { value: 'new', label: 'Register another location' },
                ]}
              />
            )}
          </Field>

          {registryId === 'new' ? (
            <div className={cn(card, 'grid gap-4 p-4 sm:grid-cols-2')}>
              <Field label="Location name">
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={160}
                    placeholder="Ibadan"
                    value={locationName}
                    onChange={(changeEvent) => setLocationName(changeEvent.target.value)}
                  />
                )}
              </Field>
              <Field label="Approved location code">
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={32}
                    pattern="[A-Z0-9]+"
                    placeholder="Enter registry code"
                    value={locationCode}
                    onChange={(changeEvent) =>
                      setLocationCode(changeEvent.target.value.toUpperCase())
                    }
                  />
                )}
              </Field>
            </div>
          ) : null}

          {!source ? (
            <Field label="Specific source or area (optional)">
              {(id) => (
                <Input
                  id={id}
                  maxLength={160}
                  placeholder="For example, Lagos Island"
                  value={sourceName}
                  onChange={(changeEvent) => setSourceName(changeEvent.target.value)}
                />
              )}
            </Field>
          ) : (
            <label
              className={cn(
                card,
                'flex cursor-pointer items-start gap-3 border-brand/20 bg-brand-tint p-4',
              )}
            >
              <Checkbox
                className="mt-0.5"
                checked={keepPrefix}
                onChange={(changeEvent) => setKeepPrefix(changeEvent.target.checked)}
              />
              <span className="font-sans text-sm tracking-[-0.02em] text-ink">
                Keep this location’s existing prefix:{' '}
                <Code tone="brand" className="text-sm font-medium">
                  {source.code}
                </Code>
                <span className="mt-1 block font-normal text-grey-2">
                  Preserves the prefix already registered for {source.name}.
                </span>
              </span>
            </label>
          )}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Summary
            rows={[
              { label: 'Supplier', value: supplier?.name ?? name },
              { label: 'Supplier code', value: <Code tone="brand">{supplierCode}</Code> },
              {
                label: 'Location',
                value: source?.name ?? (sourceName || registry?.name || locationName),
              },
              {
                label: 'Location code',
                value: <Code tone="brand">{registry?.code ?? locationCode}</Code>,
              },
            ]}
          />

          <div className={cn(card, 'border-brand/20 bg-brand-tint p-5')}>
            <p className="font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
              Supplier SKU prefix
            </p>
            <p className="mt-2 font-mono text-3xl font-medium tracking-[-0.02em] break-all text-brand-deep">
              {prefix}
            </p>
            <Footnote className="mt-3 text-brand">
              Products from this supplier location will use this prefix. Final uniqueness is
              confirmed when saved.
            </Footnote>
          </div>

          <Footnote>No product or stock quantities are created during supplier setup.</Footnote>
        </>
      ) : null}
    </WizardShell>
  );
}

type VariantDraft = {
  id: string;
  name: string;
  suffix: string;
  values: Record<string, string>;
  selected: boolean;
};

export function ProductWizard({
  catalogue,
  onClose,
  onSaved,
  onConfigureSupplier,
  initialProductId = '',
}: Props & { initialProductId?: string; onConfigureSupplier: (supplierId: string) => void }) {
  const [step, setStep] = useState(0);
  const [supplierId, setSupplierId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(false);
  const [extending, setExtending] = useState(false);
  const [attributes, setAttributes] = useState(['Colour']);
  const [newAttribute, setNewAttribute] = useState('');
  const [rows, setRows] = useState<VariantDraft[]>([
    { id: '', name: '', suffix: '', values: {}, selected: true },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submitting = useRef(false);

  const supplier = catalogue.suppliers.find((row) => row.id === supplierId);
  const source = supplier?.sources.find((row) => row.id === sourceId);
  const product = catalogue.products.find((row) => row.id === productId);

  const creatingVariants =
    extending ||
    !product ||
    !product.variants.some((row) => !product.attributes.length || row.combinationKey);

  const selected = rows.filter((row) => row.selected);
  const reviewRows: VariantDraft[] =
    !product && !options
      ? [{ id: '', name: 'Standard', suffix: 'STD', values: {}, selected: true }]
      : selected;

  const base = catalogue.sourcings.find(
    (row) => row.sourceId === sourceId && row.productId === productId,
  )?.baseCode;

  function chooseProduct(id: string) {
    setExtending(false);
    setProductId(id);

    const existing = catalogue.products.find((row) => row.id === id);
    if (!existing) {
      setOptions(false);
      setRows([{ id: '', name: '', suffix: '', values: {}, selected: true }]);
      return;
    }

    setOptions(existing.attributes.length > 0);
    setAttributes(
      existing.attributes.length ? existing.attributes.map((attribute) => attribute.name) : ['Colour'],
    );

    const available = existing.variants
      .filter((row) => !existing.attributes.length || row.combinationKey)
      .map((row) => ({
        id: row.id,
        name: row.name,
        suffix:
          catalogue.skus.find(
            (sku) => sku.variantId === row.id && sku.sourcing.source.id === sourceId,
          )?.suffix ?? (row.combinationKey ? '' : 'STD'),
        values: {},
        selected: true,
      }));

    setRows(available.length ? available : [{ id: '', name: '', suffix: '', values: {}, selected: true }]);
  }

  useEffect(() => {
    if (initialProductId) chooseProduct(initialProductId);
    // Runs once for the product this wizard was opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectSource(id: string) {
    setSourceId(id);
    if (product && !extending) {
      setRows((previous) =>
        previous.map((row) => ({
          ...row,
          suffix:
            catalogue.skus.find(
              (sku) => sku.variantId === row.id && sku.sourcing.source.id === id,
            )?.suffix ?? (row.id && !product.attributes.length ? 'STD' : ''),
        })),
      );
    }
  }

  function changeRow(index: number, changes: Partial<VariantDraft>) {
    setRows((previous) =>
      previous.map((row, position) => (position === index ? { ...row, ...changes } : row)),
    );
  }

  function changeStep(value: number) {
    setError('');

    if (value > step && step === 0 && !source?.skuPrefix) {
      setError('Select a supplier location with a saved prefix.');
      return;
    }

    if (value > step && step === 2 && (options || product) && !selected.length) {
      setError('Select at least one variant.');
      return;
    }

    setStep(value);
  }

  async function finish() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');

    const body: ProductSetupInput = {
      sourceId,
      ...(extending ? { extendVariants: true } : {}),
      product: product ? { id: product.id } : { name, description },
      variants: !creatingVariants
        ? selected.map((row) => ({ variantId: row.id, suffix: row.suffix }))
        : options
          ? selected.map((row) => ({
              name: row.name || attributes.map((attribute) => row.values[attribute]).join(' / '),
              suffix: row.suffix,
              attributes: attributes.map((attribute) => ({
                attribute,
                value: row.values[attribute] ?? '',
              })),
            }))
          : [],
    };

    try {
      const result = await saveSetup('product-setups', body);
      await onSaved(
        `Product saved. ${result.skus.map((sku: { fullCode: string }) => sku.fullCode).join(', ')}`,
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const previewColumns: Column<VariantDraft>[] = [
    {
      key: 'variant',
      label: 'Variant',
      wide: true,
      cell: (row) => row.name || attributes.map((attribute) => row.values[attribute]).join(' / '),
    },
    {
      key: 'sku',
      label: 'SKU preview',
      cell: (row) => (
        <Code tone="brand">
          {base ?? `${source?.skuPrefix?.code}•••••`}-{row.suffix}
        </Code>
      ),
    },
  ];

  return (
    <WizardShell
      title="Add product"
      subtitle="Choose the supplier once, add product details, then review its generated SKUs."
      steps={['Supplier', 'Product', 'Variants', 'Review']}
      step={step}
      setStep={changeStep}
      busy={busy}
      error={error}
      dirty={Boolean(supplierId || name || productId)}
      onClose={onClose}
      onFinish={finish}
      finishLabel="Save product"
    >
      {step === 0 ? (
        <>
          <Field label="Supplier">
            {(id) => (
              <Select
                id={id}
                required
                label="Supplier"
                placeholder="Select supplier"
                value={supplierId}
                onChange={(value) => {
                  setSupplierId(value);
                  setSourceId('');
                }}
                options={catalogue.suppliers.map((row) => ({
                  value: row.id,
                  label: `${row.name} · ${row.code}`,
                }))}
              />
            )}
          </Field>

          {supplier ? (
            <Field label="Supplier location">
              {(id) => (
                <Select
                  id={id}
                  required
                  label="Supplier location"
                  placeholder="Select supplier location"
                  value={sourceId}
                  onChange={selectSource}
                  options={supplier.sources
                    .filter((row) => row.skuPrefix)
                    .map((row) => ({
                      value: row.id,
                      label: `${row.name} · ${row.skuPrefix!.code}`,
                    }))}
                />
              )}
            </Field>
          ) : null}

          {supplier && !supplier.sources.some((row) => row.skuPrefix) ? (
            <div className={cn(card, 'border-damaged/20 bg-damaged-tint p-4')}>
              <p className="font-sans text-sm leading-[1.6] tracking-[-0.02em] text-damaged">
                Set up this supplier’s location prefix once before adding products.
              </p>
              <Button
                variant="secondary"
                type="button"
                className="mt-3"
                onClick={() => {
                  if (
                    window.confirm(
                      'Leave this product draft and configure the supplier location? Unsaved product details will be discarded.',
                    )
                  ) {
                    onConfigureSupplier(supplier.id);
                  }
                }}
              >
                Set up supplier location
              </Button>
            </div>
          ) : null}

          {source?.skuPrefix ? (
            <Summary
              rows={[
                {
                  label: 'Supplier prefix',
                  value: <Code tone="brand">{source.skuPrefix.code}</Code>,
                },
              ]}
            />
          ) : null}

          {!catalogue.suppliers.length ? (
            <Footnote>
              Use the separate Add supplier button to register your first supplier.
            </Footnote>
          ) : null}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Field label="Product">
            {(id) => (
              <Select
                id={id}
                label="Product"
                value={productId || 'new'}
                onChange={(value) => chooseProduct(value === 'new' ? '' : value)}
                options={[
                  { value: 'new', label: 'Create a new parent product' },
                  ...catalogue.products.map((row) => ({ value: row.id, label: row.name })),
                ]}
              />
            )}
          </Field>

          {!product ? (
            <>
              <Field label="Product name">
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={160}
                    placeholder="A5 Maple Leatherbound Notebook"
                    value={name}
                    onChange={(changeEvent) => setName(changeEvent.target.value)}
                  />
                )}
              </Field>
              <Field label="Description (optional)">
                {(id) => (
                  <Textarea
                    id={id}
                    maxLength={2000}
                    rows={3}
                    value={description}
                    onChange={(changeEvent) => setDescription(changeEvent.target.value)}
                  />
                )}
              </Field>
            </>
          ) : null}

          <Footnote>
            Choose the existing parent product when sourcing the same product from another
            supplier. Its variants stay shared; the supplier SKU is separate.
          </Footnote>
        </>
      ) : null}

      {step === 2 ? (
        <>
          {!product ? (
            <Field label="Does this product have options?">
              {(id) => (
                <Select
                  id={id}
                  label="Does this product have options?"
                  value={options ? 'yes' : 'no'}
                  onChange={(value) => setOptions(value === 'yes')}
                  options={[
                    { value: 'no', label: 'No options — use a standard variant' },
                    { value: 'yes', label: 'Yes — colour, size, material or other options' },
                  ]}
                />
              )}
            </Field>
          ) : null}

          {!options && !product ? (
            <Summary
              rows={[
                { label: 'Variant', value: 'Standard' },
                { label: 'Suffix', value: <Code tone="brand">STD</Code> },
              ]}
            />
          ) : null}

          {product && !creatingVariants && options ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setExtending(true);
                setRows([{ id: '', name: '', suffix: '', values: {}, selected: true }]);
              }}
            >
              Add new variant combinations
            </Button>
          ) : null}

          {extending ? (
            <div className={cn(card, 'border-brand/20 bg-brand-tint p-4')}>
              <p className="font-sans text-sm leading-[1.6] tracking-[-0.02em] text-brand-deep">
                Add combinations for this product using its existing attributes. Existing variants
                and SKUs stay unchanged. New SKUs are allocated for the selected supplier location
                only.
              </p>
            </div>
          ) : null}

          {product && creatingVariants && !extending ? (
            <WarningNotice>
              This product has attributes but no saved variant combinations yet. Enter its first
              variant below.
            </WarningNotice>
          ) : null}

          {product && !creatingVariants ? (
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className={cn(
                    card,
                    'grid min-w-0 grid-cols-1 items-end gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_150px]',
                  )}
                >
                  <label className="flex cursor-pointer items-center gap-2.5 self-center font-sans text-sm tracking-[-0.02em] text-ink">
                    <Checkbox
                      checked={row.selected}
                      onChange={(changeEvent) =>
                        changeRow(index, { selected: changeEvent.target.checked })
                      }
                    />
                    {row.name}
                  </label>
                  <Field label="Variant suffix">
                    {(id) => (
                      <Input
                        id={id}
                        required={row.selected}
                        disabled={!row.selected}
                        pattern="[A-Za-z0-9]+(-[A-Za-z0-9]+)*"
                        maxLength={64}
                        placeholder="RED"
                        aria-label={`${row.name} suffix`}
                        value={row.suffix}
                        onChange={(changeEvent) =>
                          changeRow(index, { suffix: changeEvent.target.value.toUpperCase() })
                        }
                      />
                    )}
                  </Field>
                </div>
              ))}
            </div>
          ) : null}

          {options && creatingVariants ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {attributes.map((attribute) => (
                  <Badge key={attribute} tone="brand">
                    {attribute}
                  </Badge>
                ))}
              </div>

              {!extending ? (
                <div className="flex items-end gap-2">
                  <Field label="Another attribute" className="flex-1">
                    {(id) => (
                      <Input
                        id={id}
                        maxLength={160}
                        placeholder="Size, material, finish…"
                        value={newAttribute}
                        onChange={(changeEvent) => setNewAttribute(changeEvent.target.value)}
                      />
                    )}
                  </Field>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const value = newAttribute.trim();
                      if (value && !attributes.includes(value) && attributes.length < 8) {
                        setAttributes((previous) => [...previous, value]);
                        setNewAttribute('');
                      }
                    }}
                  >
                    Add attribute
                  </Button>
                </div>
              ) : null}

              {rows.map((row, index) => (
                <div key={index} className={cn(card, 'space-y-4 p-4')}>
                  <div className="flex items-center justify-between">
                    <p className="font-sans text-xs font-semibold tracking-[0.06em] text-grey-3 uppercase">
                      Variant {index + 1}
                    </p>
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Remove variant ${index + 1}`}
                        onClick={() =>
                          setRows((previous) =>
                            previous.filter((_, position) => position !== index),
                          )
                        }
                        className="grid size-8 place-items-center rounded-lg text-grey-3 transition-colors hover:bg-danger-tint hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        <Icon icon={Delete02Icon} size={15} />
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {attributes.map((attribute) => (
                      <Field key={attribute} label={attribute}>
                        {(id) => (
                          <Input
                            id={id}
                            required
                            maxLength={160}
                            placeholder={attribute === 'Colour' ? 'Red' : attribute}
                            value={row.values[attribute] ?? ''}
                            onChange={(changeEvent) =>
                              changeRow(index, {
                                values: { ...row.values, [attribute]: changeEvent.target.value },
                              })
                            }
                          />
                        )}
                      </Field>
                    ))}
                    <Field label="Variant suffix">
                      {(id) => (
                        <Input
                          id={id}
                          required
                          pattern="[A-Za-z0-9]+(-[A-Za-z0-9]+)*"
                          maxLength={64}
                          placeholder="RED or RED-A5"
                          value={row.suffix}
                          onChange={(changeEvent) =>
                            changeRow(index, { suffix: changeEvent.target.value.toUpperCase() })
                          }
                        />
                      )}
                    </Field>
                  </div>
                </div>
              ))}

              {rows.length < 30 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setRows((previous) => [
                      ...previous,
                      { id: '', name: '', suffix: '', values: {}, selected: true },
                    ])
                  }
                >
                  <Icon icon={PlusSignIcon} size={15} strokeWidth={2} />
                  Add variant row
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Summary
            rows={[
              { label: 'Supplier', value: supplier?.name ?? '' },
              { label: 'Location', value: source?.name ?? '' },
              { label: 'Product', value: product?.name ?? name },
              {
                label: 'Product base',
                value: base ? (
                  <Code tone="brand">{base}</Code>
                ) : (
                  `${source?.skuPrefix?.code} + random 5-digit number`
                ),
              },
            ]}
          />

          <DataTable
            columns={previewColumns}
            rows={reviewRows}
            rowKey={(row) => row.id || row.suffix || row.name}
            emptyMessage="No variants selected."
          />

          <Footnote>
            {base
              ? 'The saved product base stays fixed. New suffixes add SKUs without changing existing identities.'
              : 'The final unique number is assigned on save. All variants share this product base.'}{' '}
            Saving adds catalogue identities, not stock quantities.
          </Footnote>
        </>
      ) : null}
    </WizardShell>
  );
}
