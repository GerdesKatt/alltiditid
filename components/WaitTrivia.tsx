import React from 'react';
import Icon from './Icon';
import { colors } from './styles';
import { useLang } from '../lib/i18n';
import { useTrivia } from '../lib/useTrivia';
import { track } from '../lib/track';

/**
 * "När du väntar": en lugn rad under tavlan när nästa avgång dröjer mer än 15 minuter.
 * Visas bara när det faktiskt finns kuriosa om platsen, och öppnar "Om stationen".
 * Står under taxi- och cykelraden när båda syns, i samma stil, utan färg.
 */
export default function WaitTrivia({
  stopName,
  coords,
  onOpen,
  first,
}: {
  stopName: string;
  coords: { lat: number; lon: number } | null;
  onOpen: () => void;
  /** Ingen taxirad ovanför: då börjar raden med tavlans avslutande linje. */
  first?: boolean;
}) {
  const { lang, t } = useLang();
  const trivia = useTrivia(stopName, coords, lang);
  if (!trivia) return null;

  const about = trivia.kind === 'station' || trivia.kind === 'place' ? stopName : trivia.title;
  return (
    <button
      type="button"
      onClick={() => {
        track('funktion', 0, 'kuriosa_vantan');
        onOpen();
      }}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 0',
        border: 'none',
        borderBottom: `1px solid ${colors.border}`,
        ...(first ? { marginTop: '14px', borderTop: `1px solid ${colors.text}` } : null),
        backgroundColor: 'transparent',
        color: colors.text,
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
      }}
    >
      <span style={{ paddingTop: '2px', color: colors.textDim }}>
        <Icon name="book" size={18} />
      </span>
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: '0.9375rem' }}>{t('När du väntar', 'While you wait')}</strong>
        <span style={{ fontSize: '0.8125rem', color: colors.textDim }}>
          {t(`Visste du det här om ${about}?`, `Did you know this about ${about}?`)}
        </span>
      </span>
      <span aria-hidden="true" style={{ alignSelf: 'center', color: colors.textDim }}>›</span>
    </button>
  );
}
