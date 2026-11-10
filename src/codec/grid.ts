import { HEADER_BYTES } from '../frame/header';
import { CELL_BLACK, CELL_WHITE, getLayout } from './layout';

const masks = new Map<string, Uint8Array>();

/** Fixed pseudo-random byte stream used to whiten header and payload. */
const whitenMask = (len: number, salt: number): Uint8Array => {
  const key = `${salt}:${len}`;
  const hit = masks.get(key);
  if (hit) return hit;
  const out = new Uint8Array(len);
  let s = (0x9e3779b9 ^ Math.imul(salt, 0x85ebca6b)) >>> 0 || 1;
  for (let i = 0; i < len; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    out[i] = (s >>> 8) & 255;
  }
  masks.set(key, out);
  return out;
};

export const maskHeader = (h: Uint8Array): Uint8Array => {
  const m = whitenMask(HEADER_BYTES, 1);
  return h.map((v, i) => v ^ m[i]);
};

export const maskRegion = (r: Uint8Array): Uint8Array => {
  const m = whitenMask(r.length, 2);
  return r.map((v, i) => v ^ m[i]);
};

export const encodeGrid = (nIdx: number, cIdx: number, header: Uint8Array, region: Uint8Array): Uint8Array => {
  const L = getLayout(nIdx, cIdx);
  if (region.length !== L.capacity) throw new Error('region size mismatch');
  const cells = new Uint8Array(L.n * L.n);
  L.zoneCells.forEach((idx, i) => (cells[idx] = L.zoneColor[i]));
  L.calibCells.forEach((idx, i) => (cells[idx] = L.calibColor[i]));

  const hb = maskHeader(header);
  L.header.forEach((idx, i) => (cells[idx] = (hb[i >> 3] >> (7 - (i & 7))) & 1 ? CELL_BLACK : CELL_WHITE));

  const rb = maskRegion(region);
  const totalBits = rb.length * 8;
  L.payload.forEach((idx, j) => {
    let v = 0;
    for (let b = 0; b < L.bpc; b++) {
      const bit = j * L.bpc + b;
      v = (v << 1) | (bit < totalBits ? (rb[bit >> 3] >> (7 - (bit & 7))) & 1 : 0);
    }
    cells[idx] = v;
  });
  return cells;
};

/** Inverse of the payload packing: palette indices of payload cells -> unmasked region bytes. */
export const decodePayloadIndices = (nIdx: number, cIdx: number, values: Uint8Array): Uint8Array => {
  const L = getLayout(nIdx, cIdx);
  const out = new Uint8Array(L.capacity);
  const totalBits = out.length * 8;
  for (let j = 0; j < values.length; j++) {
    for (let b = 0; b < L.bpc; b++) {
      const bit = j * L.bpc + b;
      if (bit >= totalBits) break;
      if ((values[j] >> (L.bpc - 1 - b)) & 1) out[bit >> 3] |= 0x80 >> (bit & 7);
    }
  }
  return maskRegion(out);
};

/** Header bits (true = black) -> unmasked header bytes. */
export const decodeHeaderBits = (bits: boolean[]): Uint8Array => {
  const out = new Uint8Array(HEADER_BYTES);
  bits.forEach((b, i) => {
    if (b) out[i >> 3] |= 0x80 >> (i & 7);
  });
  return maskHeader(out);
};
