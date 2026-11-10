import { REDUNDANCY_LEVELS, bodyCapacity } from '../frame';
import { META_INTERVAL, META_LEAD } from './fileSource';

export const blockCount = (fileSize: number, nIdx: number, cIdx: number): number =>
  Math.max(1, Math.ceil(fileSize / bodyCapacity(nIdx, cIdx)));

/** Planned frames (data + metadata) for a redundancy level; sending continues past this until stopped. */
export const totalFrames = (k: number, redundancyIdx: number): number => {
  const data = Math.ceil(k * (1 + REDUNDANCY_LEVELS[redundancyIdx]));
  return data + META_LEAD + Math.floor(data / META_INTERVAL);
};

export const estimateSeconds = (frames: number, fps: number): number => frames / fps;
