import React from 'react';

export type AppTab = 'trafik' | 'resa' | 'flyg';

const TABS: { key: AppTab; label: string }[] = [
  { key: 'trafik', label: 'Tavla' },
  { key: 'resa', label: 'Min resa' },
  { key: 'flyg', label: 'Flyg' },
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
  return (
    <nav className="app-tabs" aria-label="Lägen">
      {TABS.map((t) => {
        const active = t.key === tab;
        return (
          <button
            key={t.key}
            type="button"
            aria-current={active ? 'page' : undefined}
            className={`app-tab${active ? ' app-tab--active' : ''}`}
            onClick={() => onChange(t.key)}
          >
            {t.label}
            {t.key === 'resa' && hasJourney ? (
              <>
                <span className="app-tab-dot" aria-hidden="true" />
                <span className="sr-only"> (sparad resa)</span>
              </>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
