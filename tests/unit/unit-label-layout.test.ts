import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { encodeUnitQr, unitLabelProfiles, type UnitLabelLine } from '@dayari/contracts';
import { preflightUnitLabels } from '../../apps/api/src/unit-label-render.js';

function line(purpose: UnitLabelLine['purpose'] = 'USABLE'): UnitLabelLine {
  const unitId = randomUUID();
  return {
    id: randomUUID(), unitId, lotId: randomUUID(), receiptLineId: randomUUID(),
    ordinal: 1, purpose, payload: encodeUnitQr(randomUUID(), unitId), originalLineId: null,
    content: { unitCode: 'A7K2M9', productCode: 'P7K2M9', lotCode: 'L8M4Q2',
      fullSku: 'CHILG03849-RED', publicBatchCode: 'B-20261107-0001',
      productName: 'Notebook', variantName: 'Red', supplierName: 'Chioma', sourceName: 'Lagos' },
  };
}

it('keeps usable and damaged unit labels on distinct sheets for both approved profiles', () => {
  for (const profile of unitLabelProfiles) {
    const plan = preflightUnitLabels({ profile, lines: [line(), line('DAMAGED_INTAKE')] });
    expect(plan.pages).toBe(2);
    expect(plan.labels.map(label => label.sheet)).toEqual([0, 1]);
  }
});

it('rejects unsafe page geometry, unrenderable glyphs and essential identities that cannot fit', () => {
  const profile = unitLabelProfiles[0]!;
  expect(() => preflightUnitLabels({ profile: { ...profile, marginXmm: 100 }, lines: [line()] })).toThrow();
  const tooLong = line(); tooLong.content.fullSku = 'A'.repeat(200);
  expect(() => preflightUnitLabels({ profile, lines: [tooLong] })).toThrow('complete SKU');
  const unsupported = line(); unsupported.content.variantName = '\u{1F600}';
  expect(() => preflightUnitLabels({ profile, lines: [unsupported] })).toThrow('font');
  const batch = line(); batch.content.publicBatchCode = 'B-' + '9'.repeat(100);
  expect(() => preflightUnitLabels({ profile, lines: [batch] })).toThrow('identity');
});
