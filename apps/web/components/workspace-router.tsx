'use client';
import type { Catalogue, Role } from '@dayari/contracts';

import { CatalogueWorkspace } from './catalogue/catalogue-workspace';
import { Dashboard } from './dashboard';
import { InventoryWorkspace } from './inventory-workspace';
import { LabelWorkspace } from './labels/label-workspace';
import { QrWorkspace } from './labels/qr-workspace';
import { ReceiptsWorkspace } from './receiving/receipts-workspace';
import { ReceivingWorkspace } from './receiving/receiving-workspace';
import { SettingsWorkspace } from './settings-workspace';
import { SuppliersWorkspace } from './suppliers-workspace';
import type { Workspace } from './shell/destinations';

export type WorkspaceContext = {
  workspace: Workspace;
  catalogue: Catalogue;
  user: { id: string; name: string; role: Role };
  detail: { catalogue: string; stock: string; receipt: string };
  navigate: (workspace: Workspace, id?: string) => void;
  onSupplierFlow: (id?: string) => void;
  onProductFlow: (id?: string) => void;
};

/**
 * One workspace per route key. Production staff are limited to QR lookup and
 * settings regardless of the key in the hash.
 */
export function WorkspaceRouter({
  workspace,
  catalogue,
  user,
  detail,
  navigate,
  onSupplierFlow,
  onProductFlow,
}: WorkspaceContext) {
  if (workspace === 'settings') {
    return <SettingsWorkspace user={user} />;
  }

  if (user.role === 'PRODUCTION') {
    return <QrWorkspace />;
  }

  switch (workspace) {
    case 'qr':
      return <QrWorkspace />;

    case 'labels':
      return <LabelWorkspace />;

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
          onProductDetail={(id) => navigate('catalogue', id)}
          onProductFilter={(id) => navigate('inventory', id)}
          onReceipt={(id) => navigate('receipts', id)}
        />
      );

    case 'receiving':
      return (
        <ReceivingWorkspace
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
          onStock={(id) => navigate('inventory', id)}
        />
      );

    default:
      return (
        <Dashboard
          catalogue={catalogue}
          name={user.name}
          navigate={navigate}
          onReceipt={(id) => navigate('receipts', id)}
        />
      );
  }
}
