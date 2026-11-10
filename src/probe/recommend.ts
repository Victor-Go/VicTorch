import {
  CONSERVATIVE_FPS_IDX, CONSERVATIVE_SPEC, COLOR_COUNTS, FPS_LEVELS, GRID_SIZES, REDUNDANCY_LEVELS, bodyCapacity,
} from '../frame/params';
import { SWEEPS } from './steps';
import type { StepResult } from './tally';

export const PASS_RATE = 0.85;
export const LT_OVERHEAD = 0.25;

export type Recommendation = {
  fpsIdx: number;
  nIdx: number;
  cIdx: number;
  redundancyIdx: number;
  fps: number;
  gridSize: number;
  colors: number;
  redundancy: number;
  expectedBytesPerSec: number;
  lossRate: number;
  poor: boolean;
  thresholds: { A: number; B: number; C: number; D: number };
};

const rateOf = (r: StepResult): number => (r.total > 0 ? r.passed / r.total : 0);

/** Results of one segment's sweep, in level order. */
const sweepOf = (results: StepResult[], seg: number): StepResult[] =>
  SWEEPS[seg].map((id) => results.find((r) => r.stepId === id)).filter((r): r is StepResult => !!r);

/** Highest level such that it and every lower level reach PASS_RATE; level 0 if even the base fails. */
const thresholdLevel = (sweep: StepResult[]): { level: number; passedAny: boolean; step: StepResult | undefined } => {
  let last = -1;
  for (let i = 0; i < sweep.length; i++) {
    if (rateOf(sweep[i]) >= PASS_RATE) last = i;
    else break;
  }
  const level = Math.max(0, last);
  return { level, passedAny: last >= 0, step: sweep[level] };
};

type Combo = { f: number; n: number; c: number };

const throughput = (k: Combo, rate: number): number => bodyCapacity(k.n, k.c) * FPS_LEVELS[k.f] * rate;

export const recommend = (results: StepResult[]): Recommendation => {
  const sA = sweepOf(results, 0);
  const sB = sweepOf(results, 1);
  const sC = sweepOf(results, 2);
  const sD = sweepOf(results, 3);
  const A = thresholdLevel(sA);
  const B = thresholdLevel(sB);
  const C = thresholdLevel(sC);
  const D = thresholdLevel(sD);
  const fMax = A.step?.fpsIdx ?? 0;
  const nMax = B.step?.nIdx ?? 0;
  const cMax = C.step?.cIdx ?? 0;
  const thresholds = { A: fMax, B: nMax, C: cMax, D: D.level };

  const finish = (k: Combo, rate: number, poor: boolean): Recommendation => {
    const loss = Math.min(0.99, Math.max(0, 1 - rate));
    const need = (LT_OVERHEAD + loss) / (1 - loss);
    let redundancyIdx = REDUNDANCY_LEVELS.findIndex((r) => r >= need - 1e-9);
    if (redundancyIdx < 0) redundancyIdx = REDUNDANCY_LEVELS.length - 1;
    return {
      fpsIdx: k.f, nIdx: k.n, cIdx: k.c, redundancyIdx,
      fps: FPS_LEVELS[k.f], gridSize: GRID_SIZES[k.n], colors: COLOR_COUNTS[k.c],
      redundancy: REDUNDANCY_LEVELS[redundancyIdx],
      expectedBytesPerSec: throughput(k, rate),
      lossRate: loss, poor, thresholds,
    };
  };

  if (!D.passedAny) {
    return finish({ f: CONSERVATIVE_FPS_IDX, n: CONSERVATIVE_SPEC.nIdx, c: CONSERVATIVE_SPEC.cIdx }, 0.5, true);
  }

  const verifiedSteps = sD.slice(0, D.level + 1);
  const verified = verifiedSteps
    .map((r) => ({ f: r.fpsIdx, n: r.nIdx, c: r.cIdx, rate: rateOf(r) }));

  const estimateRate = (k: Combo): number => {
    const exact = verifiedSteps.find((r) => r.fpsIdx === k.f && r.nIdx === k.n && r.cIdx === k.c);
    if (exact) return rateOf(exact);
    const fr = sA.slice(0, A.level + 1).find((r) => r.fpsIdx === k.f);
    const nr = sB.slice(0, B.level + 1).find((r) => r.nIdx === k.n);
    const cr = sC.slice(0, C.level + 1).find((r) => r.cIdx === k.c);
    return Math.min(...[fr, nr, cr].map((r) => (r ? rateOf(r) : 1)));
  };

  const feasible: Combo[] = [];
  for (let f = 0; f <= fMax; f++)
    for (let n = 0; n <= nMax; n++)
      for (let c = 0; c <= cMax; c++)
        if (verified.some((v) => f <= v.f && n <= v.n && c <= v.c)) feasible.push({ f, n, c });

  if (feasible.length === 0) {
    return finish({ f: CONSERVATIVE_FPS_IDX, n: CONSERVATIVE_SPEC.nIdx, c: CONSERVATIVE_SPEC.cIdx }, 0.5, true);
  }

  const score = (k: Combo) => throughput(k, estimateRate(k));
  const conservativeFirst = (a: Combo, b: Combo) => a.f + a.n + a.c - (b.f + b.n + b.c);
  const best = feasible.reduce((acc, k) => {
    const d = score(k) - score(acc);
    return d > 1e-9 || (Math.abs(d) <= 1e-9 && conservativeFirst(k, acc) < 0) ? k : acc;
  });

  const steps: Combo[] = [
    { ...best, f: best.f - 1 },
    { ...best, n: best.n - 1 },
    { ...best, c: best.c - 1 },
  ].filter((k) => k.f >= 0 && k.n >= 0 && k.c >= 0);
  const chosen = steps.length ? steps.reduce((acc, k) => (score(k) > score(acc) ? k : acc)) : best;

  return finish(chosen, estimateRate(chosen), !A.passedAny || !B.passedAny || !C.passedAny);
};
