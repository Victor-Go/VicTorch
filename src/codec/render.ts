import { QUIET } from '../frame/params';
import { CELL_BLACK, CELL_WHITE } from './layout';
import { getPalette } from './palette';

export type RGBAImage = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };

/** Rasterise a cell array into an RGBA image: white quiet zone around the n*n grid, `cellPx` pixels per cell. */
export const renderRGBA = (
  cells: Uint8Array,
  n: number,
  cIdx: number,
  cellPx: number,
  quiet: number = QUIET,
): RGBAImage => {
  const palette = getPalette(cIdx);
  const size = (n + 2 * quiet) * cellPx;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  const colorOf = (v: number) => (v === CELL_BLACK ? [0, 0, 0] : v === CELL_WHITE ? [255, 255, 255] : palette[v]);
  const lut: (readonly number[])[] = [];
  for (let v = 0; v < 256; v++) lut.push(colorOf(v) ?? [255, 0, 255]);
  for (let r = 0; r < n; r++) {
    const y0 = (r + quiet) * cellPx;
    // paint the first pixel row of the cell row, then replicate it
    for (let c = 0; c < n; c++) {
      const col = lut[cells[r * n + c]];
      const x0 = (c + quiet) * cellPx;
      for (let dx = 0; dx < cellPx; dx++) {
        const o = (y0 * size + x0 + dx) * 4;
        data[o] = col[0];
        data[o + 1] = col[1];
        data[o + 2] = col[2];
      }
    }
    const rowStart = (y0 * size + quiet * cellPx) * 4;
    const rowLen = n * cellPx * 4;
    for (let dy = 1; dy < cellPx; dy++) {
      data.copyWithin(((y0 + dy) * size + quiet * cellPx) * 4, rowStart, rowStart + rowLen);
    }
  }
  return { width: size, height: size, data };
};
