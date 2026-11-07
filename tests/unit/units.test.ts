import { expect, it } from 'vitest';
import { unitCodeSchema, unitAlphabet } from '@dayari/contracts';
import { drawUnitCode } from '../../apps/api/src/unit-receiving.js';

it('uses exactly six readable characters without a fixed type prefix and preserves typed ambiguity', () => {
  expect(unitAlphabet).toHaveLength(31);
  for (let i = 0; i < 200; i++) expect(drawUnitCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  expect(unitCodeSchema.parse(' p7k2m9 ')).toBe('P7K2M9');
  for (const value of ['U1234567','A7K2M','A7K2M99','A7 K2M9','A0K2M9','AOK2M9','A1K2M9','AIK2M9','ALK2M9']) expect(unitCodeSchema.safeParse(value).success).toBe(false);
});
