import React from 'react';
import { colors } from './styles';

type Props = {
  onAccept: () => void;
  onDecline: () => void;
  onReadMore: () => void;
};

const choiceButton = {
  flex: '1 1 140px',
  minHeight: '44px',
  padding: '0 16px',
  borderRadius: '10px',
  fontWeight: 800,
  fontSize: '14px',
  cursor: 'pointer',
  color: colors.text,
} as const;

/**
 * Fråga om statistik. "Godkänn" och "Neka" är lika stora och syns samtidigt,
 * så att det är lika lätt att säga nej som ja.
 */
export default function ConsentBanner({ onAccept, onDecline, onReadMore }: Props) {
  return (
    <div
      role="region"
      aria-label="Fråga om statistik"
      style={{
        position: 'fixed',
        left: '12px',
        right: '12px',
        bottom: '12px',
        zIndex: 50,
        maxWidth: '620px',
        margin: '0 auto',
        padding: '16px',
        borderRadius: '16px',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.borderStrong}`,
        boxShadow: `0 16px 40px ${colors.shadow}`,
      }}
    >
      <p style={{ margin: '0 0 12px 0', fontSize: '14px', lineHeight: 1.5, color: colors.textSoft }}>
        Får vi använda Google Analytics för att se hur sajten används? Det sätter kakor och skickar
        uppgifter om ditt besök till Google. Tavlan fungerar lika bra om du nekar.{' '}
        <button
          type="button"
          onClick={onReadMore}
          style={{
            padding: 0,
            border: 'none',
            background: 'none',
            color: colors.accent,
            textDecoration: 'underline',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Läs mer
        </button>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button
          type="button"
          onClick={onDecline}
          style={{ ...choiceButton, border: `1px solid ${colors.borderStrong}`, backgroundColor: colors.surfaceRaised }}
        >
          Neka
        </button>
        <button
          type="button"
          onClick={onAccept}
          style={{ ...choiceButton, color: colors.onAccent, border: `1px solid ${colors.accent}`, backgroundColor: colors.accentStrong }}
        >
          Godkänn
        </button>
      </div>
    </div>
  );
}
