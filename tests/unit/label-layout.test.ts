import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import jsQrModule from 'jsqr';
import {
  labelProfiles,
  encodeQr,
  planLabelSheets,
  profileProblems,
  defaultSheetCount,
  type LabelJob,
  type LabelLine,
} from '@dayari/contracts';
import { renderLabelPdf, rendererVersion } from '../../apps/api/src/label-pdf.js';
import { renderLabelPdf as legacyRender } from '../../apps/api/src/label-pdf-v1.js';
const jsQR = jsQrModule as unknown as (
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
) => { data: string } | null;
const origin = randomUUID(),
  lot = randomUUID();
function line(copies: string, purpose: LabelLine['purpose'] = 'USABLE'): LabelLine {
  return {
    id: randomUUID(),
    receiptLineId: randomUUID(),
    lotId: lot,
    purpose,
    copies,
    payload: encodeQr(origin, lot),
    content: {
      fullCode: 'CHILG89610-STD',
      publicCode: 'B-20261104-0001',
      productName: 'Notebook',
      variantName: 'Default',
      supplierName: 'Chioma',
      sourceName: 'Lagos',
    },
  };
}
function job(lines: LabelLine[], legacy = false): LabelJob {
  const profile = labelProfiles.find((p) => p.id === `a4-70x35-v${legacy ? 1 : 2}`)!;
  return {
    id: randomUUID(),
    receiptId: randomUUID(),
    originId: origin,
    kind: 'INITIAL',
    originalJobId: null,
    reason: '',
    profile,
    rendererVersion: rendererVersion(profile),
    createdAt: '2026-11-04T10:00:00.000Z',
    manifestHash: 'fixture',
    totalCopies: lines.reduce((n, l) => n + BigInt(l.copies), 0n).toString(),
    chunks: '1',
    labelsPerSheet: 21,
    totalSheets: '1',
    lines,
    events: [],
  };
}
describe('versioned sheet geometry and exact generated PDF', () => {
  it('keeps purpose groups on separate sheets and starts each group independently', () => {
    const j = job([line('21'), line('2', 'DAMAGED_INTAKE')]);
    const p = planLabelSheets(j, '0', { startSlot: 5, damagedStartSlot: 3 });
    expect(p.pages).toBe(3);
    expect(p.labels[0]).toMatchObject({ sheet: 0, slot: 5, x: 140, y: 61 });
    expect(p.labels.find((l) => l.line.purpose === 'DAMAGED_INTAKE')).toMatchObject({
      sheet: 2,
      slot: 3,
    });
    for (let page = 0; page < p.pages; page++)
      expect(
        new Set(p.labels.filter((l) => l.sheet === page).map((l) => l.line.purpose)).size,
      ).toBe(1);
  });
  it('retains legacy mixed-sheet ordering and exact renderer bytes', async () => {
    const j = job([line('1'), line('1', 'DAMAGED_INTAKE')], true);
    expect(planLabelSheets(j, '0').pages).toBe(1);
    expect(await renderLabelPdf(j, '0')).toEqual(await legacyRender(j, '0'));
  }, 30000);
  it('rejects negative/noninteger starts and positions outside the sheet', () => {
    const j = job([line('2')]);
    for (const n of [-1, 1.5, 21, 999])
      expect(() => planLabelSheets(j, '0', { startSlot: n, damagedStartSlot: 0 })).toThrow();
  });
  it('validates data-driven gaps and all printable bounds without clipping', async () => {
    const j = job([line('1')]);
    const g = { ...j.profile, labelWidthMm: 60, marginXmm: 10, gapXmm: 3 };
    expect(profileProblems(g)).toEqual([]);
    expect(
      planLabelSheets({ ...j, profile: g }, '0', { startSlot: 2, damagedStartSlot: 0 }).labels[0]
        ?.x,
    ).toBe(136);
    expect(profileProblems({ ...j.profile, gapXmm: 2 })).toContain(
      'Label 3 is outside the configured printable area',
    );
    const invalid = {
      ...j,
      profile: { ...j.profile, printableInsetsMm: { top: 0, left: 3, right: 3, bottom: 0 } },
    };
    expect(profileProblems(invalid.profile).length).toBeGreaterThan(0);
    await expect(renderLabelPdf(invalid, '0')).rejects.toThrow('printable area');
  });
  it('counts large manifests without unsafe numbers and respects 500-copy part boundaries', () => {
    const j = job([line('501'), line('2', 'DAMAGED_INTAKE')]);
    expect(defaultSheetCount(j.lines, j.profile)).toBe(26n);
    expect(planLabelSheets(j, '1').pages).toBe(2);
    const huge = job([line('9007199254740993')]);
    expect(defaultSheetCount(huge.lines, huge.profile)).toBeGreaterThan(0n);
  });
  it('renders blank start positions, bold damaged warnings and largest SKU text in the final PDF', async () => {
    const j = job([line('2'), line('1', 'DAMAGED_INTAKE')]),
      start = { startSlot: 5, damagedStartSlot: 1 };
    const bytes = await renderLabelPdf(j, '0', start);
    expect(await renderLabelPdf(j, '0', start)).toEqual(bytes);
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
    try {
      const pdf = await loading.promise;
      expect(pdf.numPages).toBe(2);
      for (let n = 1; n <= 2; n++) {
        const page = await pdf.getPage(n);
        const items = (await page.getTextContent()).items.filter(
          (x): x is import('pdfjs-dist/types/src/display/api.js').TextItem => 'str' in x,
        );
        const sku = items.find((x) => x.str === 'CHILG89610-STD');
        expect(sku).toBeDefined();
        expect(Math.abs(sku!.transform[0])).toBe(
          Math.max(...items.map((x) => Math.abs(x.transform[0]))),
        );
        expect(items.some((x) => x.str.includes('DAMAGED INTAKE'))).toBe(n === 2);
        const view = page.getViewport({ scale: 200 / 72 }),
          canvas = createCanvas(Math.ceil(view.width), Math.ceil(view.height)),
          ctx = canvas.getContext('2d');
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport: view,
        }).promise;
        const chosen = planLabelSheets(j, '0', start).labels.find((l) => l.sheet === n - 1)!;
        const size = Math.round((23 * 200) / 25.4),
          x = Math.round(((chosen.x + 3) * 200) / 25.4),
          y = Math.round(((chosen.y + 1) * 200) / 25.4),
          pixels = ctx.getImageData(x, y, size, size);
        expect(jsQR(pixels.data, size, size)?.data).toBe(chosen.line.payload);
      }
    } finally {
      await loading.destroy();
    }
  }, 30000);
});
