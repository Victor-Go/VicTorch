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

/** The grid occupies this fraction of the image side whatever the density, so the code keeps one physical size. */
export const CODE_FRACTION = 0.82;

/** Renders a frame so the grid is always CODE_FRACTION of the image width (the rest is white margin). */
export const planToImage = (plan: FramePlan, targetPx: number): RGBAImage => {
  const { header, region } = buildFrame(plan);
  const n = GRID_SIZES[plan.nIdx];
  const cells = encodeGrid(plan.nIdx, plan.cIdx, header, region);
  const cellPx = Math.max(2, Math.floor((targetPx * CODE_FRACTION) / n));
  const code = renderRGBA(cells, n, plan.cIdx, cellPx, 0);
  const side = Math.round(code.width / CODE_FRACTION);
  const off = Math.floor((side - code.width) / 2);
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < code.height; y++) {
    data.set(code.data.subarray(y * code.width * 4, (y + 1) * code.width * 4), ((y + off) * side + off) * 4);
  }
  return { width: side, height: side, data };
};
