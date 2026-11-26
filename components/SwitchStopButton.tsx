import React from 'react';
import { colors } from './styles';

type Props = {
  onClick: () => void;
  /** Visar att ett trafikslag- eller textfilter är aktivt, så att en kort tavla inte förvånar. */
  activeFilter: boolean;
};

/** Öppnar region, snabbval, sök och filter. På mobilen ligger den längst ner, där tummen når. */
export default function SwitchStopButton({ onClick, activeFilter }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={false}
      style={{
        width: '100%',
        padding: '0 20px',
        minHeight: '52px',
        borderRadius: 'var(--radius-card)',
        border: 'none',
        backgroundColor: colors.switchBg,
        color: colors.switchText,
        fontWeight: 800,
        fontSize: '15px',
        cursor: 'pointer',
        boxShadow: `0 8px 24px ${colors.shadow}`,
      }}
    >
      Byt hållplats eller filtrera{activeFilter ? ' · filter på' : ''}
    </button>
  );
}
