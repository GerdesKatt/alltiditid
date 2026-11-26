import React from 'react';
import { colors } from './styles';
import { useLang } from '../lib/i18n';

export type AppTab = 'trafik' | 'flyg';

const TABS: { key: AppTab; label: string; labelEn: string }[] = [
  { key: 'trafik', label: 'Kollektivtrafik', labelEn: 'Public transport' },
  { key: 'flyg', label: 'Flyg', labelEn: 'Flights' },
];

/** De två flikarna överst: kollektivtrafik och flyg. */
export default function ModeTabs({ tab, onChange }: { tab: AppTab; onChange: (tab: AppTab) => void }) {
  const { t } = useLang();
  return (
    <div
      role="group"
      aria-label={t('Visa', 'Show')}
      style={{
        display: 'grid',
        // Vid stor text hamnar flikarna under varandra i stället för utanför skärmen.
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))',
        gap: '3px',
        padding: '3px',
        margin: '0 0 14px',
        borderRadius: 'var(--radius-card)',
        backgroundColor: colors.surfaceRaised,
      }}
    >
      {TABS.map((tb) => {
        const active = tb.key === tab;
        return (
          <button
            key={tb.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tb.key)}
            style={{
              minHeight: '44px',
              borderRadius: 'var(--radius-control)',
              border: 'none',
              backgroundColor: active ? colors.accentStrong : 'transparent',
              color: active ? colors.onAccent : colors.text,
              fontSize: '0.9375rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t(tb.label, tb.labelEn)}
          </button>
        );
      })}
    </div>
  );
}
