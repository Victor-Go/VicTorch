import type { WorkerResult } from './decodeWorker';

/**
 * Feeds bitmaps to the decode worker. While the worker is busy only the newest bitmap is kept;
 * older ones are dropped so decoding always works on the latest frame.
 */
export const createDecoder = (onResult: (r: WorkerResult) => void) => {
  const worker = new Worker(new URL('./decodeWorker.ts', import.meta.url), { type: 'module' });
  let busy = false;
  let pending: ImageBitmap | null = null;
  let dropped = 0;

  const post = (bmp: ImageBitmap) => {
    busy = true;
    worker.postMessage(bmp, [bmp]);
  };

  worker.onmessage = (e: MessageEvent<WorkerResult>) => {
    busy = false;
    onResult(e.data);
    if (pending) {
      const next = pending;
      pending = null;
      post(next);
    }
  };

  return {
    submit: (bmp: ImageBitmap) => {
      if (!busy) return post(bmp);
      if (pending) {
        pending.close();
        dropped++;
      }
      pending = bmp;
    },
    droppedFrames: () => dropped,
    terminate: () => {
      pending?.close();
      pending = null;
      worker.terminate();
    },
  };
};
