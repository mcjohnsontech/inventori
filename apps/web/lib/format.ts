const LAGOS = 'Africa/Lagos';

export const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: LAGOS,
  });

export const formatDateTime = (value: string) =>
  `${new Date(value).toLocaleString('en-GB', { timeZone: LAGOS })} Lagos`;

export const formatTime = (value: string) =>
  `${new Date(value).toLocaleTimeString('en-GB', { timeZone: LAGOS })} Lagos`;

export const roleLabel = (role: string) =>
  role === 'ADMIN' ? 'Administrator' : role === 'MANAGER' ? 'Inventory Manager' : 'Production Staff';

/** Quantities arrive as strings from the ledger; they can exceed Number.MAX_SAFE_INTEGER. */
export const isPositive = (quantity: string) => {
  try {
    return BigInt(quantity) > 0n;
  } catch {
    return false;
  }
};
