import React from 'react';
import { colors } from './styles';

export type AppTab = 'trafik' | 'flyg';

const TABS: { key: AppTab; label: string }[] = [
  { key: 'trafik', label: 'Kollektivtrafik' },
  { key: 'flyg', label: 'Flyg' },
];

/** De två flikarna överst: kollektivtrafik och flyg. */
export default function ModeTabs({ tab, onChange }: { tab: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <div
      role="group"
      aria-label="Visa"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '3px',
        padding: '3px',
        margin: '0 0 14px',
        borderRadius: 'var(--radius-card)',
        backgroundColor: colors.surfaceRaised,
      }}
    >
      {TABS.map((t) => {
        const active = t.key === tab;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.key)}
            style={{
              minHeight: '44px',
              borderRadius: 'var(--radius-control)',
              border: 'none',
              backgroundColor: active ? colors.accentStrong : 'transparent',
              color: active ? colors.onAccent : colors.text,
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
