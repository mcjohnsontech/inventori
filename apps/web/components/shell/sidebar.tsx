'use client';
import {
  Cancel01Icon,
  Logout03Icon,
  Menu01Icon,
  SidebarLeft01Icon,
  SidebarRight01Icon,
} from '@hugeicons/core-free-icons';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/cn';
import { roleLabel } from '../../lib/format';
import { Icon } from '../ui/icon';
import { Tooltip } from '../ui/tooltip';
import { BrandLockup } from './brand-lockup';
import { destinations, type Workspace } from './destinations';

type Account = { name: string; role: string };

function Items({
  available,
  current,
  collapsed,
  onNavigate,
}: {
  available: Workspace[];
  current: Workspace;
  collapsed: boolean;
  onNavigate: (workspace: Workspace) => void;
}) {
  return (
    <ul className="space-y-1">
      {available.map((key) => {
        const item = destinations[key];
        const active = current === key;

        const button = (
          <button
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onNavigate(key)}
            className={cn(
              'flex w-full items-center rounded-xl font-sans text-sm font-medium tracking-[-0.02em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              collapsed ? 'h-11 w-11 justify-center' : 'h-11 gap-3 px-3.5',
              active
                ? 'bg-brand-tint font-semibold text-brand'
                : 'text-grey-2 hover:bg-surface-muted hover:text-ink',
            )}
          >
            <Icon icon={item.icon} size={20} />
            {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
          </button>
        );

        return (
          <li key={key} className={collapsed ? 'flex justify-center' : undefined}>
            {collapsed ? <Tooltip label={item.label}>{button}</Tooltip> : button}
          </li>
        );
      })}
    </ul>
  );
}

function Footer({
  account,
  collapsed,
  busy,
  onLogout,
  onToggle,
}: {
  account: Account;
  collapsed: boolean;
  busy: boolean;
  onLogout: () => void;
  onToggle?: () => void;
}) {
  const signOut = (
    <button
      type="button"
      disabled={busy}
      onClick={onLogout}
      className={cn(
        'flex items-center rounded-xl font-sans text-sm font-semibold tracking-[-0.02em] text-grey-2 transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60',
        collapsed ? 'h-11 w-11 justify-center' : 'h-11 w-full gap-3 px-3.5',
      )}
    >
      <Icon icon={Logout03Icon} size={20} />
      {collapsed ? <span className="sr-only">Sign out</span> : 'Sign out'}
    </button>
  );

  const initial = account.name.slice(0, 1).toUpperCase();

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5 border-t border-black/[0.06] py-4">
        <Tooltip label={`${account.name} · ${roleLabel(account.role)}`}>
          <span className="grid size-10 cursor-default place-items-center rounded-full bg-brand-tint font-sans text-sm font-bold text-brand">
            {initial}
          </span>
        </Tooltip>
        {onToggle ? (
          <Tooltip label="Expand sidebar">
            <button
              type="button"
              onClick={onToggle}
              aria-label="Expand sidebar"
              className="grid h-11 w-11 place-items-center rounded-xl text-grey-3 transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Icon icon={SidebarRight01Icon} size={20} />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip label="Sign out">{signOut}</Tooltip>
      </div>
    );
  }

  return (
    <div className="border-t border-black/[0.06] px-3 py-4">
      <div className="flex items-center gap-2.5 px-1">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-tint font-sans text-sm font-bold text-brand">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
            {account.name}
          </p>
          <p className="truncate font-sans text-xs tracking-[-0.02em] text-grey-3">
            {roleLabel(account.role)}
          </p>
        </div>
      </div>
      <div className="mt-2">{signOut}</div>
    </div>
  );
}

export function Sidebar({
  available,
  current,
  account,
  collapsed,
  busy,
  onNavigate,
  onLogout,
  onToggle,
}: {
  available: Workspace[];
  current: Workspace;
  account: Account;
  collapsed: boolean;
  busy: boolean;
  onNavigate: (workspace: Workspace) => void;
  onLogout: () => void;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const navigate = (workspace: Workspace) => {
    setOpen(false);
    onNavigate(workspace);
  };

  return (
    <>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-black/[0.06] bg-white transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[84px]' : 'w-[264px]',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center border-b border-black/[0.06]',
            collapsed ? 'justify-center px-2' : 'justify-between px-5',
          )}
        >
          <BrandLockup compact={collapsed} />
          {collapsed ? null : (
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-grey-3 transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Icon icon={SidebarLeft01Icon} size={20} />
            </button>
          )}
        </div>

        <nav
          aria-label="Workspace"
          className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'px-3' : 'px-3')}
        >
          {collapsed ? null : (
            <p className="px-3.5 pb-1.5 font-sans text-xs font-semibold tracking-[0.08em] text-grey-3 uppercase">
              Menu
            </p>
          )}
          <Items
            available={available}
            current={current}
            collapsed={collapsed}
            onNavigate={navigate}
          />
        </nav>

        <Footer
          account={account}
          collapsed={collapsed}
          busy={busy}
          onLogout={onLogout}
          onToggle={onToggle}
        />
      </aside>

      <header className="sticky top-0 z-40 flex h-[68px] items-center justify-between bg-white px-4 shadow-header sm:px-6 lg:hidden">
        <BrandLockup />
        <button
          ref={trigger}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="workspace-menu"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          className="grid size-10 place-items-center rounded-lg text-grey-2 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Icon icon={open ? Cancel01Icon : Menu01Icon} size={22} />
        </button>
      </header>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="backdrop"
              aria-hidden
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 top-[68px] z-40 bg-black/40 lg:hidden"
            />
            <motion.aside
              id="workspace-menu"
              key="menu"
              initial={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-[68px] bottom-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col bg-white pt-5 shadow-header lg:hidden"
            >
              <nav aria-label="Workspace" className="flex-1 overflow-y-auto px-3">
                <p className="px-3.5 pb-1.5 font-sans text-xs font-semibold tracking-[0.08em] text-grey-3 uppercase">
                  Menu
                </p>
                <Items
                  available={available}
                  current={current}
                  collapsed={false}
                  onNavigate={navigate}
                />
              </nav>
              <Footer
                account={account}
                collapsed={false}
                busy={busy}
                onLogout={onLogout}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
