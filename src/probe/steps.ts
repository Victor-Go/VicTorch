import { CONSERVATIVE_FPS_IDX, CONSERVATIVE_SPEC, COLOR_COUNTS, FPS_LEVELS, GRID_SIZES } from '../frame/params';

/** A step lasts about STEP_SECONDS but never fewer than MIN_STEP_FRAMES frames. */
export const STEP_SECONDS = 0.8;
export const MIN_STEP_FRAMES = 8;
export const LEAD_GAP_FRAMES = 8;
export const SEGMENT_GAP_FRAMES = 4;
export const END_FRAMES = 8;

export type Seg = 0 | 1 | 2 | 3;

export type ProbeStep = {
  stepId: number;
  /** segment that first introduced this step (steps shared by several sweeps are sent once) */
  seg: Seg;
  fpsIdx: number;
  nIdx: number;
  cIdx: number;
  frames: number;
};

export const framesForFps = (fpsIdx: number): number =>
  Math.max(MIN_STEP_FRAMES, Math.ceil(FPS_LEVELS[fpsIdx] * STEP_SECONDS));

/** Starting point of every sweep: 6 fps, 48x48, 2 colours. */
export const BASE = { fpsIdx: 2, nIdx: CONSERVATIVE_SPEC.nIdx, cIdx: CONSERVATIVE_SPEC.cIdx } as const;

const COMBINED: [number, number, number][] = [
  [2, 1, 0], [3, 1, 1], [4, 2, 1], [5, 2, 2], [6, 3, 2], [7, 3, 3], [8, 4, 3],
];

const build = () => {
  const steps: ProbeStep[] = [];
  const index = new Map<string, number>();
  const sweeps: number[][] = [[], [], [], []];
  const add = (seg: Seg, fpsIdx: number, nIdx: number, cIdx: number) => {
    const key = `${fpsIdx},${nIdx},${cIdx}`;
    let id = index.get(key);
    if (id === undefined) {
      id = steps.length;
      steps.push({ stepId: id, seg, fpsIdx, nIdx, cIdx, frames: framesForFps(fpsIdx) });
      index.set(key, id);
    }
    sweeps[seg].push(id);
  };
  for (let f = BASE.fpsIdx; f < FPS_LEVELS.length; f++) add(0, f, BASE.nIdx, BASE.cIdx);
  for (let n = BASE.nIdx; n < GRID_SIZES.length; n++) add(1, BASE.fpsIdx, n, BASE.cIdx);
  for (let c = BASE.cIdx; c < COLOR_COUNTS.length; c++) add(2, BASE.fpsIdx, BASE.nIdx, c);
  for (const [f, n, c] of COMBINED) add(3, f, n, c);
  return { steps, sweeps };
};

const built = build();

export const PROBE_STEPS: readonly ProbeStep[] = built.steps;

/** Step ids of each segment's sweep in increasing difficulty; position = level. Level 0 is always the base step. */
export const SWEEPS: readonly (readonly number[])[] = built.sweeps;

export type ScheduleItem =
  | { kind: 'gap'; frames: number; nextSeg: Seg }
  | { kind: 'step'; step: ProbeStep }
  | { kind: 'end'; frames: number };

export const buildProbeSchedule = (): ScheduleItem[] => {
  const items: ScheduleItem[] = [];
  for (const seg of [0, 1, 2, 3] as const) {
    const own = PROBE_STEPS.filter((s) => s.seg === seg);
    if (own.length === 0) continue;
    items.push({ kind: 'gap', frames: seg === 0 ? LEAD_GAP_FRAMES : SEGMENT_GAP_FRAMES, nextSeg: seg });
    for (const step of own) items.push({ kind: 'step', step });
  }
  items.push({ kind: 'end', frames: END_FRAMES });
  return items;
};

/** Total on-screen time of the whole probe run. */
export const probeDurationSeconds = (): number => {
  const gapFps = FPS_LEVELS[CONSERVATIVE_FPS_IDX];
  return buildProbeSchedule().reduce(
    (s, it) => s + (it.kind === 'step' ? it.step.frames / FPS_LEVELS[it.step.fpsIdx] : it.frames / gapFps),
    0,
  );
};

/** Pack/unpack the PROBE header `arg` field. */
export const packProbeArg = (p: { stepId: number; idx: number; total: number; fpsIdx: number; seg: number }): number =>
  (((p.stepId & 255) << 24) | ((p.idx & 255) << 16) | ((p.total & 255) << 8) | ((p.fpsIdx & 15) << 4) | (p.seg & 15)) >>> 0;

export const unpackProbeArg = (arg: number) => ({
  stepId: (arg >>> 24) & 255,
  idx: (arg >>> 16) & 255,
  total: (arg >>> 8) & 255,
  fpsIdx: (arg >>> 4) & 15,
  seg: arg & 15,
});
