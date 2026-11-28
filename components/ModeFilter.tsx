import React from 'react';
import type { TransportMode } from '../lib/types';
import { colors } from './styles';
import { modeLabel, useLang } from '../lib/i18n';

/**
 * Ett lätt reglage för trafikslag: Alla, T-bana, Buss … som text, med en linje under det valda.
 * Samma rad på tavlan och på Avgångar. Ingen scrollbar rad: Safari ritar ibland inte om en
 * sådan efter ett tryck (trasiga bokstäver), så raden bryts i stället.
 */
export default function ModeFilter({
  modes,
  mode,
  onChange,
  style,
}: {
  modes: { key: TransportMode; label: string }[];
  mode: TransportMode;
  onChange: (mode: TransportMode) => void;
  style?: React.CSSProperties;
}) {
  const { t, lang } = useLang();
  return (
    <div
      role="group"
      aria-label={t('Trafikslag', 'Mode of transport')}
      style={{ display: 'flex', flexWrap: 'wrap', columnGap: '18px', borderBottom: `1px solid ${colors.border}`, ...style }}
    >
      {[{ key: 'all' as TransportMode, label: 'Alla' }, ...modes].map((m) => {
        const active = mode === m.key;
        return (
          <button
            key={m.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(m.key)}
            style={{
              flexShrink: 0,
              minHeight: '44px',
              padding: '0 2px',
              border: 'none',
              borderBottom: `2px solid ${active ? colors.text : 'transparent'}`,
              backgroundColor: 'transparent',
              color: active ? colors.text : colors.textDim,
              fontWeight: active ? 700 : 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {modeLabel(m.label, lang)}
          </button>
        );
      })}
    </div>
  );
}
