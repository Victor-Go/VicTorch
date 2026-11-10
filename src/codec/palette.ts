import { COLOR_COUNTS } from '../frame/params';

export type RGB = readonly [number, number, number];

const CORNERS: RGB[] = [
  [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255],
  [255, 255, 0], [255, 0, 255], [0, 255, 255], [255, 255, 255],
];

const dist2 = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

const buildSixteen = (): RGB[] => {
  const levels = [0, 85, 170, 255];
  const grid: RGB[] = [];
  for (const r of levels) for (const g of levels) for (const b of levels) grid.push([r, g, b]);
  const chosen: RGB[] = [...CORNERS];
  while (chosen.length < 16) {
    let best = -1;
    let bestD = -1;
    grid.forEach((p, i) => {
      const d = Math.min(...chosen.map((c) => dist2(p, c)));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    });
    chosen.push(grid[best]);
  }
  return chosen;
};

const PALETTES: RGB[][] = [
  [[0, 0, 0], [255, 255, 255]],
  [[255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255]],
  CORNERS,
  buildSixteen(),
];

export const getPalette = (cIdx: number): RGB[] => PALETTES[cIdx];

export const paletteSize = (cIdx: number): number => COLOR_COUNTS[cIdx];
