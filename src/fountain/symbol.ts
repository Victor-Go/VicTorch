import { robustSolitonCdf } from './distribution';
import { createRng } from './rng';

/** Source block indices combined into the encoded symbol identified by `seed`. */
export const symbolIndices = (k: number, seed: number): number[] => {
  const rng = createRng(seed);
  const cdf = robustSolitonCdf(k);
  const u = rng();
  let lo = 0;
  let hi = k - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] >= u) hi = mid;
    else lo = mid + 1;
  }
  const degree = lo + 1;
  if (degree * 2 > k) {
    const all = Array.from({ length: k }, (_, i) => i);
    for (let i = 0; i < degree; i++) {
      const j = i + Math.floor(rng() * (k - i));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, degree);
  }
  const chosen = new Set<number>();
  while (chosen.size < degree) chosen.add(Math.floor(rng() * k));
  return [...chosen];
};
