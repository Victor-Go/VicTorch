import { crc32 } from './crc';
import { decodeHeader, encodeHeader, HEADER_BYTES, type FrameHeader, type FrameType } from './header';
import { capacityBytes } from './params';

export type FramePlan = {
  type: FrameType;
  nIdx: number;
  cIdx: number;
  transferId: number;
  arg: number;
  body: Uint8Array;
};

export type ParsedFrame = { header: FrameHeader; body: Uint8Array };

export const buildFrame = (plan: FramePlan): { header: Uint8Array; region: Uint8Array } => {
  const cap = capacityBytes(plan.nIdx, plan.cIdx);
  if (plan.body.length + 4 > cap) throw new Error(`body ${plan.body.length}B exceeds capacity ${cap - 4}B`);
  const header = encodeHeader({ ...plan, length: plan.body.length });
  const region = new Uint8Array(cap);
  region.set(plan.body, 0);
  new DataView(region.buffer).setUint32(plan.body.length, crc32(plan.body, crc32(header)));
  return { header, region };
};

export const parseFrame = (headerBytes: Uint8Array, region: Uint8Array): ParsedFrame | null => {
  const header = decodeHeader(headerBytes);
  if (!header) return null;
  if (header.length + 4 > region.length || region.length !== capacityBytes(header.nIdx, header.cIdx)) return null;
  const body = region.subarray(0, header.length);
  const stored = new DataView(region.buffer, region.byteOffset + header.length, 4).getUint32(0);
  const actual = crc32(body, crc32(headerBytes.subarray(0, HEADER_BYTES)));
  if (stored !== actual) return null;
  return { header, body: body.slice() };
};
