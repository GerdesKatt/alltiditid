import React from 'react';
import { useLang } from '../lib/i18n';

export type AppTab = 'trafik' | 'resa' | 'flyg';

const TABS: { key: AppTab; label: string; labelEn: string }[] = [
  { key: 'trafik', label: 'Tavla', labelEn: 'Board' },
  { key: 'resa', label: 'Min resa', labelEn: 'My trip' },
  { key: 'flyg', label: 'Flyg', labelEn: 'Flights' },
];

/**
 * Appens tre lägen: tavlan (en plats), min resa (ett tåg, ett byte) och flyg.
 * Meny längst ned i mobilen där tummen når, flikar överst på bred skärm (globals.css).
 */
export default function ModeTabs({
  tab,
  onChange,
  hasJourney,
}: {
  tab: AppTab;
  onChange: (tab: AppTab) => void;
  /** Något är sparat under Min resa: visas som en prick på fliken. */
  hasJourney: boolean;
}) {
  const { t } = useLang();
  return (
    <nav className="app-tabs" aria-label={t('Lägen', 'Views')}>
      {TABS.map((tb) => {
        const active = tb.key === tab;
        return (
          <button
            key={tb.key}
            type="button"
            aria-current={active ? 'page' : undefined}
            className={`app-tab${active ? ' app-tab--active' : ''}`}
            onClick={() => onChange(tb.key)}
          >
            {t(tb.label, tb.labelEn)}
            {tb.key === 'resa' && hasJourney ? (
              <>
                <span className="app-tab-dot" aria-hidden="true" />
                <span className="sr-only"> ({t('sparad resa', 'saved trip')})</span>
              </>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
