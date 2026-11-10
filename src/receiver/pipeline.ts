import { detectAndSample, type RGBAImage } from '../codec';
import { parseFrame, type ParsedFrame } from '../frame';

export type DecodeOutcome =
  | { ok: true; frame: ParsedFrame }
  | { ok: false; reason: 'nocode' | 'crc' };

/** Image -> verified frame. Frames that fail the frame CRC are dropped. */
export const decodeImageToFrame = (img: RGBAImage): DecodeOutcome => {
  const raw = detectAndSample(img);
  if (!raw) return { ok: false, reason: 'nocode' };
  const frame = parseFrame(raw.header, raw.region);
  return frame ? { ok: true, frame } : { ok: false, reason: 'crc' };
};
