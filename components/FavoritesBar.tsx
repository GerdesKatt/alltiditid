import React from 'react';
import type { StopOption } from '../lib/types';
import { colors } from './styles';

type Props = {
  favorites: StopOption[];
  currentId: string;
  onSelect: (stop: StopOption) => void;
};

/** Sparade hållplatser som en rad knappar ovanför tavlan: ett tryck byter tavla. */
export default function FavoritesBar({ favorites, currentId, onSelect }: Props) {
  if (favorites.length === 0) return null;
  return (
    <nav aria-label="Sparade hållplatser" style={{ marginBottom: '14px' }}>
      <ul
        className="favorites-scroll"
        style={{
          display: 'flex',
          gap: '8px',
          listStyle: 'none',
          margin: 0,
          padding: '2px 0 4px',
          overflowX: 'auto',
        }}
      >
        {favorites.map((stop) => {
          const current = stop.id === currentId;
          return (
            <li key={stop.id} style={{ flexShrink: 0 }}>
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                onClick={() => onSelect(stop)}
                style={{
                  minHeight: '40px',
                  padding: '0 14px',
                  borderRadius: '999px',
                  border: current ? `2px solid ${colors.accent}` : `1px solid ${colors.borderStrong}`,
                  backgroundColor: current ? colors.accentTint : colors.surface,
                  color: colors.text,
                  fontSize: '14px',
                  fontWeight: current ? 800 : 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden="true" style={{ color: colors.amber, marginRight: '6px' }}>
                  ★
                </span>
                {stop.shortName || stop.name}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
