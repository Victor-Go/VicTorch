import { useEffect, useRef, useState } from 'react';
import { createDecoder, isCameraAvailable, startCamera, startGrabber, type CameraInfo } from '../camera';
import { COLOR_COUNTS, FPS_LEVELS, GRID_SIZES } from '../frame';
import { stepBandwidth } from '../probe';
import { useI18n } from '../i18n/react';
import { createReceiverSession, type ReceiverSession, type ReceiverState } from '../receiver';
import { formatBytes, formatDuration, formatRate } from './format';

type Counters = { attempts: number; ok: number; crc: number; none: number; ms: number };

const download = (name: string, bytes: Uint8Array) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'received.bin';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export const ReceivePanel = () => {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement | null>(null);
  const session = useRef<ReceiverSession>(createReceiverSession());
  const counters = useRef<Counters>({ attempts: 0, ok: 0, crc: 0, none: 0, ms: 0 });
  const stopRef = useRef<(() => void) | null>(null);
  const [camera, setCamera] = useState<CameraInfo | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState<ReceiverState>(() => session.current.getState());
  const [stats, setStats] = useState<Counters>(counters.current);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setState(session.current.getState(Date.now()));
      setStats({ ...counters.current });
    }, 250);
    return () => {
      window.clearInterval(timer);
      stopRef.current?.();
    };
  }, []);

  const begin = async () => {
    setError('');
    if (!isCameraAvailable()) {
      setError(t('rx.needSecure'));
      return;
    }
    try {
      const cam = await startCamera(video.current!);
      setCamera(cam.info);
      const decoder = createDecoder((r) => {
        const c = counters.current;
        c.attempts++;
        c.ms = c.ms * 0.8 + r.ms * 0.2;
        if (r.ok) {
          c.ok++;
          session.current.onFrame(r.frame, Date.now());
        } else if (r.reason === 'crc') c.crc++;
        else c.none++;
      });
      const stopGrab = startGrabber(video.current!, decoder.submit);
      stopRef.current = () => {
        stopGrab();
        decoder.terminate();
        cam.stop();
        setCamera(null);
      };
    } catch (e) {
      setError(t('rx.cameraFail', { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  const end = () => {
    stopRef.current?.();
    stopRef.current = null;
  };

  const tr = state.transfer;
  const needFrames = tr ? Math.ceil(tr.k * 1.25) : 0;
  const eta =
    tr && tr.status === 'receiving' && state.dataFps > 0
      ? t('rx.eta', {
          time: tr.dataFrames >= needFrames ? t('rx.soon') : formatDuration((needFrames - tr.dataFrames) / state.dataFps, t),
        })
      : null;
  const probe = state.probe;
  const rec = probe?.recommendation;
  const rate = formatRate(state.kbps * 1024);

  return (
    <section>
      {!window.isSecureContext && <p className="notice warn">{t('rx.insecure')}</p>}
      <div className="row">
        {!camera ? (
          <button className="primary" onClick={begin}>{t('rx.openCamera')}</button>
        ) : (
          <button onClick={end}>{t('rx.closeCamera')}</button>
        )}
        <button
          onClick={() => {
            session.current.reset();
            counters.current = { attempts: 0, ok: 0, crc: 0, none: 0, ms: 0 };
          }}
        >
          {t('rx.reset')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <video ref={video} className="preview" playsInline muted />
      {camera && (
        <p className="hint">
          {t('rx.cameraInfo', { w: camera.width, h: camera.height, fps: camera.frameRate ? camera.frameRate.toFixed(0) : '?' })}
        </p>
      )}
      <p className="hint">
        {t('rx.decodeStats', { attempts: stats.attempts, ok: stats.ok, crc: stats.crc, none: stats.none, ms: stats.ms.toFixed(0) })}
      </p>

      {state.mode === 'transfer' && (
        <div className="card">
          {tr ? (
            <>
              <p>{t('rx.file', { name: tr.fileName, size: formatBytes(tr.fileSize) })}</p>
              <p>{t('rx.blocks', { k: tr.k, solved: tr.solved, pct: Math.floor((tr.solved / tr.k) * 100) })}</p>
              <p>
                {t('rx.rate', { rate })}
                {eta && ` · ${eta}`}
              </p>
              <progress value={tr.solved} max={tr.k} />
              {tr.status === 'done' && tr.fileBytes && (
                <p>
                  <span className="ok">{t('rx.verified')}</span>{' '}
                  <button className="primary" onClick={() => download(tr.fileName, tr.fileBytes!)}>{t('rx.download')}</button>
                </p>
              )}
              {tr.status === 'failed' && <p className="error">{t('rx.failed')}</p>}
            </>
          ) : (
            <p>{t('rx.waitMeta', { rate })}</p>
          )}
        </div>
      )}

      {state.mode === 'probe' && probe && (
        <div className="card">
          <h3>{probe.finished ? t('rx.probe.done') : t('rx.probe.running')}</h3>
          {!probe.finished && (
            <p>
              {t('rx.probe.current', { id: probe.currentStepId ?? '—' })}{' '}
              <button onClick={() => session.current.finishProbe()}>{t('rx.probe.finish')}</button>
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('rx.probe.thSeg')}</th>
                  <th>{t('rx.probe.thStep')}</th>
                  <th>{t('rx.probe.thFps')}</th>
                  <th>{t('rx.probe.thGrid')}</th>
                  <th>{t('rx.probe.thColors')}</th>
                  <th>{t('rx.probe.thRate')}</th>
                  <th>{t('rx.probe.thBandwidth')}</th>
                </tr>
              </thead>
              <tbody>
                {probe.results.map((r) => (
                  <tr
                    key={r.stepId}
                    className={[
                      r.stepId === probe.currentStepId && !probe.finished ? 'current' : '',
                      rec && r.fpsIdx === rec.fpsIdx && r.nIdx === rec.nIdx && r.cIdx === rec.cIdx ? 'best' : '',
                    ].join(' ')}
                  >
                    <td>{t(`probe.seg.${r.seg}`)}</td>
                    <td>{r.stepId + 1}</td>
                    <td>{FPS_LEVELS[r.fpsIdx]} fps</td>
                    <td>{GRID_SIZES[r.nIdx]}</td>
                    <td>{COLOR_COUNTS[r.cIdx]}</td>
                    <td>{r.passed}/{r.total} ({Math.round((r.passed / Math.max(1, r.total)) * 100)}%)</td>
                    <td>
                      {formatRate(stepBandwidth(r))}
                      {rec && r.fpsIdx === rec.fpsIdx && r.nIdx === rec.nIdx && r.cIdx === rec.cIdx && (
                        <span className="badge"> ★ {t('rx.probe.best')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rec && (
            <div className="rec">
              <h3>{t('rx.probe.recTitle')}</h3>
              <ul>
                <li>{t('rx.probe.recFps', { v: rec.fps })}</li>
                <li>{t('rx.probe.recDensity', { n: rec.gridSize })}</li>
                <li>{t('rx.probe.recColors', { n: rec.colors })}</li>
                <li>{t('rx.probe.recBandwidth', { rate: formatRate(rec.expectedBytesPerSec) })}</li>
                <li>{t('rx.probe.recRedundancy', { pct: Math.round(rec.redundancy * 100) })}</li>
              </ul>
              <p>
                {t('rx.probe.recNote', { loss: (rec.lossRate * 100).toFixed(0) })}
              </p>
              {rec.poor && <p className="error">{t('rx.probe.poor')}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
