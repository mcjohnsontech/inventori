import { z } from 'zod';
import { chunkRange, type LabelJob, type LabelLine, type LabelProfile } from './labels.js';
export const sheetStartSchema = z
  .object({
    startSlot: z.number().int().min(0).max(1000).default(0),
    damagedStartSlot: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
export type SheetStart = z.infer<typeof sheetStartSchema>;
export const defaultSheetStart: SheetStart = { startSlot: 0, damagedStartSlot: 0 };
export type PlacedLabel = {
  line: LabelLine;
  sheet: number;
  slot: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
export function labelCell(p: LabelProfile, slot: number) {
  return {
    x: p.marginXmm + (slot % p.columns) * (p.labelWidthMm + (p.gapXmm ?? 0)),
    y: p.marginYmm + Math.floor(slot / p.columns) * (p.labelHeightMm + (p.gapYmm ?? 0)),
    width: p.labelWidthMm,
    height: p.labelHeightMm,
  };
}
export function profileProblems(p: LabelProfile) {
  const issues: string[] = [];
  const values = [
    p.pageWidthMm,
    p.pageHeightMm,
    p.labelWidthMm,
    p.labelHeightMm,
    p.marginXmm,
    p.marginYmm,
    p.gapXmm ?? 0,
    p.gapYmm ?? 0,
    ...Object.values(p.printableInsetsMm ?? {}),
  ];
  if (
    values.some((v) => !Number.isFinite(v) || v < 0) ||
    ![p.columns, p.rows].every((v) => Number.isInteger(v) && v > 0) ||
    p.columns * p.rows > 1000 ||
    [p.pageWidthMm, p.pageHeightMm, p.labelWidthMm, p.labelHeightMm].some((v) => v <= 0)
  )
    return ['Invalid label profile dimensions'];
  const i = p.printableInsetsMm ?? { top: 0, right: 0, bottom: 0, left: 0 };
  for (let slot = 0; slot < p.columns * p.rows; slot++) {
    const c = labelCell(p, slot);
    if (
      c.x < i.left - 0.001 ||
      c.y < i.top - 0.001 ||
      c.x + c.width > p.pageWidthMm - i.right + 0.001 ||
      c.y + c.height > p.pageHeightMm - i.bottom + 0.001
    )
      issues.push(`Label ${slot + 1} is outside the configured printable area`);
  }
  return issues;
}
export function copiesInPart(job: Pick<LabelJob, 'totalCopies' | 'lines'>, chunk: string) {
  const r = chunkRange(job.totalCopies, chunk);
  let skip = BigInt(r.offset),
    remaining = r.copies;
  const labels: LabelLine[] = [];
  for (const line of job.lines) {
    const count = BigInt(line.copies);
    if (skip >= count) {
      skip -= count;
      continue;
    }
    const take = Number(count - skip > BigInt(remaining) ? BigInt(remaining) : count - skip);
    for (let i = 0; i < take; i++) labels.push(line);
    remaining -= take;
    skip = 0n;
    if (!remaining) break;
  }
  if (remaining) throw new Error('Manifest count mismatch');
  return labels;
}
export function planLabelSheets(
  job: Pick<LabelJob, 'profile' | 'lines' | 'totalCopies'>,
  chunk: string,
  start: SheetStart = defaultSheetStart,
) {
  const p = job.profile,
    capacity = p.columns * p.rows,
    issues = profileProblems(p);
  if (issues.length) throw new Error(issues.join('. '));
  const labels = copiesInPart(job, chunk),
    placed: PlacedLabel[] = [];
  if (p.layoutVersion !== 2) {
    if (start.startSlot || start.damagedStartSlot)
      throw new Error('Historical layout has a fixed start position');
    labels.forEach((line, n) =>
      placed.push({
        line,
        sheet: Math.floor(n / capacity),
        slot: n % capacity,
        ...labelCell(p, n % capacity),
      }),
    );
  } else {
    if (
      ![start.startSlot, start.damagedStartSlot].every(
        (v) => Number.isInteger(v) && v >= 0 && v < capacity,
      )
    )
      throw new Error('Choose a start position inside this sheet');
    let sheet = 0;
    for (const purpose of ['USABLE', 'DAMAGED_INTAKE'] as const) {
      const group = labels.filter((l) => l.purpose === purpose);
      if (!group.length) continue;
      const offset = purpose === 'USABLE' ? start.startSlot : start.damagedStartSlot;
      for (const [n, line] of group.entries()) {
        const slot = (n + offset) % capacity;
        placed.push({
          line,
          sheet: sheet + Math.floor((n + offset) / capacity),
          slot,
          ...labelCell(p, slot),
        });
      }
      sheet += Math.ceil((group.length + offset) / capacity);
    }
  }
  return {
    labels: placed,
    pages: placed.length ? Math.max(...placed.map((l) => l.sheet)) + 1 : 0,
    edgeLabels: placed.filter(
      (c) =>
        c.x < 1 ||
        c.y < 1 ||
        c.x + c.width > p.pageWidthMm - 1 ||
        c.y + c.height > p.pageHeightMm - 1,
    ).length,
  };
}
/** Count all bounded parts without allocating a receipt-sized unit array. */
export function defaultSheetCount(lines: LabelLine[], p: LabelProfile) {
  const capacity = BigInt(p.columns * p.rows),
    ceil = (n: bigint) => (n + capacity - 1n) / capacity;
  if (p.layoutVersion !== 2) {
    const total = lines.reduce((n, l) => n + BigInt(l.copies), 0n);
    return (total / 500n) * ceil(500n) + ceil(total % 500n);
  }
  let global = 0n,
    sheets = 0n;
  for (const purpose of ['USABLE', 'DAMAGED_INTAKE']) {
    let n = lines
      .filter((l) => l.purpose === purpose)
      .reduce((sum, l) => sum + BigInt(l.copies), 0n);
    if (!n) continue;
    const first = n < 500n - (global % 500n) ? n : 500n - (global % 500n);
    sheets += ceil(first);
    global += n;
    n -= first;
    sheets += (n / 500n) * ceil(500n) + ceil(n % 500n);
  }
  return sheets;
}
export function savedSheetStart(note: string): SheetStart {
  const data: unknown = JSON.parse(note);
  if (!data || typeof data !== 'object' || !('layout' in data))
    throw new Error('Saved sheet layout is unavailable');
  return sheetStartSchema.parse(data.layout);
}
