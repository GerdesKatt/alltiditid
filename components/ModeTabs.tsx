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
 * Tavla och Flyg är båda tavlor; Min resa är det som syr ihop resan och sticker därför ut
 * (hallonfärgad, i mitten).
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
            className={`app-tab${tb.key === 'resa' ? ' app-tab--journey' : ''}${active ? ' app-tab--active' : ''}`}
            onClick={() => onChange(tb.key)}
          >
            <TabIcon tab={tb.key} />
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

/** Små ikoner så att lägena går att känna igen utan att läsa. */
function TabIcon({ tab }: { tab: AppTab }) {
  const common = {
    'aria-hidden': true,
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'app-tab-icon',
  };
  if (tab === 'trafik') {
    // Tavla: rader med tider.
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <path d="M7 9h6M7 13h6M7 17h4M16.5 9h.5M16.5 13h.5" />
      </svg>
    );
  }
  if (tab === 'resa') {
    // Min resa: en sträcka med start och mål.
    return (
      <svg {...common}>
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" />
      </svg>
    );
  }
  // Flyg
  return (
    <svg {...common}>
      <path d="M10.5 13.5 4 11l1.5-1.5 7 1 4-4a2 2 0 0 1 3 3l-4 4 1 7L15 22l-2.5-6.5-3 3V21l-1.5 1-1-3.5L3.5 17.5 4.5 16h2.5z" />
    </svg>
  );
}
