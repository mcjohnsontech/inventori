'use client';
import {
  Alert02Icon,
  ArrowRight01Icon,
  Invoice01Icon,
  MoneyBag02Icon,
  BoxesIcon,
  CheckListIcon,
  Factory01Icon,
  NoteEditIcon,
  RefreshIcon,
  TruckDeliveryIcon,
} from '@hugeicons/core-free-icons';
import { money } from './financial';
import type { Catalogue, FinancialReport, OperationalStock, Role } from '@dayari/contracts';
import { useApiRead } from '../lib/api';
import { useCanSeeMoney } from '../lib/role';
import { cn } from '../lib/cn';
import { stockOverview } from '../lib/stock-overview';
import { formatDate, formatTime, isPositive, plural, sumQuantities } from '../lib/format';
import { Badge, Button, Code, EmptyState, ErrorNotice, Icon, ListSkeleton, Page, PageHeader, Panel, type IconSpec } from './ui';
import { PagedItems } from './ui/paged-items';
import type { Workspace } from './shell/destinations';

export type ReceiptSummary = { id: string; batchId: string; publicCode: string; supplierName: string; sourceName: string; deliveredOn: string; acceptedAt: string; totalItems?: string; labelledUnits?: number; labelsPrinted?: number };

function greeting() {
  const hour = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** A stat tile that opens the view behind its number. */
function StatTile({ label, value, hint, icon, tone, onClick }: { label: string; value: string | number; hint?: string; icon: IconSpec; tone: 'brand' | 'danger' | 'damaged' | 'neutral'; onClick: () => void }) {
  const tones = { brand: 'bg-brand-tint text-brand', danger: 'bg-danger-tint text-danger', damaged: 'bg-damaged-tint text-damaged', neutral: 'bg-black/5 text-grey-2' };
  return (
    <button type="button" onClick={onClick} className="surface group flex items-center gap-4 p-4 text-left transition-colors hover:border-black/15 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', tones[tone])}>
        <Icon icon={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-grey-2">{label}</span>
        <strong className="mt-1 block font-display text-2xl font-semibold text-ink">{value}</strong>
        {hint ? <span className="mt-0.5 block text-xs text-grey-3">{hint}</span> : null}
      </span>
      <Icon icon={ArrowRight01Icon} size={16} className="text-grey-3 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function ActionCard({ title, detail, icon, onClick }: { title: string; detail: string; icon: IconSpec; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="surface flex items-start gap-3 p-4 text-left transition-colors hover:border-black/15 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
        <Icon icon={icon} size={18} />
      </span>
      <span className="min-w-0">
        <span className="block font-sans text-sm font-semibold tracking-[-0.02em] text-ink">{title}</span>
        <span className="mt-0.5 block font-sans text-xs leading-5 text-grey-2">{detail}</span>
      </span>
    </button>
  );
}

export function Dashboard({ catalogue, name, navigate, onReceipt, onReceive }: { catalogue: Catalogue; name: string; role: Role; navigate: (key: Workspace, id?: string, lotId?: string) => void; onReceipt: (id: string) => void; onLot: (id: string, lotId: string) => void; onReceive: () => void }) {
  const stock = useApiRead<OperationalStock>('stock', { refreshOnFocus: true });
  const receipts = useApiRead<ReceiptSummary[]>('receipts', { refreshOnFocus: true });
  const rows = stock.data ? stockOverview(catalogue, stock.data) : [];
  // Owner decision 26 Nov 2026: money is Admin-only; Managers never request it.
  const seeMoney = useCanSeeMoney();
  const value$ = useApiRead<FinancialReport>(seeMoney ? 'financial/report' : null, { refreshOnFocus: true });
  const damagedItems = stock.data ? sumQuantities(stock.data.lots.map((lot) => lot.damaged)) : '0';
  const usableItems = stock.data ? sumQuantities(stock.data.lots.map((lot) => lot.usable)) : '0';
  const productsInStock = new Set(rows.filter((row) => row.status === 'available').map((row) => row.productId)).size;
  const summary = value$.data?.summary;
  const moneyValue = (amount: string | null | undefined) => (value$.loading ? 'Loading…' : value$.error || !summary ? 'Unavailable' : amount === null ? 'Not enough data' : money(amount ?? '0'));
  const outOfStock = rows.filter((row) => row.status === 'empty');
  const unreceived = rows.filter((row) => row.status === 'unreceived').length;
  const missingCosts = useApiRead<{ total: number }>(seeMoney ? 'financial/missing-costs?page=1' : null, { refreshOnFocus: true });
  const attention = [
    ...(missingCosts.data?.total ? [{ key: 'missing-costs', productId: '', title: `${plural(missingCosts.data.total, 'delivery line')} ${missingCosts.data.total === 1 ? 'needs' : 'need'} a cost price`, detail: 'Received without a cost. Add what was paid in Deliveries.', badge: <Badge tone="neutral">Needs a cost</Badge>, onOpen: () => navigate('receipts') }] : []),
    ...outOfStock.map((row) => ({ key: row.variantId, productId: row.productId, title: `${row.productName} · ${row.variantName}`, detail: '', badge: <Badge tone="danger">Out of stock</Badge>, onOpen: () => navigate('inventory', row.productId) })),
    ...rows.filter((row) => isPositive(row.damaged)).map((row) => {
      const lots = row.lots.filter((lot) => isPositive(lot.damaged)).length;
      return { key: `damaged-${row.variantId}`, productId: row.productId, title: `${row.productName} · ${row.variantName}`, detail: plural(lots, 'lot'), badge: <Badge tone="damaged">{row.damaged} damaged</Badge>, onOpen: () => navigate('inventory', row.productId) };
    }),
  ];
  const value = (n: number | string) => (stock.loading ? 'Loading…' : stock.error ? 'Unavailable' : n);
  const first = name.split(' ')[0];

  return (
    <Page>
      <PageHeader
        title={`${greeting()}, ${first}`}
        description=""
        actions={
          <Button onClick={onReceive}>
            <Icon icon={TruckDeliveryIcon} size={16} />
            Receive a delivery
          </Button>
        }
      />
      <p className="mt-2 flex flex-wrap items-center gap-2 font-sans text-sm text-grey-2">
        {formatDate(new Date().toISOString())}
        <span aria-hidden className="text-black/15">·</span>
        <button type="button" onClick={() => { stock.refresh(); receipts.refresh(); value$.refresh(); missingCosts.refresh(); }} className="inline-flex items-center gap-1.5 rounded text-grey-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand" aria-label="Refresh stock">
          {stock.loadedAt ? `Updated ${formatTime(stock.loadedAt.toISOString())}` : 'Refresh'}
          <Icon icon={RefreshIcon} size={14} />
        </button>
      </p>

      <div aria-label="Stock summary" aria-busy={stock.loading} className="mt-6 grid gap-3 md:grid-cols-3">
        <StatTile label="Usable stock" value={value(usableItems)} hint={stock.data ? `${plural(Number(usableItems), 'item')} across ${plural(productsInStock, 'product')}` : undefined} icon={BoxesIcon} tone="brand" onClick={() => navigate('inventory')} />
        {seeMoney ? <>
        <StatTile label="Total cost of stock left" value={moneyValue(summary?.usableCostValue)} hint={summary ? `What we paid · ${summary.knownCostUnits} of ${summary.usableUnits} items have a cost price` : undefined} icon={MoneyBag02Icon} tone="neutral" onClick={() => navigate('reports')} />
        <StatTile label="Total selling price of stock left" value={moneyValue(summary?.potentialSellingValue)} hint={summary ? `If all sold · ${summary.pricedUsableUnits} of ${summary.usableUnits} items have a selling price` : undefined} icon={Invoice01Icon} tone="neutral" onClick={() => navigate('reports')} />
        </> : <>
        <StatTile label="Damaged items" value={value(damagedItems)} hint={stock.data ? 'Held apart from usable stock' : undefined} icon={Alert02Icon} tone="neutral" onClick={() => navigate('damage')} />
        <StatTile label="Out of stock" value={value(outOfStock.length)} hint={stock.data ? `${plural(outOfStock.length, 'option')} with nothing usable left` : undefined} icon={BoxesIcon} tone="neutral" onClick={() => navigate('inventory')} />
        </>}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ActionCard title="Product checkout" detail="Scan items going out to be worked on." icon={Factory01Icon} onClick={() => navigate('checkout')} />
        <ActionCard title="Stock count" detail="Count a shelf and record what you find." icon={CheckListIcon} onClick={() => navigate('counts')} />
        <ActionCard title="Missing reasons" detail="Add a reason to checkouts that had none." icon={NoteEditIcon} onClick={() => navigate('reconciliation')} />
        <ActionCard title="Damaged items" detail="Report or review damaged items." icon={Alert02Icon} onClick={() => navigate('damage')} />
      </div>

      <div className="mt-6 grid items-start gap-5 xl:grid-cols-2">
        <Panel title="Needs attention">
          {stock.loading ? <ListSkeleton rows={3} /> : stock.error ? <ErrorNotice message={stock.error} onRetry={stock.refresh} /> : !attention.length ? (
            <EmptyState title="Nothing needs attention" icon={BoxesIcon}>Every received variant has usable stock and no lot holds damaged items.</EmptyState>
          ) : (
            <PagedItems items={attention}>
              {(items) => (
                <ul className="divide-y divide-black/5">
                  {items.map((row) => (
                    <li key={row.key}>
                      <button type="button" className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-brand focus-visible:outline-2 focus-visible:outline-brand" onClick={row.onOpen}>
                        <span className="min-w-0"><strong className="block font-medium text-ink">{row.title}</strong>{row.detail ? <span className="text-xs text-grey-3">in {row.detail}</span> : null}</span>
                        {row.badge}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PagedItems>
          )}
          {unreceived && !stock.loading ? (
            <button type="button" onClick={() => navigate('catalogue')} className="mt-3 text-sm font-semibold text-brand underline-offset-4 hover:underline">
              {plural(unreceived, 'product variant')} never received →
            </button>
          ) : null}
        </Panel>

        <Panel title="Recent deliveries" action={<Button variant="secondary" size="compact" onClick={() => navigate('receipts')}>View all</Button>}>
          {receipts.loading ? <ListSkeleton rows={3} /> : receipts.error ? <ErrorNotice message={receipts.error} onRetry={receipts.refresh} /> : !receipts.data?.length ? (
            <EmptyState title="Ready for your first delivery" action={<Button onClick={onReceive}>Receive a delivery</Button>}>Receive a delivery to begin tracking stock.</EmptyState>
          ) : (
            <PagedItems items={receipts.data}>
              {(items) => (
                <ul className="divide-y divide-black/5">
                  {items.map((row) => (
                    <li key={row.id}>
                      <button onClick={() => onReceipt(row.id)} className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">
                        <span className="min-w-0">
                          <span className="block font-medium text-ink">{row.supplierName} · {row.sourceName}</span>
                          <Code tone="muted" className="text-xs">{row.publicCode}</Code>
                        </span>
                        <span className="text-xs text-grey-2">{formatDate(row.acceptedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PagedItems>
          )}
        </Panel>
      </div>

    </Page>
  );
}
