import { describe, expect, it } from 'vitest';
import { combinationKey, nextSupplierCode, productSchema, skuSchema, supplierCodeSeed, supplierSchema, variantSchema } from '@dayari/contracts';
const red = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const size = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
describe('catalogue identity and input boundaries', () => {
  it('abbreviates the first word, reserves unique collision codes and rejects names with no initial letters', () => {
    expect(supplierCodeSeed('  Chioma Ventures  ')).toBe('CHI');
    expect(supplierCodeSeed('Lagos Paper Supplies')).toBe('LAG');
    expect(supplierCodeSeed('Al')).toBe('AL');
    expect(nextSupplierCode('Chioma Ventures', ['CHI', 'CHI-02', 'CHI-04'])).toBe('CHI-03');
    expect(supplierSchema.safeParse({ name: '123 Supplies' }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: 'Chioma', code: 'MANUAL' }).success).toBe(false);
  });
  it('treats reordered attributes as the same stable combination and rejects duplicate values', () => {
    expect(combinationKey([red, size])).toBe(combinationKey([size, red]));
    expect(combinationKey([red.toUpperCase(), size])).toBe(combinationKey([red, size]));
    expect(() => combinationKey([red, red])).toThrow();
    expect(combinationKey([])).toBe('');
    expect(variantSchema.parse({ productId: red.toUpperCase(), name: 'Red', valueIds: [size.toUpperCase()] })).toMatchObject({ productId: red, valueIds: [size] });
  });
  it('requires actual values for new variants, reserving the empty combination for the default', () => {
    expect(variantSchema.safeParse({ productId: red, name: 'Red', valueIds: [] }).success).toBe(false);
  });
  it('accepts an opaque base without imposing guessed segment lengths and refuses unexpected fields', () => {
    expect(skuSchema.parse({ sourceId: red, variantId: size, baseCode: 'CHILG03849', suffix: 'RED' }).baseCode).toBe('CHILG03849');
    expect(skuSchema.parse({ sourceId: red, variantId: size, baseCode: 'existing-long-base', suffix: 'RED-A5' }).suffix).toBe('RED-A5');
    expect(productSchema.safeParse({ name: 'Notebook', usableStock: 99 }).success).toBe(false);
    expect(productSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});
