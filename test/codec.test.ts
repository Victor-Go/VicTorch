import { describe, expect, it } from 'vitest';
import {
  detectAndSample, encodeGrid, getLayout, renderRGBA, type RGBAImage,
} from '../src/codec';
import {
  COLOR_COUNTS, GRID_SIZES, bodyCapacity, buildFrame, parseFrame, payloadCells,
} from '../src/frame';
import { distort, type DistortOptions } from './helpers/distort';

const randomBody = (len: number, seed: number) => {
  let a = seed;
  return Uint8Array.from({ length: len }, () => {
    a = (Math.imul(a, 1664525) + 1013904223) | 0;
    return (a >>> 16) & 255;
  });
};

const makeImage = (nIdx: number, cIdx: number, seed: number) => {
  const body = randomBody(bodyCapacity(nIdx, cIdx), seed);
  const { header, region } = buildFrame({ type: 0, nIdx, cIdx, transferId: 0x1234, arg: seed, body });
  const cells = encodeGrid(nIdx, cIdx, header, region);
  return { body, img: renderRGBA(cells, GRID_SIZES[nIdx], cIdx, 8) };
};

const decodeBody = (img: RGBAImage) => {
  const raw = detectAndSample(img);
  if (!raw) return null;
  return parseFrame(raw.header, raw.region)?.body ?? null;
};

describe('layout', () => {
  it('payload cell counts match the contract formula', () => {
    GRID_SIZES.forEach((n, i) => {
      expect(getLayout(i, 0).payload.length).toBe(payloadCells(n));
      expect(getLayout(i, 3).calibCells.length).toBe(4 * (n - 16));
    });
  });
});

describe('grid codec through simulated camera', () => {
  const mild: DistortOptions = {
    angle: 6, tilt: 0.06, tiltX: 0.03, gain: [0.92, 1.0, 1.05], offset: 8, gamma: 1.1, noise: 3, blur: 0.25, seed: 5,
  };
  for (let nIdx = 0; nIdx < GRID_SIZES.length; nIdx++) {
    for (let cIdx = 0; cIdx < COLOR_COUNTS.length; cIdx++) {
      it(`decodes N=${GRID_SIZES[nIdx]} colors=${COLOR_COUNTS[cIdx]}`, () => {
        const { body, img } = makeImage(nIdx, cIdx, nIdx * 10 + cIdx + 1);
        expect(decodeBody(distort(img, mild))).toEqual(body);
      }, 60000);
    }
  }

  it('handles 90/180/270 degree rotations', () => {
    const { body, img } = makeImage(1, 1, 99);
    for (const angle of [90, 180, 270, -80]) {
      expect(decodeBody(distort(img, { ...mild, angle }))).toEqual(body);
    }
  }, 60000);

  it('handles strong brightness/colour shifts for 4-colour mode', () => {
    const { body, img } = makeImage(2, 1, 7);
    const out = distort(img, { gain: [0.6, 0.85, 1.1], offset: 25, gamma: 0.8, noise: 4, blur: 0.2, seed: 3, tilt: 0.1 });
    expect(decodeBody(out)).toEqual(body);
  }, 60000);

  it('returns nothing for an image without a code', () => {
    const noise = new Uint8ClampedArray(640 * 480 * 4);
    const r = randomBody(noise.length, 3);
    noise.set(r);
    expect(detectAndSample({ width: 640, height: 480, data: noise })).toBeNull();
  });

  it('a heavily damaged frame is dropped by the frame CRC, never mis-decoded', () => {
    const { body, img } = makeImage(1, 2, 11);
    const bad = distort(img, { ...mild, noise: 70, seed: 9 });
    const got = decodeBody(bad);
    if (got) expect(got).toEqual(body);
    else expect(got).toBeNull();
  }, 60000);
});
