'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Layers3, LogOut, Menu, QrCode, Printer, Truck, X, LayoutDashboard, Boxes, Building2, ReceiptText, Settings } from 'lucide-react';
import type { Role } from '@dayari/contracts';

export const destinations = {
  dashboard: { label: 'Overview', icon: LayoutDashboard },
  catalogue: { label: 'Catalogue', icon: BookOpen },
  suppliers: { label: 'Suppliers & sources', icon: Building2 },
  inventory: { label: 'Inventory', icon: Boxes },
  receiving: { label: 'Receiving', icon: Truck },
  receipts: { label: 'Receipts & activity', icon: ReceiptText },
  qr: { label: 'QR lookup', icon: QrCode },
  labels: { label: 'Labels & printing', icon: Printer },
  settings: { label: 'Account & shop', icon: Settings },
};
export type Workspace = keyof typeof destinations;
export function AppShell({ workspace, available, onNavigate, user, onLogout, busy, children }: {
  workspace: Workspace; available: Workspace[]; onNavigate: (workspace: Workspace) => void;
  user: { name: string; role: Role }; onLogout: () => void; busy: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [workspace]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); menu.current?.focus(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return <div className="app-shell">
    <a href="#workspace-content" className="skip-link">Skip to content</a>
    <aside className="app-sidebar">
      <div className="brand"><Layers3 size={27} aria-hidden="true" /><span>dayari<span className="brand-dot">.</span></span><span className="brand-caption">INVENTORY</span></div>
      <button ref={menu} className="mobile-menu icon-button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      <div id="workspace-navigation" className={`sidebar-content ${open ? 'is-open' : ''}`}>
        <div className="shop-context"><span className="status-dot" />Local shop workspace<p>Connected through your shop service</p></div>
        <nav aria-label="Workspace" className="workspace-nav">{available.filter(key => user.role !== 'PRODUCTION' || key === 'qr' || key === 'settings').map(key => {
          const item = destinations[key]; const Icon = item.icon;
          return <button key={key} aria-current={workspace === key ? 'page' : undefined} onClick={() => { setOpen(false); onNavigate(key); }}><Icon size={18} aria-hidden="true" /><span>{item.label}</span></button>;
        })}</nav>
        <div className="sidebar-footer"><p className="text-xs leading-5 text-stone-500">Stock changes only through accepted shop transactions.</p><div className="account-summary"><span className="avatar">{user.name.slice(0, 1)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.name}</p><p className="text-xs text-stone-500">{user.role === 'ADMIN' ? 'Administrator' : user.role === 'MANAGER' ? 'Inventory Manager' : 'Production Staff'}</p></div><button className="icon-button" aria-label="Sign out" onClick={onLogout} disabled={busy}><LogOut size={18} /></button></div></div>
      </div>
    </aside>
    <main id="workspace-content" tabIndex={-1} className="workspace-content"><header className="workspace-bar"><p><span className="hidden sm:inline text-stone-400">Shop workspace <span className="mx-2">/</span></span>{destinations[workspace].label}</p><span className="connection-badge"><span className="status-dot" />Local authority<span className="hidden md:inline"> · Cloud sync not configured</span></span></header>{children}</main>
  </div>;
}
