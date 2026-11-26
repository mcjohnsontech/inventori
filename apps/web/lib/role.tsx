'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { Role } from '@dayari/contracts';

const RoleContext = createContext<Role | null>(null);

export function RoleProvider({ role, children }: { role: Role; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/**
 * Owner decision, 24 Nov 2026: Production Staff see only the item code plus the
 * product name and options. Supplier, batch, lot and product codes are for
 * Managers and Admins. Presentation only; the API still scopes what each role
 * may read.
 */
export function useShowCodes(): boolean {
  return useContext(RoleContext) !== 'PRODUCTION';
}

/** Renders its children only for roles that see supplier, batch and lot codes. */
export function CodesOnly({ children }: { children: ReactNode }) {
  return useShowCodes() ? <>{children}</> : null;
}

/**
 * Owner decision, 26 Nov 2026: money is Admin-only. Managers maintain inventory
 * and see no costs, selling prices, stock values or financial reports. The API
 * enforces the same rule with FINANCIAL_READ; this only hides the screens.
 */
export function useCanSeeMoney(): boolean {
  return useContext(RoleContext) === 'ADMIN';
}

/** Renders its children only for roles that see money. */
export function MoneyOnly({ children }: { children: ReactNode }) {
  return useCanSeeMoney() ? <>{children}</> : null;
}
