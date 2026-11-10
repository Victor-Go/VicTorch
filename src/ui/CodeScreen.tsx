import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/react';
import type { RGBAImage } from '../codec';

/** Canvas that shows rendered code images, with optional fullscreen presentation. */
export const useCodeScreen = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);

  const draw = useCallback((img: RGBAImage) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== img.width || canvas.height !== img.height) {
      canvas.width = img.width;
      canvas.height = img.height;
    }
    const data = img.data instanceof Uint8ClampedArray ? img.data : new Uint8ClampedArray(img.data);
    canvas.getContext('2d')!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  /** Must be called from a user gesture (e.g. the Start click). Failures are ignored. */
  const enterFullscreen = useCallback(() => {
    screenRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => exitFullscreen, [exitFullscreen]);

  return { canvasRef, screenRef, draw, clear, enterFullscreen, exitFullscreen };
};

export type CodeScreenHandle = ReturnType<typeof useCodeScreen>;

/** Target image side in pixels: as large as the physical screen allows, capped. */
export const pickTargetPx = (): number => {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(400, Math.min(1200, Math.floor(Math.min(window.screen.width, window.screen.height) * dpr)));
};

/** Counts down whole seconds, then calls the callback. Cancelling (or unmounting) drops it. */
export const useCountdown = (seconds = 3) => {
  const [count, setCount] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    setCount(null);
  }, []);
  const begin = useCallback(
    (onDone: () => void) => {
      let n = seconds;
      setCount(n);
      const tick = () => {
        n -= 1;
        if (n <= 0) {
          setCount(null);
          onDone();
        } else {
          setCount(n);
          timer.current = window.setTimeout(tick, 1000);
        }
      };
      timer.current = window.setTimeout(tick, 1000);
    },
    [seconds],
  );
  useEffect(() => cancel, [cancel]);
  return { count, begin, cancel };
};

/** Fixed-size code area. While a countdown runs it shows a ghost outline of where the code will appear. */
export const CodeScreen = ({ screen, count }: { screen: CodeScreenHandle; count: number | null }) => {
  const { t } = useI18n();
  return (
    <div className="screen" ref={screen.screenRef}>
      <div className="codebox">
        <canvas ref={screen.canvasRef} className="code" width={4} height={4} />
        {count !== null && (
          <div className="ghost" aria-live="polite">
            <i className="c tl" />
            <i className="c tr" />
            <i className="c bl" />
            <i className="c br" />
            <b>{count}</b>
            <span>{t('ghost.hint')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
