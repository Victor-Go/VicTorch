import { describe, expect, it } from 'vitest';
import {
  FPS_LEVELS, buildFrame, crc32, parseFrame, type FramePlan, type ParsedFrame,
} from '../src/frame';
import { createReceiverSession } from '../src/receiver';
import { decodeImageToFrame } from '../src/receiver';
import { createFileSource, createFrameClock, createProbeSource, planToImage } from '../src/sender';
import { PROBE_STEPS, recommend } from '../src/probe';
import { distort } from './helpers/distort';

const rngOf = (seed: number) => {
  let a = seed;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) | 0;
    return (a >>> 8) / 16777216;
  };
};

/** Round-trips a plan through the byte-level frame format (what the camera path yields after CRC check). */
const wire = (plan: FramePlan): ParsedFrame | null => {
  const { header, region } = buildFrame(plan);
  return parseFrame(header, region);
};

const makeFile = (n: number, seed: number) => {
  const r = rngOf(seed);
  return Uint8Array.from({ length: n }, () => Math.floor(r() * 256));
};

describe('file transfer', () => {
  it('endless mode survives loss, reordering and duplicates, and the file CRC passes', () => {
    const data = makeFile(20000, 5);
    const src = createFileSource({ data, name: '测试文件.bin', spec: { nIdx: 1, cIdx: 1 }, redundancyIdx: 2 });
    const session = createReceiverSession();
    const r = rngOf(9);
    let t = 0;
    let produced = 0;
    while (session.getState().transfer?.status !== 'done' && produced < src.info.k * 6) {
      const batch: ParsedFrame[] = [];
      for (let i = 0; i < 10; i++) {
        const f = wire(src.next());
        produced++;
        if (f) batch.push(f);
      }
      batch.sort(() => r() - 0.5);
      for (const f of batch) {
        if (r() < 0.25) continue;
        session.onFrame(f, (t += 30));
        if (r() < 0.2) session.onFrame(f, (t += 30));
      }
    }
    const st = session.getState();
    expect(st.transfer?.status).toBe('done');
    expect(st.transfer?.fileName).toBe('测试文件.bin');
    expect(st.transfer?.fileBytes).toEqual(data);
    expect(crc32(st.transfer!.fileBytes!)).toBe(crc32(data));
  });

  it('buffers data frames that arrive before the metadata frame', () => {
    const data = makeFile(3000, 2);
    const src = createFileSource({ data, name: 'a', spec: { nIdx: 1, cIdx: 0 }, redundancyIdx: 2 });
    const frames: ParsedFrame[] = [];
    for (let i = 0; i < src.info.k * 4; i++) frames.push(wire(src.next())!);
    const dataFirst = [...frames.filter((f) => f.header.type === 0), ...frames.filter((f) => f.header.type === 1)];
    const session = createReceiverSession();
    dataFirst.forEach((f, i) => session.onFrame(f, i));
    expect(session.getState().transfer?.fileBytes).toEqual(data);
  });

  it('never stops by itself: it keeps producing new symbols past the planned count', () => {
    const src = createFileSource({ data: makeFile(5000, 1), name: 'x', spec: { nIdx: 1, cIdx: 0 }, redundancyIdx: 1 });
    expect(src.info.plannedData).toBe(Math.ceil(src.info.k * 1.2));
    const seeds = new Set<number>();
    for (let i = 0; i < src.info.plannedData * 3; i++) {
      const f = src.next();
      if (f.type === 0) seeds.add(f.arg);
    }
    expect(seeds.size).toBeGreaterThan(src.info.plannedData * 2);
  });

  it('repeated captures of the same frame do not inflate progress or rate', () => {
    const data = makeFile(8000, 6);
    const src = createFileSource({ data, name: 'x', spec: { nIdx: 1, cIdx: 0 }, redundancyIdx: 2 });
    const session = createReceiverSession();
    let t0 = 0;
    for (let i = 0; i < 40; i++) {
      const f = wire(src.next());
      if (!f) continue;
      for (let rep = 0; rep < 4; rep++) session.onFrame(f, (t0 += 25));
    }
    const st = session.getState(t0);
    const sent = 40 - 3 - Math.floor(37 / 16);
    expect(st.transfer!.dataFrames).toBeLessThanOrEqual(sent);
    expect(st.dataFps).toBeLessThan(40 / ((t0 / 1000) || 1));
  });

  it('reports failure when the whole-file CRC does not match', () => {
    const data = makeFile(2000, 4);
    const src = createFileSource({ data, name: 'x', spec: { nIdx: 1, cIdx: 0 }, redundancyIdx: 2 });
    const session = createReceiverSession();
    const first = wire(src.next())!;
    // rebuild a META with a wrong file CRC
    const bad = { ...first, body: first.body.slice() };
    new DataView(bad.body.buffer).setUint32(11, 0x12345678);
    session.onFrame(bad, 0);
    for (let i = 0; i < src.info.k * 5 && session.getState().transfer?.status === 'receiving'; i++) {
      const f = src.next();
      if (f && f.type === 0) session.onFrame(wire(f)!, i);
    }
    expect(session.getState().transfer?.status).toBe('failed');
    expect(session.getState().transfer?.fileBytes).toBeNull();
  });

  it('does not decode through the full image path unless the frame CRC passes (smoke test)', () => {
    const data = makeFile(500, 8);
    const src = createFileSource({ data, name: 'p', spec: { nIdx: 1, cIdx: 1 }, redundancyIdx: 2 });
    const session = createReceiverSession();
    for (let i = 0; i < 2; i++) {
      const plan = src.next()!;
      const img = distort(planToImage(plan, 800), { angle: 4, tilt: 0.05, noise: 3, gain: [0.95, 1, 1.05], offset: 6, seed: i + 1 });
      const out = decodeImageToFrame(img);
      expect(out.ok).toBe(true);
      if (out.ok) session.onFrame(out.frame, i * 100);
    }
    expect(session.getState().transfer?.fileName).toBe('p');
  }, 60000);
});

describe('frame clock', () => {
  it('fires on timestamps without drifting, even with jittery animation frames', () => {
    const clock = createFrameClock(1000 / 30);
    let fired = 0;
    const r = rngOf(3);
    for (let t = 0; t <= 3000; t += 1000 / 60) if (clock.due(t + (r() - 0.5) * 2)) fired++;
    expect(fired).toBeGreaterThanOrEqual(89);
    expect(fired).toBeLessThanOrEqual(92);
  });
  it('resyncs after a long stall instead of bursting', () => {
    const clock = createFrameClock(100);
    expect(clock.due(0)).toBe(true);
    expect(clock.due(2000)).toBe(true);
    expect(clock.due(2010)).toBe(false);
  });
});

describe('probe flow', () => {
  const run = (passFn: (s: (typeof PROBE_STEPS)[number], idx: number) => boolean) => {
    const src = createProbeSource(321);
    const session = createReceiverSession();
    let t = 0;
    for (let f = src.next(); f; f = src.next()) {
      const parsed = wire(f.plan)!;
      if (f.stepId !== null && !passFn(PROBE_STEPS[f.stepId], parsed.header.arg & 0xff)) continue;
      session.onFrame(parsed, (t += 1000 / f.fps));
    }
    return session;
  };

  it('receiver enters probe mode by itself, tallies each step and recommends when the end frames arrive', () => {
    const session = run((s) => s.fpsIdx < 6);
    const st = session.getState();
    expect(st.mode).toBe('probe');
    expect(st.probe?.finished).toBe(true);
    const a = st.probe!.results.filter((r) => r.seg === 0);
    expect(a[0].passed).toBe(a[0].total);
    expect(a[a.length - 1].passed).toBe(0);
    const rec = st.probe!.recommendation!;
    expect(rec.thresholds.A).toBe(5);
    expect(rec.fps).toBeLessThanOrEqual(FPS_LEVELS[5]);
  });

  it('manual finish works without end frames', () => {
    const src = createProbeSource(5);
    const session = createReceiverSession();
    for (let i = 0; i < 100; i++) session.onFrame(wire(src.next()!.plan)!, i);
    expect(session.getState().probe?.finished).toBe(false);
    session.finishProbe();
    expect(session.getState().probe?.finished).toBe(true);
    expect(session.getState().probe?.recommendation).toEqual(recommend(session.getState().probe!.results));
  });
});
