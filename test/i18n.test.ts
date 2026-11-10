import { describe, expect, it } from 'vitest';
import { detectLocale, translate } from '../src/i18n';
import { en } from '../src/i18n/en';
import { zh } from '../src/i18n/zh';

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  it('Chinese covers exactly the English keys with the same parameters', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) expect(params(zh[key])).toEqual(params(en[key]));
  });

  it('detects the first supported language and falls back to English', () => {
    expect(detectLocale(['zh-CN', 'en'])).toBe('zh');
    expect(detectLocale(['zh-Hant-TW'])).toBe('zh');
    expect(detectLocale(['en-US', 'zh'])).toBe('en');
    expect(detectLocale(['fr-FR', 'zh-CN'])).toBe('zh');
    expect(detectLocale(['fr-FR', 'de'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('interpolates parameters', () => {
    expect(translate('en', 'send.blocks', { n: 12 })).toBe('The file will be split into 12 data blocks.');
    expect(translate('zh', 'send.blocks', { n: 12 })).toBe('文件将拆成 12 个数据块。');
  });
});
