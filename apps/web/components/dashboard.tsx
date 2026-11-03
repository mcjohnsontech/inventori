'use client';
import type { Catalogue, OperationalStock } from '@dayari/contracts';
import { ArrowUpRight, Box, PackageCheck, Tags, Truck } from 'lucide-react';
import { useApiRead } from '../lib/api';
import { PageHeader, EmptyState, ReadError, Badge, LoadingState } from './ui/workspace';
import { Button } from './ui/button';
import type { Workspace } from './app-shell';
export type ReceiptSummary = { id: string; batchId: string; publicCode: string; supplierName: string; sourceName: string; deliveredOn: string; acceptedAt: string };
export function Dashboard({ catalogue, name, navigate, onReceipt }: { catalogue: Catalogue; name: string; navigate: (workspace: Workspace) => void; onReceipt: (id: string) => void }) {
  const stock = useApiRead<OperationalStock>('stock');
  const receipts = useApiRead<ReceiptSummary[]>('receipts');
  const variants = catalogue.products.reduce((sum, product) => sum + product.variants.filter(variant => !product.attributes.length || variant.combinationKey).length, 0);
  const cards = [
    { title: 'Registered products', value: catalogue.products.length, hint: 'Shared parent identities', icon: Box, target: 'catalogue' },
    { title: 'Configured variants', value: variants, hint: 'Across the product catalogue', icon: Tags, target: 'catalogue' },
    { title: 'Supplier SKUs', value: catalogue.skus.length, hint: 'Saved source-specific identities', icon: Truck, target: 'catalogue' },
    { title: 'Lots with usable stock', value: stock.data ? stock.data.lots.filter(lot => BigInt(lot.usable) > 0n).length : '—', hint: 'Separate SKU and delivery batches', icon: PackageCheck, target: 'inventory' },
  ] as const;
  return <div className="page"><PageHeader eyebrow="Your shop, at a glance" title={`Welcome, ${name.split(' ')[0]}`} description="A clear starting point for today's inventory work. Figures come from your local shop service." actions={<Button onClick={() => navigate('receiving')}>Receive a delivery <ArrowUpRight size={16} /></Button>} />
    <div className="metric-grid">{cards.map(card => <button key={card.title} className="metric-card" onClick={() => navigate(card.target)}><div><span>{card.title}</span><card.icon size={18} /></div><strong>{card.value}</strong><p>{card.hint}</p></button>)}</div>
    {stock.error && <ReadError message={stock.error} onRetry={stock.refresh} />}
    <div className="dashboard-grid"><section className="surface"><div className="surface-heading"><h2>Recent receiving activity</h2><Button variant="outline" size="small" onClick={() => navigate('receipts')}>View receipts</Button></div>{receipts.loading ? <div className="px-5"><LoadingState /></div> : receipts.error ? <div className="px-5"><ReadError message={receipts.error} onRetry={receipts.refresh} /></div> : !receipts.data?.length ? <EmptyState title="Ready for your first delivery">Register a supplier and sourced product, then accept a receipt.</EmptyState> : <div className="divide-y divide-stone-100">{receipts.data.slice(0, 6).map(receipt => <button key={receipt.id} className="activity-row" onClick={() => onReceipt(receipt.id)}><span className="activity-icon"><Truck size={18} /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{receipt.publicCode}</strong><span className="text-xs text-stone-500">{receipt.supplierName} · {receipt.sourceName}</span></span><span className="text-xs text-stone-500">{new Date(receipt.acceptedAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' })}</span></button>)}</div>}</section>
      <section className="surface"><div className="surface-heading"><h2>Stock attention</h2></div><div className="space-y-5 p-5"><p className="text-sm leading-6 text-stone-500">Quantities stay separated by variant, supplier SKU and batch. Unlike products are never combined into one available-stock total.</p>{stock.data && <><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Lots containing damaged stock</span><Badge tone="damaged">{stock.data.lots.filter(lot => BigInt(lot.damaged) > 0n).length}</Badge></div><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">SKUs with usable availability</span><Badge tone="usable">{stock.data.bySku.filter(sku => BigInt(sku.usable) > 0n).length}</Badge></div><Button variant="outline" onClick={() => navigate('inventory')}>Explore inventory <ArrowUpRight size={15} /></Button></>}</div></section></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">{[['catalogue', 'Build the catalogue', 'Products, variants and saved supplier SKUs'], ['qr', 'Identify a stock lot', 'Scan DYI:1 or enter a Product / Lot Code'], ['labels', 'Prepare delivery labels', 'Accepted receipts and explicit reprints']].map(([target, title, detail]) => <button className="shortcut-card" key={target} onClick={() => navigate(target as Workspace)}><strong>{title}<ArrowUpRight size={16} /></strong><span>{detail}</span></button>)}</div>
  </div>;
}
