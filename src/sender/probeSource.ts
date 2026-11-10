import { createRng } from '../fountain';
import {
  CONSERVATIVE_FPS_IDX, CONSERVATIVE_SPEC, FPS_LEVELS, bodyCapacity,
  type FramePlan,
} from '../frame';
import { buildProbeSchedule, packProbeArg, type ScheduleItem, type Seg } from '../probe';

/** What the sender is currently showing; the UI turns it into text. */
export type ProbeStatus =
  | { kind: 'gap'; nextSeg: Seg; first: boolean }
  | { kind: 'step'; seg: Seg; fpsIdx: number; nIdx: number; cIdx: number; index: number; total: number }
  | { kind: 'end' };

export type ProbeFrame = { plan: FramePlan; fps: number; status: ProbeStatus; stepId: number | null };

export type ProbeSource = {
  next: () => ProbeFrame | null;
  /** fraction of scheduled frames already produced */
  progress: () => number;
};

const noiseBody = (len: number, seed: number): Uint8Array => {
  const rng = createRng(seed);
  return Uint8Array.from({ length: len }, () => Math.floor(rng() * 256));
};

export const createProbeSource = (transferId: number = Math.floor(Math.random() * 65536)): ProbeSource => {
  const schedule: ScheduleItem[] = buildProbeSchedule();
  const frameCount = (it: ScheduleItem) => (it.kind === 'step' ? it.step.frames : it.frames);
  const totalFrames = schedule.reduce((s, it) => s + frameCount(it), 0);
  let item = 0;
  let inItem = 0;
  let produced = 0;
  const consFps = FPS_LEVELS[CONSERVATIVE_FPS_IDX];
  const { nIdx: cn, cIdx: cc } = CONSERVATIVE_SPEC;

  return {
    progress: () => produced / totalFrames,
    next: () => {
      if (item >= schedule.length) return null;
      const it = schedule[item];
      const idx = inItem;
      if (++inItem >= frameCount(it)) {
        item++;
        inItem = 0;
      }
      produced++;
      if (it.kind === 'step') {
        const s = it.step;
        return {
          stepId: s.stepId,
          fps: FPS_LEVELS[s.fpsIdx],
          status: { kind: 'step', seg: s.seg, fpsIdx: s.fpsIdx, nIdx: s.nIdx, cIdx: s.cIdx, index: idx + 1, total: s.frames },
          plan: {
            type: 2, nIdx: s.nIdx, cIdx: s.cIdx, transferId,
            arg: packProbeArg({ stepId: s.stepId, idx, total: s.frames, fpsIdx: s.fpsIdx, seg: s.seg }),
            body: noiseBody(bodyCapacity(s.nIdx, s.cIdx), s.stepId * 256 + idx + 1),
          },
        };
      }
      if (it.kind === 'gap') {
        return {
          stepId: null, fps: consFps,
          status: { kind: 'gap', nextSeg: it.nextSeg, first: it.nextSeg === 0 },
          plan: { type: 3, nIdx: cn, cIdx: cc, transferId, arg: it.nextSeg, body: noiseBody(16, idx + 1) },
        };
      }
      return {
        stepId: null, fps: consFps, status: { kind: 'end' },
        plan: { type: 4, nIdx: cn, cIdx: cc, transferId, arg: 0, body: noiseBody(16, idx + 77) },
      };
    },
  };
};
