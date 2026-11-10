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

  it('perfect link: recommends the measured step with the highest bandwidth', () => {
    const rec = recommend(results(() => 1));
    expect(rec.poor).toBe(false);
    expect(rec.thresholds).toEqual({ A: 8, B: 4, C: 3, D: 6 });
    expect([rec.fpsIdx, rec.nIdx, rec.cIdx]).toEqual([8, 4, 3]);
    expect(rec.expectedBytesPerSec).toBe(bodyCapacity(4, 3) * FPS_LEVELS[8]);
    expect(rec.redundancy).toBe(0.3);
  });

  it('reliability comes first: a faster step below 95% never beats a clean slower one', () => {
    const fast = PROBE_STEPS[PROBE_STEPS.length - 1];
    const rec = recommend(results((s) => (s.stepId === fast.stepId ? 0.875 : 1)));
    expect([rec.fpsIdx, rec.nIdx, rec.cIdx]).not.toEqual([fast.fpsIdx, fast.nIdx, fast.cIdx]);
    const match = PROBE_STEPS.find((s) => s.fpsIdx === rec.fpsIdx && s.nIdx === rec.nIdx && s.cIdx === rec.cIdx)!;
    expect(match.stepId).not.toBe(fast.stepId);
    expect(rec.lossRate).toBe(0);
  });

  it('when nothing is reliable, the highest success rate wins even over much higher bandwidth', () => {
    // 20 fps / 48x48 / 2 colours: 15 of 16 frames (93.75%, below the 95% bar); every other step is at most 11 of 12
    const rec = recommend(results((s) => (s.fpsIdx === 7 && s.nIdx === 1 && s.cIdx === 0 ? 0.9375 : 0.875)));
    expect([rec.fpsIdx, rec.nIdx, rec.cIdx]).toEqual([7, 1, 0]);
    expect(rec.lossRate).toBeCloseTo(1 / 16, 3);
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

  it('only ever recommends a configuration that was measured to pass', () => {
    const rate: RateFn = (s) => (s.seg === 3 && dLevel(s.stepId) >= 3 ? 0.1 : s.fpsIdx > 6 ? 0.5 : 1);
    const rs = results(rate);
    const rec = recommend(rs);
    const match = rs.find((r) => r.fpsIdx === rec.fpsIdx && r.nIdx === rec.nIdx && r.cIdx === rec.cIdx)!;
    expect(match.passed / match.total).toBeGreaterThanOrEqual(0.85);
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
