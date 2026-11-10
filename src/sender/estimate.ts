import { REDUNDANCY_LEVELS, bodyCapacity } from '../frame';
import { META_INTERVAL, META_LEAD } from './fileSource';

export const blockCount = (fileSize: number, nIdx: number, cIdx: number): number =>
  Math.max(1, Math.ceil(fileSize / bodyCapacity(nIdx, cIdx)));

/** Total frames (data + metadata) a finite send will display. */
export const totalFrames = (k: number, redundancyIdx: number): number => {
  const data = Math.ceil(k * (1 + REDUNDANCY_LEVELS[redundancyIdx]));
  return data + META_LEAD + Math.floor(data / META_INTERVAL);
};

/** Frames needed for a lossless receiver to finish in endless mode (about 25% decoding overhead). */
export const minimumFramesForEndless = (k: number): number => totalFrames(k, 0) + Math.ceil(k * 0.15);

export const estimateSeconds = (frames: number, fps: number): number => frames / fps;
