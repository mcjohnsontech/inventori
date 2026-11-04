'use client';
import { useRef, useState } from 'react';
import {
  lagosDate,
  receiptSchema,
  type AcceptedReceipt,
  type ReceivingOptions,
} from '@dayari/contracts';

import {
  Badge,
  Checkbox,
  Code,
  Field,
  Footnote,
  Input,
  LinkButton,
  SearchInput,
  Select,
  Textarea,
  card,
} from '../ui';
import { notifyAuthFailure } from '../../lib/api';
import { cn } from '../../lib/cn';
import { WizardShell } from '../wizard/wizard-shell';
import { Totals } from './totals';

type DraftLine = {
  skuId: string;
  usableQuantity: string;
  damagedQuantity: string;
  damageReason: string;
};

async function post(path: string, init?: RequestInit) {
  const response = await fetch(`/api/${path}`, init);
  notifyAuthFailure(response);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof result.message === 'string'
        ? result.message
        : 'Check the receiving details and try again.',
    );
  }
  return result;
}

export function ReceiveWizard({
  options,
  onClose,
  onSaved,
}: {
  options: ReceivingOptions;
  onClose: () => void;
  onSaved: (receipt: AcceptedReceipt) => void;
}) {
  const [step, setStep] = useState(0);
  const [supplierId, setSupplierId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [deliveredOn, setDeliveredOn] = useState(lagosDate());
  const [invoiceReference, setInvoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submitting = useRef(false);

  const supplier = options.suppliers.find((item) => item.id === supplierId);
  const source = supplier?.sources.find((item) => item.id === sourceId);
  const available = options.skus.filter((item) => item.sourceId === sourceId);
  const products = [...new Map(available.map((sku) => [sku.productId, sku.productName])).entries()];

  const usable = lines.reduce((sum, row) => sum + Number(row.usableQuantity || 0), 0);
  const damaged = lines.reduce((sum, row) => sum + Number(row.damagedQuantity || 0), 0);

  function change(index: number, patch: Partial<DraftLine>) {
    setLines((previous) =>
      previous.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    );
  }

  function changeStep(next: number) {
    setError('');

    if (next > step && step === 1 && !lines.length) {
      setError('Select at least one variant to receive.');
      return;
    }

    if (next > step && step === 2) {
      const valid = receiptSchema.safeParse({
        sourceId,
        deliveredOn,
        invoiceReference,
        lines: lines.map((row) => ({
          ...row,
          usableQuantity: Number(row.usableQuantity),
          damagedQuantity: Number(row.damagedQuantity),
        })),
      });
      if (!valid.success) {
        setError(valid.error.issues.map((issue) => issue.message).join('. '));
        return;
      }
    }

    setStep(next);
  }

  async function finish() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');

    try {
      const body = {
        sourceId,
        deliveredOn,
        invoiceReference,
        lines: lines.map((row) => ({
          ...row,
          usableQuantity: Number(row.usableQuantity),
          damagedQuantity: Number(row.damagedQuantity),
        })),
      };

      // Reuse the submission key for an unchanged draft so a lost response cannot double-post.
      const fingerprint = JSON.stringify(body);
      const pending = JSON.parse(sessionStorage.getItem('dayari_pending_receipt') ?? 'null');
      const key = pending?.fingerprint === fingerprint ? pending.key : crypto.randomUUID();
      sessionStorage.setItem('dayari_pending_receipt', JSON.stringify({ fingerprint, key }));

      const result = await post('receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: fingerprint,
      });

      sessionStorage.removeItem('dayari_pending_receipt');
      onSaved(result);
    } catch (failure) {
      setError(
        `${(failure as Error).message} Retry without changing the draft if the response was lost. Check recent receipts before starting a separate delivery.`,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const visibleProducts = products.filter(([id, name]) =>
    `${name} ${available
      .filter((sku) => sku.productId === id)
      .map((sku) => `${sku.variantName} ${sku.fullCode}`)
      .join(' ')}`
      .toLowerCase()
      .includes(productSearch.toLowerCase()),
  );

  return (
    <WizardShell
      eyebrow="Stock receiving"
      title="Receive delivery"
      subtitle="One supplier location, all delivered products. Keep usable and damaged arrivals separate."
      steps={['Supplier', 'Products', 'Quantities', 'Review']}
      step={step}
      setStep={changeStep}
      busy={busy}
      error={error}
      dirty={Boolean(supplierId || lines.length || invoiceReference)}
      onClose={onClose}
      onFinish={finish}
      finishLabel="Confirm receipt"
    >
      {step === 0 ? (
        <>
          <Field label="Receiving supplier">
            {(id) => (
              <Select
                id={id}
                required
                label="Receiving supplier"
                placeholder="Select supplier"
                value={supplierId}
                onChange={(value) => {
                  setSupplierId(value);
                  setSourceId('');
                  setLines([]);
                }}
                options={options.suppliers.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.code}`,
                }))}
              />
            )}
          </Field>

          {supplier ? (
            <Field label="Receiving source">
              {(id) => (
                <Select
                  id={id}
                  required
                  label="Receiving source"
                  placeholder="Select source location"
                  value={sourceId}
                  onChange={(value) => {
                    setSourceId(value);
                    setLines([]);
                  }}
                  options={supplier.sources.map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${item.code}`,
                  }))}
                />
              )}
            </Field>
          ) : null}

          <Footnote>
            Only existing sourced SKUs can be received. Ask Admin to complete catalogue setup if a
            product is missing.
          </Footnote>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <SearchInput
            label="Search receiving products"
            value={productSearch}
            onChange={setProductSearch}
            placeholder="Find a product, variant or SKU…"
          />
          <Badge tone="brand">
            {lines.length} variant line{lines.length === 1 ? '' : 's'} selected
          </Badge>

          {visibleProducts.map(([productId, name]) => (
            <section key={productId} className={cn(card, 'p-4')}>
              <h4 className="font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
                {name}
              </h4>
              <div className="mt-3 space-y-2.5">
                {available
                  .filter((sku) => sku.productId === productId)
                  .map((sku) => (
                    <label key={sku.id} className="flex cursor-pointer items-start gap-2.5">
                      <Checkbox
                        className="mt-0.5"
                        checked={lines.some((line) => line.skuId === sku.id)}
                        onChange={(event) =>
                          setLines((previous) =>
                            event.target.checked
                              ? [
                                  ...previous,
                                  {
                                    skuId: sku.id,
                                    usableQuantity: '0',
                                    damagedQuantity: '0',
                                    damageReason: '',
                                  },
                                ]
                              : previous.filter((line) => line.skuId !== sku.id),
                          )
                        }
                      />
                      <span className="min-w-0">
                        <span className="block font-sans text-sm tracking-[-0.02em] text-ink">
                          {sku.variantName}
                        </span>
                        <Code tone="muted" className="mt-0.5 block">
                          {sku.fullCode}
                        </Code>
                      </span>
                    </label>
                  ))}
              </div>
            </section>
          ))}

          {!visibleProducts.length ? (
            <Footnote>No products match that search for this source.</Footnote>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Delivery date">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  required
                  min="0001-01-01"
                  max={lagosDate()}
                  value={deliveredOn}
                  onChange={(event) => setDeliveredOn(event.target.value)}
                />
              )}
            </Field>
            <Field label="Invoice reference (optional)">
              {(id) => (
                <Input
                  id={id}
                  maxLength={160}
                  value={invoiceReference}
                  onChange={(event) => setInvoice(event.target.value)}
                />
              )}
            </Field>
          </div>

          {lines.map((line, index) => {
            const sku = available.find((item) => item.id === line.skuId)!;

            return (
              <section key={line.skuId} className={cn(card, 'space-y-4 p-4')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
                      {sku.productName} · {sku.variantName}
                    </h4>
                    <Code tone="muted" className="mt-0.5 block">
                      {sku.fullCode}
                    </Code>
                  </div>
                  <LinkButton
                    aria-label={`Remove ${sku.fullCode}`}
                    className="shrink-0 text-grey-3 hover:text-danger"
                    onClick={() =>
                      setLines((previous) => previous.filter((row) => row.skuId !== line.skuId))
                    }
                  >
                    Remove
                  </LinkButton>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Usable quantity">
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min="0"
                        max="2147483647"
                        step="1"
                        required
                        aria-label={`${sku.fullCode} usable quantity`}
                        value={line.usableQuantity}
                        onChange={(event) => change(index, { usableQuantity: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Damaged quantity">
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min="0"
                        max="2147483647"
                        step="1"
                        required
                        aria-label={`${sku.fullCode} damaged quantity`}
                        value={line.damagedQuantity}
                        onChange={(event) => change(index, { damagedQuantity: event.target.value })}
                      />
                    )}
                  </Field>
                </div>

                {Number(line.damagedQuantity) > 0 ? (
                  <Field label="Damage explanation">
                    {(id) => (
                      <Textarea
                        id={id}
                        required
                        minLength={10}
                        maxLength={2000}
                        aria-label={`${sku.fullCode} damage explanation`}
                        placeholder="Describe the condition of the damaged arrivals"
                        value={line.damageReason}
                        onChange={(event) => change(index, { damageReason: event.target.value })}
                      />
                    )}
                  </Field>
                ) : null}
              </section>
            );
          })}

          <Totals
            usable={String(usable)}
            damaged={String(damaged)}
            delivered={String(usable + damaged)}
          />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <div className={cn(card, 'p-4')}>
            <p className="font-sans text-sm tracking-[-0.02em] text-ink">
              <strong className="font-semibold">{supplier?.name}</strong> · {source?.name}
            </p>
            <p className="mt-1.5 font-sans text-sm tracking-[-0.02em] text-ink">
              Delivery date: {deliveredOn}
            </p>
            {invoiceReference ? (
              <p className="mt-1.5 font-sans text-sm tracking-[-0.02em] text-ink">
                Invoice reference: {invoiceReference}
              </p>
            ) : null}
            <Footnote className="mt-3">
              A new delivery batch will be assigned when accepted. Acceptance is recorded now,
              independently of the delivery date.
            </Footnote>
          </div>

          {lines.map((line) => {
            const sku = available.find((item) => item.id === line.skuId)!;

            return (
              <div key={line.skuId} className={cn(card, 'p-4')}>
                <p className="font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
                  {sku.productName} · {sku.variantName}
                </p>
                <Code className="mt-1 block">{sku.fullCode}</Code>
                <p className="mt-3 font-sans text-sm tracking-[-0.02em] text-ink">
                  Usable: {line.usableQuantity} · Damaged: {line.damagedQuantity} · Total:{' '}
                  {Number(line.usableQuantity) + Number(line.damagedQuantity)}
                </p>
                {Number(line.damagedQuantity) > 0 ? (
                  <p className="mt-2 font-sans text-sm leading-[1.6] tracking-[-0.02em] text-damaged">
                    {line.damageReason}
                  </p>
                ) : null}
              </div>
            );
          })}

          <Totals
            usable={String(usable)}
            damaged={String(damaged)}
            delivered={String(usable + damaged)}
          />

          <Footnote>
            Confirming accepts every line together. Damaged arrivals enter damaged stock only. This
            receipt cannot be edited or supplemented after acceptance.
          </Footnote>
        </>
      ) : null}
    </WizardShell>
  );
}
