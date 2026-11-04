'use client';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { TooltipProvider } from '../ui/tooltip';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { useSidebarCollapsed } from './use-sidebar';
import type { Workspace } from './destinations';

export function AppShell({
  workspace,
  available,
  account,
  busy,
  onNavigate,
  onLogout,
  children,
}: {
  workspace: Workspace;
  available: Workspace[];
  account: { name: string; role: string };
  busy: boolean;
  onNavigate: (workspace: Workspace) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <TooltipProvider>
      <a
        href="#workspace-content"
        onClick={(event) => {
          // This app routes on URL fragments. A native anchor jump would turn
          // the skip target into an unknown workspace route.
          event.preventDefault();
          const content = document.getElementById('workspace-content');
          content?.focus({ preventScroll: true });
          content?.scrollIntoView({ block: 'start' });
        }}
        className="fixed top-2 left-4 z-[100] -translate-y-24 rounded-lg border border-brand bg-white px-4 py-3 font-sans text-sm font-semibold text-brand transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>

      <div className="min-h-dvh">
        <Sidebar
          available={available}
          current={workspace}
          account={account}
          collapsed={collapsed}
          busy={busy}
          onNavigate={onNavigate}
          onLogout={onLogout}
          onToggle={toggle}
        />
        <div
          // No margin transition: it would animate on viewport changes too, and
          // a half-applied margin briefly overflows the page at narrow widths.
          className={cn('min-w-0', collapsed ? 'lg:ml-[84px]' : 'lg:ml-[264px]')}
        >
          <TopBar workspace={workspace} account={account} />
          <main id="workspace-content" tabIndex={-1} className="scroll-mt-[124px] outline-none lg:scroll-mt-16">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
