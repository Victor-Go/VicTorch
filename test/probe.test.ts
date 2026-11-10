import { describe, expect, it } from 'vitest';
import { FPS_LEVELS, GRID_SIZES, COLOR_COUNTS, bodyCapacity } from '../src/frame';
import {
  PROBE_STEPS, SWEEPS, buildProbeSchedule, createProbeTally, probeDurationSeconds, recommend, type StepResult,
} from '../src/probe';

type StepInfo = { stepId: number; seg: number; fpsIdx: number; nIdx: number; cIdx: number };
type RateFn = (s: StepInfo) => number;

const results = (rate: RateFn): StepResult[] =>
  PROBE_STEPS.map((s) => ({
    stepId: s.stepId, seg: s.seg, fpsIdx: s.fpsIdx, nIdx: s.nIdx, cIdx: s.cIdx,
    total: s.frames, passed: Math.round(rate(s) * s.frames),
  }));

const dLevel = (stepId: number) => SWEEPS[3].indexOf(stepId);

describe('step table', () => {
  it('has the documented shape and every sweep starts at the shared base step', () => {
    expect(SWEEPS.map((s) => s.length)).toEqual([FPS_LEVELS.length - 2, GRID_SIZES.length - 1, COLOR_COUNTS.length, 7]);
    PROBE_STEPS.forEach((s, i) => expect(s.stepId).toBe(i));
    for (const sweep of SWEEPS) expect(sweep[0]).toBe(SWEEPS[0][0]);
    expect(new Set(PROBE_STEPS.map((s) => `${s.fpsIdx},${s.nIdx},${s.cIdx}`)).size).toBe(PROBE_STEPS.length);
  });
  it('every step has enough frames to tell 85% from failure and the whole run fits in about 30 s', () => {
    PROBE_STEPS.forEach((s) => expect(s.frames).toBeGreaterThanOrEqual(8));
    expect(probeDurationSeconds()).toBeLessThanOrEqual(30);
  });
  it('schedule starts and ends with conservative frames and covers every step once', () => {
    const sched = buildProbeSchedule();
    expect(sched[0].kind).toBe('gap');
    expect(sched[sched.length - 1].kind).toBe('end');
    expect(sched.filter((x) => x.kind === 'step')).toHaveLength(PROBE_STEPS.length);
  });
});

describe('tally', () => {
  it('counts distinct frames only and reports unseen steps as zero', () => {
    const t = createProbeTally();
    const s = PROBE_STEPS[2];
    for (const idx of [0, 1, 1, 1, 5]) t.add({ transferId: 1, stepId: s.stepId, idx, total: s.frames, fpsIdx: s.fpsIdx, seg: s.seg, nIdx: s.nIdx, cIdx: s.cIdx });
    const r = t.results();
    expect(r).toHaveLength(PROBE_STEPS.length);
    expect(r[2].passed).toBe(3);
    expect(r[3].passed).toBe(0);
    expect(r[3].total).toBe(PROBE_STEPS[3].frames);
  });
});

describe('recommend', () => {
  it('threshold is 85%: 7 of 8 frames passes, 6 of 8 does not', () => {
    const base = (passed: number) =>
      results((s) => (s.stepId === SWEEPS[0][1] ? passed / PROBE_STEPS[s.stepId].frames : 1));
    expect(recommend(base(7)).thresholds.A).toBeGreaterThanOrEqual(3);
    expect(recommend(base(6)).thresholds.A).toBe(2);
  });

  it('perfect link: picks a fast verified config one notch below the peak, with modest redundancy', () => {
    const rec = recommend(results(() => 1));
    expect(rec.poor).toBe(false);
    expect(rec.thresholds).toEqual({ A: 8, B: 4, C: 3, D: 6 });
    const peak = bodyCapacity(4, 3) * FPS_LEVELS[8];
    expect(rec.expectedBytesPerSec).toBeLessThan(peak);
    expect(rec.expectedBytesPerSec).toBeGreaterThan(peak * 0.7);
    expect(rec.redundancy).toBe(0.3);
  });

  it('high frame rates failing caps the fps', () => {
    const rec = recommend(results((s) => (s.fpsIdx > 4 ? 0.2 : 1)));
    expect(rec.thresholds.A).toBe(4);
    expect(rec.fpsIdx).toBeLessThanOrEqual(4);
  });

  it('dense grids failing caps the grid size', () => {
    const rec = recommend(results((s) => (s.nIdx > 2 ? 0 : 1)));
    expect(rec.thresholds.B).toBe(2);
    expect(rec.nIdx).toBeLessThanOrEqual(2);
  });

  it('colours failing beyond 4 colours caps colours', () => {
    const rec = recommend(results((s) => (s.cIdx > 1 ? 0.3 : 1)));
    expect(rec.thresholds.C).toBe(1);
    expect(rec.cIdx).toBeLessThanOrEqual(1);
  });

  it('combined stress failing limits the combination even if single axes pass', () => {
    const rec = recommend(results((s) => (s.seg === 3 && dLevel(s.stepId) >= 3 ? 0.1 : 1)));
    expect(rec.thresholds.D).toBe(2);
    // D level 2 is (fps idx4, N idx2, colours idx1)
    expect(rec.fpsIdx).toBeLessThanOrEqual(4);
    expect(rec.nIdx).toBeLessThanOrEqual(2);
    expect(rec.cIdx).toBeLessThanOrEqual(1);
  });

  it('observed loss raises redundancy', () => {
    const clean = recommend(results(() => 1));
    const lossy = recommend(results(() => 0.88));
    expect(lossy.redundancy).toBeGreaterThanOrEqual(clean.redundancy);
    expect(lossy.lossRate).toBeGreaterThan(0);
  });

  it('a dead link falls back to the conservative default and flags it', () => {
    const rec = recommend(results(() => 0));
    expect(rec.poor).toBe(true);
    expect([rec.fpsIdx, rec.nIdx, rec.cIdx]).toEqual([1, 1, 0]);
    expect(rec.redundancy).toBe(1);
  });

  it('is consistent with the throughput definition', () => {
    const rec = recommend(results(() => 1));
    expect(rec.expectedBytesPerSec).toBeCloseTo(bodyCapacity(rec.nIdx, rec.cIdx) * FPS_LEVELS[rec.fpsIdx], 5);
  });
});
