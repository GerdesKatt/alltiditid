import React from 'react';
import { colors } from './styles';
import { useLang } from '../lib/i18n';

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
  fontSize: '0.875rem',
  cursor: 'pointer',
  color: colors.text,
} as const;

/**
 * Fråga om statistik. "Godkänn" och "Neka" är lika stora och syns samtidigt,
 * så att det är lika lätt att säga nej som ja.
 */
export default function ConsentBanner({ onAccept, onDecline, onReadMore }: Props) {
  const { t } = useLang();
  return (
    <div
      role="region"
      aria-label={t('Fråga om statistik', 'Statistics consent')}
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
      <p style={{ margin: '0 0 12px 0', fontSize: '0.875rem', lineHeight: 1.5, color: colors.textSoft }}>
        {t(
          'Får vi använda Google Analytics för att se hur sajten används? Det sätter kakor och skickar uppgifter om ditt besök till Google. Tavlan fungerar lika bra om du nekar.',
          'May we use Google Analytics to see how the site is used? It sets cookies and sends information about your visit to Google. The board works just as well if you decline.'
        )}{' '}
        <button
          type="button"
          onClick={onReadMore}
          style={{
            padding: 0,
            border: 'none',
            background: 'none',
            color: colors.accent,
            textDecoration: 'underline',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          {t('Läs mer', 'Read more')}
        </button>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button
          type="button"
          onClick={onDecline}
          style={{ ...choiceButton, border: `1px solid ${colors.borderStrong}`, backgroundColor: colors.surfaceRaised }}
        >
          {t('Neka', 'Decline')}
        </button>
        <button
          type="button"
          onClick={onAccept}
          style={{ ...choiceButton, color: colors.onAccent, border: `1px solid ${colors.accentStrong}`, backgroundColor: colors.accentStrong }}
        >
          {t('Godkänn', 'Accept')}
        </button>
      </div>
    </div>
  );
}
