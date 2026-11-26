import React from 'react';
import { useLang } from '../lib/i18n';

/** Appens lägen. Flyg nås via sök och snabbval, inte via menyn. */
export type AppTab = 'trafik' | 'resa' | 'flyg';
export type MenuKey = 'trafik' | 'resa' | 'sok';

const TABS: { key: MenuKey; label: string; labelEn: string }[] = [
  { key: 'trafik', label: 'Nu', labelEn: 'Now' },
  { key: 'resa', label: 'Min resa', labelEn: 'My trip' },
  { key: 'sok', label: 'Sök', labelEn: 'Search' },
];

/**
 * Tre val: Nu (tavlan med din avgång överst), Min resa och Sök.
 * Meny längst ned i mobilen där tummen når, flikar överst på bred skärm (globals.css).
 */
export default function ModeTabs({
  active,
  onChange,
  hasJourney,
}: {
  active: MenuKey | null;
  onChange: (key: MenuKey) => void;
  /** Något är sparat under Min resa: visas som en prick på fliken. */
  hasJourney: boolean;
}) {
  const { t } = useLang();
  return (
    <nav className="app-tabs" aria-label={t('Lägen', 'Views')}>
      {TABS.map((tb) => {
        const current = tb.key === active;
        return (
          <button
            key={tb.key}
            type="button"
            aria-current={current ? 'page' : undefined}
            className={`app-tab${current ? ' app-tab--active' : ''}`}
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
