import { crc16 } from './crc';
import { COLOR_COUNTS, GRID_SIZES } from './params';

export const HEADER_BYTES = 12;
export const MAGIC = 0x56;

export const FrameTypes = { DATA: 0, META: 1, PROBE: 2, PROBE_GAP: 3, PROBE_END: 4 } as const;
export type FrameType = 0 | 1 | 2 | 3 | 4;

export type FrameHeader = {
  type: FrameType;
  nIdx: number;
  cIdx: number;
  transferId: number;
  arg: number;
  length: number;
};

export const encodeHeader = (h: FrameHeader): Uint8Array => {
  const b = new Uint8Array(HEADER_BYTES);
  const dv = new DataView(b.buffer);
  b[0] = (h.type << 5) | (h.nIdx << 2) | h.cIdx;
  dv.setUint16(1, h.transferId & 0xffff);
  dv.setUint32(3, h.arg >>> 0);
  dv.setUint16(7, h.length & 0xffff);
  dv.setUint16(9, crc16(b.subarray(0, 9)));
  b[11] = MAGIC;
  return b;
};

export const decodeHeader = (b: Uint8Array): FrameHeader | null => {
  if (b.length < HEADER_BYTES || b[11] !== MAGIC) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint16(9) !== crc16(b.subarray(0, 9))) return null;
  const type = b[0] >> 5;
  const nIdx = (b[0] >> 2) & 7;
  const cIdx = b[0] & 3;
  if (type > 4 || nIdx >= GRID_SIZES.length || cIdx >= COLOR_COUNTS.length) return null;
  return {
    type: type as FrameType,
    nIdx,
    cIdx,
    transferId: dv.getUint16(1),
    arg: dv.getUint32(3),
    length: dv.getUint16(7),
  };
};
