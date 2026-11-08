import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { encodeUnitQr, unitLabelProfiles, type UnitLabelJob } from '@dayari/contracts';
import { renderUnitLabels, unitRendererVersion } from '../apps/api/src/unit-label-render.js';

// Pure synthetic renderer rehearsal: no database connection or printer access.
const originId = randomUUID();
const lines: UnitLabelJob['lines'] = Array.from({ length: 500 }, (_, index) => {
  const unitId = randomUUID();
  return {
    id: randomUUID(), unitId, lotId: randomUUID(), receiptLineId: randomUUID(),
    ordinal: index + 1, purpose: index < 490 ? 'USABLE' : 'DAMAGED_INTAKE',
    payload: encodeUnitQr(originId, unitId), originalLineId: null,
    content: { unitCode: 'A' + Array.from({length:5},(_,position)=>'23456789ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(index/31**(4-position))%31]).join(''),
      productCode: 'P7K2M9', lotCode: 'L8M4Q2', fullSku: 'CHILG03849-RED',
      publicBatchCode: 'B-20261107-0001', productName: 'Synthetic Notebook',
      variantName: 'Red', supplierName: 'Synthetic supplier', sourceName: 'Lagos' },
  };
});
const samples = [];
for (const profile of unitLabelProfiles) {
  for (let trial = 0; trial < 4; trial++) {
    const start = performance.now(), before = process.memoryUsage().rss;
    const artifact = await renderUnitLabels({ id: randomUUID(), profile, lines,
      rendererVersion: unitRendererVersion, createdAt: new Date().toISOString(), manifestHash: 'synthetic' },
      randomUUID(), { startSlot: 5, damagedStartSlot: 2 });
    const sample = { profileId: profile.id, warmup: trial === 0, units: lines.length,
      elapsedMs: performance.now() - start, rssBefore: before, rssAfter: process.memoryUsage().rss,
      htmlBytes: Buffer.byteLength(artifact.html), pdfBytes: artifact.pdf.length, pages: artifact.pages };
    samples.push(sample);
    console.log(JSON.stringify(sample));
  }
}
await mkdir('artifacts/completion', { recursive: true });
await writeFile('artifacts/completion/unit-label-render-benchmark.json', JSON.stringify({
  syntheticOnly: true, recordedAt: new Date().toISOString(), node: process.version, samples,
  limitations: ['Renderer-only benchmark; does not include network/database/native print time',
    'One warmup and three measured samples per profile; no shop hardware certification'],
}, null, 2));
