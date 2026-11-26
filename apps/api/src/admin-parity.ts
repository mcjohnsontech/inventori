import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaClient, User } from '@prisma/client';

/**
 * Owner decision, 24 November 2026: Admin may do everything an Inventory
 * Manager may do (counts, closing, damage decisions, recovery/correction
 * requests). Migration 034 widens the matching database guards in one
 * transaction, so one constraint shows whether this shop has the upgrade.
 */
export function managerOrAdmin(role: User['role']): boolean {
  return role === 'MANAGER' || role === 'ADMIN';
}

type Db = Pick<PrismaClient, '$queryRaw'>;

export async function adminParityReady(db: Db): Promise<boolean> {
  const [row] = await db.$queryRaw<{ ready: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"DamageReview"'::regclass AND conname='DamageReview_actorRole_check' AND pg_get_constraintdef(oid) LIKE '%ADMIN%') AS ready`;
  return Boolean(row?.ready);
}

/** Admins may act only once the shop database has migration 034. */
export async function requireAdminParity(db: Db, user: Pick<User, 'role'>): Promise<void> {
  if (user.role === 'ADMIN' && !await adminParityReady(db))
    throw new ServiceUnavailableException('This shop’s database needs an update before Admins can do this. Ask the person who runs the shop server.');
}

/** True when this user may perform Manager work now (role allowed and database ready). */
export async function canDoManagerWork(db: Db, user: Pick<User, 'role'>): Promise<boolean> {
  if (user.role === 'MANAGER') return true;
  return user.role === 'ADMIN' && await adminParityReady(db);
}
