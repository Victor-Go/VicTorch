import { createLtEncoder, splitIntoBlocks } from '../fountain';
import {
  REDUNDANCY_LEVELS, bodyCapacity, conservativeFor, crc32, encodeMeta,
  type FramePlan, type GridSpec,
} from '../frame';

export const META_LEAD = 3;
export const META_INTERVAL = 16;

export type FileSourceOptions = {
  data: Uint8Array;
  name: string;
  spec: GridSpec;
  /** index into REDUNDANCY_LEVELS: the planned redundancy, used for progress and time estimates only; sending never stops by itself */
  redundancyIdx: number;
  transferId?: number;
  seedBase?: number;
};

export type FileSource = {
  info: { k: number; blockSize: number; fileSize: number; plannedData: number; transferId: number };
  next: () => FramePlan;
  progress: () => { sentData: number; plannedData: number };
};

const randomU32 = () => Math.floor(Math.random() * 4294967296) >>> 0;

export const createFileSource = (o: FileSourceOptions): FileSource => {
  if (o.data.length === 0) throw new Error('empty file');
  const blockSize = bodyCapacity(o.spec.nIdx, o.spec.cIdx);
  if (blockSize <= 0) throw new Error('grid too small');
  const blocks = splitIntoBlocks(o.data, blockSize);
  const k = blocks.length;
  const encoder = createLtEncoder(blocks);
  const transferId = o.transferId ?? Math.floor(Math.random() * 65536);
  const seedBase = o.seedBase ?? randomU32();
  const plannedData = Math.ceil(k * (1 + REDUNDANCY_LEVELS[o.redundancyIdx]));

  const cons = conservativeFor(o.spec);
  const metaBody = encodeMeta(
    { fileSize: o.data.length, blockCount: k, blockSize, fileCrc: crc32(o.data), nIdx: o.spec.nIdx, cIdx: o.spec.cIdx, name: o.name },
    bodyCapacity(cons.nIdx, cons.cIdx),
  );
  const metaPlan = (): FramePlan => ({ type: 1, nIdx: cons.nIdx, cIdx: cons.cIdx, transferId, arg: 0, body: metaBody });

  let metaLeft = META_LEAD;
  let sinceMeta = 0;
  let sentData = 0;

  return {
    info: { k, blockSize, fileSize: o.data.length, plannedData, transferId },
    progress: () => ({ sentData, plannedData }),
    next: () => {
      if (metaLeft > 0) {
        metaLeft--;
        sinceMeta = 0;
        return metaPlan();
      }
      if (sinceMeta >= META_INTERVAL) {
        sinceMeta = 0;
        return metaPlan();
      }
      const seed = (seedBase + sentData) >>> 0;
      sentData++;
      sinceMeta++;
      return {
        type: 0, nIdx: o.spec.nIdx, cIdx: o.spec.cIdx, transferId, arg: seed, body: encoder.encode(seed),
      };
    },
  };
};
