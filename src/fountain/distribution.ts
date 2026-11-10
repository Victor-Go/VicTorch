export const SOLITON_C = 0.1;
export const SOLITON_DELTA = 0.5;

const cache = new Map<number, Float64Array>();

/** Cumulative distribution over degrees 1..k (index d-1) of the robust soliton distribution. */
export const robustSolitonCdf = (k: number): Float64Array => {
  const hit = cache.get(k);
  if (hit) return hit;
  const R = Math.max(1, SOLITON_C * Math.log(k / SOLITON_DELTA) * Math.sqrt(k));
  const spike = Math.min(k, Math.max(1, Math.round(k / R)));
  const mu = new Float64Array(k);
  let sum = 0;
  for (let d = 1; d <= k; d++) {
    const rho = d === 1 ? 1 / k : 1 / (d * (d - 1));
    let tau = 0;
    if (d < spike) tau = R / (d * k);
    else if (d === spike) tau = (R * Math.log(R / SOLITON_DELTA)) / k;
    mu[d - 1] = rho + Math.max(0, tau);
    sum += mu[d - 1];
  }
  let acc = 0;
  for (let i = 0; i < k; i++) {
    acc += mu[i] / sum;
    mu[i] = acc;
  }
  mu[k - 1] = 1;
  cache.set(k, mu);
  return mu;
};

/**
 * Mean extra symbols an LT decoder needs beyond K, measured: ~38% at K=50, ~30% at K=200, ~19% at K=1000.
 * Fitted against log10(K) and clamped.
 */
export const ltOverhead = (k: number): number => Math.min(0.5, Math.max(0.1, 0.62 - 0.145 * Math.log10(Math.max(1, k))));

/** Distinct symbols after which decoding is usually done (mean plus a small margin). */
export const expectedSymbols = (k: number): number => Math.ceil(k * (1 + ltOverhead(k) + 0.05));
