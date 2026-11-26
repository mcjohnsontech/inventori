import {
  Alert02Icon,
  Analytics01Icon,
  ArrowTurnBackwardIcon,
  Book02Icon,
  BoxesIcon,
  Building03Icon,
  CalendarLock01Icon,
  CheckListIcon,
  DashboardSquare01Icon,
  Factory01Icon,
  HelpCircleIcon,
  Invoice01Icon,
  NoteEditIcon,
  PackageSearchIcon,
  PrinterIcon,
  QrCodeIcon,
  Settings02Icon,
  TaskDone01Icon,
  TruckDeliveryIcon,
  UserGroupIcon,
  UserCircleIcon,
  WorkHistoryIcon,
} from '@hugeicons/core-free-icons';
import { can, type Capability, type Role } from '@dayari/contracts';

import type { HugeiconsIcon } from '@hugeicons/react';
type IconSpec = Parameters<typeof HugeiconsIcon>[0]['icon'];

/**
 * One name per screen. `label` is used by the sidebar, the breadcrumb, the
 * browser tab and the page heading; `tab` is the shorter name used inside a
 * section's tab bar when it differs. Every destination has its own icon.
 */
export const destinations = {
  dashboard: { label: 'Overview', icon: DashboardSquare01Icon as IconSpec },
  inventory: { label: 'Stock', tab: 'All stock', icon: BoxesIcon as IconSpec },
  availability: { label: 'Usable stock', icon: PackageSearchIcon as IconSpec },
  counts: { label: 'Stock counts', icon: CheckListIcon as IconSpec },
  requests: { label: 'Correction requests', icon: ArrowTurnBackwardIcon as IconSpec },
  damage: { label: 'Damaged items', icon: Alert02Icon as IconSpec },
  closing: { label: 'End of day', icon: CalendarLock01Icon as IconSpec },
  receipts: { label: 'Deliveries', icon: TruckDeliveryIcon as IconSpec },
  receiving: { label: 'Deliveries', icon: TruckDeliveryIcon as IconSpec },
  checkout: { label: 'Checkout', tab: 'Product checkout', icon: Factory01Icon as IconSpec },
  completion: { label: 'Finished items', icon: TaskDone01Icon as IconSpec },
  orders: { label: 'Orders', icon: Invoice01Icon as IconSpec },
  checkoutHistory: { label: 'Checkout history', tab: 'History', icon: WorkHistoryIcon as IconSpec },
  reconciliation: { label: 'Missing reasons', icon: NoteEditIcon as IconSpec },
  qr: { label: 'Scan & find', icon: QrCodeIcon as IconSpec },
  labels: { label: 'Print labels', icon: PrinterIcon as IconSpec },
  catalogue: { label: 'Products', icon: Book02Icon as IconSpec },
  suppliers: { label: 'Suppliers', icon: Building03Icon as IconSpec },
  reports: { label: 'Reports', icon: Analytics01Icon as IconSpec },
  settings: { label: 'Settings', tab: 'My account', icon: Settings02Icon as IconSpec },
  users: { label: 'Staff', icon: UserGroupIcon as IconSpec },
  help: { label: 'Help', icon: HelpCircleIcon as IconSpec },
} as const satisfies Record<string, { label: string; tab?: string; icon: IconSpec }>;

export type Workspace = keyof typeof destinations;

export const accountIcon = UserCircleIcon as IconSpec;

/** The name a destination carries inside its section's tab bar. */
export function tabLabel(key: Workspace): string {
  const item = destinations[key] as { label: string; tab?: string };
  return item.tab ?? item.label;
}

/** What a workspace requires. The sidebar and the router both read this. */
const workspaceCapabilities: Record<Workspace, Capability> = {
  dashboard: 'OPERATIONAL_STOCK',
  closing: 'OPERATIONAL_STOCK',
  counts: 'OPERATIONAL_STOCK',
  completion: 'OPERATIONAL_STOCK',
  requests: 'OPERATIONAL_STOCK',
  damage: 'REPORT_BAD',
  reconciliation: 'RECONCILIATION_READ',
  orders: 'CHECKOUT',
  checkoutHistory: 'CHECKOUT',
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

/** Sidebar grouping. Order here is the order staff read it in. Help lives in
 * the sidebar footer beside the account, not in a group. */
export const navGroups: { name: string; keys: Workspace[] }[] = [
  { name: 'Daily work', keys: ['dashboard', 'inventory', 'receipts', 'checkout', 'qr', 'labels'] },
  { name: 'Manage', keys: ['catalogue', 'reports', 'settings'] },
];

/** Section tab bars: the first entry is the section's own landing view. */
export const sectionTabs: Partial<Record<Workspace, Workspace[]>> = {
  inventory: ['inventory', 'counts', 'requests', 'damage', 'closing'],
  checkout: ['checkout', 'completion', 'orders', 'checkoutHistory', 'reconciliation'],
  settings: ['settings', 'users'],
};

/** Phone bottom bar: the four most frequent destinations; "Menu" opens the rest. */
export const bottomNavKeys: Workspace[] = ['dashboard', 'inventory', 'qr', 'checkout'];

export function mainDestination(key: Workspace): Workspace {
  if (['availability', 'counts', 'requests', 'damage', 'closing'].includes(key)) return 'inventory';
  if (['completion', 'reconciliation', 'orders', 'checkoutHistory'].includes(key)) return 'checkout';
  if (key === 'receiving') return 'receipts';
  if (key === 'suppliers') return 'catalogue';
  if (key === 'users') return 'settings';
  return key;
}

export const workspaceOrder = Object.keys(destinations) as Workspace[];
