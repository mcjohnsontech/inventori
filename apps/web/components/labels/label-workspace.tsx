'use client';
import { PrinterIcon } from '@hugeicons/core-free-icons';
import { useEffect, useRef, useState } from 'react';
import {
  chunkRange,
  defaultSheetStart,
  planLabelSheets,
  savedSheetStart,
  type LabelJob,
  type LabelProfile,
  type SheetStart,
} from '@dayari/contracts';
import { PdfSheetPreview } from './pdf-sheet-preview';
import { SheetStartPicker } from './sheet-start-picker';

import { notifyAuthFailure } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import {
  Badge,
  Button,
  Checkbox,
  Code,
  Disclosure,
  EmptyState,
  ErrorNotice,
  Field,
  Footnote,
  Input,
  Page,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  Stack,
  SuccessNotice,
  Textarea,
} from '../ui';

async function read(path: string, signal?: AbortSignal) {
  const response = await fetch(`/api/${path}`, { signal });
  notifyAuthFailure(response);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body.message === 'string' ? body.message : 'Label service unavailable');
  }
  return body;
}

/** Reuses the submission key for an unchanged body so a lost response cannot double-post. */
async function write(path: string, body: unknown) {
  const fingerprint = JSON.stringify(body);
  const storage = `dayari_label_${path}`;
  const prior = JSON.parse(sessionStorage.getItem(storage) ?? 'null');
  const key = prior?.fingerprint === fingerprint ? prior.key : crypto.randomUUID();

  sessionStorage.setItem(storage, JSON.stringify({ fingerprint, key }));

  const response = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: fingerprint,
  });
  notifyAuthFailure(response);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(typeof data.message === 'string' ? data.message : 'Label request failed');
  }

  sessionStorage.removeItem(storage);
  return data;
}

type Plan = {
  id: string;
  batch: { publicCode: string; originId: string };
  totals: { usable: string; damaged: string; delivered: string };
  profiles: LabelProfile[];
  initialJobId: string | null;
  lines: { lotId: string; fullCode: string; usableQuantity: string; damagedQuantity: string }[];
};

type JobSummary = { id: string; kind: string; totalCopies: string; createdAt: string };

export function LabelWorkspace({
  receiptId: initialReceiptId = '',
  initialJobId = '',
  compact = false,
}: {
  receiptId?: string;
  initialJobId?: string;
  compact?: boolean;
}) {
  const working = useRef(false);

  const [receiptSearch, setReceiptSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [receipts, setReceipts] = useState<
    { id: string; publicCode: string; supplierName: string }[]
  >([]);
  const [receiptId, setReceiptId] = useState(initialReceiptId);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [profile, setProfile] = useState('a4-70x35-v2');

  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [job, setJob] = useState<LabelJob | null>(null);
  const [part, setPart] = useState('1');

  const [artifact, setArtifact] = useState<{
    url: string;
    copies: string;
    pages: number;
    chunk: string;
    artifactHash: string;
  } | null>(null);
  const [sheetStart, setSheetStart] = useState<SheetStart>(defaultSheetStart);
  const [previewHash, setPreviewHash] = useState('');

  const [selected, setSelected] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([read('receipts', controller.signal), read('label-print-jobs', controller.signal)])
      .then(([nextReceipts, nextJobs]) => {
        setReceipts(nextReceipts);
        setJobs(nextJobs);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPlan(null);

    if (receiptId) {
      read(`receipts/${receiptId}/label-plan`, controller.signal)
        .then(setPlan)
        .catch((failure) => {
          if (!controller.signal.aborted) setError(failure.message);
        });
    }

    return () => controller.abort();
  }, [receiptId]);

  // Preserve unsaved layout and reprint selections when navigating.
  const dirty = Boolean(
    (!artifact && (sheetStart.startSlot > 0 || sheetStart.damagedStartSlot > 0)) ||
      reason.trim() ||
      Object.values(selected).some((value) => value.trim()),
  );

  function mayDiscard() {
    return (
      !busy && (!dirty || window.confirm('Discard unsaved label positions, reprint selections?'))
    );
  }

  useEffect(() => {
    const guard = (event: Event) => {
      if (!mayDiscard()) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (busy || dirty) event.preventDefault();
    };

    window.addEventListener('dayari:before-navigate', guard);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('dayari:before-navigate', guard);
      window.removeEventListener('beforeunload', unload);
    };
  });

  useEffect(() => {
    if (!initialJobId) return;
    const controller = new AbortController();

    read(`label-print-jobs/${initialJobId}`, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          showJob(next);
          setReceiptId(next.receiptId);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJobId]);

  async function action(task: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      await task();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function showJob(next: LabelJob) {
    setJob(next);
    loadPart(next, '0');
    setReceiptId(next.receiptId);
    setPreviewHash('');
    setPart('1');
    setSelected({});
    setReason('');
  }

  function loadPart(next: LabelJob, chunk: string) {
    const ready = next.events.find((e) => e.kind === 'ARTIFACT_READY' && e.chunk === chunk);
    const layout =
      ready && next.profile.layoutVersion === 2 ? savedSheetStart(ready.note) : defaultSheetStart;
    setSheetStart(layout);
    setPreviewHash('');
    setArtifact(
      ready
        ? {
            url: `/api/label-print-jobs/${next.id}/artifacts/${chunk}.pdf`,
            copies: String(chunkRange(next.totalCopies, chunk).copies),
            pages: planLabelSheets(next, chunk, layout).pages,
            chunk,
            artifactHash: ready.artifactHash!,
          }
        : null,
    );
  }
  async function createInitial() {
    await action(async () => {
      showJob(await write('label-print-jobs', { kind: 'INITIAL', receiptId, profileId: profile }));
      setPlan(await read(`receipts/${receiptId}/label-plan`));
      setJobs(await read('label-print-jobs'));
    });
  }

  async function refreshJob() {
    if (job) setJob(await read(`label-print-jobs/${job.id}`));
  }

  const validPart = Boolean(
    job && /^([1-9][0-9]*)$/.test(part) && BigInt(part) <= BigInt(job.chunks),
  );
  const chunk = validPart ? (BigInt(part) - 1n).toString() : '0';
  async function ensureArtifact() {
    if (!job || !validPart) throw new Error('Choose a valid PDF part');
    const next =
      artifact ?? (await write(`label-print-jobs/${job.id}/artifacts/${chunk}`, sheetStart));
    if (previewHash && next.artifactHash !== previewHash)
      throw new Error('The prepared PDF differs from the preview. Reload it before printing.');
    setArtifact(next);
    await refreshJob();
    return next;
  }
  async function prepare() {
    await action(async () => {
      await ensureArtifact();
    });
  }
  async function print(alignment = false) {
    if (working.current || !job || !previewHash || !validPart) return;
    const windowRef = window.open('about:blank', '_blank');
    if (!windowRef) {
      setError('Print window blocked. Allow it and retry explicitly.');
      return;
    }
    windowRef.opener = null;
    await action(async () => {
      try {
        const ready = await ensureArtifact(),
          id = crypto.randomUUID();
        // The artifact may have just been prepared: record against its exact immutable part.
        await write(`label-print-jobs/${job.id}/events`, {
          kind: 'HANDOFF_REQUESTED',
          chunk: ready.chunk,
          attemptId: id,
          note: alignment
            ? 'Alignment trial: plain paper; select page 1 only in the native print dialog. Output is not confirmed.'
            : 'Operator requested printing of the saved PDF; physical output is not confirmed.',
        });
        await refreshJob();
        setNotice('Print dialog requested. Need another copy? Use Reprint labels below.');
        const document = windowRef.document;
        document.title = 'Dayari label printing';
        document.body.style.margin = '0';
        const instruction = document.createElement('p');
        instruction.textContent = alignment
          ? 'Alignment trial: use plain paper and select page 1 only. Print at actual size / 100%.'
          : 'Print at actual size / 100%. If the dialog does not open, use the PDF Print control.';
        instruction.style.cssText = 'font:14px system-ui;padding:12px;margin:0';
        document.body.append(instruction);
        let printRequested = false;
        const frame = document.createElement('iframe');
        frame.title = 'Print-ready PDF';
        frame.style.cssText = 'width:100%;height:calc(100vh - 60px);border:0';
        frame.onload = () => {
          if (printRequested) return;
          printRequested = true;
          try {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          } catch {
            /* Native PDF controls remain available as fallback; no false dialog/output event. */
          }
        };
        frame.src = ready.url;
        document.body.append(frame);
      } catch (failure) {
        windowRef.close();
        throw failure;
      }
    });
  }
  async function reprint() {
    await action(async () => {
      if (!job) return;

      const lines = job.lines
        .filter((line) => selected[line.id])
        .map((line) => ({ lotId: line.lotId, purpose: line.purpose, copies: selected[line.id] }));

      if (!lines.length) throw new Error('Select at least one purpose to reprint');

      const next = await write('label-print-jobs', {
        kind: 'REPRINT',
        originalJobId: job.id,
        reason,
        lines,
      });

      showJob(next);
      setJobs(await read('label-print-jobs'));
    });
  }

  const layout = job && validPart ? planLabelSheets(job, chunk, sheetStart) : null;
  const queue =
    job?.lines ??
    plan?.lines.flatMap((line) =>
      (['USABLE', 'DAMAGED_INTAKE'] as const).flatMap((purpose) => {
        const copies = purpose === 'USABLE' ? line.usableQuantity : line.damagedQuantity;
        return BigInt(copies) > 0n
          ? [
              {
                id: line.lotId + purpose,
                purpose,
                copies,
                content: { fullCode: line.fullCode, publicCode: plan.batch.publicCode },
              },
            ]
          : [];
      }),
    ) ??
    [];
  const receiptControls = (
    <div className="grid gap-4 sm:grid-cols-2">
      <SearchInput
        label="Search label receipts"
        value={receiptSearch}
        onChange={setReceiptSearch}
        placeholder="Batch or supplier…"
      />
      <Field label="Accepted receipt">
        {(id) => (
          <Select
            id={id}
            label="Accepted receipt"
            placeholder="Choose receipt"
            disabled={busy}
            value={receiptId}
            onChange={(value) => {
              if (!mayDiscard()) return;
              setReceiptId(value);
              setJob(null);
              setArtifact(null);
              setSheetStart(defaultSheetStart);
              setError('');
              setNotice('');
            }}
            options={receipts
              .filter((r) =>
                `${r.publicCode} ${r.supplierName}`
                  .toLowerCase()
                  .includes(receiptSearch.toLowerCase()),
              )
              .map((r) => ({ value: r.id, label: `${r.publicCode} · ${r.supplierName}` }))}
          />
        )}
      </Field>
    </div>
  );
  const body = (
    <Stack>
      {notice && <SuccessNotice message={notice} />}
      {error && (
        <ErrorNotice message={`${error} Retry the unchanged request after a lost response.`} />
      )}
      {!compact &&
        (job ? (
          <Disclosure summary={`Delivery · ${job.lines[0]?.content.publicCode ?? 'saved job'}`}>
            {receiptControls}
          </Disclosure>
        ) : (
          <Panel
            title="Choose an accepted delivery"
            description="Latest 100 receipts. Printing and reprinting never change stock."
          >
            {receiptControls}
          </Panel>
        ))}
      {(plan || job) && (
        <>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.35fr)]">
            <Stack>
              <Panel
                title="1. Print queue"
                description={plan ? `Batch ${plan.batch.publicCode}` : 'Saved manifest'}
              >
                {(['USABLE', 'DAMAGED_INTAKE'] as const).map((purpose) => {
                  const rows = queue.filter((l) => l.purpose === purpose);
                  return (
                    rows.length > 0 && (
                      <div key={purpose} className="mb-5 last:mb-0">
                        <Badge tone={purpose === 'USABLE' ? 'usable' : 'damaged'}>
                          {purpose === 'USABLE'
                            ? 'Usable'
                            : job && job.profile.layoutVersion !== 2
                              ? 'Damaged intake · historical sheet order'
                              : 'Damaged intake · separate sheets'}
                        </Badge>
                        <ul className="mt-2 max-h-64 divide-y divide-black/[0.06] overflow-y-auto">
                          {rows.map((line) => (
                            <li
                              key={line.id}
                              className="flex items-center justify-between gap-3 py-1.5"
                            >
                              <div className="min-w-0">
                                <Code className="break-all text-xs">{line.content.fullCode}</Code>
                              </div>
                              <span className="shrink-0 rounded-lg border border-black/10 bg-white px-2.5 py-0.5 text-sm font-semibold tabular-nums">
                                {line.copies}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  );
                })}
                <div className="flex flex-wrap justify-between gap-2 border-t border-black/[0.06] pt-3 text-sm">
                  <span>
                    <strong>{job?.totalCopies ?? plan?.totals.delivered}</strong> labels
                  </span>
                  {layout && <span>{layout.pages} sheets in this part</span>}
                </div>
                {plan && !job && (
                  <p className="mt-2 text-xs text-grey-2">
                    Usable {plan.totals.usable} · Damaged {plan.totals.damaged} · Total{' '}
                    {plan.totals.delivered}
                  </p>
                )}
                {!job &&
                  plan &&
                  (plan.initialJobId ? (
                    <Button
                      className="mt-4"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        action(async () =>
                          showJob(await read(`label-print-jobs/${plan.initialJobId}`)),
                        )
                      }
                    >
                      Open initial label job
                    </Button>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <Field label="Print profile">
                        {(id) => (
                          <Select
                            id={id}
                            label="Print profile"
                            value={profile}
                            onChange={setProfile}
                            options={plan.profiles
                              .filter((p) => p.layoutVersion === 2)
                              .map((p) => ({
                                value: p.id,
                                label: `${p.labelWidthMm} × ${p.labelHeightMm} mm · ${p.columns} × ${p.rows} · A4 trial`,
                              }))}
                          />
                        )}
                      </Field>
                      <Button disabled={busy} onClick={createInitial}>
                        Create full-receipt label job
                      </Button>
                    </div>
                  ))}
                {job && (
                  <div className="mt-3 space-y-3 border-t border-black/[0.06] pt-3">
                    {job.kind === 'REPRINT' && (
                      <h3 className="text-sm font-semibold">Reprint manifest</h3>
                    )}
                    {BigInt(job.chunks) > 1n && (
                      <Field label="PDF part">
                        {(id) => (
                          <Input
                            id={id}
                            type="number"
                            min="1"
                            max={job.chunks}
                            value={part}
                            disabled={busy}
                            onChange={(e) => {
                              if (!mayDiscard()) return;
                              const next = e.target.value;
                              setPart(next);
                              if (/^[1-9][0-9]*$/.test(next) && BigInt(next) <= BigInt(job.chunks))
                                loadPart(job, (BigInt(next) - 1n).toString());
                              else {
                                setArtifact(null);
                                setPreviewHash('');
                              }
                            }}
                          />
                        )}
                      </Field>
                    )}
                    <Disclosure
                      summary={`${job.profile.labelWidthMm} × ${job.profile.labelHeightMm} mm · Paper settings`}
                    >
                      <Footnote>
                        {job.totalCopies} copies · {job.chunks} PDF part(s), at most 500 copies
                        each. {job.totalSheets} sheets at default start positions across all parts.
                        Grid {job.profile.columns} × {job.profile.rows}; gaps{' '}
                        {job.profile.gapXmm ?? 0}/{job.profile.gapYmm ?? 0} mm; margins{' '}
                        {job.profile.marginXmm}/{job.profile.marginYmm} mm.
                      </Footnote>
                    </Disclosure>
                  </div>
                )}
              </Panel>
              {job && (
                <Panel
                  title="2. First free label"
                  description={
                    job.profile.layoutVersion === 2
                      ? undefined
                      : 'Historical layout — fixed start and original sheet order.'
                  }
                >
                  <SheetStartPicker
                    profile={job.profile}
                    value={sheetStart}
                    onChange={(next) => {
                      setSheetStart(next);
                      setPreviewHash('');
                    }}
                    disabled={busy || Boolean(artifact) || job.profile.layoutVersion !== 2}
                    hasDamaged={job.lines.some((l) => l.purpose === 'DAMAGED_INTAKE')}
                  />
                </Panel>
              )}
            </Stack>
            <div className="min-w-0 xl:sticky xl:top-24">
              <Panel
                title="3. Preview & inspect"
                description="Rendered from the same generated PDF used for printing."
              >
                {job && validPart ? (
                  <PdfSheetPreview
                    job={job}
                    chunk={chunk}
                    layout={sheetStart}
                    artifact={artifact}
                    onReady={setPreviewHash}
                  />
                ) : (
                  <EmptyState title="Your sheet preview appears here" icon={PrinterIcon}>
                    Create or open a label job, then choose the first free position. Labels are
                    generated from the accepted delivery.
                  </EmptyState>
                )}
              </Panel>
            </div>
          </div>
          {job && (
            <>
              {artifact && (
                <SuccessNotice
                  message={`PDF ready: ${artifact.copies} labels on ${artifact.pages} A4 sheet(s). Ready to print.`}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white p-4">
                <div className="text-xs leading-5 text-grey-2">
                  <strong className="block text-ink">
                    {previewHash ? 'Ready to print' : 'Preparing preview…'}
                  </strong>
                  Print at actual size / 100%.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy || !previewHash || !validPart}
                    onClick={() => void print(true)}
                  >
                    Print alignment test
                  </Button>
                  {!artifact && (
                    <Button
                      variant="secondary"
                      disabled={busy || !previewHash || !validPart}
                      onClick={prepare}
                    >
                      Prepare PDF
                    </Button>
                  )}
                  <Button
                    disabled={busy || !previewHash || !validPart}
                    onClick={() => void print()}
                  >
                    Print {layout?.pages ?? 0} {layout?.pages === 1 ? 'sheet' : 'sheets'}
                  </Button>
                </div>
              </div>
              {artifact && (
                <div className="flex flex-wrap gap-5 text-sm">
                  <a
                    href={artifact.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand underline"
                  >
                    Open print-ready PDF
                  </a>
                  <a href={artifact.url} download className="text-brand underline">
                    Download PDF
                  </a>
                </div>
              )}
              <Footnote>
                Use plain paper for the alignment trial and select page 1 in the print dialog. Print
                at actual size / 100%.
              </Footnote>
              <Panel title="Reprint labels">
                <Stack>
                  <Disclosure
                    summary="Explicit reprint"
                    className="border-t border-black/[0.06] pt-4"
                  >
                    <Stack gap="tight" className="mt-4">
                      {job.lines.map((line) => (
                        <div key={line.id} className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-1 cursor-pointer items-center gap-2.5 font-sans text-sm tracking-[-0.02em] text-ink">
                            <Checkbox
                              checked={Boolean(selected[line.id])}
                              onChange={(changeEvent) =>
                                setSelected((previous) => ({
                                  ...previous,
                                  [line.id]: changeEvent.target.checked ? '1' : '',
                                }))
                              }
                            />
                            <span className="min-w-0">
                              <Code>{line.content.fullCode}</Code> · {line.purpose}
                            </span>
                          </label>
                          {selected[line.id] ? (
                            <Field label="Reprint copies" className="w-32">
                              {(id) => (
                                <Input
                                  id={id}
                                  type="number"
                                  min="1"
                                  max="10000"
                                  aria-label={`${line.content.fullCode} ${line.purpose} reprint copies`}
                                  value={selected[line.id]}
                                  onChange={(changeEvent) =>
                                    setSelected((previous) => ({
                                      ...previous,
                                      [line.id]: changeEvent.target.value,
                                    }))
                                  }
                                />
                              )}
                            </Field>
                          ) : null}
                        </div>
                      ))}

                      <Field label="Reprint reason">
                        {(id) => (
                          <Textarea
                            id={id}
                            minLength={10}
                            maxLength={1000}
                            value={reason}
                            onChange={(changeEvent) => setReason(changeEvent.target.value)}
                          />
                        )}
                      </Field>

                      <Button disabled={busy || reason.trim().length < 10} onClick={reprint}>
                        Create explicit reprint
                      </Button>
                    </Stack>
                  </Disclosure>

                  <Disclosure summary="Print attempt history">
                    <ul className="mt-3 space-y-1.5">
                      {job.events.map((entry) => (
                        <li
                          key={entry.id}
                          className="font-sans text-xs leading-[1.7] tracking-[-0.02em] text-grey-2"
                        >
                          {formatDateTime(entry.createdAt)} · {entry.kind.replaceAll('_', ' ')} ·{' '}
                          {entry.copies} copies
                          {entry.note ? ` · ${entry.note}` : ''}
                        </li>
                      ))}
                    </ul>
                    <Footnote className="mt-2">
                      Print requests are logged automatically. Older operator reports remain in
                      history.
                    </Footnote>
                  </Disclosure>
                </Stack>
              </Panel>
            </>
          )}
        </>
      )}
      {!compact && (
        <Disclosure summary="Recent label jobs">
          <div className="mt-3 divide-y divide-black/[0.06]">
            {jobs.length ? (
              jobs.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={busy}
                  className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-sm"
                  onClick={() => {
                    if (mayDiscard())
                      void action(async () => showJob(await read(`label-print-jobs/${item.id}`)));
                  }}
                >
                  <span>
                    {item.kind} · {item.totalCopies} copies
                  </span>
                  <span className="text-xs text-grey-2">{formatDate(item.createdAt)}</span>
                </button>
              ))
            ) : (
              <p className="text-sm text-grey-2">No label jobs yet.</p>
            )}
          </div>
        </Disclosure>
      )}
    </Stack>
  );
  return compact ? (
    <section aria-label="Label printing" className="mt-5 border-t border-black/[0.06] pt-5">
      {body}
    </section>
  ) : (
    <Page>
      <PageHeader
        eyebrow="Delivery identification"
        title="Labels & printing"
        description="Choose a delivery, position your labels, inspect the PDF and print."
      />
      <section aria-label="Label printing" className="mt-6">
        {body}
      </section>
    </Page>
  );
}
