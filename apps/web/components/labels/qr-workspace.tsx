'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicIdentityLookup, QrLookup, UnitIdentityLookup } from '@dayari/contracts';
import { Camera01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { UnitIdentityResult } from './unit-identity-result';
import { UnitTrackingDrawer } from '../unit-tracking-drawer';
import { useQrPresentation } from '../../lib/qr-presentation';

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
  Icon,
  Input,
  Page,
  PageHeader,
  Panel,
  Select,
  Stack,
  WarningNotice,
  card,
} from '../ui';
import { CodesOnly } from '../../lib/role';
import { CodeNotFound, IdentityResult, lookupIdentity } from '../identity-lookup';

/** Unit Codes use a readable alphabet without 0, O, 1, I or L. */
const UNIT_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
const NOT_A_CODE =
  "That doesn't look like a Dayari code. Product codes start with P, lot codes start with L, unit codes are six characters, and QR labels start with DYI:.";

type Source = { id: string; name: string; code: string; originId: string };

export function QrWorkspace({ initialCode = '' }: { initialCode?: string }) {
  const [payload, setPayload] = useState('');
  const [identity, setIdentity] = useState<PublicIdentityLookup | null>(null);
  const [tracking, setTracking] = useState('');
  const presentation = useQrPresentation();
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
    presentation.cancel();
    requestVersion.current += 1;
    request.current?.abort();
    working.current = false;
    setBusy(false);
    setResult(null);
    setIdentity(null);
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
      // The aborted lookup's finally no longer matches the ticket, so release the
      // in-flight guard here; otherwise a remount (React dev double-mount) never looks up.
      working.current = false;
      generation.current += 1;
      stopper.current?.();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function resolve(body: unknown, path = 'qr/resolve', method: 'GET' | 'POST' = 'POST', qrMethod: 'CAMERA' | 'QR_INPUT' | null = null) {
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
      if (ticket === requestVersion.current) {
        setResult(data);
        if(data.payloadVersion===2 && qrMethod && typeof body==='object' && body && 'payload' in body && typeof body.payload==='string') presentation.record({payload:body.payload,method:qrMethod});
      }
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
    return resolve({ payload: framed },'qr/resolve','POST','QR_INPUT');
  }

  /** Exact Product/Lot Code lookup; 'missing' lets a P… code fall back to a Unit Code. */
  async function findIdentity(code: string): Promise<'found' | 'missing' | 'invalid' | 'failed'> {
    if (working.current) return 'failed';
    working.current = true;
    const ticket = ++requestVersion.current;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setResult(null);
    setIdentity(null);
    try {
      const found = await lookupIdentity(code, controller.signal);
      if (ticket === requestVersion.current && found) setIdentity(found);
      return found ? 'found' : 'invalid';
    } catch (failure) {
      if (failure instanceof CodeNotFound) return 'missing';
      if (ticket === requestVersion.current && !controller.signal.aborted) setError((failure as Error).message);
      return 'failed';
    } finally {
      if (ticket === requestVersion.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }

  /** One input for every printed code: works out which kind it is. */
  async function find(raw = payload) {
    if (camera) stopCamera();
    const text = raw.replace(/(?:\r\n|\r|\n)$/, '').trim();
    if (!text) return;
    if (text.startsWith('DYI:') || (prefix && text.startsWith(prefix))) return scan(text);
    const code = text.toUpperCase().replace(/\s+/g, '');
    if (/^[PL][A-Z0-9]{5}$/.test(code)) {
      const outcome = await findIdentity(code);
      if (outcome === 'found' || outcome === 'failed') return;
      if (outcome === 'missing' && !UNIT_CODE.test(code)) {
        setError('Code not found in this shop. Check the printed code and try again.');
        return;
      }
    }
    if (UNIT_CODE.test(code)) {
      return resolve({}, 'inventory/units/by-code/' + encodeURIComponent(code), 'GET');
    }
    clearLookup();
    setError(NOT_A_CODE);
  }

  useEffect(() => {
    if (!initialCode) return;
    setPayload(initialCode);
    void find(initialCode);
    // Runs once per searched code; the workspace remounts for a new code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

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
        void resolve({ payload: text },'qr/resolve','POST','CAMERA');
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
        title="Scan & find"
        description="Scan a label or type any Dayari code. Looking up never changes stock."
      />

      <div className="mt-6 space-y-4">
        <Panel
          label="Scan & find"
          title="Scan a label or type a code"
          description="Works with product codes (P…), lot codes (L…), six-character unit codes and QR labels. Looking up never changes stock."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void find();
            }}
          >
            <Stack gap="tight">
              <Field label="Code or QR label">
                {(id) => (
                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <Input
                      id={id}
                      autoFocus
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={128}
                      value={payload}
                      placeholder="P7K2M9, L8M4Q2, A7K2M9 — or scan a label"
                      className="min-w-0 flex-1 font-mono"
                      onChange={(event) => {
                        clearLookup();
                        setPayload(event.target.value);
                      }}
                      onPaste={(event) => {
                        event.preventDefault();
                        clearLookup();
                        setPayload(event.clipboardData.getData('text').replace(/(?:\r\n|\r|\n)$/, ''));
                      }}
                    />
                    <div className="flex shrink-0 gap-2.5">
                      <Button disabled={busy || !payload.trim()} className="flex-1 sm:flex-none">
                        <Icon icon={Search01Icon} size={16} />
                        {busy ? 'Looking up…' : 'Find'}
                      </Button>
                      {camera ? (
                        <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={stopCamera}>
                          <Icon icon={Camera01Icon} size={16} />
                          Stop camera
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          className="flex-1 sm:flex-none"
                          disabled={busy}
                          onClick={() => void startCamera()}
                        >
                          <Icon icon={Camera01Icon} size={16} />
                          Use camera
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Field>

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

        {identity ? <IdentityResult result={identity} /> : null}

        {result?.payloadVersion===2 ? <div className="space-y-3"><UnitIdentityResult unit={result}/><Button variant="secondary" onClick={()=>setTracking(result.unitId)}>View unit history</Button>
          {presentation.state!=='idle'?<section aria-label="Scan history" className="space-y-2 text-sm"><p>{presentation.state==='saved'?'QR presentation recorded. No stock was changed.':presentation.state==='saving'?'Saving QR presentation history…':'Identity resolved; QR presentation history was not confirmed.'}</p>{presentation.state==='error'?<><p className="text-grey-2">{presentation.error}</p><Button variant="secondary" onClick={presentation.retry}>Retry scan record</Button></>:null}</section>:null}
        </div> : null}
        {result?.payloadVersion===1 ? (
          <section
            aria-label="Stock found"
            className={cn(card, 'border-brand/15 bg-brand-tint p-6')}
          >
            <p className="font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
              Stock found
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] break-words text-brand-deep">
              {result.productName} · {result.variantName}
            </h2>

            <CodesOnly><div className="mt-3 space-y-1.5">
              <Code className="block text-sm text-ink">
                Product {result.productCode ?? '—'} · Lot{' '}
                {result.lotCode ?? '—'}
              </Code>
              <span className="group flex items-start gap-2">
                <Code className="text-sm text-ink">{result.fullSku}</Code>
                <CopyButton value={result.fullSku} label="supplier code" />
              </span>
              <Code className="block text-ink">Batch {result.publicBatchCode}</Code>
            </div></CodesOnly>

            <div className="mt-4 space-y-1">
              <p className="font-display text-lg font-semibold tracking-[-0.03em] text-usable">
                Usable: {result.usable}
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

        <CodesOnly><Disclosure summary="More lookup options">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Scanner settings"
              description="Only needed if a connected scanner adds extra characters before each code."
            >
              <Stack gap="tight">
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
                        { value: ']Q3', label: 'AIM ]Q3 — enable only after testing the device' },
                      ]}
                    />
                  )}
                </Field>
                <Footnote>
                  Only the selected prefix and one trailing line break are removed. Case and
                  punctuation are kept as scanned.
                </Footnote>
              </Stack>
            </Panel>

            <Panel
              title="Look up by supplier code and batch"
              description="For a label that can't be scanned. Matches must be exact."
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
                  <Field label="Supplier code">
                    {(id) => (
                      <Input
                        id={id}
                        required
                        maxLength={400}
                        value={fullSku}
                        className="font-mono"
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
                        className="font-mono"
                        onChange={(event) => {
                          clearLookup();
                          setBatch(event.target.value);
                        }}
                      />
                    )}
                  </Field>
                  <Button disabled={busy} className="self-start">
                    Look up lot
                  </Button>
                </Stack>
              </form>
            </Panel>
          </div>
        </Disclosure></CodesOnly>
      </div>
      {tracking ? <UnitTrackingDrawer key={tracking} unitId={tracking} onClose={() => setTracking('')} /> : null}
    </Page>
  );
}
