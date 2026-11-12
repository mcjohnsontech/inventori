import {
  Analytics01Icon,
  ClipboardCheckIcon,
  CheckListIcon,
  PackageDelivered01Icon,
  Alert02Icon,
  ArrowTurnBackwardIcon,
  ClipboardPenIcon,
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

import type { HugeiconsIcon } from '@hugeicons/react';
type IconSpec = Parameters<typeof HugeiconsIcon>[0]['icon'];

export const destinations = {
  dashboard: { label: 'Overview', icon: DashboardSquare01Icon as IconSpec },
  closing: {label:'Daily closing',icon:ClipboardCheckIcon as IconSpec},
  counts: {label: 'Physical counts', icon: CheckListIcon as IconSpec},
  completion: { label: 'Production completion', icon: ClipboardCheckIcon as IconSpec },
  requests: { label: 'Recovery & corrections', icon: ArrowTurnBackwardIcon as IconSpec },
  damage: { label: 'Damage & BAD reports', icon: Alert02Icon as IconSpec },
  reconciliation: { label: 'Reason reconciliation', icon: ClipboardPenIcon as IconSpec },
  orders: {label:'Orders',icon:Invoice01Icon as IconSpec},
  checkoutHistory: {label:'Checkout history',icon:Invoice01Icon as IconSpec},
  checkout: { label: 'Production', icon: PackageDelivered01Icon as IconSpec },
  availability: { label: 'Usable stock', icon: PackageSearchIcon as IconSpec },
  inventory: { label: 'Inventory', icon: BoxesIcon as IconSpec },
  receiving: { label: 'Receiving', icon: TruckDeliveryIcon as IconSpec },
  receipts: { label: 'Receiving', icon: Invoice01Icon as IconSpec },
  catalogue: { label: 'Catalogue', icon: Book02Icon as IconSpec },
  suppliers: { label: 'Suppliers & sources', icon: Building03Icon as IconSpec },
  labels: { label: 'Labels & printing', icon: PrinterIcon as IconSpec },
  qr: { label: 'QR lookup', icon: QrCodeIcon as IconSpec },
  reports: { label: 'Reports & history', icon: Analytics01Icon as IconSpec },
  users: { label: 'Users & access', icon: SecurityCheckIcon as IconSpec },
  settings: { label: 'Users & settings', icon: Settings02Icon as IconSpec },
  help: { label: 'Help & guide', icon: HelpCircleIcon as IconSpec },
} as const;

export type Workspace = keyof typeof destinations;

/** What a workspace requires. The sidebar and the router both read this. */
const workspaceCapabilities: Record<Workspace, Capability> = {
  dashboard: 'OPERATIONAL_STOCK',
  closing:'OPERATIONAL_STOCK',
  counts: 'OPERATIONAL_STOCK',
  completion: 'OPERATIONAL_STOCK',
  requests: 'OPERATIONAL_STOCK',
  damage: 'REPORT_BAD',
  reconciliation: 'RECONCILIATION_READ',
  orders:'CHECKOUT',checkoutHistory:'CHECKOUT',
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
  if (workspace === 'inventory' && role === 'PRODUCTION') return can(role, 'IDENTIFY');
  return can(role, workspaceCapabilities[workspace]);
}

/** Sidebar grouping. Order here is the order staff read it in.
 * Existing operational views are grouped under their main workspace; legacy
 * views stay routable so saved links and supported workflows keep working. */
export const navGroups: { name: string; keys: Workspace[] }[] = [
  {name:'Operations',keys:['dashboard','inventory','receipts','checkout','labels']},
  {name:'Management',keys:['catalogue','reports','settings']},
];
export function mainDestination(key:Workspace):Workspace {
 if(['availability','counts','requests','damage','closing'].includes(key))return 'inventory';
 if(['completion','reconciliation','qr','orders','checkoutHistory'].includes(key))return 'checkout';
 if(key==='receiving')return 'receipts';
 if(key==='suppliers')return 'catalogue';
 if(['users','help'].includes(key))return 'settings';
 return key;
}
export const workspaceOrder = Object.keys(destinations) as Workspace[];
