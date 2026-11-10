import { useEffect, useRef, useState } from 'react';
import { COLOR_COUNTS, FPS_LEVELS, GRID_SIZES } from '../frame';
import { useI18n } from '../i18n/react';
import { createFrameClock, createProbeSource, planToImage, startTicker, type ProbeStatus } from '../sender';
import { CodeScreen, pickTargetPx, useCodeScreen, useCountdown } from './CodeScreen';

export const ProbePanel = () => {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [status, setStatus] = useState<ProbeStatus | 'countdown' | 'finished' | 'stopped' | null>(null);
  const [progress, setProgress] = useState(0);
  const screen = useCodeScreen();
  const countdown = useCountdown();
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const stop = (final: 'finished' | 'stopped') => {
    countdown.cancel();
    stopRef.current?.();
    stopRef.current = null;
    screen.clear();
    screen.exitFullscreen();
    setRunning(false);
    setStatus(final);
  };

  const start = () => {
    if (fullscreen) screen.enterFullscreen();
    setRunning(true);
    setStatus('countdown');
    countdown.begin(run);
  };

  const run = () => {
    const source = createProbeSource();
    const clock = createFrameClock(250);
    stopRef.current = startTicker(clock, () => {
      const f = source.next();
      if (!f) return stop('finished');
      screen.draw(planToImage(f.plan, pickTargetPx()));
      clock.setInterval(1000 / f.fps);
      setStatus(f.status);
      setProgress(source.progress());
    });
  };

  const text = (() => {
    if (!status) return t('probe.idle');
    if (status === 'countdown') return t('probe.statusCountdown');
    if (status === 'finished') return t('probe.finished');
    if (status === 'stopped') return t('probe.stopped');
    if (status.kind === 'end') return t('probe.status.end');
    if (status.kind === 'gap') {
      return status.first ? t('probe.status.lead') : t('probe.status.gap', { seg: t(`probe.seg.${status.nextSeg}`) });
    }
    return t('probe.status.step', {
      seg: t(`probe.seg.${status.seg}`),
      fps: FPS_LEVELS[status.fpsIdx],
      n: GRID_SIZES[status.nIdx],
      colors: COLOR_COUNTS[status.cIdx],
      i: status.index,
      total: status.total,
    });
  })();

  return (
    <section className="layout">
      <div>
        <p className="notice">{t('probe.intro')}</p>
        <div className="row">
          {!running ? (
            <button className="primary" onClick={start}>{t('probe.start')}</button>
          ) : (
            <button onClick={() => stop('stopped')}>{countdown.count !== null ? t('common.cancel') : t('probe.stop')}</button>
          )}
        </div>
        <label className="check">
          <input type="checkbox" checked={fullscreen} disabled={running} onChange={(e) => setFullscreen(e.target.checked)} />
          <span>
            {t('send.fullscreen')}
            <small>{t('send.fullscreenHint')}</small>
          </span>
        </label>
        <p className="status">{text}</p>
        <progress value={progress} max={1} />
      </div>
      <CodeScreen screen={screen} count={countdown.count} />
    </section>
  );
};
