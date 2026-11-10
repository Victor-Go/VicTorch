import { useCallback, useEffect, useRef } from 'react';
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

  /** Must be called from a user gesture (e.g. the Start click). Failures are ignored. */
  const enterFullscreen = useCallback(() => {
    screenRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => exitFullscreen, [exitFullscreen]);

  return { canvasRef, screenRef, draw, enterFullscreen, exitFullscreen };
};

export type CodeScreenHandle = ReturnType<typeof useCodeScreen>;

/** Largest integer cell size that keeps the whole code (with quiet zone) within the physical screen. */
export const pickCellPx = (gridWithQuiet: number): number => {
  const dpr = window.devicePixelRatio || 1;
  const target = Math.min(window.screen.width, window.screen.height) * dpr;
  return Math.max(3, Math.min(24, Math.floor(Math.min(target, 1200) / gridWithQuiet)));
};

export const CodeScreen = ({ screen }: { screen: CodeScreenHandle }) => (
  <div className="screen" ref={screen.screenRef}>
    <canvas ref={screen.canvasRef} className="code" width={4} height={4} />
  </div>
);
