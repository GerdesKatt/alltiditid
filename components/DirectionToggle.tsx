import React from 'react';
import type { BoardDirection } from '../lib/types';
import { colors } from './styles';
import { useLang } from '../lib/i18n';

type Props = {
  direction: BoardDirection;
  onChange: (direction: BoardDirection) => void;
};

const OPTIONS: { key: BoardDirection; label: string; labelEn: string }[] = [
  { key: 'departures', label: 'Avgångar', labelEn: 'Departures' },
  { key: 'arrivals', label: 'Ankomster', labelEn: 'Arrivals' },
];

/**
 * Avgångar/Ankomster: samma understrukna flikar som tavlans filter (Alla/Tåg/Buss),
 * så att ett vyval ser likadant ut i hela appen.
 */
export default function DirectionToggle({ direction, onChange }: Props) {
  const { t } = useLang();
  return (
    <div
      role="group"
      aria-label={t('Visa', 'Show')}
      style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', columnGap: '18px', borderBottom: `1px solid ${colors.border}` }}
    >
      {OPTIONS.map((opt) => {
        const active = direction === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.key)}
            style={{
              flexShrink: 0,
              minHeight: '44px',
              padding: '0 2px',
              border: 'none',
              borderBottom: `2px solid ${active ? colors.text : 'transparent'}`,
              borderRadius: 0,
              backgroundColor: 'transparent',
              color: active ? colors.text : colors.textDim,
              fontWeight: active ? 800 : 700,
              fontSize: 'var(--fs-2)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t(opt.label, opt.labelEn)}
          </button>
        );
      })}
    </div>
  );
}
