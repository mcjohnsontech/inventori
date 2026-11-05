import { describe, expect, it } from 'vitest';

import { matchProducts, normaliseProductCode } from '../../apps/web/lib/catalogue-search.js';

const products = [
  {
    name: 'Hardcover notebook',
    productCode: 'PABC123',
    description: 'Sewn notebook',
    variants: [{ name: 'Red' }],
  },
  {
    name: 'Gift box',
    productCode: 'PABC124',
    description: 'Rigid box',
    variants: [{ name: 'Large' }],
  },
  {
    name: 'Ball pen',
    productCode: null,
    description: 'Blue ink',
    variants: [],
  },
];

describe('catalogue product search', () => {
  it('normalises typed codes without changing stored codes', () => {
    expect(normaliseProductCode('  pab-c 123 ')).toBe('PABC123');
    expect(normaliseProductCode('PABC123')).toBe('PABC123');
  });

  it('finds a product by its exact Product Code only', () => {
    expect(matchProducts(products, 'PABC124').map((item) => item.name)).toEqual(['Gift box']);
  });

  it('accepts a lower-case, spaced or hyphenated code', () => {
    expect(matchProducts(products, 'pab-c 124')[0]?.name).toBe('Gift box');
  });

  it('ranks a code prefix match and keeps name order within the tie', () => {
    expect(matchProducts(products, 'PABC12').map((item) => item.productCode)).toEqual([
      'PABC124',
      'PABC123',
    ]);
  });

  it('finds a product by name', () => {
    expect(matchProducts(products, 'ball').map((item) => item.name)).toEqual(['Ball pen']);
  });

  it('still matches description and variant text', () => {
    expect(matchProducts(products, 'sewn')[0]?.name).toBe('Hardcover notebook');
    expect(matchProducts(products, 'large')[0]?.name).toBe('Gift box');
  });

  it('returns no products for an unknown term', () => {
    expect(matchProducts(products, 'nothing-here')).toEqual([]);
  });

  it('keeps the catalogue order for an empty query', () => {
    expect(matchProducts(products, '   ').map((item) => item.name)).toEqual([
      'Hardcover notebook',
      'Gift box',
      'Ball pen',
    ]);
  });
});
