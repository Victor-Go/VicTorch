import { applyHomography, homographyFromQuad, type Pt, type RGBAImage } from '../../src/codec';

export type DistortOptions = {
  outW?: number;
  outH?: number;
  /** side of the projected square in px */
  side?: number;
  /** rotation in degrees */
  angle?: number;
  /** top edge shrink fraction (perspective tilt) */
  tilt?: number;
  /** side tilt: right edge shrink fraction */
  tiltX?: number;
  gain?: [number, number, number];
  offset?: number;
  gamma?: number;
  noise?: number;
  blur?: number;
  seed?: number;
  bg?: number;
};

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const distort = (src: RGBAImage, o: DistortOptions = {}): RGBAImage => {
  const outW = o.outW ?? 1280;
  const outH = o.outH ?? 960;
  const side = o.side ?? 760;
  const angle = ((o.angle ?? 0) * Math.PI) / 180;
  const tilt = o.tilt ?? 0;
  const tiltX = o.tiltX ?? 0;
  const gain = o.gain ?? [1, 1, 1];
  const gamma = o.gamma ?? 1;
  const offset = o.offset ?? 0;
  const bg = o.bg ?? 40;
  const rand = rng(o.seed ?? 1);

  const h = side / 2;
  const local: Pt[] = [[-h, -h], [h, -h], [h, h], [-h, h]];
  const shrunk: Pt[] = local.map(([x, y]) => {
    const top = y < 0 ? 1 - tilt : 1;
    const right = x > 0 ? 1 - tiltX : 1;
    return [x * top, y * right] as Pt;
  });
  const dst: Pt[] = shrunk.map(([x, y]) => [
    outW / 2 + x * Math.cos(angle) - y * Math.sin(angle),
    outH / 2 + x * Math.sin(angle) + y * Math.cos(angle),
  ]);
  const srcCorners: Pt[] = [[0, 0], [src.width, 0], [src.width, src.height], [0, src.height]];
  const H = homographyFromQuad(dst, srcCorners)!;

  const out = new Uint8ClampedArray(outW * outH * 4);
  const SS = [0.25, 0.75];
  const fetch = (sx: number, sy: number, ch: number): number => {
    if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) return bg;
    const fx = Math.min(src.width - 1.001, Math.max(0, sx - 0.5));
    const fy = Math.min(src.height - 1.001, Math.max(0, sy - 0.5));
    const x0 = fx | 0;
    const y0 = fy | 0;
    const ax = fx - x0;
    const ay = fy - y0;
    const p = (x: number, y: number) => src.data[(y * src.width + x) * 4 + ch];
    return (
      (p(x0, y0) * (1 - ax) + p(x0 + 1, y0) * ax) * (1 - ay) + (p(x0, y0 + 1) * (1 - ax) + p(x0 + 1, y0 + 1) * ax) * ay
    );
  };
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let acc = 0;
        for (const dy of SS) {
          for (const dx of SS) {
            const [sx, sy] = applyHomography(H, x + dx, y + dy);
            acc += fetch(sx, sy, ch);
          }
        }
        out[(y * outW + x) * 4 + ch] = acc / 4;
      }
      out[(y * outW + x) * 4 + 3] = 255;
    }
  }

  if (o.blur) {
    const copy = out.slice();
    const k = o.blur;
    for (let y = 1; y < outH - 1; y++)
      for (let x = 1; x < outW - 1; x++)
        for (let ch = 0; ch < 3; ch++) {
          let s = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += copy[((y + j) * outW + x + i) * 4 + ch];
          out[(y * outW + x) * 4 + ch] = copy[(y * outW + x) * 4 + ch] * (1 - k) + (s / 9) * k;
        }
  }

  for (let i = 0; i < outW * outH; i++) {
    for (let ch = 0; ch < 3; ch++) {
      let v = 255 * Math.pow(out[i * 4 + ch] / 255, gamma) * gain[ch] + offset;
      if (o.noise) {
        const u1 = Math.max(1e-9, rand());
        v += o.noise * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand());
      }
      out[i * 4 + ch] = v;
    }
  }
  return { width: outW, height: outH, data: out };
};
