export type CameraInfo = { width: number; height: number; frameRate: number; label: string };

export type CameraHandle = { info: CameraInfo; stop: () => void };

export const isCameraAvailable = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

export const startCamera = async (video: HTMLVideoElement): Promise<CameraHandle> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
  });
  const track = stream.getVideoTracks()[0];

  // Advanced controls are inconsistently supported: try once, ignore any failure.
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: 'continuous', exposureMode: 'continuous', whiteBalanceMode: 'continuous' } as MediaTrackConstraintSet],
    });
  } catch {
    /* unsupported */
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();

  const s = track.getSettings();
  return {
    info: { width: s.width ?? video.videoWidth, height: s.height ?? video.videoHeight, frameRate: s.frameRate ?? 0, label: track.label },
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
};
