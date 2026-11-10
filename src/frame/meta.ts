export type Meta = {
  fileSize: number;
  blockCount: number;
  blockSize: number;
  fileCrc: number;
  nIdx: number;
  cIdx: number;
  name: string;
};

const FIXED = 18;
const META_VERSION = 1;

const truncateUtf8 = (s: string, maxBytes: number): Uint8Array => {
  const enc = new TextEncoder();
  let out = '';
  let used = 0;
  for (const ch of s) {
    const n = enc.encode(ch).length;
    if (used + n > maxBytes) break;
    out += ch;
    used += n;
  }
  return enc.encode(out);
};

export const encodeMeta = (m: Meta, maxBytes: number): Uint8Array => {
  const name = truncateUtf8(m.name, Math.min(255, Math.max(0, maxBytes - FIXED)));
  const b = new Uint8Array(FIXED + name.length);
  const dv = new DataView(b.buffer);
  b[0] = META_VERSION;
  dv.setUint32(1, m.fileSize);
  dv.setUint32(5, m.blockCount);
  dv.setUint16(9, m.blockSize);
  dv.setUint32(11, m.fileCrc);
  b[15] = m.nIdx;
  b[16] = m.cIdx;
  b[17] = name.length;
  b.set(name, FIXED);
  return b;
};

export const decodeMeta = (b: Uint8Array): Meta | null => {
  if (b.length < FIXED || b[0] !== META_VERSION) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const nameLen = b[17];
  if (b.length < FIXED + nameLen) return null;
  const meta: Meta = {
    fileSize: dv.getUint32(1),
    blockCount: dv.getUint32(5),
    blockSize: dv.getUint16(9),
    fileCrc: dv.getUint32(11),
    nIdx: b[15],
    cIdx: b[16],
    name: new TextDecoder().decode(b.subarray(FIXED, FIXED + nameLen)),
  };
  if (meta.blockSize === 0 || meta.blockCount === 0 || meta.fileSize === 0) return null;
  if (meta.blockCount !== Math.ceil(meta.fileSize / meta.blockSize)) return null;
  return meta;
};
