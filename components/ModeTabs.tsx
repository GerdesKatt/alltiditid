import React from 'react';
import { useLang } from '../lib/i18n';

/** Appens lägen: Avgångar (Hem och tavlor), Min resa och Flyg. */
export type AppTab = 'trafik' | 'resa' | 'flyg';
export type MenuKey = 'trafik' | 'resa' | 'flyg';

/** Tunna linjesymboler: buss (på marken), rutt (Min resa), flygplan (i luften). */
const ICONS: Record<MenuKey, React.ReactNode> = {
  trafik: (
    <>
      <rect x="5" y="3.5" width="14" height="14" rx="2.5" />
      <path d="M5 11h14M8.5 20.5v-3M15.5 20.5v-3" />
      <circle cx="8.5" cy="14.3" r="0.6" fill="currentColor" />
      <circle cx="15.5" cy="14.3" r="0.6" fill="currentColor" />
    </>
  ),
  resa: (
    <>
      <circle cx="5.5" cy="18.5" r="2.5" />
      <path d="M7.8 17.4C12 15.5 7 11 11.5 9.2s4.6-1.3 4.9-1.6" />
    </>
  ),
  flyg: <path d="M21 15.5v-1.7l-7.6-4.6V4.3a1.4 1.4 0 0 0-2.8 0v4.9L3 13.8v1.7l7.6-2.3v4.6l-2.1 1.6v1.3l3.5-1 3.5 1v-1.3l-2.1-1.6v-4.6z" />,
};

const TABS: { key: MenuKey; label: string; labelEn: string }[] = [
  { key: 'trafik', label: 'Avgångar', labelEn: 'Departures' },
  { key: 'resa', label: 'Min resa', labelEn: 'My trip' },
  { key: 'flyg', label: 'Flyg', labelEn: 'Flights' },
];

/**
 * Tre val: Avgångar (Hem med sökfältet och tavlorna), Min resa och Flyg (flygtavla och väntetider).
 * Meny längst ned i mobilen där tummen når, flikar överst på bred skärm (globals.css).
 */
export default function ModeTabs({
  active,
  onChange,
  hasJourney,
}: {
  active: MenuKey | null;
  onChange: (key: MenuKey) => void;
  /** Något är sparat under Min resa: ruttens slutpunkt i ikonen fylls i. */
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
            <span className="app-tab-sym" aria-hidden="true">
              <svg className="app-tab-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={current ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
                {ICONS[tb.key]}
                {/* Ruttens slutpunkt: ifylld när något är sparat under Min resa. */}
                {tb.key === 'resa' ? <circle cx="18.5" cy="5.5" r="2.5" fill={hasJourney ? 'currentColor' : 'none'} /> : null}
              </svg>
            </span>
            <span className="app-tab-label">{t(tb.label, tb.labelEn)}</span>
            {tb.key === 'resa' && hasJourney ? (
              <>
                <span className="sr-only"> ({t('sparad resa', 'saved trip')})</span>
              </>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
