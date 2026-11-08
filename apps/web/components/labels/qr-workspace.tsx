'use client';
import { useEffect, useRef, useState } from 'react';
import type { QrLookup, UnitIdentityLookup } from '@dayari/contracts';
import { UnitIdentityResult } from './unit-identity-result';

import { notifyAuthFailure } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import {
  Button,
  Code,
  CopyButton,
  Disclosure,
  ErrorNotice,
  Field,
  Footnote,
  Input,
  Page,
  PageHeader,
  Panel,
  Select,
  Stack,
  WarningNotice,
  card,
} from '../ui';
import { IdentityLookup } from '../identity-lookup';

type Source = { id: string; name: string; code: string; originId: string };

export function QrWorkspace({ initialCode = '' }: { initialCode?: string }) {
  const [payload, setPayload] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [prefix, setPrefix] = useState('');
  const [result, setResult] = useState<QrLookup | UnitIdentityLookup | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');

  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [fullSku, setSku] = useState('');
  const [batch, setBatch] = useState('');

  const request = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const working = useRef(false);

  const streamRef = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stopper = useRef<(() => void) | null>(null);
  const generation = useRef(0);

  function clearLookup() {
    requestVersion.current += 1;
    request.current?.abort();
    working.current = false;
    setBusy(false);
    setResult(null);
    setError('');
  }

  function stopCamera() {
    generation.current += 1;
    stopper.current?.();
    stopper.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const stream = video.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video.current) video.current.srcObject = null;
    setCamera(false);
  }

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/qr/manual-sources', { signal: controller.signal })
      .then(async (response) => {
        notifyAuthFailure(response);
        if (response.ok) setSources(await response.json());
      })
      .catch(() => {});

    return () => {
      controller.abort();
      requestVersion.current += 1;
      request.current?.abort();
      generation.current += 1;
      stopper.current?.();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function resolve(body: unknown, path = 'qr/resolve', method: 'GET' | 'POST' = 'POST') {
    if (working.current) return;
    working.current = true;

    const ticket = ++requestVersion.current;
    const controller = new AbortController();
    request.current = controller;

    setBusy(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(`/api/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method==='POST'?JSON.stringify(body):undefined,
        signal: controller.signal,
      });
      notifyAuthFailure(response);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data.message === 'string' ? data.message : 'Lot lookup failed');
      }
      if (ticket === requestVersion.current) setResult(data);
    } catch (failure) {
      if (ticket === requestVersion.current && !controller.signal.aborted) {
        setError(
          `${(failure as Error).message}. No stock was changed. If the shop is unavailable, reconnect and retry.`,
        );
      }
    } finally {
      if (ticket === requestVersion.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }

  function scan(text = payload) {
    if (camera) stopCamera();
    let framed = text.replace(/(?:\r\n|\r|\n)$/, '');
    if (prefix && framed.startsWith(prefix)) framed = framed.slice(prefix.length);
    setPayload(framed);
    return resolve({ payload: framed });
  }

  async function startCamera() {
    setError('');
    setCameraMessage('');

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraMessage(
        'Camera unavailable: use a trusted HTTPS shop address or localhost. Use a scanner or manual entry here.',
      );
      return;
    }

    const ticket = ++generation.current;
    setCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });

      if (generation.current !== ticket) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const element = video.current!;
      element.srcObject = stream;
      await element.play();

      const finish = (text: string) => {
        stopCamera();
        clearLookup();
        setPayload(text);
        void resolve({ payload: text });
      };

      type NativeInstance = {
        detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
      };

      const Native = (
        window as unknown as {
          BarcodeDetector?: {
            new (options: { formats: string[] }): NativeInstance;
            getSupportedFormats?: () => Promise<string[]>;
          };
        }
      ).BarcodeDetector;

      const formats = (await Native?.getSupportedFormats?.().catch(() => [])) ?? [];

      if (generation.current !== ticket) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      if (Native && formats.includes('qr_code')) {
        const detector = new Native({ formats: ['qr_code'] });
        let timer: ReturnType<typeof setTimeout>;
        let cancelled = false;

        stopper.current = () => {
          cancelled = true;
          clearTimeout(timer);
          stream.getTracks().forEach((track) => track.stop());
        };

        const loop = async () => {
          if (cancelled || generation.current !== ticket) return;
          try {
            const codes = await detector.detect(element);
            if (codes[0]) {
              finish(codes[0].rawValue);
              return;
            }
          } catch {
            /* keep polling — a frame can fail to decode */
          }
          if (!cancelled) timer = setTimeout(() => void loop(), 250);
        };

        void loop();
      } else {
        const { BrowserQRCodeReader } = await import('@zxing/browser');

        if (generation.current !== ticket) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromStream(stream, element, (decoded, _, controls) => {
          if (decoded && generation.current === ticket) {
            controls.stop();
            finish(decoded.getText());
          }
        });

        if (generation.current !== ticket) controls.stop();
        else
          stopper.current = () => {
            controls.stop();
            stream.getTracks().forEach((track) => track.stop());
          };
      }
    } catch (failure) {
      stopCamera();
      setCameraMessage(
        (failure as Error).name === 'NotAllowedError'
          ? 'Camera permission denied. Use the scanner input or exact manual lookup.'
          : 'Camera could not start on this device. Use scanner or manual lookup.',
      );
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Identification only"
        title="QR lookup"
        description="Scan a lot QR with a camera or connected scanner, or enter an exact Product / Lot Code. Lookup never issues, reserves or deducts stock."
      />

      <div className="mt-8 space-y-4">
        <IdentityLookup initialCode={initialCode} />

        <Panel title="Find an individual item"><form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event=>{event.preventDefault();stopCamera();void resolve({},'inventory/units/by-code/'+encodeURIComponent(unitCode.trim().toUpperCase()),'GET');}}><div className="min-w-0 flex-1"><Field label="Individual Unit Code" hint="Exactly six readable characters. Omit 0, O, 1, I and L.">{id=><Input id={id} value={unitCode} maxLength={6} required pattern="[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}" autoComplete="off" spellCheck={false} placeholder="A7K2M9" className="font-mono tracking-widest" onChange={event=>{clearLookup();setUnitCode(event.target.value.trim().toUpperCase());}} onPaste={event=>{event.preventDefault();clearLookup();const value=event.clipboardData.getData('text').trim().toUpperCase();if(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(value))setUnitCode(value);else setError('Paste exactly six Unit Code characters, or use the QR field for a complete payload.');}}/>}</Field></div><Button disabled={busy||unitCode.length!==6}>{busy?'Looking up…':'Find unit'}</Button></form></Panel>
        <Panel title="Scan an inventory QR" description="Individual-unit DYI:2 and existing lot DYI:1 codes are supported.">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void scan();
            }}
          >
            <Stack gap="tight">
              <Field label="Scan or enter QR payload">
                {(id) => (
                  <Input
                    id={id}
                    autoComplete="off"
                    maxLength={128}
                    value={payload}
                    placeholder="DYI:1:…"
                    onChange={(event) => {
                      clearLookup();
                      setPayload(event.target.value);
                    }}
                    onPaste={(event) => {
                      event.preventDefault();
                      clearLookup();
                      setPayload(
                        event.clipboardData.getData('text').replace(/(?:\r\n|\r|\n)$/, ''),
                      );
                    }}
                  />
                )}
              </Field>

              <Disclosure summary="Scanner framing profile">
                <div className="mt-3 space-y-2">
                  <Field label="Known scanner prefix">
                    {(id) => (
                      <Select
                        id={id}
                        label="Known scanner prefix"
                        value={prefix || 'none'}
                        onChange={(value) => {
                          clearLookup();
                          setPrefix(value === 'none' ? '' : value);
                        }}
                        options={[
                          { value: 'none', label: 'None (default)' },
                          {
                            value: ']Q3',
                            label: 'AIM ]Q3 — enable only after testing the device',
                          },
                        ]}
                      />
                    )}
                  </Field>
                  <Footnote>
                    Only the selected known prefix and one terminal CR/LF are removed. Case and
                    punctuation are preserved. Input is captured only while focused here.
                  </Footnote>
                </div>
              </Disclosure>

              <div className="flex flex-wrap gap-2.5">
                <Button disabled={busy || !payload}>
                  {busy ? 'Looking up…' : 'Resolve QR'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={camera || busy}
                  onClick={() => void startCamera()}
                >
                  Use camera
                </Button>
                {camera ? (
                  <Button type="button" variant="secondary" onClick={stopCamera}>
                    Stop camera
                  </Button>
                ) : null}
              </div>

              <video
                ref={video}
                muted
                playsInline
                aria-label="Camera preview"
                className={camera ? 'max-h-80 w-full rounded-xl bg-black' : 'hidden'}
              />

              {cameraMessage ? <WarningNotice role="status">{cameraMessage}</WarningNotice> : null}
            </Stack>
          </form>
        </Panel>

        {error ? <ErrorNotice message={error} /> : null}

        {result?.payloadVersion===2 ? <UnitIdentityResult unit={result}/> : null}
        {result?.payloadVersion===1 ? (
          <section
            aria-label="Resolved stock lot"
            className={cn(card, 'border-brand/15 bg-brand-tint p-6')}
          >
            <p className="font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
              Resolved stock lot
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] break-words text-brand-deep">
              {result.productName} · {result.variantName}
            </h2>

            <div className="mt-3 space-y-1.5">
              <Code className="block text-sm text-ink">
                Product {result.productCode ?? 'Code not assigned'} · Lot{' '}
                {result.lotCode ?? 'Code not assigned'}
              </Code>
              <span className="group flex items-start gap-2">
                <Code className="text-sm text-ink">{result.fullSku}</Code>
                <CopyButton value={result.fullSku} label="supplier SKU" />
              </span>
              <Code className="block text-ink">Batch {result.publicBatchCode}</Code>
            </div>

            <div className="mt-4 space-y-1">
              <p className="font-display text-lg font-semibold tracking-[-0.03em] text-usable">
                Usable availability: {result.usable}
              </p>
              {result.damaged !== undefined ? (
                <p className="font-sans text-sm tracking-[-0.02em] text-damaged">
                  Damaged lot quantity: {result.damaged}
                </p>
              ) : null}
            </div>

            {result.supplierName ? (
              <p className="mt-3 font-sans text-sm tracking-[-0.02em] text-ink">
                {result.supplierName} · {result.sourceName}
              </p>
            ) : null}

            <Footnote className="mt-3">
              <Code tone="muted" className="block">
                Lot {result.lotId} · Origin {result.originId}
              </Code>
              <span className="mt-1.5 block">
                Local data as of {formatDateTime(result.dataAsOf)}. This shared QR does not prove
                the state of an individual item.
              </span>
            </Footnote>
          </section>
        ) : null}

        <Panel
          title="Exact manual lookup"
          description="No approximate matches or new stock identities are created."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const source = sources.find((item) => item.id === sourceId);
              if (source) {
                void resolve(
                  { sourceId, originId: source.originId, fullSku, publicBatchCode: batch },
                  'qr/manual',
                );
              }
            }}
          >
            <Stack gap="tight">
              <Field label="Stock source">
                {(id) => (
                  <Select
                    id={id}
                    required
                    label="Stock source"
                    placeholder="Choose source"
                    value={sourceId}
                    onChange={(value) => {
                      clearLookup();
                      setSourceId(value);
                    }}
                    options={sources.map((source) => ({
                      value: source.id,
                      label: `${source.name} · ${source.code}`,
                    }))}
                  />
                )}
              </Field>

              {sourceId ? (
                <Footnote>
                  <Code tone="muted">
                    Origin {sources.find((source) => source.id === sourceId)?.originId}
                  </Code>
                </Footnote>
              ) : null}

              <Field label="Exact saved SKU">
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={400}
                    value={fullSku}
                    onChange={(event) => {
                      clearLookup();
                      setSku(event.target.value);
                    }}
                  />
                )}
              </Field>

              <Field label="Exact batch code">
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={64}
                    value={batch}
                    onChange={(event) => {
                      clearLookup();
                      setBatch(event.target.value);
                    }}
                  />
                )}
              </Field>

              <Button disabled={busy}>Look up exact lot</Button>
            </Stack>
          </form>
        </Panel>
      </div>
    </Page>
  );
}
