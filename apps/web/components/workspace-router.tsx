'use client';
import type { Catalogue, Role } from '@dayari/contracts';

import { CatalogueWorkspace } from './catalogue/catalogue-workspace';
import { Dashboard } from './dashboard';
import { HelpWorkspace } from './help-workspace';
import { InventoryWorkspace } from './inventory-workspace';
import { LabelWorkspace } from './labels/label-workspace';
import { ProductionWorkspace } from './production-workspace';
import { QrWorkspace } from './labels/qr-workspace';
import { ReceiptsWorkspace } from './receiving/receipts-workspace';
import { ReceivingWorkspace } from './receiving/receiving-workspace';
import { ReportsWorkspace } from './reports-workspace';
import { SettingsWorkspace } from './settings-workspace';
import { SuppliersWorkspace } from './suppliers-workspace';
import { UsersWorkspace } from './users-workspace';
import { Button, DetailSkeleton, EmptyState, Page, card } from './ui';
import { cn } from '../lib/cn';
import { workspaceAllowed, type Workspace } from './shell/destinations';

/** Workspaces that cannot render until the catalogue snapshot has loaded. */
const NEEDS_CATALOGUE: Workspace[] = [
  'dashboard',
  'catalogue',
  'suppliers',
  'inventory',
  'reports',
];

export type Actor = { id: string; name: string; role: Role };

function Blocked({
  title,
  message,
  onHome,
}: {
  title: string;
  message: string;
  onHome: () => void;
}) {
  return (
    <Page>
      <div className={cn(card, 'mx-auto max-w-lg px-6 py-10 text-center')}>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">{title}</h1>
        <p className="mt-3 font-sans text-sm leading-[1.7] tracking-[-0.02em] text-grey-2">
          {message}
        </p>
        <Button className="mt-6" onClick={onHome}>
          Return to your workspace
        </Button>
      </div>
    </Page>
  );
}

export function WorkspaceRouter({
  workspace,
  catalogue,
  catalogueReady,
  user,
  detail,
  missing,
  error,
  navigate,
  onSupplierFlow,
  onProductFlow,
  onPasswordChanged,
  onCatalogueChanged,
}: {
  workspace: Workspace;
  catalogue: Catalogue;
  catalogueReady: boolean;
  user: Actor;
  detail: { catalogue: string; stock: string; lot: string; receipt: string; labelJob: string; qrCode: string };
  missing: boolean;
  error: string;
  navigate: (workspace: Workspace, id?: string, lotId?: string) => void;
  onSupplierFlow: (id?: string) => void;
  onProductFlow: (id?: string) => void;
  onPasswordChanged: () => void;
  onCatalogueChanged: (catalogue: Catalogue) => void;
}) {
  const home = () => navigate(user.role === 'PRODUCTION' ? 'availability' : 'dashboard');

  if (missing) {
    return (
      <Blocked
        title="Workspace not found"
        message="This workspace address is unavailable."
        onHome={home}
      />
    );
  }

  if (!workspaceAllowed(user.role, workspace)) {
    return (
      <Blocked
        title="Access restricted"
        message="This workspace is not available for your role."
        onHome={home}
      />
    );
  }

  if (NEEDS_CATALOGUE.includes(workspace) && !catalogueReady) {
    return (
      <Page>
        {error ? (
          <EmptyState title="Catalogue data is unavailable">
            Reload it above before continuing.
          </EmptyState>
        ) : (
          <DetailSkeleton rows={4} />
        )}
      </Page>
    );
  }

  switch (workspace) {
    case 'help':
      return <HelpWorkspace role={user.role} navigate={navigate} />;

    case 'reports':
      return (
        <ReportsWorkspace
          catalogue={catalogue}
          onProduct={(id) => navigate('inventory', id)}
          onReceipt={(id) => navigate('receipts', id)}
          onLabels={(id) => navigate('labels', id)}
        />
      );

    case 'availability':
      return (
        <ProductionWorkspace
          onScan={() => navigate('qr')}
          onCode={(code) => navigate('qr', code)}
        />
      );

    case 'users':
      return <UsersWorkspace actorId={user.id} />;

    case 'settings':
      return <SettingsWorkspace user={user} onPasswordChanged={onPasswordChanged} />;

    case 'qr':
      return <QrWorkspace initialCode={detail.qrCode} />;

    case 'labels':
      return <LabelWorkspace initialJobId={detail.labelJob} />;

    case 'suppliers':
      return (
        <SuppliersWorkspace
          catalogue={catalogue}
          role={user.role}
          onSupplier={onSupplierFlow}
          onProduct={onProductFlow}
        />
      );

    case 'inventory':
      return (
        <InventoryWorkspace
          catalogue={catalogue}
          initialProductId={detail.stock}
          initialLotId={detail.lot}
          onProductDetail={(id) => navigate('catalogue', id)}
          onProductFilter={(id) => navigate('inventory', id)}
          onReceipt={(id) => navigate('receipts', id)}
        />
      );

    case 'receiving':
      return (
        <ReceivingWorkspace
          onCatalogueChanged={onCatalogueChanged}
          onHistory={() => navigate('receipts')}
          onInventory={(id) => navigate('inventory', id)}
        />
      );

    case 'receipts':
      return (
        <ReceiptsWorkspace
          initialReceiptId={detail.receipt}
          onSelect={(id) => navigate('receipts', id)}
          onStock={(id) => navigate('inventory', id)}
        />
      );

    case 'catalogue':
      return (
        <CatalogueWorkspace
          catalogue={catalogue}
          role={user.role}
          initialProductId={detail.catalogue}
          onSelect={(id) => navigate('catalogue', id)}
          onProduct={onProductFlow}
          onSupplier={onSupplierFlow}
          onSupplierDirectory={() => navigate('suppliers')}
          onStock={(id) => navigate('inventory', id)}
        />
      );

    default:
      return (
        <Dashboard
          catalogue={catalogue}
          name={user.name}
          role={user.role}
          navigate={navigate}
          onReceipt={(id) => navigate('receipts', id)}
          onLot={(productId, lotId) => navigate('inventory', productId, lotId)}
        />
      );
  }
}
