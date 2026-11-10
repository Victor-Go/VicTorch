import { describe, expect, it } from 'vitest';
import { GRID_SIZES, bodyCapacity } from '../src/frame';
import { CODE_FRACTION, planToImage } from '../src/sender';

const darkExtent = (img: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }) => {
  let min = img.width;
  let max = 0;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4] < 128) {
        min = Math.min(min, x, y);
        max = Math.max(max, x, y);
      }
  return (max - min + 1) / img.width;
};

describe('fixed code size', () => {
  it('the grid fills the same fraction of the image for every density', () => {
    for (let nIdx = 0; nIdx < GRID_SIZES.length; nIdx++) {
      const plan = { type: 3 as const, nIdx, cIdx: 0, transferId: 1, arg: 0, body: new Uint8Array(Math.min(16, bodyCapacity(nIdx, 0))) };
      const img = planToImage(plan, 1000);
      expect(img.width).toBe(img.height);
      expect(Math.abs(darkExtent(img) - CODE_FRACTION)).toBeLessThan(0.01);
    }
  });
});
