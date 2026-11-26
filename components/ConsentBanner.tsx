import React from 'react';
import { colors } from './styles';

type Props = {
  onAccept: () => void;
  onDecline: () => void;
  onReadMore: () => void;
};

const choiceButton = {
  flex: '1 1 6rem',
  minHeight: '44px',
  padding: '0 16px',
  borderRadius: '10px',
  fontWeight: 800,
  fontSize: '0.875rem',
  cursor: 'pointer',
  color: colors.text,
} as const;

/**
 * Fråga om statistik, som en låg rad längst ned så att tavlan syns. "Godkänn" och "Neka" är lika stora och syns samtidigt,
 * så att det är lika lätt att säga nej som ja.
 */
export default function ConsentBanner({ onAccept, onDecline, onReadMore }: Props) {
  return (
    <div
      role="region"
      className="consent-banner"
      aria-label="Fråga om statistik"
      style={{
        position: 'fixed',
        left: '12px',
        right: '12px',
        bottom: '12px',
        zIndex: 50,
        maxWidth: '620px',
        margin: '0 auto',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px 14px',
        padding: '10px 12px',
        borderRadius: '14px',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.borderStrong}`,
        boxShadow: `0 16px 40px ${colors.shadow}`,
      }}
    >
      <p style={{ flex: '1 1 16rem', margin: 0, fontSize: '0.8125rem', lineHeight: 1.4, color: colors.textSoft }}>
        Får vi mäta besöken med Google Analytics? Det sätter kakor och skickar uppgifter till Google.{' '}
        <button
          type="button"
          onClick={onReadMore}
          style={{
            padding: 0,
            border: 'none',
            background: 'none',
            color: colors.accent,
            textDecoration: 'underline',
            fontSize: '0.8125rem',
            cursor: 'pointer',
          }}
        >
          Läs mer
        </button>
      </p>
      <div style={{ flex: '1 1 12rem', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
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
          style={{ ...choiceButton, color: colors.onAccent, border: `1px solid ${colors.accentStrong}`, backgroundColor: colors.accentStrong }}
        >
          Godkänn
        </button>
      </div>
    </div>
  );
}
