import {
  Analytics01Icon,
  Book02Icon,
  BoxesIcon,
  Building03Icon,
  DashboardSquare01Icon,
  HelpCircleIcon,
  Invoice01Icon,
  PackageSearchIcon,
  PrinterIcon,
  QrCodeIcon,
  SecurityCheckIcon,
  Settings02Icon,
  TruckDeliveryIcon,
} from '@hugeicons/core-free-icons';
import { can, type Capability, type Role } from '@dayari/contracts';

import type { IconSpec } from '../ui/icon';

export const destinations = {
  dashboard: { label: 'Overview', icon: DashboardSquare01Icon as IconSpec },
  counts: {label: 'Physical counts', icon: BoxesIcon as IconSpec},
  completion: { label: 'Production completion', icon: BoxesIcon as IconSpec },
  requests: { label: 'Recovery & corrections', icon: Invoice01Icon as IconSpec },
  damage: { label: 'Damage & BAD reports', icon: Invoice01Icon as IconSpec },
  reconciliation: { label: 'Reason reconciliation', icon: Invoice01Icon as IconSpec },
  checkout: { label: 'Production checkout', icon: BoxesIcon as IconSpec },
  availability: { label: 'Usable stock', icon: PackageSearchIcon as IconSpec },
  inventory: { label: 'Inventory', icon: BoxesIcon as IconSpec },
  receiving: { label: 'Receiving', icon: TruckDeliveryIcon as IconSpec },
  receipts: { label: 'Receipts & activity', icon: Invoice01Icon as IconSpec },
  catalogue: { label: 'Catalogue', icon: Book02Icon as IconSpec },
  suppliers: { label: 'Suppliers & sources', icon: Building03Icon as IconSpec },
  labels: { label: 'Labels & printing', icon: PrinterIcon as IconSpec },
  qr: { label: 'QR lookup', icon: QrCodeIcon as IconSpec },
  reports: { label: 'Reports & history', icon: Analytics01Icon as IconSpec },
  users: { label: 'Users & access', icon: SecurityCheckIcon as IconSpec },
  settings: { label: 'Account & shop', icon: Settings02Icon as IconSpec },
  help: { label: 'Help & guide', icon: HelpCircleIcon as IconSpec },
} as const;

export type Workspace = keyof typeof destinations;

/** What a workspace requires. The sidebar and the router both read this. */
const workspaceCapabilities: Record<Workspace, Capability> = {
  dashboard: 'OPERATIONAL_STOCK',
  counts: 'OPERATIONAL_STOCK',
  completion: 'OPERATIONAL_STOCK',
  requests: 'OPERATIONAL_STOCK',
  damage: 'REPORT_BAD',
  reconciliation: 'RECONCILIATION_READ',
  checkout: 'CHECKOUT',
  availability: 'IDENTIFY',
  inventory: 'OPERATIONAL_STOCK',
  receiving: 'RECEIVE',
  receipts: 'RECEIVE',
  catalogue: 'CATALOGUE_READ',
  suppliers: 'CATALOGUE_READ',
  labels: 'PRINT_ADMIN',
  qr: 'IDENTIFY',
  reports: 'OPERATIONAL_STOCK',
  users: 'STAFF_ADMIN',
  settings: 'OWN_ACCOUNT',
  help: 'OWN_ACCOUNT',
};

export function workspaceAllowed(role: Role, workspace: Workspace) {
  return can(role, workspaceCapabilities[workspace]);
}

/** Sidebar grouping. Order here is the order staff read it in.
 * Suppliers and Receiving are consolidated into Catalogue and the receipt
 * workflow; both workspaces stay routable so existing workflows and links work. */
export const navGroups: { name: string; keys: Workspace[] }[] = [
  { name: 'Stock & operations', keys: ['dashboard', 'availability', 'inventory', 'checkout', 'completion', 'counts', 'reconciliation', 'damage', 'requests', 'receipts'] },
  { name: 'Catalogue', keys: ['catalogue'] },
  { name: 'Tools & reports', keys: ['labels', 'qr', 'reports'] },
  { name: 'Workspace', keys: ['users', 'settings', 'help'] },
];

export const workspaceOrder = Object.keys(destinations) as Workspace[];
