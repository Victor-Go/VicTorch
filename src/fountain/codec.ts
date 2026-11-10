import { symbolIndices } from './symbol';

export const splitIntoBlocks = (data: Uint8Array, blockSize: number): Uint8Array[] => {
  const k = Math.ceil(data.length / blockSize);
  return Array.from({ length: k }, (_, i) => {
    const b = new Uint8Array(blockSize);
    b.set(data.subarray(i * blockSize, (i + 1) * blockSize));
    return b;
  });
};

export const createLtEncoder = (blocks: Uint8Array[]) => {
  const k = blocks.length;
  const size = blocks[0].length;
  return {
    encode: (seed: number): Uint8Array => {
      const out = new Uint8Array(size);
      for (const i of symbolIndices(k, seed)) {
        const b = blocks[i];
        for (let j = 0; j < size; j++) out[j] ^= b[j];
      }
      return out;
    },
  };
};

type Equation = { pending: number[]; data: Uint8Array };

export const createLtDecoder = (k: number, blockSize: number) => {
  const blocks: (Uint8Array | null)[] = new Array(k).fill(null);
  const seen = new Set<number>();
  const waiting: Map<number, Equation[]> = new Map();
  let solved = 0;

  const xorInto = (dst: Uint8Array, src: Uint8Array) => {
    for (let i = 0; i < dst.length; i++) dst[i] ^= src[i];
  };

  const resolve = (index: number, data: Uint8Array) => {
    const queue: [number, Uint8Array][] = [[index, data]];
    while (queue.length) {
      const [idx, d] = queue.pop()!;
      if (blocks[idx]) continue;
      blocks[idx] = d;
      solved++;
      const eqs = waiting.get(idx);
      waiting.delete(idx);
      if (!eqs) continue;
      for (const eq of eqs) {
        if (eq.data === d) continue;
        const p = eq.pending.indexOf(idx);
        if (p < 0) continue;
        eq.pending.splice(p, 1);
        xorInto(eq.data, d);
        if (eq.pending.length === 1) queue.push([eq.pending[0], eq.data]);
      }
    }
  };

  return {
    /** Returns true when the symbol was new (not a repeat of a seed already seen). */
    add: (seed: number, data: Uint8Array): boolean => {
      if (data.length !== blockSize || seen.has(seed >>> 0)) return false;
      seen.add(seed >>> 0);
      const d = data.slice();
      const pending: number[] = [];
      for (const i of symbolIndices(k, seed)) {
        const known = blocks[i];
        if (known) xorInto(d, known);
        else pending.push(i);
      }
      if (pending.length === 0) return true;
      if (pending.length === 1) {
        resolve(pending[0], d);
        return true;
      }
      const eq: Equation = { pending, data: d };
      for (const i of pending) {
        const list = waiting.get(i);
        if (list) list.push(eq);
        else waiting.set(i, [eq]);
      }
      return true;
    },
    receivedCount: (): number => seen.size,
    isComplete: (): boolean => solved === k,
    solvedCount: (): number => solved,
    assemble: (fileSize: number): Uint8Array | null => {
      if (solved !== k) return null;
      const out = new Uint8Array(k * blockSize);
      blocks.forEach((b, i) => out.set(b!, i * blockSize));
      return out.subarray(0, fileSize).slice();
    },
  };
};
