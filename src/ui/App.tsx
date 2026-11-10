import { useState } from 'react';
import { useI18n } from '../i18n/react';
import { ProbePanel } from './ProbePanel';
import { ReceivePanel } from './ReceivePanel';
import { SendPanel } from './SendPanel';

const TABS = ['send', 'receive', 'probe'] as const;

type TabId = (typeof TABS)[number];

export const App = () => {
  const [tab, setTab] = useState<TabId>('send');
  const { t, locale, setLocale } = useI18n();
  return (
    <div className="shell">
      <header className="header">
        <h1>VicTorch</h1>
        <p className="tagline">{t('app.tagline')}</p>
        <button className="lang" aria-label={t('lang.switchLabel')} onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>
          {t('lang.switch')}
        </button>
      </header>
      <div className="tablist" role="tablist">
        {TABS.map((id) => (
          <button key={id} role="tab" aria-selected={id === tab} className="tab" onClick={() => setTab(id)}>
            {t(`tab.${id}`)}
          </button>
        ))}
      </div>
      <main className="panel" role="tabpanel">
        {tab === 'send' && <SendPanel />}
        {tab === 'receive' && <ReceivePanel />}
        {tab === 'probe' && <ProbePanel />}
      </main>
    </div>
  );
};
