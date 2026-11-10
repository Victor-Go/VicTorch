type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/** Calls `onBitmap` with a snapshot of each new video frame. Uses requestVideoFrameCallback when available. */
export const startGrabber = (video: HTMLVideoElement, onBitmap: (bmp: ImageBitmap) => void): (() => void) => {
  const v = video as VideoWithRvfc;
  let running = true;
  let id = 0;
  let snapshotting = false;

  const grab = () => {
    if (snapshotting || video.readyState < 2 || video.videoWidth === 0) return;
    snapshotting = true;
    createImageBitmap(video)
      .then((bmp) => (running ? onBitmap(bmp) : bmp.close()))
      .catch(() => undefined)
      .finally(() => {
        snapshotting = false;
      });
  };

  if (typeof v.requestVideoFrameCallback === 'function') {
    const loop = () => {
      if (!running) return;
      grab();
      id = v.requestVideoFrameCallback!(loop);
    };
    id = v.requestVideoFrameCallback(loop);
    return () => {
      running = false;
      v.cancelVideoFrameCallback?.(id);
    };
  }
  const loop = () => {
    if (!running) return;
    grab();
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => {
    running = false;
    cancelAnimationFrame(id);
  };
};
