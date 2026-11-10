import { GRID_SIZES } from '../frame/params';
import type { RGBAImage } from './render';
import type { Pt } from './homography';

export type Finder = { x: number; y: number; size: number; hits: number };

export const toGray = (img: RGBAImage): Uint8Array => {
  const { width, height, data } = img;
  const g = new Uint8Array(width * height);
  for (let i = 0, o = 0; i < g.length; i++, o += 4) g[i] = (data[o] * 77 + data[o + 1] * 150 + data[o + 2] * 29) >> 8;
  return g;
};

/** Adaptive (local mean) threshold. Result: 1 = dark. */
export const binarize = (gray: Uint8Array, w: number, h: number): Uint8Array => {
  const W = w + 1;
  const integral = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + row;
    }
  }
  const half = Math.max(8, Math.round(w / 16));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w, x + half + 1);
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = gray[y * w + x] < mean * 0.85 ? 1 : 0;
    }
  }
  return out;
};

/** Do five run lengths (dark, light, dark, light, dark) look like 1:1:3:1:1? Returns module size or 0. */
const finderRatio = (a: number, b: number, c: number, d: number, e: number): number => {
  const u = (a + b + c + d + e) / 7;
  if (u < 1) return 0;
  const tol = 0.7 * u;
  if (Math.abs(a - u) > tol || Math.abs(b - u) > tol || Math.abs(d - u) > tol || Math.abs(e - u) > tol) return 0;
  if (Math.abs(c - 3 * u) > 1.3 * u) return 0;
  return u;
};

/** Check the pattern along a line through (cx, cy). Returns centre along the axis (edge coordinates) and module size. */
const crossCheck = (
  bin: Uint8Array, w: number, h: number, cx: number, cy: number, vertical: boolean,
): { center: number; u: number } | null => {
  const pos = vertical ? cy : cx;
  const limit = vertical ? h : w;
  const at = (t: number) => (vertical ? bin[t * w + cx] : bin[cy * w + t]);
  if (!at(pos)) return null;
  let i = pos;
  while (i >= 0 && at(i)) i--;
  const start = i + 1; // first pixel of centre run
  const up0 = pos - i; // dark pixels up to and including centre pixel
  let j = i;
  while (j >= 0 && !at(j)) j--;
  const up1 = i - j;
  let k = j;
  while (k >= 0 && at(k)) k--;
  const up2 = j - k;
  let f = pos + 1;
  while (f < limit && at(f)) f++;
  const end = f; // one past last pixel of centre run
  let g = f;
  while (g < limit && !at(g)) g++;
  const down1 = g - f;
  let m = g;
  while (m < limit && at(m)) m++;
  const down2 = m - g;
  void up0;
  if (up1 === 0 || up2 === 0 || down1 === 0 || down2 === 0) return null;
  const c = end - start;
  const u = finderRatio(up2, up1, c, down1, down2);
  if (!u) return null;
  return { center: start + c / 2, u };
};

export const findFinders = (bin: Uint8Array, w: number, h: number): Finder[] => {
  const found: Finder[] = [];
  const add = (x: number, y: number, size: number) => {
    for (const f of found) {
      if (Math.hypot(f.x - x, f.y - y) < 3.5 * Math.max(f.size, size)) {
        const t = f.hits + 1;
        f.x = (f.x * f.hits + x) / t;
        f.y = (f.y * f.hits + y) / t;
        f.size = (f.size * f.hits + size) / t;
        f.hits = t;
        return;
      }
    }
    found.push({ x, y, size, hits: 1 });
  };

  const runs = [0, 0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let color = bin[base];
    let runStart = 0;
    let count = 0; // runs recorded in ring
    const history: number[] = [];
    const starts: number[] = [];
    for (let x = 1; x <= w; x++) {
      const v = x < w ? bin[base + x] : color ^ 1;
      if (v === color) continue;
      history.push(x - runStart);
      starts.push(runStart);
      count++;
      if (color === 1 && count >= 5) {
        for (let q = 0; q < 5; q++) runs[q] = history[count - 5 + q];
        const u = finderRatio(runs[0], runs[1], runs[2], runs[3], runs[4]);
        if (u) {
          const cStart = starts[count - 3];
          const cx = Math.floor(cStart + runs[2] / 2);
          const vert = crossCheck(bin, w, h, cx, y, true);
          if (vert) {
            const cy = Math.floor(vert.center);
            const hor = crossCheck(bin, w, h, cx, cy, false);
            if (hor) add(hor.center, vert.center, (u + vert.u + hor.u) / 3);
          }
        }
      }
      color = v;
      runStart = x;
    }
  }
  return found;
};

const sortCyclic = (pts: Finder[]): Finder[] => {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
};

/** Ranked candidate quadrilaterals (cyclic, clockwise on screen) built from finder candidates. */
export const selectQuads = (cands: Finder[], maxQuads = 6): Pt[][] => {
  const pool = [...cands].sort((a, b) => b.hits - a.hits).slice(0, 12);
  const scored: { score: number; quad: Pt[] }[] = [];
  for (let a = 0; a < pool.length; a++)
    for (let b = a + 1; b < pool.length; b++)
      for (let c = b + 1; c < pool.length; c++)
        for (let d = c + 1; d < pool.length; d++) {
          const q = sortCyclic([pool[a], pool[b], pool[c], pool[d]]);
          const sides = q.map((p, i) => Math.hypot(p.x - q[(i + 1) % 4].x, p.y - q[(i + 1) % 4].y));
          const sMin = Math.min(...sides);
          const sMax = Math.max(...sides);
          const uMin = Math.min(...q.map((p) => p.size));
          const uMax = Math.max(...q.map((p) => p.size));
          if (sMin / sMax < 0.35 || uMax / uMin > 2.2) continue;
          const diag1 = Math.hypot(q[0].x - q[2].x, q[0].y - q[2].y);
          const diag2 = Math.hypot(q[1].x - q[3].x, q[1].y - q[3].y);
          if (Math.min(diag1, diag2) / Math.max(diag1, diag2) < 0.6) continue;
          const ratio = sides.reduce((s, v) => s + v, 0) / 4 / (q.reduce((s, p) => s + p.size, 0) / 4);
          const nErr = Math.min(...GRID_SIZES.map((n) => Math.abs(ratio / (n - 7) - 1)));
          const hits = q.reduce((s, p) => s + Math.min(p.hits, 6), 0);
          const score = hits * 0.05 - nErr * 2 - (sMax / sMin - 1) - (uMax / uMin - 1);
          scored.push({ score, quad: q.map((p) => [p.x, p.y] as Pt) });
        }
  return scored.sort((x, y) => y.score - x.score).slice(0, maxQuads).map((s) => s.quad);
};
