import { decodeImageToFrame } from '../receiver/pipeline';
import type { ParsedFrame } from '../frame';

export type WorkerResult =
  | { ok: true; frame: ParsedFrame; ms: number }
  | { ok: false; reason: 'nocode' | 'crc' | 'error'; ms: number };

type WorkerScope = {
  onmessage: ((e: MessageEvent<ImageBitmap>) => void) | null;
  postMessage: (m: WorkerResult) => void;
};
const scope = self as unknown as WorkerScope;

let canvas: OffscreenCanvas | null = null;

scope.onmessage = (e) => {
  const bmp = e.data;
  const t0 = performance.now();
  try {
    if (!canvas || canvas.width !== bmp.width || canvas.height !== bmp.height) canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    const out = decodeImageToFrame(img);
    scope.postMessage(out.ok ? { ok: true, frame: out.frame, ms: performance.now() - t0 } : { ok: false, reason: out.reason, ms: performance.now() - t0 });
  } catch {
    scope.postMessage({ ok: false, reason: 'error', ms: performance.now() - t0 });
  } finally {
    bmp.close();
  }
};
