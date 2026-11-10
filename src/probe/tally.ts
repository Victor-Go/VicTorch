import { PROBE_STEPS, type Seg } from './steps';

export type StepResult = {
  stepId: number;
  seg: Seg;
  fpsIdx: number;
  nIdx: number;
  cIdx: number;
  total: number;
  passed: number;
};

export type ProbeObservation = {
  transferId: number;
  stepId: number;
  idx: number;
  total: number;
  fpsIdx: number;
  seg: number;
  nIdx: number;
  cIdx: number;
};

export const createProbeTally = () => {
  let transferId: number | null = null;
  let seen = new Map<number, Set<number>>();
  let totals = new Map<number, number>();

  return {
    /** Records one CRC-verified probe frame. A new transfer id starts a fresh tally. */
    add: (o: ProbeObservation): void => {
      if (transferId !== o.transferId) {
        transferId = o.transferId;
        seen = new Map();
        totals = new Map();
      }
      let set = seen.get(o.stepId);
      if (!set) seen.set(o.stepId, (set = new Set()));
      set.add(o.idx);
      totals.set(o.stepId, o.total);
    },
    results: (): StepResult[] =>
      PROBE_STEPS.map((s) => ({
        stepId: s.stepId,
        seg: s.seg,
        fpsIdx: s.fpsIdx,
        nIdx: s.nIdx,
        cIdx: s.cIdx,
        total: totals.get(s.stepId) ?? s.frames,
        passed: Math.min(seen.get(s.stepId)?.size ?? 0, totals.get(s.stepId) ?? s.frames),
      })),
    seenSteps: (): number => seen.size,
    reset: (): void => {
      transferId = null;
      seen = new Map();
      totals = new Map();
    },
  };
};
