export const splitmix32 = (x: number): number => {
  x = (x + 0x9e3779b9) | 0;
  let z = x ^ (x >>> 16);
  z = Math.imul(z, 0x21f0aaad);
  z ^= z >>> 15;
  z = Math.imul(z, 0x735a2d97);
  z ^= z >>> 15;
  return z >>> 0;
};

/** Returns a function producing uniform floats in [0, 1). */
export const createRng = (seed: number): (() => number) => {
  let a = splitmix32(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
