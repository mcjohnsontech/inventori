import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  planLabelSheets,
  type LabelJob,
  type LabelProfile,
  type SheetStart,
  defaultSheetStart,
} from '@dayari/contracts';
import {
  renderLabelPdf as legacyRender,
  rendererVersion as legacyVersion,
  mm,
  qrGeometry,
} from './label-pdf-v1.js';
export { mm, qrGeometry, copiesForChunk } from './label-pdf-v1.js';
const regular = fileURLToPath(new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url));
const bold = fileURLToPath(new URL('../assets/fonts/NotoSans-Bold.ttf', import.meta.url));
const fontHash = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
export function rendererVersion(profile?: LabelProfile) {
  return profile?.layoutVersion === 2
    ? `pdfkit-0.20.2-qrcode-1.5.4-v2-${fontHash(regular)}-${fontHash(bold)}`
    : legacyVersion();
}
function supported(doc: PDFKit.PDFDocument, text: string) {
  const font = (doc as unknown as { _font: { font: { hasGlyphForCodePoint(n: number): boolean } } })
    ._font.font;
  if (
    [...text].some(
      (c) => !['\r', '\n'].includes(c) && !font.hasGlyphForCodePoint(c.codePointAt(0)!),
    )
  )
    throw new Error('Embedded font does not cover this text; a reviewed font is required');
}
export async function renderLabelPdf(
  job: LabelJob,
  chunk: string,
  start: SheetStart = defaultSheetStart,
): Promise<Buffer> {
  if (job.profile.layoutVersion !== 2) return legacyRender(job, chunk);
  if (job.rendererVersion !== rendererVersion(job.profile))
    throw new Error('Historical renderer version is unavailable');
  const p = job.profile,
    layout = planLabelSheets(job, chunk, start);
  const doc = new PDFDocument({
    autoFirstPage: false,
    compress: true,
    info: {
      Title: `Dayari labels ${job.id} chunk ${chunk}`,
      Creator: job.rendererVersion,
      CreationDate: new Date(job.createdAt),
      ModDate: new Date(job.createdAt),
    },
  });
  doc.registerFont('Regular', regular);
  doc.registerFont('Bold', bold);
  const buffers: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (v) => buffers.push(Buffer.from(v)));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
  try {
    let page = -1;
    const symbols = new Map<string, ReturnType<typeof qrGeometry>>();
    for (const placed of layout.labels) {
      while (page < placed.sheet) {
        doc.addPage({ size: [mm(p.pageWidthMm), mm(p.pageHeightMm)], margin: 0 });
        page++;
      }
      const { line } = placed,
        x = mm(placed.x),
        y = mm(placed.y),
        damaged = line.purpose === 'DAMAGED_INTAKE';
      doc.fillColor('white').rect(x, y, mm(p.labelWidthMm), mm(p.labelHeightMm)).fill();
      if (damaged) {
        doc
          .save()
          .lineWidth(1.2)
          .strokeColor('black')
          .rect(x + mm(0.6), y + mm(0.6), mm(p.labelWidthMm - 1.2), mm(p.labelHeightMm - 1.2))
          .stroke()
          .restore();
      }
      const qr =
        symbols.get(line.payload) ?? qrGeometry(line.payload, p.qrDotsPerModule, p.designDpi);
      symbols.set(line.payload, qr);
      if (qr.moduleMm < 0.4 || qr.areaMm > p.labelHeightMm - 10)
        throw new Error('QR geometry does not fit; choose the larger profile');
      const qx = x + mm(4),
        qy = y + mm(2),
        unit = mm(qr.moduleMm);
      doc.fillColor('black');
      for (let row = 0; row < qr.modules; row++)
        for (let col = 0; col < qr.modules; col++)
          if (qr.symbol.modules.get(row, col))
            doc.rect(qx + (col + 4) * unit, qy + (row + 4) * unit, unit, unit).fill();
      const tx = qx + mm(qr.areaMm + 2),
        width = x + mm(p.labelWidthMm - 4) - tx;
      doc
        .font('Regular')
        .fontSize(5.5)
        .text('SKU', tx, y + mm(2), { width, lineBreak: false });
      doc.font('Bold').fontSize(p.fontSize);
      supported(doc, line.content.fullCode);
      const skuHeight = doc.heightOfString(line.content.fullCode, { width, lineGap: 0 });
      if (skuHeight > mm(p.labelHeightMm >= 45 ? 17 : 12))
        throw new Error(
          'Full SKU does not fit. Choose the larger profile; codes are never clipped.',
        );
      doc.text(line.content.fullCode, tx, y + mm(4.3), { width, lineGap: 0 });
      const batchY = Math.max(p.labelHeightMm >= 45 ? 22 : 17, 4.3 + (skuHeight * 25.4) / 72 + 1);
      doc
        .font('Regular')
        .fontSize(5.5)
        .text('BATCH', tx, y + mm(batchY), { width, lineBreak: false });
      doc.font('Bold').fontSize(7.5);
      supported(doc, line.content.publicCode);
      if (
        doc.heightOfString(line.content.publicCode, { width }) > mm(6) ||
        batchY + 8 > p.labelHeightMm - 7
      )
        throw new Error('Full batch code does not fit this profile');
      doc.text(line.content.publicCode, tx, y + mm(batchY + 2.2), { width });
      const descriptor = `${line.content.productName} • ${line.content.variantName} • ${line.content.supplierName} / ${line.content.sourceName}`;
      doc.font('Regular').fontSize(6.3);
      supported(doc, descriptor);
      const descY = Math.max(p.labelHeightMm >= 45 ? 33 : 25, qr.areaMm + 4),
        descWidth = mm(p.labelWidthMm - 8),
        descHeight = mm(damaged ? 4 : 6);
      if (descY + (damaged ? 4 : 6) > p.labelHeightMm - (damaged ? 5 : 2))
        throw new Error('Description does not fit the label bounds');
      const chars = [...descriptor];
      let description = descriptor;
      while (chars.length && doc.heightOfString(description, { width: descWidth }) > descHeight) {
        chars.pop();
        description = chars.join('') + '…';
      }
      doc.text(description, x + mm(4), y + mm(descY), { width: descWidth, height: descHeight });
      if (damaged) {
        doc
          .fillColor('black')
          .rect(x + mm(0.6), y + mm(p.labelHeightMm - 5), mm(p.labelWidthMm - 1.2), mm(4.4))
          .fill();
        doc
          .font('Bold')
          .fontSize(6.1)
          .fillColor('white')
          .text('DAMAGED INTAKE — NOT FOR PRODUCTION', x + mm(2), y + mm(p.labelHeightMm - 4.3), {
            width: mm(p.labelWidthMm - 4),
            align: 'center',
            lineBreak: false,
          });
      }
    }
    doc.end();
    return await done;
  } catch (error) {
    doc.on('error', () => {});
    doc.destroy();
    throw error;
  }
}
