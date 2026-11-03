'use client';
import {
  ArrowUpRight01Icon,
  Book02Icon,
  PackageDeliveredIcon,
  PackageIcon,
  PrinterIcon,
  QrCodeIcon,
  TagsIcon,
  TruckDeliveryIcon,
} from '@hugeicons/core-free-icons';
import type { Catalogue, OperationalStock } from '@dayari/contracts';

import { useApiRead } from '../lib/api';
import { formatDate, isPositive } from '../lib/format';
import {
  Badge,
  Button,
  Code,
  EmptyState,
  ErrorNotice,
  Footnote,
  Icon,
  LinkButton,
  ListSkeleton,
  Page,
  PageHeader,
  Panel,
  Stack,
  Stat,
  StatSkeleton,
  card,
  cardInteractive,
} from './ui';
import { cn } from '../lib/cn';
import type { Workspace } from './shell/destinations';

export type ReceiptSummary = {
  id: string;
  batchId: string;
  publicCode: string;
  supplierName: string;
  sourceName: string;
  deliveredOn: string;
  acceptedAt: string;
};

const shortcuts = [
  {
    target: 'catalogue' as Workspace,
    title: 'Build the catalogue',
    detail: 'Products, variants and saved supplier SKUs',
    icon: Book02Icon,
  },
  {
    target: 'qr' as Workspace,
    title: 'Identify a stock lot',
    detail: 'Scan DYI:1 or enter a Product / Lot Code',
    icon: QrCodeIcon,
  },
  {
    target: 'labels' as Workspace,
    title: 'Prepare delivery labels',
    detail: 'Accepted receipts and explicit reprints',
    icon: PrinterIcon,
  },
];

export function Dashboard({
  catalogue,
  name,
  navigate,
  onReceipt,
}: {
  catalogue: Catalogue;
  name: string;
  navigate: (workspace: Workspace) => void;
  onReceipt: (id: string) => void;
}) {
  const stock = useApiRead<OperationalStock>('stock');
  const receipts = useApiRead<ReceiptSummary[]>('receipts');

  const variants = catalogue.products.reduce(
    (sum, product) =>
      sum +
      product.variants.filter((variant) => !product.attributes.length || variant.combinationKey)
        .length,
    0,
  );

  const stats = [
    {
      label: 'Registered products',
      value: catalogue.products.length,
      hint: 'Shared parent identities',
      icon: PackageIcon,
      target: 'catalogue' as Workspace,
    },
    {
      label: 'Configured variants',
      value: variants,
      hint: 'Across the product catalogue',
      icon: TagsIcon,
      target: 'catalogue' as Workspace,
    },
    {
      label: 'Supplier SKUs',
      value: catalogue.skus.length,
      hint: 'Saved source-specific identities',
      icon: TruckDeliveryIcon,
      target: 'catalogue' as Workspace,
    },
    {
      label: 'Lots with usable stock',
      value: stock.data ? stock.data.lots.filter((lot) => isPositive(lot.usable)).length : '—',
      hint: 'Separate SKU and delivery batches',
      icon: PackageDeliveredIcon,
      target: 'inventory' as Workspace,
    },
  ];

  const damagedLots = stock.data?.lots.filter((lot) => isPositive(lot.damaged)).length ?? 0;
  const usableSkus = stock.data?.bySku.filter((sku) => isPositive(sku.usable)).length ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Your shop, at a glance"
        title={`Welcome, ${name.split(' ')[0]}`}
        description="A clear starting point for today's inventory work. Figures come from your local shop service."
        actions={
          <Button onClick={() => navigate('receiving')}>
            Receive a delivery
            <Icon icon={ArrowUpRight01Icon} size={16} strokeWidth={2} />
          </Button>
        }
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stock.loading && !stock.data
          ? stats.map((stat) => <StatSkeleton key={stat.label} />)
          : stats.map((stat) => (
              <Stat
                key={stat.label}
                label={stat.label}
                value={stat.value}
                hint={stat.hint}
                icon={stat.icon}
                onClick={() => navigate(stat.target)}
              />
            ))}
      </div>

      {stock.error ? (
        <ErrorNotice message={stock.error} onRetry={stock.refresh} className="mt-6" />
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel
          title="Recent receiving activity"
          description="The latest accepted deliveries, newest first."
          action={
            <Button variant="secondary" size="compact" onClick={() => navigate('receipts')}>
              View receipts
            </Button>
          }
          flush
        >
          {receipts.loading ? (
            <ListSkeleton rows={5} />
          ) : receipts.error ? (
            <div className="px-5 pb-5">
              <ErrorNotice message={receipts.error} onRetry={receipts.refresh} />
            </div>
          ) : !receipts.data?.length ? (
            <EmptyState title="Ready for your first delivery" icon={TruckDeliveryIcon}>
              Register a supplier and sourced product, then accept a receipt.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {receipts.data.slice(0, 6).map((receipt) => (
                <li key={receipt.id}>
                  <button
                    type="button"
                    onClick={() => onReceipt(receipt.id)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-muted/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
                      <Icon icon={TruckDeliveryIcon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Code className="block font-medium text-ink">{receipt.publicCode}</Code>
                      <span className="mt-0.5 block truncate font-sans text-xs tracking-[-0.02em] text-grey-3">
                        {receipt.supplierName} · {receipt.sourceName}
                      </span>
                    </span>
                    <span className="shrink-0 font-sans text-xs tracking-[-0.02em] text-grey-3">
                      {formatDate(receipt.acceptedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Stock attention"
          description="Quantities stay separated by variant, supplier SKU and batch."
        >
          <Stack gap="tight">
            <Footnote>
              Unlike products are never combined into one available-stock total.
            </Footnote>
            {stock.data ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] pt-4">
                  <span className="font-sans text-sm tracking-[-0.02em] text-ink">
                    Lots containing damaged stock
                  </span>
                  <Badge tone="damaged">{damagedLots}</Badge>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-sans text-sm tracking-[-0.02em] text-ink">
                    SKUs with usable availability
                  </span>
                  <Badge tone="usable">{usableSkus}</Badge>
                </div>
                <Button variant="secondary" onClick={() => navigate('inventory')} className="w-full">
                  Explore inventory
                  <Icon icon={ArrowUpRight01Icon} size={15} strokeWidth={2} />
                </Button>
              </>
            ) : null}
          </Stack>
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.target}
            type="button"
            onClick={() => navigate(shortcut.target)}
            className={cn(card, cardInteractive, 'p-5')}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-brand-tint text-brand">
                <Icon icon={shortcut.icon} size={18} />
              </span>
              <Icon icon={ArrowUpRight01Icon} size={16} className="mt-1 text-grey-3" />
            </span>
            <span className="mt-4 block font-sans text-sm font-semibold tracking-[-0.03em] text-ink">
              {shortcut.title}
            </span>
            <span className="mt-1.5 block font-sans text-xs leading-[1.6] tracking-[-0.02em] text-grey-3">
              {shortcut.detail}
            </span>
          </button>
        ))}
      </div>
    </Page>
  );
}
