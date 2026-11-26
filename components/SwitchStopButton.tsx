import React from 'react';
import { colors } from './styles';

type Props = {
  onClick: () => void;
  /** Visar att ett trafikslag- eller textfilter är aktivt, så att en kort tavla inte förvånar. */
  activeFilter: boolean;
};

/**
 * Öppnar region, snabbval, sök och filter. På mobilen flyter den nere till höger, där
 * tummen når, men i kortens färg så att den inte tar över tavlan.
 */
export default function SwitchStopButton({ onClick, activeFilter }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={false}
      aria-label={activeFilter ? 'Byt hållplats eller ändra filter (filter på)' : 'Byt hållplats eller filtrera'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 18px 0 14px',
        minHeight: '48px',
        borderRadius: '999px',
        border: `1px solid ${colors.borderStrong}`,
        backgroundColor: colors.surface,
        color: colors.text,
        fontWeight: 700,
        fontSize: '0.9375rem',
        cursor: 'pointer',
        boxShadow: `0 6px 18px ${colors.shadow}`,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      Byt hållplats
      {activeFilter ? (
        <span
          aria-hidden="true"
          style={{
            padding: '2px 8px',
            borderRadius: '999px',
            backgroundColor: colors.surfaceRaised,
            color: colors.textDim,
            fontSize: '0.8125rem',
            fontWeight: 700,
          }}
        >
          filter
        </span>
      ) : null}
    </button>
  );
}
