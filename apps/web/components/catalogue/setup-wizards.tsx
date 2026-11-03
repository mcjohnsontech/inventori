'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { nextSupplierCode, type Catalogue, type ProductSetupInput, type SupplierSetupInput } from '@dayari/contracts';
import { Button } from '../ui/button';
import { WizardShell } from './wizard-shell';

async function saveSetup(type: string, body: unknown) {
  const fingerprint = JSON.stringify(body);
  const storageKey = `dayari_pending_${type}`;
  const prior = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as { fingerprint: string; key: string } | null;
  const key = prior?.fingerprint === fingerprint ? prior.key : crypto.randomUUID();
  sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
  const response = await fetch(`/api/catalogue/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: fingerprint });
  const result = await response.json();
  if (!response.ok) {
    const message = result.message ?? result.issues?.map((issue: { message: string }) => issue.message).join('. ');
    throw new Error(typeof message === 'string' ? message : 'Check the entered details and try again.');
  }
  sessionStorage.removeItem(storageKey);
  return result;
}
type Props = { catalogue: Catalogue; onClose: () => void; onSaved: (message: string) => Promise<void> };
function Summary({ rows }: { rows: [string, string][] }) { return <dl className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white px-5">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-[120px_1fr] gap-4 py-4 text-sm"><dt className="text-stone-500">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl>; }

export function SupplierWizard({ catalogue, onClose, onSaved, initialSupplierId = '' }: Props & { initialSupplierId?: string }) {
  const [step, setStep] = useState(0);
  const supplierId = initialSupplierId;
  const [name, setName] = useState('');
  const [registryId, setRegistryId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [keepPrefix, setKeepPrefix] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const supplier = catalogue.suppliers.find(row => row.id === supplierId);
  const registry = catalogue.locations.find(row => row.id === registryId);
  const source = supplier?.sources.find(row => row.id === sourceId);
  const supplierCode = supplier?.code ?? nextSupplierCode(name, catalogue.suppliers.map(row => row.code));
  const prefix = source && keepPrefix ? source.code : `${supplierCode}${registry?.code ?? locationCode}`;
  const submitting = useRef(false);
  async function finish() {
    if (submitting.current) return; submitting.current = true;
    setBusy(true); setError('');
    const body: SupplierSetupInput = {
      supplier: supplier ? { id: supplier.id } : { name },
      location: registry ? { registryId: registry.id } : { name: locationName, code: locationCode },
      ...(source ? { existingSourceId: source.id } : {}),
      ...(!source && sourceName.trim() ? { sourceName: sourceName.trim() } : {}),
      useExistingPrefix: Boolean(source && keepPrefix),
    };
    try { const result = await saveSetup('supplier-setups', body); await onSaved(`Supplier location ready. Prefix: ${result.prefix.code}`); } catch (failure) { setError((failure as Error).message); } finally { submitting.current = false; setBusy(false); }
  }
  return <WizardShell title={initialSupplierId ? 'Set up supplier location' : 'Add supplier'} subtitle="Set up a supplier and location once. Select them whenever you add a product." steps={['Supplier', 'Location', 'Review prefix']} step={step} setStep={value => { setError(''); setStep(value); }} busy={busy} error={error} dirty={Boolean(name || supplierId || registryId)} onClose={onClose} onFinish={finish} finishLabel="Save supplier location">
    {step === 0 && <>
      {supplier && <Summary rows={[[ 'Supplier', supplier.name ]]} />}
      {!supplier && <label>Supplier name<input value={name} onChange={event => setName(event.target.value)} required maxLength={160} placeholder="Chioma Ventures" /></label>}
      <Summary rows={[[supplier ? 'Saved code' : 'Suggested code', supplierCode || 'Enter a supplier name']]} />
      <p className="text-xs leading-5 text-stone-500">{supplier ? 'Set up another location for this supplier. Its saved supplier code stays the same.' : 'Enter the new supplier’s name. Its code is generated automatically; you’ll add its location next.'}</p>
    </>}
    {step === 1 && <>
      {supplier && supplier.sources.some(row => !row.skuPrefix) && <label>Supplier location<select value={sourceId} onChange={event => { setSourceId(event.target.value); setKeepPrefix(true); }}><option value="">Add a new location</option>{supplier.sources.filter(row => !row.skuPrefix).map(row => <option key={row.id} value={row.id}>{row.name} · existing code {row.code}</option>)}</select></label>}
      <label>Location registry<select value={registryId} onChange={event => setRegistryId(event.target.value)} required><option value="" disabled>Select location</option>{catalogue.locations.map(row => <option value={row.id} key={row.id}>{row.name} ({row.code})</option>)}<option value="new">Register another location</option></select></label>
      {registryId === 'new' && <div className="grid gap-4 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2"><label>Location name<input required maxLength={160} value={locationName} onChange={event => setLocationName(event.target.value)} placeholder="Ibadan" /></label><label>Approved location code<input required maxLength={32} pattern="[A-Z0-9]+" value={locationCode} onChange={event => setLocationCode(event.target.value.toUpperCase())} placeholder="Enter registry code" /></label></div>}
      {!source && <label>Specific source or area (optional)<input maxLength={160} value={sourceName} onChange={event => setSourceName(event.target.value)} placeholder="For example, Lagos Island" /></label>}
      {source && <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><input className="!mt-0.5 !w-auto" type="checkbox" checked={keepPrefix} onChange={event => setKeepPrefix(event.target.checked)} /><span>Keep this location’s existing prefix: <strong>{source.code}</strong><span className="mt-1 block font-normal text-stone-500">Preserves the prefix already registered for {source.name}.</span></span></label>}
    </>}
    {step === 2 && <>
      <Summary rows={[[ 'Supplier', supplier?.name ?? name ], ['Supplier code', supplierCode], ['Location', source?.name ?? (sourceName || registry?.name || locationName)], ['Location code', registry?.code ?? locationCode]]} />
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs text-emerald-800">Supplier SKU prefix</p><p className="mt-2 font-mono text-3xl font-semibold text-emerald-950">{prefix}</p><p className="mt-3 text-xs leading-5 text-emerald-800">Products from this supplier location will use this prefix. Final uniqueness is confirmed when saved.</p></div>
      <p className="text-xs text-stone-500">No product or stock quantities are created during supplier setup.</p>
    </>}
  </WizardShell>;
}

type VariantDraft = { id: string; name: string; suffix: string; values: Record<string, string>; selected: boolean };
export function ProductWizard({ catalogue, onClose, onSaved, onConfigureSupplier, initialProductId = '' }: Props & { initialProductId?: string; onConfigureSupplier: (supplierId: string) => void }) {
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
  const [rows, setRows] = useState<VariantDraft[]>([{ id: '', name: '', suffix: '', values: {}, selected: true }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const supplier = catalogue.suppliers.find(row => row.id === supplierId);
  const source = supplier?.sources.find(row => row.id === sourceId);
  const product = catalogue.products.find(row => row.id === productId);
  const creatingVariants = extending || !product || !product.variants.some(row => !product.attributes.length || row.combinationKey);
  const selected = rows.filter(row => row.selected);
  const reviewRows: VariantDraft[] = !product && !options ? [{ id: '', name: 'Standard', suffix: 'STD', values: {}, selected: true }] : selected;
  const base = catalogue.sourcings.find(row => row.sourceId === sourceId && row.productId === productId)?.baseCode;
  function chooseProduct(id: string) {
    setExtending(false);
    setProductId(id);
    const existing = catalogue.products.find(row => row.id === id);
    if (!existing) { setOptions(false); setRows([{ id: '', name: '', suffix: '', values: {}, selected: true }]); return; }
    setOptions(existing.attributes.length > 0);
    setAttributes(existing.attributes.length ? existing.attributes.map(attribute => attribute.name) : ['Colour']);
    const available = existing.variants.filter(row => !existing.attributes.length || row.combinationKey).map(row => ({ id: row.id, name: row.name, suffix: catalogue.skus.find(sku => sku.variantId === row.id && sku.sourcing.source.id === sourceId)?.suffix ?? (row.combinationKey ? '' : 'STD'), values: {}, selected: true }));
    setRows(available.length ? available : [{ id: '', name: '', suffix: '', values: {}, selected: true }]);
  }
  useEffect(() => { if (initialProductId) chooseProduct(initialProductId); }, []);
  function selectSource(id: string) {
    setSourceId(id);
    if (product && !extending) setRows(previous => previous.map(row => ({ ...row, suffix: catalogue.skus.find(sku => sku.variantId === row.id && sku.sourcing.source.id === id)?.suffix ?? (row.id && !product.attributes.length ? 'STD' : '') })));
  }
  function changeRow(index: number, changes: Partial<VariantDraft>) { setRows(previous => previous.map((row, position) => position === index ? { ...row, ...changes } : row)); }
  function changeStep(value: number) {
    setError('');
    if (value > step && step === 0 && !source?.skuPrefix) { setError('Select a supplier location with a saved prefix.'); return; }
    if (value > step && step === 2 && (options || product) && !selected.length) { setError('Select at least one variant.'); return; }
    setStep(value);
  }
  const submitting = useRef(false);
  async function finish() {
    if (submitting.current) return; submitting.current = true;
    setBusy(true); setError('');
    const body: ProductSetupInput = {
      sourceId, ...(extending ? { extendVariants: true } : {}), product: product ? { id: product.id } : { name, description },
      variants: !creatingVariants ? selected.map(row => ({ variantId: row.id, suffix: row.suffix })) : options ? selected.map(row => ({ name: row.name || attributes.map(attribute => row.values[attribute]).join(' / '), suffix: row.suffix, attributes: attributes.map(attribute => ({ attribute, value: row.values[attribute] ?? '' })) })) : [],
    };
    try { const result = await saveSetup('product-setups', body); await onSaved(`Product saved. ${result.skus.map((sku: { fullCode: string }) => sku.fullCode).join(', ')}`); } catch (failure) { setError((failure as Error).message); } finally { submitting.current = false; setBusy(false); }
  }
  return <WizardShell title="Add product" subtitle="Choose the supplier once, add product details, then review its generated SKUs." steps={['Supplier', 'Product', 'Variants', 'Review']} step={step} setStep={changeStep} busy={busy} error={error} dirty={Boolean(supplierId || name || productId)} onClose={onClose} onFinish={finish} finishLabel="Save product">
    {step === 0 && <>
      <label>Supplier<select required value={supplierId} onChange={event => { setSupplierId(event.target.value); setSourceId(''); }}><option value="" disabled>Select supplier</option>{catalogue.suppliers.map(row => <option value={row.id} key={row.id}>{row.name} · {row.code}</option>)}</select></label>
      {supplier && <label>Supplier location<select required value={sourceId} onChange={event => selectSource(event.target.value)}><option value="" disabled>Select supplier location</option>{supplier.sources.filter(row => row.skuPrefix).map(row => <option key={row.id} value={row.id}>{row.name} · {row.skuPrefix!.code}</option>)}</select></label>}
      {supplier && !supplier.sources.some(row => row.skuPrefix) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm leading-6">Set up this supplier’s location prefix once before adding products.</p><Button className="mt-3" variant="outline" type="button" onClick={() => { if (window.confirm('Leave this product draft and configure the supplier location? Unsaved product details will be discarded.')) onConfigureSupplier(supplier.id); }}>Set up supplier location</Button></div>}
      {source?.skuPrefix && <Summary rows={[[ 'Supplier prefix', source.skuPrefix.code ]]} />}
      {!catalogue.suppliers.length && <p className="text-sm text-stone-500">Use the separate Add supplier button to register your first supplier.</p>}
    </>}
    {step === 1 && <>
      <label>Product<select value={productId} onChange={event => chooseProduct(event.target.value)}><option value="">Create a new parent product</option>{catalogue.products.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {!product && <><label>Product name<input required maxLength={160} value={name} onChange={event => setName(event.target.value)} placeholder="A5 Maple Leatherbound Notebook" /></label><label>Description (optional)<textarea maxLength={2000} rows={3} value={description} onChange={event => setDescription(event.target.value)} /></label></>}
      <p className="rounded-xl bg-stone-100 p-4 text-xs leading-6 text-stone-500">Choose the existing parent product when sourcing the same product from another supplier. Its variants stay shared; the supplier SKU is separate.</p>
    </>}
    {step === 2 && <>
      {!product && <label>Does this product have options?<select value={options ? 'yes' : 'no'} onChange={event => setOptions(event.target.value === 'yes')}><option value="no">No options — use a standard variant</option><option value="yes">Yes — colour, size, material or other options</option></select></label>}
      {!options && !product && <Summary rows={[[ 'Variant', 'Standard' ], ['Suffix', 'STD']]} />}
      {product && !creatingVariants && options && <Button type="button" variant="outline" onClick={() => { setExtending(true); setRows([{ id: '', name: '', suffix: '', values: {}, selected: true }]); }}>Add new variant combinations</Button>}
      {extending && <p className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">Add combinations for this product using its existing attributes. Existing variants and SKUs stay unchanged. New SKUs are allocated for the selected supplier location only.</p>}
      {product && creatingVariants && !extending && <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">This product has attributes but no saved variant combinations yet. Enter its first variant below.</p>}
      {product && !creatingVariants && <div className="space-y-3">{rows.map((row, index) => <div key={row.id} className="grid grid-cols-[1fr_140px] items-end gap-4 rounded-xl border border-stone-200 bg-white p-4"><label className="flex items-center gap-3 self-center"><input type="checkbox" className="!m-0 !w-auto" checked={row.selected} onChange={event => changeRow(index, { selected: event.target.checked })} />{row.name}</label><label>Variant suffix<input aria-label={`${row.name} suffix`} required={row.selected} disabled={!row.selected} pattern="[A-Za-z0-9]+(-[A-Za-z0-9]+)*" maxLength={64} value={row.suffix} onChange={event => changeRow(index, { suffix: event.target.value.toUpperCase() })} placeholder="RED" /></label></div>)}</div>}
      {options && creatingVariants && <>
        <div className="flex flex-wrap gap-2">{attributes.map(attribute => <span key={attribute} className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-900">{attribute}</span>)}</div>
        {!extending && <div className="flex items-end gap-2"><label className="flex-1">Another attribute<input maxLength={160} value={newAttribute} onChange={event => setNewAttribute(event.target.value)} placeholder="Size, material, finish…" /></label><Button type="button" variant="outline" onClick={() => { const value = newAttribute.trim(); if (value && !attributes.includes(value) && attributes.length < 8) { setAttributes(previous => [...previous, value]); setNewAttribute(''); } }}>Add attribute</Button></div>}
        {rows.map((row, index) => <div key={index} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-stone-500">Variant {index + 1}</p>{rows.length > 1 && <button type="button" aria-label={`Remove variant ${index + 1}`} onClick={() => setRows(previous => previous.filter((_, position) => position !== index))}><Trash2 size={15} /></button>}</div><div className="grid gap-4 sm:grid-cols-2">{attributes.map(attribute => <label key={attribute}>{attribute}<input required maxLength={160} value={row.values[attribute] ?? ''} onChange={event => changeRow(index, { values: { ...row.values, [attribute]: event.target.value } })} placeholder={attribute === 'Colour' ? 'Red' : attribute} /></label>)}<label>Variant suffix<input required pattern="[A-Za-z0-9]+(-[A-Za-z0-9]+)*" maxLength={64} value={row.suffix} onChange={event => changeRow(index, { suffix: event.target.value.toUpperCase() })} placeholder="RED or RED-A5" /></label></div></div>)}
        {rows.length < 30 && <Button type="button" variant="outline" onClick={() => setRows(previous => [...previous, { id: '', name: '', suffix: '', values: {}, selected: true }])}><Plus size={15} />Add variant row</Button>}
      </>}
    </>}
    {step === 3 && <>
      <Summary rows={[[ 'Supplier', supplier?.name ?? '' ], ['Location', source?.name ?? ''], ['Product', product?.name ?? name], ['Product base', base ?? `${source?.skuPrefix?.code} + random 5-digit number`]]} />
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white"><table className="w-full text-sm"><thead><tr><th>Variant</th><th>SKU preview</th></tr></thead><tbody>{reviewRows.map((row, index) => <tr key={index}><td>{row.name || attributes.map(attribute => row.values[attribute]).join(' / ')}</td><td className="font-mono text-xs text-emerald-900">{base ?? `${source?.skuPrefix?.code}•••••`}-{row.suffix}</td></tr>)}</tbody></table></div>
      <p className="text-xs leading-6 text-stone-500">The final unique number is assigned on save. All variants share this product base. Saving adds catalogue identities, not stock quantities.</p>
    </>}
  </WizardShell>;
}
