export const GRID_SIZES = [32, 48, 64, 96, 128] as const;
export const COLOR_COUNTS = [2, 4, 8, 16] as const;
export const FPS_LEVELS = [2, 4, 6, 8, 10, 12, 15, 20, 30] as const;
export const REDUNDANCY_LEVELS = [0.1, 0.2, 0.3, 0.5, 1.0] as const;

export type GridSpec = { nIdx: number; cIdx: number };

export const CONSERVATIVE_SPEC: GridSpec = { nIdx: 1, cIdx: 0 };
export const CONSERVATIVE_FPS_IDX = 1;

export const conservativeFor = (spec: GridSpec): GridSpec => ({
  nIdx: Math.min(spec.nIdx, CONSERVATIVE_SPEC.nIdx),
  cIdx: CONSERVATIVE_SPEC.cIdx,
});

export const ZONE = 8;
export const HEADER_CELLS = 96;
export const HEADER_COLS = 16;
export const HEADER_ROWS = 6;
export const QUIET = 3;

export const payloadCells = (n: number): number => n * n - 4 * ZONE * ZONE - 4 * (n - 2 * ZONE) - HEADER_CELLS;

export const bitsPerCell = (cIdx: number): number => Math.log2(COLOR_COUNTS[cIdx]);

export const capacityBytes = (nIdx: number, cIdx: number): number =>
  Math.floor((payloadCells(GRID_SIZES[nIdx]) * bitsPerCell(cIdx)) / 8);

/** Bytes of body that fit into one frame (capacity minus the trailing CRC32). */
export const bodyCapacity = (nIdx: number, cIdx: number): number => capacityBytes(nIdx, cIdx) - 4;
