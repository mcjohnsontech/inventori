/**
 * Catalogue product search.
 *
 * Owners find a product either by its Product Code or by its name, so the
 * ranking leads with an exact code match and never relies on catalogue order.
 * Stored codes are never rewritten; only the typed query is normalised.
 */
export type SearchableProduct = {
  name: string;
  productCode?: string | null;
  description: string;
  variants: { name: string }[];
};

/** Trim, uppercase and drop the separators people type between code segments. */
export function normaliseProductCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '');
}

function haystack(product: SearchableProduct): string {
  return `${product.name} ${product.productCode ?? ''} ${product.description} ${product.variants
    .map((variant) => variant.name)
    .join(' ')}`.toLowerCase();
}

function score(product: SearchableProduct, text: string, code: string): number {
  const productCode = normaliseProductCode(product.productCode ?? '');
  if (code && productCode === code) return 0;
  if (code && productCode.startsWith(code)) return 1;
  if (product.name.toLowerCase().startsWith(text)) return 2;
  if (productCode && productCode.includes(code)) return 3;
  if (haystack(product).includes(text)) return 4;
  return 5;
}

/**
 * Filter and rank products for a search box.
 * Exact Product Code, then code prefix, then name prefix, then any-field match.
 * Stable by name so equal matches keep a predictable order.
 */
export function matchProducts<T extends SearchableProduct>(
  products: readonly T[],
  rawQuery: string,
): T[] {
  const text = rawQuery.trim().toLowerCase();
  if (!text) return [...products];
  const code = normaliseProductCode(rawQuery);
  return products
    .map((product) => ({ product, rank: score(product, text, code) }))
    .filter((entry) => entry.rank < 5)
    .sort(
      (left, right) =>
        left.rank - right.rank || left.product.name.localeCompare(right.product.name),
    )
    .map((entry) => entry.product);
}
