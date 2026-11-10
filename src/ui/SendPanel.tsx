import { useEffect, useRef, useState } from 'react';
import { COLOR_COUNTS, FPS_LEVELS, GRID_SIZES, REDUNDANCY_LEVELS, bodyCapacity } from '../frame';
import { useI18n } from '../i18n/react';
import {
  blockCount, createFileSource, createFrameClock, estimateSeconds, minimumFramesForEndless, planToImage, startTicker, totalFrames,
  type FileSource,
} from '../sender';
import { CodeScreen, pickTargetPx, useCodeScreen, useCountdown } from './CodeScreen';
import { formatBytes, formatDuration, formatRate } from './format';

export const SendPanel = () => {
  const { t } = useI18n();
  const [file, setFile] = useState<{ name: string; data: Uint8Array } | null>(null);
  const [nIdx, setNIdx] = useState(1);
  const [cIdx, setCIdx] = useState(0);
  const [fpsIdx, setFpsIdx] = useState(1);
  const [redIdx, setRedIdx] = useState<number | 'endless'>(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const screen = useCodeScreen();
  const countdown = useCountdown();
  const stopRef = useRef<(() => void) | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const stop = (msg: string) => {
    countdown.cancel();
    stopRef.current?.();
    stopRef.current = null;
    screen.clear();
    screen.exitFullscreen();
    setRunning(false);
    setStatus(msg);
  };

  const start = () => {
    if (!file) return;
    setError('');
    let source: FileSource;
    try {
      source = createFileSource({ data: file.data, name: file.name, spec: { nIdx, cIdx }, redundancyIdx: redIdx });
    } catch (e) {
      setError(String(e));
      return;
    }
    if (fullscreen) screen.enterFullscreen();
    setRunning(true);
    setStatus(t('send.statusCountdown'));
    countdown.begin(() => run(source));
  };

  const run = (source: FileSource) => {
    const fps = FPS_LEVELS[fpsIdx];
    const clock = createFrameClock(1000 / fps);
    const planned = redIdx === 'endless' ? null : totalFrames(source.info.k, redIdx);
    let shown = 0;
    stopRef.current = startTicker(clock, () => {
      const plan = source.next();
      if (!plan) return stop(t('send.statusDone'));
      screen.draw(planToImage(plan, pickTargetPx()));
      shown++;
      if (shown % 5 !== 0) return;
      if (planned) {
        const left = formatDuration(estimateSeconds(Math.max(0, planned - shown), fps), t);
        setStatus(t('send.statusProgress', { sent: shown, total: planned, left }));
      } else {
        setStatus(t('send.statusEndless', { sent: shown }));
      }
    });
    setStatus(t('send.statusSending'));
  };

  const fps = FPS_LEVELS[fpsIdx];
  const bodyBytes = bodyCapacity(nIdx, cIdx);
  const blocks = file ? blockCount(file.data.length, nIdx, cIdx) : 0;
  let eta = '';
  if (file) {
    eta =
      redIdx === 'endless'
        ? t('send.etaEndless', { time: formatDuration(estimateSeconds(minimumFramesForEndless(blocks), fps), t) })
        : t('send.etaFinite', { time: formatDuration(estimateSeconds(totalFrames(blocks, redIdx), fps), t) });
  }

  return (
    <section className="layout">
      <div>
        <div className="form">
          <div className="field wide">
            {t('send.file')}
            <div className="row">
              <input
                ref={picker}
                type="file"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
                  e.target.value = '';
                }}
              />
              <button type="button" disabled={running} onClick={() => picker.current?.click()}>{t('send.chooseFile')}</button>
              <span className="filename">{file ? `${file.name} (${formatBytes(file.data.length)})` : t('send.noFile')}</span>
            </div>
          </div>
          <label className="field">
            {t('send.density')}
            <select disabled={running} value={nIdx} onChange={(e) => setNIdx(+e.target.value)}>
              {GRID_SIZES.map((n, i) => (
                <option key={n} value={i}>{n} × {n}</option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('send.colors')}
            <select disabled={running} value={cIdx} onChange={(e) => setCIdx(+e.target.value)}>
              {COLOR_COUNTS.map((c, i) => (
                <option key={c} value={i}>{t('send.colorsOption', { n: c })}</option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('send.fps')}
            <select disabled={running} value={fpsIdx} onChange={(e) => setFpsIdx(+e.target.value)}>
              {FPS_LEVELS.map((f, i) => (
                <option key={f} value={i}>{f} fps</option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('send.redundancy')}
            <select
              disabled={running}
              value={redIdx}
              onChange={(e) => setRedIdx(e.target.value === 'endless' ? 'endless' : +e.target.value)}
            >
              {REDUNDANCY_LEVELS.map((r, i) => (
                <option key={r} value={i}>{Math.round(r * 100)}%</option>
              ))}
              <option value="endless">{t('send.endless')}</option>
            </select>
          </label>
        </div>
        <p className="notice">
          {t('send.info', { payload: formatBytes(bodyBytes), rate: formatRate(bodyBytes * fps) })}
          {file && ` ${t('send.blocks', { n: blocks })}`}
          {eta && (
            <>
              <br />
              {eta}
            </>
          )}
          <br />
          {t('send.warn')}
        </p>
        <div className="row">
          {!running ? (
            <button className="primary" disabled={!file} onClick={start}>{t('send.start')}</button>
          ) : (
            <button onClick={() => stop(t('send.statusStopped'))}>{countdown.count !== null ? t('common.cancel') : t('send.stop')}</button>
          )}
        </div>
        <label className="check">
          <input type="checkbox" checked={fullscreen} disabled={running} onChange={(e) => setFullscreen(e.target.checked)} />
          <span>
            {t('send.fullscreen')}
            <small>{t('send.fullscreenHint')}</small>
          </span>
        </label>
        {error && <p className="error">{error}</p>}
        <p className="status">{status}</p>
      </div>
      <CodeScreen screen={screen} count={countdown.count} />
    </section>
  );
};
