import { createLtDecoder } from '../fountain';
import { crc32, decodeMeta, type Meta, type ParsedFrame } from '../frame';
import { createProbeTally, recommend, unpackProbeArg, type Recommendation, type StepResult } from '../probe';

export const THROUGHPUT_WINDOW_MS = 3000;
export const MAX_BUFFERED = 4000;

export type TransferState = {
  transferId: number;
  fileName: string;
  fileSize: number;
  k: number;
  solved: number;
  status: 'receiving' | 'done' | 'failed';
  /** data frames accepted so far */
  dataFrames: number;
  fileBytes: Uint8Array | null;
};

export type ProbeState = {
  transferId: number;
  finished: boolean;
  currentStepId: number | null;
  results: StepResult[];
  recommendation: Recommendation | null;
};

export type ReceiverState = {
  mode: 'idle' | 'transfer' | 'probe';
  /** DATA frames seen for a transfer whose META has not arrived yet */
  waitingMeta: boolean;
  transfer: TransferState | null;
  probe: ProbeState | null;
  kbps: number;
  /** accepted data frames per second over the recent window */
  dataFps: number;
  validFrames: number;
};

type Pending = { seed: number; body: Uint8Array };

export const createReceiverSession = () => {
  let mode: ReceiverState['mode'] = 'idle';
  let transfer: TransferState | null = null;
  let meta: Meta | null = null;
  let decoder: ReturnType<typeof createLtDecoder> | null = null;
  const buffered = new Map<number, Pending[]>();
  let bufferedCount = 0;

  const tally = createProbeTally();
  let probeId: number | null = null;
  let probeFinished = false;
  let probeStep: number | null = null;
  let probeRec: Recommendation | null = null;

  let events: { t: number; bytes: number; data: boolean }[] = [];
  let firstT: number | null = null;
  let lastNow = 0;
  let validFrames = 0;

  const finishAssembly = () => {
    if (!decoder || !meta || !transfer) return;
    const bytes = decoder.assemble(meta.fileSize);
    if (bytes && crc32(bytes) === meta.fileCrc) {
      transfer.status = 'done';
      transfer.fileBytes = bytes;
    } else {
      transfer.status = 'failed';
    }
  };

  const feed = (seed: number, body: Uint8Array) => {
    if (!decoder || !transfer || transfer.status !== 'receiving') return;
    decoder.add(seed, body);
    transfer.dataFrames++;
    transfer.solved = decoder.solvedCount();
    if (decoder.isComplete()) finishAssembly();
  };

  const startTransfer = (transferId: number, m: Meta) => {
    meta = m;
    decoder = createLtDecoder(m.blockCount, m.blockSize);
    transfer = {
      transferId, fileName: m.name, fileSize: m.fileSize, k: m.blockCount, solved: 0, status: 'receiving', dataFrames: 0, fileBytes: null,
    };
    const waiting = buffered.get(transferId);
    if (waiting) {
      bufferedCount -= waiting.length;
      buffered.delete(transferId);
      for (const p of waiting) feed(p.seed, p.body);
    }
  };

  const finishProbe = () => {
    if (mode !== 'probe' || probeFinished) return;
    probeFinished = true;
    probeRec = recommend(tally.results());
  };

  const enterProbe = (transferId: number) => {
    if (mode !== 'probe' || probeId !== transferId) {
      mode = 'probe';
      probeId = transferId;
      probeFinished = false;
      probeStep = null;
      probeRec = null;
      tally.reset();
    }
  };

  return {
    onFrame: (frame: ParsedFrame, nowMs: number): void => {
      const { header, body } = frame;
      lastNow = nowMs;
      validFrames++;
      if (firstT === null) firstT = nowMs;
      events.push({ t: nowMs, bytes: body.length, data: header.type === 0 });

      switch (header.type) {
        case 1: {
          const m = decodeMeta(body);
          if (!m) return;
          if (mode === 'probe') mode = 'transfer';
          if (mode === 'idle') mode = 'transfer';
          if (!transfer || transfer.transferId !== header.transferId) startTransfer(header.transferId, m);
          return;
        }
        case 0: {
          if (mode === 'probe') mode = 'transfer';
          if (mode === 'idle') mode = 'transfer';
          if (transfer && transfer.transferId === header.transferId) {
            feed(header.arg, body);
          } else if (!transfer || transfer.status !== 'receiving') {
            // unknown transfer: keep the symbols until its META shows up
            if (bufferedCount < MAX_BUFFERED) {
              const list = buffered.get(header.transferId) ?? [];
              list.push({ seed: header.arg, body });
              buffered.set(header.transferId, list);
              bufferedCount++;
            }
          }
          return;
        }
        case 2: {
          enterProbe(header.transferId);
          if (probeFinished) return;
          const p = unpackProbeArg(header.arg);
          probeStep = p.stepId;
          tally.add({
            transferId: header.transferId, stepId: p.stepId, idx: p.idx, total: p.total,
            fpsIdx: p.fpsIdx, seg: p.seg, nIdx: header.nIdx, cIdx: header.cIdx,
          });
          return;
        }
        case 3:
          enterProbe(header.transferId);
          return;
        case 4:
          enterProbe(header.transferId);
          finishProbe();
          return;
      }
    },

    finishProbe,

    reset: (): void => {
      mode = 'idle';
      transfer = null;
      meta = null;
      decoder = null;
      buffered.clear();
      bufferedCount = 0;
      tally.reset();
      probeId = null;
      probeFinished = false;
      probeStep = null;
      probeRec = null;
      events = [];
      firstT = null;
      validFrames = 0;
    },

    getState: (nowMs: number = lastNow): ReceiverState => {
      events = events.filter((e) => nowMs - e.t <= THROUGHPUT_WINDOW_MS);
      const bytes = events.reduce((s, e) => s + e.bytes, 0);
      const span = firstT === null ? 1 : Math.max(1, Math.min(THROUGHPUT_WINDOW_MS, nowMs - firstT));
      return {
        mode,
        waitingMeta: mode === 'transfer' && !transfer && bufferedCount > 0,
        transfer: transfer ? { ...transfer } : null,
        probe:
          mode === 'probe' && probeId !== null
            ? {
                transferId: probeId,
                finished: probeFinished,
                currentStepId: probeStep,
                results: tally.results(),
                recommendation: probeRec,
              }
            : null,
        kbps: bytes / (span / 1000) / 1024,
        dataFps: events.filter((e) => e.data).length / (span / 1000),
        validFrames,
      };
    },
  };
};

export type ReceiverSession = ReturnType<typeof createReceiverSession>;
