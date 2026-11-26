const LAGOS = 'Africa/Lagos';

export const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: LAGOS,
  });

/** One date style app-wide: "17 Nov 2026, 08:08". The shop runs on Lagos time. */
export const formatDateTime = (value: string) =>
  `${formatDate(value)}, ${formatTime(value)}`;

export const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: LAGOS,
  });

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

/** Adds ledger quantity strings without losing precision. */
export const sumQuantities = (values: string[]) =>
  values
    .reduce((total, value) => {
      try {
        return total + BigInt(value);
      } catch {
        return total;
      }
    }, 0n)
    .toString();

/** "1 variant", "3 variants". */
export const plural = (count: number, word: string, many = `${word}s`) =>
  `${count} ${count === 1 ? word : many}`;
