'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { planLabelSheets, type LabelJob, type SheetStart } from '@dayari/contracts';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { notifyAuthFailure } from '../../lib/api';
import { Badge, Button, Code, ErrorNotice, Footnote } from '../ui';
type Artifact = { url: string; artifactHash: string };
export function PdfSheetPreview({
  job,
  chunk,
  layout,
  artifact,
  onReady,
}: {
  job: LabelJob;
  chunk: string;
  layout: SheetStart;
  artifact: Artifact | null;
  onReady: (hash: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    inspector = useRef<HTMLCanvasElement>(null);
  const [revision, setRevision] = useState(0);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(0),
    [slot, setSlot] = useState(0),
    [rendered, setRendered] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const loadedHash = useRef('');
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  const placement = useMemo(() => planLabelSheets(job, chunk, layout), [job, chunk, layout]);
  const pageLabels = placement.labels.filter((l) => l.sheet === page),
    selected = pageLabels.find((l) => l.slot === slot) ?? pageLabels[0];
  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    let task: ReturnType<typeof import('pdfjs-dist').getDocument> | undefined;
    setPdf(null);
    setPage(0);
    setRendered(0);
    setError('');
    setLoading(true);
    readyCallback.current('');
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(artifact?.url ?? `/api/label-print-jobs/${job.id}/preview`, {
            method: artifact ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...(artifact ? {} : { body: JSON.stringify({ chunk, layout }) }),
            signal: controller.signal,
          });
          notifyAuthFailure(response);
          if (!response.ok) {
            const body = await response.json();
            throw new Error(
              typeof body.message === 'string' ? body.message : 'PDF preview is unavailable',
            );
          }
          const bytes = await response.arrayBuffer(),
            hash = response.headers.get('x-artifact-sha256');
          if (!hash) throw new Error('PDF integrity header is unavailable');
          if (artifact && hash !== artifact.artifactHash)
            throw new Error('PDF hash does not match the saved artifact');
          if (stopped) return;
          const pdfjs = await import('pdfjs-dist');
          if (stopped) return;
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
          ).toString();
          const loadingTask = pdfjs.getDocument({
            data: new Uint8Array(bytes),
            useSystemFonts: false,
            disableAutoFetch: true,
            disableRange: true,
          });
          task = loadingTask;
          const document = await loadingTask.promise;
          if (stopped) {
            await loadingTask.destroy();
            return;
          }
          if (document.numPages !== placement.pages)
            throw new Error('PDF sheet count differs from the selected layout');
          loadedHash.current = hash;
          setPdf(document);
        } catch (failure) {
          if (!stopped) setError((failure as Error).message);
        } finally {
          if (!stopped) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
      if (task) void task.destroy();
    };
  }, [
    job.id,
    chunk,
    layout.startSlot,
    layout.damagedStartSlot,
    artifact?.url,
    artifact?.artifactHash,
    placement.pages,
    revision,
  ]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setRendered(0);
    void pdf
      .getPage(page + 1)
      .then(async (sheet) => {
        if (cancelled || !canvas.current) return;
        const view = sheet.getViewport({ scale: (96 / 72) * 2 }),
          target = canvas.current;
        target.width = Math.ceil(view.width);
        target.height = Math.ceil(view.height);
        task = sheet.render({ canvas: target, viewport: view });
        await task.promise;
        if (!cancelled) {
          setRendered(page + 1);
          readyCallback.current(loadedHash.current);
        }
      })
      .catch((failure) => {
        if (!cancelled) setError((failure as Error).message);
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page]);
  useEffect(() => {
    if (!selected || rendered !== page + 1 || !canvas.current || !inspector.current) return;
    const source = canvas.current,
      target = inspector.current,
      p = job.profile;
    target.width = Math.ceil(((p.labelWidthMm * 96) / 25.4) * 2);
    target.height = Math.ceil(((p.labelHeightMm * 96) / 25.4) * 2);
    target
      .getContext('2d')
      ?.drawImage(
        source,
        (selected.x / p.pageWidthMm) * source.width,
        (selected.y / p.pageHeightMm) * source.height,
        (selected.width / p.pageWidthMm) * source.width,
        (selected.height / p.pageHeightMm) * source.height,
        0,
        0,
        target.width,
        target.height,
      );
  }, [selected, rendered, page, job.profile]);
  return (
    <div className="space-y-5" aria-label="Generated PDF preview">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Sheet preview</h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="compact"
            variant="secondary"
            aria-label="Previous sheet"
            disabled={page === 0 || !pdf}
            onClick={() => {
              setPage(page - 1);
              setSlot(0);
            }}
          >
            ‹
          </Button>
          <span className="text-xs tabular-nums" aria-live="polite">
            Sheet {page + 1} of {placement.pages}
          </span>
          <Button
            type="button"
            size="compact"
            variant="secondary"
            aria-label="Next sheet"
            disabled={!pdf || page + 1 >= placement.pages}
            onClick={() => {
              setPage(page + 1);
              setSlot(0);
            }}
          >
            ›
          </Button>
        </div>
      </div>
      {error && <ErrorNotice message={error} onRetry={() => setRevision((v) => v + 1)} />}
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-32 flex-1 basis-36">
          <div
            className="relative mx-auto w-full max-w-56 overflow-hidden border border-black/15 bg-white shadow-sm"
            style={{ aspectRatio: `${job.profile.pageWidthMm}/${job.profile.pageHeightMm}` }}
          >
            <canvas ref={canvas} aria-label="Rendered PDF sheet" className="block h-full w-full" />
            {rendered === page + 1 &&
              pageLabels.map((label) => (
                <button
                  key={label.slot}
                  type="button"
                  aria-label={`Inspect label ${label.slot + 1}: ${label.line.content.fullCode} ${label.line.purpose}`}
                  aria-pressed={selected?.slot === label.slot}
                  onClick={() => setSlot(label.slot)}
                  className={`absolute border focus-visible:outline-2 focus-visible:outline-brand ${selected?.slot === label.slot ? 'border-brand bg-brand/10' : 'border-transparent hover:border-brand/50'}`}
                  style={{
                    left: `${(label.x / job.profile.pageWidthMm) * 100}%`,
                    top: `${(label.y / job.profile.pageHeightMm) * 100}%`,
                    width: `${(label.width / job.profile.pageWidthMm) * 100}%`,
                    height: `${(label.height / job.profile.pageHeightMm) * 100}%`,
                  }}
                />
              ))}
          </div>
          {loading || !rendered ? (
            <p className="mt-2 text-xs text-grey-2">Rendering PDF locally…</p>
          ) : (
            <p className="mt-2 text-xs text-grey-2">Tap a label to inspect it.</p>
          )}
        </div>
        <div className="min-w-0 flex-[2_1_280px] space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">Selected label · 100% layout size</h4>
            {selected && (
              <Badge tone={selected.line.purpose === 'USABLE' ? 'usable' : 'damaged'}>
                {selected.line.purpose === 'USABLE' ? 'Usable' : 'Damaged intake'}
              </Badge>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-black/10 bg-white p-2">
            <canvas
              ref={inspector}
              aria-label="Selected label from generated PDF"
              className="block"
              style={{
                width: `${job.profile.labelWidthMm}mm`,
                height: `${job.profile.labelHeightMm}mm`,
                visibility: rendered === page + 1 ? 'visible' : 'hidden',
              }}
            />
          </div>
          {selected && (
            <>
              <Code className="block break-all">{selected.line.content.fullCode}</Code>
              <p className="text-xs leading-5 text-grey-2">
                {selected.line.content.productName} · {selected.line.content.variantName} ·{' '}
                {selected.line.content.supplierName} / {selected.line.content.sourceName}
              </p>
            </>
          )}
          {rendered === page + 1 && (
            <ul className="space-y-1 text-xs leading-5">
              <li>✓ Preview and inspector use the generated PDF.</li>
              <li>✓ Full SKU and batch passed renderer fit checks.</li>
              <li>QR sizing is checked; confirm scans on physical output.</li>
              {placement.edgeLabels > 0 && (
                <li className="text-damaged">
                  ⚠ {placement.edgeLabels} labels across this PDF part approach a page edge.
                </li>
              )}
            </ul>
          )}
          <Footnote>
            Screen millimetres depend on display calibration. Print at actual size / 100%. Printer
            margins and adhesive alignment still need a physical trial. Long descriptions may be
            shortened on the label; full details appear above.
          </Footnote>
        </div>
      </div>
    </div>
  );
}
