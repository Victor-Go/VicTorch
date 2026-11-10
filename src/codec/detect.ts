import { decodeHeader } from '../frame/header';
import { GRID_SIZES } from '../frame/params';
import { binarize, findFinders, selectQuads, toGray } from './finder';
import { decodeHeaderBits, decodePayloadIndices } from './grid';
import { applyHomography, homographyFromQuad, type Homography, type Pt } from './homography';
import { CELL_BLACK, getLayout } from './layout';
import { getPalette } from './palette';
import type { RGBAImage } from './render';

export type RawFrame = { header: Uint8Array; region: Uint8Array; nIdx: number; cIdx: number };

const OFFSETS: Pt[] = [[0, 0], [-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]];

/** Average RGB of cell centre (u, v in cell units) over a few sub-samples. */
const createSampler = (img: RGBAImage, H: Homography) => {
  const { width: w, height: h, data } = img;
  const out = [0, 0, 0];
  return (u: number, v: number): number[] => {
    out[0] = out[1] = out[2] = 0;
    for (const [du, dv] of OFFSETS) {
      const [px, py] = applyHomography(H, u + du, v + dv);
      const fx = Math.min(w - 1.001, Math.max(0, px - 0.5));
      const fy = Math.min(h - 1.001, Math.max(0, py - 0.5));
      const x0 = fx | 0;
      const y0 = fy | 0;
      const ax = fx - x0;
      const ay = fy - y0;
      const o = (y0 * w + x0) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = data[o + ch] * (1 - ax) + data[o + 4 + ch] * ax;
        const bot = data[o + w * 4 + ch] * (1 - ax) + data[o + w * 4 + 4 + ch] * ax;
        out[ch] += top * (1 - ay) + bot * ay;
      }
    }
    out[0] /= OFFSETS.length;
    out[1] /= OFFSETS.length;
    out[2] /= OFFSETS.length;
    return out;
  };
};

const luma = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

const tryHypothesis = (img: RGBAImage, pts: Pt[], nIdx: number): RawFrame | null => {
  const n = GRID_SIZES[nIdx];
  const src: Pt[] = [[3.5, 3.5], [n - 3.5, 3.5], [n - 3.5, n - 3.5], [3.5, n - 3.5]];
  const H = homographyFromQuad(src, pts);
  if (!H) return null;
  const sample = createSampler(img, H);
  const L0 = getLayout(nIdx, 0);

  let lb = 0, nb = 0, lw = 0, nw = 0;
  L0.zoneCells.forEach((idx, i) => {
    const l = luma(sample((idx % n) + 0.5, Math.floor(idx / n) + 0.5));
    if (L0.zoneColor[i] === CELL_BLACK) {
      lb += l;
      nb++;
    } else {
      lw += l;
      nw++;
    }
  });
  lb /= nb;
  lw /= nw;
  if (lw - lb < 40) return null;
  const thr = (lb + lw) / 2;

  const bits = Array.from(L0.header, (idx) => luma(sample((idx % n) + 0.5, Math.floor(idx / n) + 0.5)) < thr);
  const header = decodeHeaderBits(bits);
  const parsed = decodeHeader(header);
  if (!parsed || parsed.nIdx !== nIdx) return null;

  const { cIdx } = parsed;
  const L = getLayout(nIdx, cIdx);
  const C = L.colors;
  const sums = new Float64Array(C * 3);
  const counts = new Float64Array(C);
  L.calibCells.forEach((idx, i) => {
    const c = sample((idx % n) + 0.5, Math.floor(idx / n) + 0.5);
    const k = L.calibColor[i];
    sums[k * 3] += c[0];
    sums[k * 3 + 1] += c[1];
    sums[k * 3 + 2] += c[2];
    counts[k]++;
  });
  const refs = new Float64Array(C * 3);
  const nominal = getPalette(cIdx);
  for (let k = 0; k < C; k++) {
    for (let ch = 0; ch < 3; ch++) refs[k * 3 + ch] = counts[k] ? sums[k * 3 + ch] / counts[k] : nominal[k][ch];
  }

  const values = new Uint8Array(L.payload.length);
  L.payload.forEach((idx, j) => {
    const c = sample((idx % n) + 0.5, Math.floor(idx / n) + 0.5);
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < C; k++) {
      const d = (c[0] - refs[k * 3]) ** 2 + (c[1] - refs[k * 3 + 1]) ** 2 + (c[2] - refs[k * 3 + 2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    values[j] = best;
  });
  return { header, region: decodePayloadIndices(nIdx, cIdx, values), nIdx, cIdx };
};

/** Locate a grid code in the image and read header + payload bytes (frame CRC is verified by the caller). */
export const detectAndSample = (img: RGBAImage): RawFrame | null => {
  const gray = toGray(img);
  const bin = binarize(gray, img.width, img.height);
  const quads = selectQuads(findFinders(bin, img.width, img.height));
  for (const quad of quads) {
    for (let rot = 0; rot < 4; rot++) {
      const pts = [0, 1, 2, 3].map((i) => quad[(i + rot) % 4]);
      for (let nIdx = 0; nIdx < GRID_SIZES.length; nIdx++) {
        const r = tryHypothesis(img, pts, nIdx);
        if (r) return r;
      }
    }
  }
  return null;
};
