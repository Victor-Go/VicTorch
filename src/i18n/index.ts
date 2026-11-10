import { en, type MessageKey } from './en';
import { zh } from './zh';

export type Locale = 'en' | 'zh';
export type { MessageKey };
export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

export const LOCALES: readonly Locale[] = ['en', 'zh'];

const catalogues: Record<Locale, Record<MessageKey, string>> = { en, zh };

/** First supported language in the user's preference order wins; anything else falls back to English. */
export const detectLocale = (languages: readonly string[]): Locale => {
  for (const lang of languages) {
    const base = lang.toLowerCase().split('-')[0];
    if (base === 'zh') return 'zh';
    if (base === 'en') return 'en';
  }
  return 'en';
};

export const translate = (locale: Locale, key: MessageKey, params?: Params): string => {
  const text = catalogues[locale][key] ?? en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
};

export const createTranslator = (locale: Locale): Translate => (key, params) => translate(locale, key, params);
