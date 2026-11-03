import { z } from 'zod';
export const publicCodeAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const identityQuerySchema = z.object({ originId: z.uuid().transform(v => v.toLowerCase()).optional() }).strict();
export function publicCodeSchema(kind: 'PRODUCT' | 'LOT') {
  return z.string().trim().transform(v => v.toUpperCase()).pipe(z.string().regex(new RegExp(`^${kind === 'PRODUCT' ? 'P' : 'L'}[${publicCodeAlphabet}]{5}$`)));
}
export type PublicIdentityLookup = {
  kind: 'PRODUCT' | 'LOT'; originId: string; productId: string; productCode: string | null; productName: string;
  dataAsOf: string; originSequence: string;
  lotId?: string; lotCode?: string; skuId?: string; fullSku?: string; variantId?: string; variantName?: string;
  batchId?: string; publicBatchCode?: string; usable?: string; damaged?: string;
};
