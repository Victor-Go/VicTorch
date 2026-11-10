import {
  CONSERVATIVE_FPS_IDX, CONSERVATIVE_SPEC, COLOR_COUNTS, FPS_LEVELS, GRID_SIZES, REDUNDANCY_LEVELS, bodyCapacity,
} from '../frame/params';
import { SWEEPS } from './steps';
import type { StepResult } from './tally';

export const PASS_RATE = 0.85;
/** A resend is expensive, so steps at or above this rate are always preferred over faster but lossier ones. */
export const RELIABLE_RATE = 0.95;
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

/** Effective bandwidth of one measured step in bytes per second: payload per frame x fps x success rate. */
export const stepBandwidth = (r: StepResult): number => throughput({ f: r.fpsIdx, n: r.nIdx, c: r.cIdx }, rateOf(r));

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

  const fallback = () =>
    finish({ f: CONSERVATIVE_FPS_IDX, n: CONSERVATIVE_SPEC.nIdx, c: CONSERVATIVE_SPEC.cIdx }, 0.5, true);

  // Every step is a complete, directly measured configuration. Candidates are the steps that pass
  // the threshold along an unbroken run from the base step of their sweep (isolated lucky passes are ignored).
  const candidates = new Map<number, StepResult>();
  for (const sweep of [sA, sB, sC, sD]) {
    for (const r of sweep) {
      if (rateOf(r) < PASS_RATE) break;
      candidates.set(r.stepId, r);
    }
  }
  if (candidates.size === 0) return fallback();

  // Reliability first: only if no step is reliable do lossier candidates compete, and then the
  // highest success rate wins before bandwidth is considered.
  const all = [...candidates.values()];
  const reliable = all.filter((r) => rateOf(r) >= RELIABLE_RATE);
  const pool = reliable.length > 0 ? reliable : all;
  const better = (x: StepResult, y: StepResult): boolean => {
    if (reliable.length === 0) {
      const dr = rateOf(x) - rateOf(y);
      if (Math.abs(dr) > 1e-9) return dr > 0;
    }
    const d = stepBandwidth(x) - stepBandwidth(y);
    if (Math.abs(d) > 1e-9) return d > 0;
    return x.fpsIdx + x.nIdx + x.cIdx < y.fpsIdx + y.nIdx + y.cIdx;
  };
  const best = pool.reduce((acc, x) => (better(x, acc) ? x : acc));
  return finish({ f: best.fpsIdx, n: best!.nIdx, c: best.cIdx }, rateOf(best), false);
};
