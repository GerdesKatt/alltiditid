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
        minHeight: '48px',
        padding: '0 20px',
        borderRadius: '999px',
        border: `2px solid ${colors.accent}`,
        backgroundColor: '#0c2a40',
        color: colors.text,
        fontWeight: 800,
        fontSize: '15px',
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(2, 6, 23, 0.6)',
      }}
    >
      Byt hållplats eller filtrera{activeFilter ? ' · filter på' : ''}
    </button>
  );
}
