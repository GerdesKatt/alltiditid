import React from 'react';
import type { BoardDirection } from '../lib/types';
import { colors } from './styles';
import { useLang } from '../lib/i18n';

type Props = {
  direction: BoardDirection;
  onChange: (direction: BoardDirection) => void;
};

const OPTIONS: { key: BoardDirection; label: string; labelEn: string; activeBorder: string; activeBg: string }[] = [
  { key: 'departures', label: 'Avgångar', labelEn: 'Departures', activeBorder: colors.accentStrong, activeBg: colors.accentStrong },
  { key: 'arrivals', label: 'Ankomster', labelEn: 'Arrivals', activeBorder: colors.arrivalsBg, activeBg: colors.arrivalsBg },
];

/** Avgångar/Ankomster, direkt vid tavlan så att man inte behöver öppna inställningarna. */
export default function DirectionToggle({ direction, onChange }: Props) {
  const { t } = useLang();
  return (
    <div role="group" aria-label={t('Visa', 'Show')} style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
      {OPTIONS.map((opt) => {
        const active = direction === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.key)}
            style={{
              minHeight: '44px',
              padding: '0 16px',
              borderRadius: 0,
              border: active ? `1px solid ${opt.activeBorder}` : `1px solid ${colors.borderMuted}`,
              backgroundColor: active ? opt.activeBg : colors.surface,
              color: active ? colors.onAccent : colors.text,
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            {t(opt.label, opt.labelEn)}
          </button>
        );
      })}
    </div>
  );
}
