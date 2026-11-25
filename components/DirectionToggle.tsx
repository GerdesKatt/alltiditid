import React from 'react';
import type { BoardDirection } from '../lib/types';
import { colors } from './styles';

type Props = {
  direction: BoardDirection;
  onChange: (direction: BoardDirection) => void;
};

const OPTIONS: { key: BoardDirection; label: string; activeBorder: string; activeBg: string }[] = [
  { key: 'departures', label: 'Avgångar', activeBorder: colors.accent, activeBg: '#0369a1' },
  { key: 'arrivals', label: 'Ankomster', activeBorder: colors.green, activeBg: '#047857' },
];

/** Avgångar/Ankomster, direkt vid tavlan så att man inte behöver öppna inställningarna. */
export default function DirectionToggle({ direction, onChange }: Props) {
  return (
    <div role="group" aria-label="Visa" style={{ display: 'flex', gap: '7px' }}>
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
              borderRadius: '10px',
              border: active ? `1px solid ${opt.activeBorder}` : `1px solid ${colors.borderMuted}`,
              backgroundColor: active ? opt.activeBg : colors.surface,
              color: colors.text,
              fontWeight: 800,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
