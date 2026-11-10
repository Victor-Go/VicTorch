import { describe, expect, it } from 'vitest';
import { createLtDecoder, createLtEncoder, expectedSymbols, splitIntoBlocks, symbolIndices } from '../src/fountain';

const mulberry = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const makeData = (n: number, seed: number) => {
  const r = mulberry(seed);
  return Uint8Array.from({ length: n }, () => Math.floor(r() * 256));
};

describe('symbolIndices', () => {
  it('is deterministic with distinct in-range indices', () => {
    for (const k of [1, 2, 10, 300]) {
      for (let s = 0; s < 50; s++) {
        const a = symbolIndices(k, s);
        expect(a).toEqual(symbolIndices(k, s));
        expect(new Set(a).size).toBe(a.length);
        expect(a.every((i) => i >= 0 && i < k)).toBe(true);
        expect(a.length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

const run = (size: number, blockSize: number, loss: number, dupRate: number, rngSeed: number) => {
  const data = makeData(size, rngSeed);
  const blocks = splitIntoBlocks(data, blockSize);
  const enc = createLtEncoder(blocks);
  const dec = createLtDecoder(blocks.length, blockSize);
  const r = mulberry(rngSeed + 1);
  const pool: { seed: number; data: Uint8Array }[] = [];
  let seed = Math.floor(r() * 1e9);
  let sent = 0;
  while (!dec.isComplete() && sent < blocks.length * 6 + 200) {
    // emit a small shuffled batch, drop some, duplicate some
    pool.length = 0;
    for (let i = 0; i < 20; i++) {
      const s = seed++;
      pool.push({ seed: s, data: enc.encode(s) });
      sent++;
    }
    pool.sort(() => r() - 0.5);
    for (const p of pool) {
      if (r() < loss) continue;
      dec.add(p.seed, p.data);
      if (r() < dupRate) dec.add(p.seed, p.data);
    }
  }
  return { dec, data, k: blocks.length, sent };
};

describe('LT fountain', () => {
  it('recovers under random loss, reordering and duplication', () => {
    for (const [size, bs, loss] of [[5000, 100, 0.3], [777, 64, 0.5], [30000, 200, 0.1], [90, 100, 0.2]] as const) {
      const { dec, data } = run(size, bs, loss, 0.3, size);
      expect(dec.isComplete()).toBe(true);
      expect(dec.assemble(size)).toEqual(data);
    }
  });
  it('ignores duplicates and does not complete early', () => {
    const data = makeData(1000, 3);
    const blocks = splitIntoBlocks(data, 100);
    const enc = createLtEncoder(blocks);
    const dec = createLtDecoder(blocks.length, 100);
    for (let i = 0; i < 5; i++) dec.add(42, enc.encode(42));
    expect(dec.isComplete()).toBe(false);
    expect(dec.assemble(1000)).toBeNull();
  });
  it('keeps mean overhead reasonable', () => {
    for (const k of [50, 200, 1000]) {
      let total = 0;
      const trials = 20;
      for (let t = 0; t < trials; t++) {
        const blocks = splitIntoBlocks(makeData(k * 8, t), 8);
        const enc = createLtEncoder(blocks);
        const dec = createLtDecoder(k, 8);
        let n = 0;
        while (!dec.isComplete()) dec.add(1000 * t + n, enc.encode(1000 * t + n++));
        total += n / k;
      }
      console.log(`K=${k} mean symbols/K = ${(total / trials).toFixed(3)}`);
      expect(total / trials).toBeLessThan(k >= 200 ? 1.5 : 2.2);
      // the time estimate must not be optimistic compared with what the decoder really needs
      expect(expectedSymbols(k) / k).toBeGreaterThanOrEqual(total / trials);
    }
  });
});
