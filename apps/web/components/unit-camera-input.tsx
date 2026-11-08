'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, ErrorNotice } from './ui';

/** Reads one QR into a draft. Never confirms a checkout or changes stock. */
export function UnitCameraInput({ onRead, onClose }: { onRead: (payload: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null), callback = useRef(onRead);
  const [error, setError] = useState('');
  useEffect(() => { callback.current = onRead; }, [onRead]);
  useEffect(() => {
    let active = true, stream: MediaStream | null = null, controls: { stop: () => void } | null = null;
    const stop = () => { active = false; controls?.stop(); stream?.getTracks().forEach(track => track.stop()); if (video.current) video.current.srcObject = null; };
    void (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error('Camera requires a trusted HTTPS address or localhost. Use the scanner field or Unit Code instead.');
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (!active) { stream.getTracks().forEach(track => track.stop()); return; }
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (!active || !video.current) { stream.getTracks().forEach(track => track.stop()); return; }
        controls = await new BrowserQRCodeReader().decodeFromStream(stream, video.current, result => {
          if (result && active) { const payload = result.getText(); stop(); callback.current(payload); }
        });
        if (!active) controls.stop();
      } catch (failure) {
        const wasActive = active; stop();
        if (wasActive) setError((failure as Error).name === 'NotAllowedError' ? 'Camera permission denied. Use a connected scanner or enter the Unit Code.' : (failure as Error).message);
      }
    })();
    return stop;
  }, []);
  return <section aria-label="Checkout camera" className="space-y-3 rounded-lg border border-black/10 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Scan one individual-unit label</h3><Button variant="secondary" onClick={onClose}>Close checkout camera</Button></div>
    {error ? <ErrorNotice message={error} /> : <video ref={video} muted playsInline className="max-h-72 w-full rounded-lg bg-black" aria-label="Checkout camera view" />}
    <p className="text-xs text-grey-2">A scan adds an eligible item to your draft. Stock changes only after review and confirmation.</p>
  </section>;
}
