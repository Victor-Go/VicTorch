import { COLOR_COUNTS, GRID_SIZES, HEADER_CELLS, HEADER_COLS, HEADER_ROWS, ZONE, capacityBytes } from '../frame/params';

export const CELL_BLACK = 250;
export const CELL_WHITE = 251;

export const KIND_PAYLOAD = 0;
export const KIND_ZONE = 1;
export const KIND_CALIB = 2;
export const KIND_HEADER = 3;

export type Layout = {
  n: number;
  colors: number;
  bpc: number;
  capacity: number;
  kind: Uint8Array;
  /** Cell indices (r*n+c) of payload cells, in fill order. */
  payload: Int32Array;
  header: Int32Array;
  calibCells: Int32Array;
  calibColor: Uint8Array;
  /** Finder zone cells with a fixed colour: indices and CELL_BLACK / CELL_WHITE. */
  zoneCells: Int32Array;
  zoneColor: Uint8Array;
};

/** Colour of zone-local cell (lr, lc) with both in 0..7. */
export const zoneColor = (lr: number, lc: number): number => {
  if (lr > 6 || lc > 6) return CELL_WHITE;
  const ring = lr === 0 || lr === 6 || lc === 0 || lc === 6;
  const core = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
  return ring || core ? CELL_BLACK : CELL_WHITE;
};

const cache = new Map<number, Layout>();

export const getLayout = (nIdx: number, cIdx: number): Layout => {
  const key = nIdx * 8 + cIdx;
  const hit = cache.get(key);
  if (hit) return hit;
  const n = GRID_SIZES[nIdx];
  const colors = COLOR_COUNTS[cIdx];
  const kind = new Uint8Array(n * n);
  const zoneIdx: number[] = [];
  const zoneCol: number[] = [];
  const calibIdx: number[] = [];
  const calibCol: number[] = [];
  const headerIdx: number[] = [];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const lr = r < ZONE ? r : r >= n - ZONE ? n - 1 - r : -1;
      const lc = c < ZONE ? c : c >= n - ZONE ? n - 1 - c : -1;
      if (lr >= 0 && lc >= 0) {
        kind[r * n + c] = KIND_ZONE;
        zoneIdx.push(r * n + c);
        zoneCol.push(zoneColor(lr, lc));
      }
    }
  }
  const strip = (cells: [number, number][]) => {
    cells.forEach(([r, c], k) => {
      kind[r * n + c] = KIND_CALIB;
      calibIdx.push(r * n + c);
      calibCol.push(k % colors);
    });
  };
  const span = Array.from({ length: n - 2 * ZONE }, (_, i) => i + ZONE);
  strip(span.map((c) => [0, c]));
  strip(span.map((c) => [n - 1, c]));
  strip(span.map((r) => [r, 0]));
  strip(span.map((r) => [r, n - 1]));

  for (let r = 1; r <= HEADER_ROWS; r++) {
    for (let c = ZONE; c < ZONE + HEADER_COLS; c++) {
      kind[r * n + c] = KIND_HEADER;
      headerIdx.push(r * n + c);
    }
  }
  const payload: number[] = [];
  for (let i = 0; i < n * n; i++) if (kind[i] === KIND_PAYLOAD) payload.push(i);

  const layout: Layout = {
    n,
    colors,
    bpc: Math.log2(colors),
    capacity: capacityBytes(nIdx, cIdx),
    kind,
    payload: Int32Array.from(payload),
    header: Int32Array.from(headerIdx),
    calibCells: Int32Array.from(calibIdx),
    calibColor: Uint8Array.from(calibCol),
    zoneCells: Int32Array.from(zoneIdx),
    zoneColor: Uint8Array.from(zoneCol),
  };
  if (layout.header.length !== HEADER_CELLS) throw new Error('header layout mismatch');
  cache.set(key, layout);
  return layout;
};
