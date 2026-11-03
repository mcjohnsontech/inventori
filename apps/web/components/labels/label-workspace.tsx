'use client';
import { PrinterIcon } from '@hugeicons/core-free-icons';
import { useEffect, useRef, useState } from 'react';
import type { LabelJob, LabelProfile } from '@dayari/contracts';

import { cn } from '../../lib/cn';
import { formatDate, formatDateTime } from '../../lib/format';
import {
  Badge,
  Button,
  Checkbox,
  Code,
  type Column,
  DataTable,
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
  WarningNotice,
  card,
} from '../ui';

async function read(path: string, signal?: AbortSignal) {
  const response = await fetch(`/api/${path}`, { signal });
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
  compact = false,
}: {
  receiptId?: string;
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
  const [profile, setProfile] = useState('a4-70x35-v1');

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
  const [attempt, setAttempt] = useState('');
  const [ack, setAck] = useState(false);
  const [reported, setReported] = useState('');
  const [note, setNote] = useState('');

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
    setArtifact(null);
    setAttempt('');
    setPart('1');
    setSelected({});
    setReason('');
    setAck(false);
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

  async function event(kind: string, id = attempt) {
    if (!job || !artifact) return;

    await write(`label-print-jobs/${job.id}/events`, {
      kind,
      chunk: artifact.chunk,
      attemptId: id,
      ...(kind === 'OPERATOR_REPORTED_PRINTED' ? { copies: reported } : {}),
      note,
    });

    await refreshJob();

    setNotice(
      kind === 'HANDOFF_REQUESTED'
        ? 'PDF handoff recorded. Physical output has not been confirmed.'
        : kind === 'OPERATOR_REPORTED_PRINTED'
          ? 'Operator report saved. This is reported output, not verified affixed labels.'
          : kind === 'OUTCOME_UNKNOWN'
            ? 'Uncertain output recorded. Check physical labels before retrying or reprinting.'
            : 'Print outcome recorded. Inventory is unchanged.',
    );
  }

  async function prepare() {
    await action(async () => {
      if (!job || !/^([1-9][0-9]*)$/.test(part) || BigInt(part) > BigInt(job.chunks)) {
        throw new Error('Choose a valid PDF part');
      }
      const chunk = (BigInt(part) - 1n).toString();
      setArtifact(await write(`label-print-jobs/${job.id}/artifacts/${chunk}`, {}));
      setAttempt('');
      setAck(false);
      await refreshJob();
    });
  }

  async function print() {
    if (working.current || !artifact || !job) return;

    const previous = job.events.some(
      (entry) => entry.kind === 'HANDOFF_REQUESTED' && entry.chunk === artifact.chunk,
    );

    if (previous && !ack) {
      setError('Check previous physical output and acknowledge before starting another attempt.');
      return;
    }

    // Open the window synchronously, before any await, or the popup blocker stops it.
    const windowRef = window.open('about:blank', '_blank');
    if (!windowRef) {
      setError('Popup blocked. Allow the PDF window and try explicitly again. No print was confirmed.');
      return;
    }
    windowRef.opener = null;

    await action(async () => {
      try {
        const id = crypto.randomUUID();
        await event('HANDOFF_REQUESTED', id);
        setAttempt(id);
        setReported(artifact.copies);
        setAck(false);
        windowRef.location.href = artifact.url;
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

  const manifestColumns: Column<NonNullable<typeof job>['lines'][number]>[] = [
    {
      key: 'sku',
      label: 'Saved SKU / batch',
      wide: true,
      cell: (line) => (
        <>
          <Code className="block">{line.content.fullCode}</Code>
          <Code tone="muted" className="mt-0.5 block">
            {line.content.publicCode}
          </Code>
        </>
      ),
    },
    {
      key: 'purpose',
      label: 'Purpose',
      cell: (line) =>
        line.purpose === 'USABLE' ? (
          <Badge tone="usable">Usable</Badge>
        ) : (
          <Badge tone="damaged">Damaged intake — not for production</Badge>
        ),
    },
    { key: 'copies', label: 'Copies', align: 'right', cell: (line) => line.copies },
  ];

  const body = (
    <Stack>
      {notice ? <SuccessNotice message={notice} /> : null}
      {error ? (
        <ErrorNotice message={`${error} Retry the unchanged request after a lost response.`} />
      ) : null}

      {!compact ? (
        <Panel
          title="1. Choose an accepted delivery"
          description="Latest 100 receipts. Choose a receipt or reopen an existing print job below."
        >
          <Stack gap="tight">
            <SearchInput
              label="Search label receipts"
              value={receiptSearch}
              onChange={setReceiptSearch}
              placeholder="Filter recent batches or suppliers…"
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
                    setReceiptId(value);
                    setJob(null);
                    setArtifact(null);
                    setNotice('');
                    setError('');
                  }}
                  options={receipts
                    .filter((item) =>
                      `${item.publicCode} ${item.supplierName}`
                        .toLowerCase()
                        .includes(receiptSearch.toLowerCase()),
                    )
                    .map((item) => ({
                      value: item.id,
                      label: `${item.publicCode} · ${item.supplierName}`,
                    }))}
                />
              )}
            </Field>
          </Stack>
        </Panel>
      ) : null}

      {plan ? (
        <Panel
          title={`Label plan · ${plan.batch.publicCode}`}
          description="Includes every delivered unit. Damaged goods must be labelled and segregated by staff."
        >
          <Stack gap="tight">
            <p className="font-sans text-sm tracking-[-0.02em] text-ink">
              Usable copies <strong className="font-semibold text-usable">{plan.totals.usable}</strong>
              {' · '}Damaged-intake copies{' '}
              <strong className="font-semibold text-damaged">{plan.totals.damaged}</strong>
              {' · '}Total <strong className="font-semibold">{plan.totals.delivered}</strong>
            </p>

            <ul className="space-y-1.5 border-t border-black/[0.06] pt-4">
              {plan.lines.map((line) => (
                <li key={line.lotId} className="font-sans text-xs tracking-[-0.02em] text-grey-2">
                  <Code>{line.fullCode}</Code> — {line.usableQuantity} usable /{' '}
                  {line.damagedQuantity} damaged
                </li>
              ))}
            </ul>

            {plan.initialJobId ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  action(async () => showJob(await read(`label-print-jobs/${plan.initialJobId}`)))
                }
              >
                Open initial label job
              </Button>
            ) : (
              <>
                <Field label="Print profile">
                  {(id) => (
                    <Select
                      id={id}
                      label="Print profile"
                      disabled={busy}
                      value={profile}
                      onChange={setProfile}
                      options={plan.profiles.map((item) => ({
                        value: item.id,
                        label: `${item.labelWidthMm} × ${item.labelHeightMm} mm · ${item.columns} × ${item.rows} per A4 sheet · trial v1`,
                      }))}
                    />
                  )}
                </Field>
                <Button disabled={busy} onClick={createInitial}>
                  {busy ? 'Working…' : 'Create full-receipt label job'}
                </Button>
              </>
            )}
          </Stack>
        </Panel>
      ) : null}

      {job ? (
        <Panel
          title={job.kind === 'INITIAL' ? 'Initial label manifest' : 'Reprint manifest'}
          description={`${job.totalCopies} copies · ${job.chunks} PDF part(s), at most 500 copies each · ${job.labelsPerSheet} labels per sheet · ${job.totalSheets} A4 sheets across all parts`}
          action={<Badge tone="brand">{job.kind}</Badge>}
        >
          <Stack gap="tight">
            <Footnote>
              Profile {job.profile.labelWidthMm} × {job.profile.labelHeightMm} mm, A4.{' '}
              <Code tone="muted">Origin {job.originId}</Code>
            </Footnote>

            <DataTable
              columns={manifestColumns}
              rows={job.lines}
              rowKey={(line) => line.id}
              emptyMessage="This manifest has no lines."
            />

            <div className="flex flex-wrap items-end gap-3 border-t border-black/[0.06] pt-4">
              <Field label="PDF part" className="w-28">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min="1"
                    max={job.chunks}
                    disabled={busy}
                    value={part}
                    onChange={(changeEvent) => {
                      setPart(changeEvent.target.value);
                      setArtifact(null);
                      setAttempt('');
                    }}
                  />
                )}
              </Field>
              <Button disabled={busy} onClick={prepare}>
                {busy ? 'Working…' : 'Prepare PDF'}
              </Button>
            </div>

            {artifact ? (
              <Stack gap="tight" className="border-t border-black/[0.06] pt-4">
                <SuccessNotice
                  message={`PDF ready: ${artifact.copies} labels on ${artifact.pages} A4 sheet(s). Not yet confirmed printed.`}
                />

                <WarningNotice>
                  Use A4, actual size / 100%. Disable Fit to page and headers/footers. Print one
                  alignment trial first. Ordinary paper is for cut-and-attach trials; adhesive
                  sheets and physical scan reliability are not certified.
                </WarningNotice>

                <div className="flex flex-wrap gap-4">
                  <a
                    href={artifact.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-sans text-[13px] font-semibold tracking-[-0.02em] text-brand underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    Preview PDF
                  </a>
                  <a
                    href={artifact.url}
                    download
                    className="font-sans text-[13px] font-semibold tracking-[-0.02em] text-brand underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    Download PDF
                  </a>
                </div>

                <iframe
                  title="A4 label PDF preview"
                  src={artifact.url}
                  className="h-80 w-full rounded-xl border border-black/[0.07] bg-white"
                />

                {job.events.some(
                  (entry) =>
                    entry.kind === 'HANDOFF_REQUESTED' && entry.chunk === artifact.chunk,
                ) ? (
                  <label className="flex cursor-pointer items-start gap-2.5 font-sans text-sm leading-[1.6] tracking-[-0.02em] text-ink">
                    <Checkbox
                      className="mt-0.5"
                      checked={ack}
                      onChange={(changeEvent) => setAck(changeEvent.target.checked)}
                    />
                    I checked previous output before starting another print attempt.
                  </label>
                ) : null}

                <Button disabled={busy} onClick={print}>
                  Open PDF to print
                </Button>

                <Footnote>
                  The PDF viewer opens; use its Print control. Opening a dialog or downloading a
                  PDF does not prove physical output. Dayari cannot observe printing outside the
                  app.
                </Footnote>

                {attempt ? (
                  <div className={cn(card, 'space-y-3 p-4')}>
                    <h3 className="font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
                      Report this print attempt
                    </h3>
                    <Field label="Operator-reported copies">
                      {(id) => (
                        <Input
                          id={id}
                          type="number"
                          min="1"
                          max={artifact.copies}
                          value={reported}
                          onChange={(changeEvent) => setReported(changeEvent.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="Print outcome note">
                      {(id) => (
                        <Input
                          id={id}
                          maxLength={1000}
                          value={note}
                          onChange={(changeEvent) => setNote(changeEvent.target.value)}
                        />
                      )}
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="compact"
                        disabled={busy}
                        onClick={() => action(() => event('OPERATOR_REPORTED_PRINTED'))}
                      >
                        Report printed
                      </Button>
                      <Button
                        variant="secondary"
                        size="compact"
                        disabled={busy}
                        onClick={() => action(() => event('OUTCOME_UNKNOWN'))}
                      >
                        Output uncertain
                      </Button>
                      <Button
                        variant="secondary"
                        size="compact"
                        disabled={busy}
                        onClick={() => action(() => event('FAILED'))}
                      >
                        Report failed
                      </Button>
                    </div>
                    <Footnote>
                      For partial output, report only the copies you observed. Check physical
                      output after a jam or cancellation, then use an explicit reprint for spoiled
                      or missing labels. Duplicate stickers retain the same lot QR; they never
                      represent extra stock. Nothing prints again automatically.
                    </Footnote>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => action(() => event('CANCELLED_BEFORE_HANDOFF', crypto.randomUUID()))}
                  >
                    Cancel before handoff
                  </Button>
                )}
              </Stack>
            ) : null}

            <Disclosure summary="Explicit reprint" className="border-t border-black/[0.06] pt-4">
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
                    {entry.copies} reported/requested copies
                    {entry.note ? ` · ${entry.note}` : ''}
                  </li>
                ))}
              </ul>
              <Footnote className="mt-2">
                Manifest counts, handed-off counts and operator reports are separate evidence,
                never verified affixed units.
              </Footnote>
            </Disclosure>
          </Stack>
        </Panel>
      ) : null}

      {!compact ? (
        <Panel
          title="Recent label jobs"
          description="Latest 100 manifests. Reopening a job never sends it to a printer."
          flush
        >
          {!jobs.length ? (
            <EmptyState title="No label jobs yet" icon={PrinterIcon}>
              Select an accepted receipt to create its label plan.
            </EmptyState>
          ) : (
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {jobs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    action(async () => showJob(await read(`label-print-jobs/${item.id}`)))
                  }
                  className={cn(
                    card,
                    'p-4 text-left transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <Badge tone={item.kind === 'INITIAL' ? 'brand' : 'neutral'}>{item.kind}</Badge>
                    <span className="font-sans text-xs tracking-[-0.02em] text-grey-3">
                      {formatDate(item.createdAt)}
                    </span>
                  </span>
                  <span className="mt-2.5 block font-sans text-sm font-semibold tracking-[-0.02em] text-ink">
                    {item.totalCopies} copies
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      ) : null}
    </Stack>
  );

  if (compact) {
    return (
      <section aria-label="Label printing" className="mt-5 border-t border-black/[0.06] pt-5">
        {body}
      </section>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Delivery identification"
        title="Labels & printing"
        description="Create an immutable label manifest from an accepted receipt. Inspect the A4 PDF, print explicitly, then report the outcome. Printing never changes inventory."
      />
      <section aria-label="Label printing" className="mt-8">
        {body}
      </section>
    </Page>
  );
}
