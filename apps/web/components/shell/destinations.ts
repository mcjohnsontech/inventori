import {
  Book02Icon,
  BoxesIcon,
  Building03Icon,
  DashboardSquare01Icon,
  Invoice01Icon,
  PrinterIcon,
  QrCodeIcon,
  Settings02Icon,
  TruckDeliveryIcon,
} from '@hugeicons/core-free-icons';

import type { IconSpec } from '../ui/icon';

export const destinations = {
  dashboard: { label: 'Overview', icon: DashboardSquare01Icon as IconSpec },
  catalogue: { label: 'Catalogue', icon: Book02Icon as IconSpec },
  suppliers: { label: 'Suppliers & sources', icon: Building03Icon as IconSpec },
  inventory: { label: 'Inventory', icon: BoxesIcon as IconSpec },
  receiving: { label: 'Receiving', icon: TruckDeliveryIcon as IconSpec },
  receipts: { label: 'Receipts & activity', icon: Invoice01Icon as IconSpec },
  qr: { label: 'QR lookup', icon: QrCodeIcon as IconSpec },
  labels: { label: 'Labels & printing', icon: PrinterIcon as IconSpec },
  settings: { label: 'Account & shop', icon: Settings02Icon as IconSpec },
} as const;

export type Workspace = keyof typeof destinations;

export const workspaceOrder = Object.keys(destinations) as Workspace[];
