import { expect, it } from 'vitest';
import { allocateProductBase } from '../../apps/api/src/product-code.js';

it('pads random product numbers and skips an already occupied base even if repeated random draws collide', () => {
  expect(allocateProductBase('CHILG', [], () => 3849)).toBe('CHILG03849');
  expect(allocateProductBase('CHILG', ['CHILG03849'], () => 3849)).toBe('CHILG03850');
  expect(allocateProductBase('CHI-02LG', [], () => 7)).toBe('CHI-02LG00007');
});
it('reports namespace exhaustion without recycling an allocated base', () => {
  const full = Array.from({ length: 100000 }, (_, number) => `CHILG${String(number).padStart(5, '0')}`);
  expect(() => allocateProductBase('CHILG', full, () => 0)).toThrow('All five-digit');
});
