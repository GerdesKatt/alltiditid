import React from 'react';
import { StarIcon } from './Icon';
import type { StopOption } from '../lib/types';
import { colors } from './styles';
import { useLang } from '../lib/i18n';

type Props = {
  favorites: StopOption[];
  currentId: string;
  onSelect: (stop: StopOption) => void;
};

/** Sparade hållplatser som en rad knappar ovanför tavlan: ett tryck byter tavla. */
export default function FavoritesBar({ favorites, currentId, onSelect }: Props) {
  const { t } = useLang();
  if (favorites.length === 0) return null;
  return (
    <nav aria-label={t('Sparade hållplatser', 'Saved stops')} style={{ marginBottom: '6px' }}>
      <ul
        className="favorites-scroll"
        style={{
          display: 'flex',
          gap: '18px',
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
                  // En lätt rad: stjärna och namn, det valda understruket.
                  minHeight: '44px',
                  padding: 0,
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: current ? colors.text : colors.textDim,
                  textDecoration: current ? 'underline' : 'none',
                  textUnderlineOffset: '5px',
                  textDecorationThickness: '2px',
                  fontSize: 'var(--fs-2)',
                  fontWeight: current ? 800 : 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden="true" style={{ display: 'inline-flex', color: 'inherit', marginRight: '6px' }}>
                  <StarIcon filled size={14} />
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
