import type { Translate } from '../i18n';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

const trim = (v: number): string => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));

/** 1536 -> "1.50 KB" (1024-based, B through TB). */
export const formatBytes = (n: number): string => {
  let v = Math.max(0, n);
  let u = 0;
  while (v >= 1024 && u < UNITS.length - 1) {
    v /= 1024;
    u++;
  }
  return u === 0 ? `${Math.round(v)} B` : `${trim(v)} ${UNITS[u]}`;
};

export const formatRate = (bytesPerSec: number): string => `${formatBytes(bytesPerSec)}/s`;

/** 3725 -> "1 h 2 min" / "1 小时 2 分" */
export const formatDuration = (sec: number, t: Translate): string => {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return t('time.s', { n: s });
  if (s < 3600) return t('time.ms', { m: Math.floor(s / 60), s: s % 60 });
  const h = Math.floor(s / 3600);
  if (h < 48) return t('time.hm', { h, m: Math.floor((s % 3600) / 60) });
  return t('time.dh', { d: Math.floor(h / 24), h: h % 24 });
};
