import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createTranslator, detectLocale, type Locale, type Translate } from './index';

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: Translate };

const I18nContext = createContext<Ctx | null>(null);

const initialLocale = (): Locale => detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const value = useMemo<Ctx>(() => ({ locale, setLocale, t: createTranslator(locale) }), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.querySelector('meta[name="description"]')?.setAttribute('content', value.t('app.tagline'));
  }, [locale, value]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): Ctx => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
};
