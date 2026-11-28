import React from 'react';
import type { TransportMode } from '../lib/types';
import { colors } from './styles';
import { modeLabel, useLang } from '../lib/i18n';

/**
 * Ett lätt reglage för trafikslag: Alla, T-bana, Buss … som text, med en linje under det valda.
 * Samma rad på tavlan och på Avgångar. Ingen scrollbar rad: Safari ritar ibland inte om en
 * sådan efter ett tryck (trasiga bokstäver). I stället får alla slag plats på en rad: vid många
 * slag krymper avstånd och text, och flikarna fördelas över bredden (bryts bara på mycket smal skärm).
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
  const many = modes.length >= 5;
  return (
    <div
      role="group"
      aria-label={t('Trafikslag', 'Mode of transport')}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: many ? '10px' : '18px',
        justifyContent: many ? 'space-between' : 'flex-start',
        borderBottom: `1px solid ${colors.border}`,
        ...style,
      }}
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
              padding: many ? '0' : '0 2px',
              border: 'none',
              borderBottom: `2px solid ${active ? colors.text : 'transparent'}`,
              backgroundColor: 'transparent',
              color: active ? colors.text : colors.textDim,
              fontWeight: active ? 700 : 600,
              fontSize: many ? '0.8125rem' : '0.875rem',
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
