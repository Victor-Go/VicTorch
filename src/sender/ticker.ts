import { buildFrame, type FramePlan } from '../frame';
import { encodeGrid, renderRGBA, type RGBAImage } from '../codec';
import { GRID_SIZES } from '../frame/params';

/**
 * Timestamp-driven frame clock. `due(now)` is true when the next frame should be shown;
 * `setInterval(ms)` sets how long the frame just shown stays on screen.
 */
export const createFrameClock = (initialIntervalMs: number, toleranceMs = 4) => {
  let interval = initialIntervalMs;
  let slot: number | null = null;
  return {
    setInterval: (ms: number) => {
      interval = ms;
    },
    reset: () => {
      slot = null;
    },
    due: (now: number): boolean => {
      if (slot === null) {
        slot = now;
        return true;
      }
      if (now + toleranceMs < slot + interval) return false;
      slot += interval;
      if (slot + interval <= now) slot = now;
      return true;
    },
  };
};

/** requestAnimationFrame loop; `onTick` runs once per due frame. Returns a stop function. */
export const startTicker = (clock: ReturnType<typeof createFrameClock>, onTick: (now: number) => void): (() => void) => {
  let id = 0;
  let running = true;
  clock.reset();
  const loop = (now: number) => {
    if (!running) return;
    if (clock.due(now)) onTick(now);
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => {
    running = false;
    cancelAnimationFrame(id);
  };
};

export const planToImage = (plan: FramePlan, cellPx: number): RGBAImage => {
  const { header, region } = buildFrame(plan);
  const cells = encodeGrid(plan.nIdx, plan.cIdx, header, region);
  return renderRGBA(cells, GRID_SIZES[plan.nIdx], plan.cIdx, cellPx);
};
