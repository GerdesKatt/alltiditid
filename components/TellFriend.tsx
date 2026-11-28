'use client';
import React, { useState } from 'react';
import { colors } from './styles';
import { useLang } from '../lib/i18n';
import { shareLink } from '../lib/share';
import { track } from '../lib/track';

/**
 * "Tipsa en vän" (tillväxtplanen, ändring 5): en lugn textlänk, inte en knapp som tar plats.
 * Står där man just fått hjälp: på Hem och på kvittot när man är framme.
 * Budskapet följer annonserna: namn, slogan och realtid för hela Sverige.
 */
export default function TellFriend({ where }: { where: 'hem' | 'kvitto' }) {
  const { t } = useLang();
  const [note, setNote] = useState<'' | 'copied' | 'failed'>('');

  async function tell() {
    const result = await shareLink({
      title: 'alltid i tid',
      text: t(
        'alltid i tid. För oss som inte kommer sent. Realtid för hela Sverige: lokalt, regionalt och flyg.',
        'alltid i tid. For those of us who are never late. Real time for all of Sweden: local, regional and flights.'
      ),
      url: 'https://alltiditid.se/?utm_source=tipsa',
    });
    if (result === 'shared' || result === 'copied') track('funktion', 0, `tipsa_${where}`);
    if (result === 'copied' || result === 'failed') {
      setNote(result);
      window.setTimeout(() => setNote(''), 4000);
    }
  }

  return (
    <p style={{ margin: where === 'hem' ? '0 0 22px' : '10px 0 0', fontSize: 'var(--fs-2)', color: colors.textDim }}>
      <button
        type="button"
        className="tap-44"
        onClick={tell}
        style={{ border: 'none', background: 'none', padding: 0, color: colors.text, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px', cursor: 'pointer', font: 'inherit' }}
      >
        {t('Tipsa en vän om alltid i tid', 'Tell a friend about alltid i tid')}
      </button>
      <span role="status" style={{ marginLeft: '10px' }}>
        {note === 'copied' ? t('Länken är kopierad.', 'Link copied.') : note === 'failed' ? t('Gick inte att dela.', "Couldn't share.") : ''}
      </span>
    </p>
  );
}
