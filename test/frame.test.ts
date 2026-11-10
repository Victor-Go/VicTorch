import { describe, expect, it } from 'vitest';
import {
  CONSERVATIVE_SPEC, GRID_SIZES, buildFrame, capacityBytes, conservativeFor, crc16, crc32,
  decodeHeader, decodeMeta, encodeHeader, encodeMeta, parseFrame, type FramePlan,
} from '../src/frame';

const plan = (over: Partial<FramePlan> = {}): FramePlan => ({
  type: 0, nIdx: 1, cIdx: 1, transferId: 0xbeef, arg: 0xdeadbeef,
  body: Uint8Array.from({ length: capacityBytes(1, 1) - 4 }, (_, i) => (i * 7) & 255), ...over,
});

describe('crc', () => {
  it('matches known vectors', () => {
    const s = new TextEncoder().encode('123456789');
    expect(crc32(s)).toBe(0xcbf43926);
    expect(crc16(s)).toBe(0x29b1);
  });
});

describe('header', () => {
  it('roundtrips', () => {
    const h = { type: 2 as const, nIdx: 4, cIdx: 3, transferId: 1234, arg: 0x01020304, length: 99 };
    expect(decodeHeader(encodeHeader(h))).toEqual(h);
  });
  it('rejects corrupted bytes', () => {
    const b = encodeHeader({ type: 0, nIdx: 0, cIdx: 0, transferId: 1, arg: 2, length: 3 });
    for (let i = 0; i < b.length; i++) {
      const c = b.slice();
      c[i] ^= 0x10;
      expect(decodeHeader(c)).toBeNull();
    }
  });
  it('is readable for the conservative spec regardless of data spec', () => {
    for (let n = 0; n < GRID_SIZES.length; n++) {
      const c = conservativeFor({ nIdx: n, cIdx: 3 });
      expect(c.cIdx).toBe(0);
      expect(c.nIdx).toBe(Math.min(n, CONSERVATIVE_SPEC.nIdx));
      const f = buildFrame({ type: 1, nIdx: c.nIdx, cIdx: c.cIdx, transferId: 7, arg: 0, body: new Uint8Array(10) });
      expect(decodeHeader(f.header)).not.toBeNull();
    }
  });
});

describe('frame', () => {
  it('roundtrips body', () => {
    const p = plan();
    const f = buildFrame(p);
    expect(f.region.length).toBe(capacityBytes(1, 1));
    const parsed = parseFrame(f.header, f.region)!;
    expect(parsed.body).toEqual(p.body);
    expect(parsed.header.arg).toBe(p.arg);
    expect(parsed.header.transferId).toBe(p.transferId);
  });
  it('drops frames with any single corrupted bit in body, crc or header', () => {
    const f = buildFrame(plan({ body: new Uint8Array(100).fill(5) }));
    for (const pos of [0, 50, 99, 100, 103]) {
      const r = f.region.slice();
      r[pos] ^= 1;
      expect(parseFrame(f.header, r)).toBeNull();
    }
    const h = f.header.slice();
    h[3] ^= 1;
    expect(parseFrame(h, f.region)).toBeNull();
  });
  it('rejects oversize body', () => {
    expect(() => buildFrame(plan({ body: new Uint8Array(capacityBytes(1, 1) - 3) }))).toThrow();
  });
});

describe('meta', () => {
  it('roundtrips and truncates names on utf8 boundary', () => {
    const m = { fileSize: 12345, blockCount: 78, blockSize: 160, fileCrc: 0x11223344, nIdx: 2, cIdx: 1, name: '文件.txt' };
    expect(decodeMeta(encodeMeta(m, 200))).toEqual(m);
    const long = { ...m, name: '很长的文件名'.repeat(20) };
    const enc = encodeMeta(long, 40);
    expect(enc.length).toBeLessThanOrEqual(40);
    const dec = decodeMeta(enc)!;
    expect(long.name.startsWith(dec.name)).toBe(true);
    expect(dec.name.length).toBeGreaterThan(0);
  });
});
