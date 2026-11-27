'use client';
import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import { colors, fonts } from './styles';
import { useLang } from '../lib/i18n';
import { inStockholm, uberLink } from '../lib/mobility.mjs';
import { track } from '../lib/track';

type Area = { county: string; town: string; traffic: { name: string; url: string } | null };

const button: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '44px',
  padding: '0 14px',
  border: `1px solid ${colors.text}`,
  borderRadius: 0,
  color: colors.text,
  fontSize: '0.875rem',
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

/**
 * Strandad (på landet, inget går, ingen hållplats nära): två vägar vidare.
 * Närtrafik hos länets trafikbolag, som kör när man bokar till kollektivtrafikpris,
 * och taxi på orten. Länet och orten slås upp från positionen (avrundad, sparas inte).
 */
export default function StrandedTips({ lat, lon }: { lat: number; lon: number }) {
  const { t } = useLang();
  const [area, setArea] = useState<Area | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/trafik?action=area', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: Number(lat.toFixed(2)), lon: Number(lon.toFixed(2)) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setArea(d as Area);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lat, lon]);

  const traffic = area?.traffic;
  const town = area?.town;
  const sthlm = inStockholm(lat, lon);

  const block: React.CSSProperties = { display: 'flex', gap: '12px', padding: '14px 0', borderTop: `1px solid ${colors.border}` };
  const text: React.CSSProperties = { margin: '2px 0 10px', fontSize: '0.875rem', color: colors.textSoft, lineHeight: 1.5 };

  return (
    <section aria-label={t('Så kommer du vidare', 'How to get onward')} style={{ marginTop: '16px' }}>
      <h3 style={{ margin: '0 0 2px', fontFamily: fonts.text, fontSize: '1rem', fontWeight: 800, color: colors.text }}>
        {t('Lugnt, det finns vägar härifrån', 'Relax, there are ways out of here')}
      </h3>

      <div style={block}>
        <span style={{ paddingTop: '2px', color: colors.textDim }} aria-hidden="true">
          <Icon name="bus" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: '0.9375rem' }}>{t('Närtrafik', 'On-demand public transport')}</strong>
          <p style={text}>
            {t(
              'Landsbygdens bäst bevarade hemlighet: en buss eller taxi som hämtar dig om du bokar, till vanligt busspris. Boka gärna ett par timmar innan.',
              'The countryside’s best-kept secret: a bus or taxi that picks you up if you book, at the normal bus fare. Book a couple of hours ahead.'
            )}
          </p>
          {traffic ? (
            <a href={traffic.url} target="_blank" rel="noopener noreferrer" onClick={() => track('funktion', 0, 'nartrafik')} style={button}>
              {t(`Boka hos ${traffic.name} ↗`, `Book with ${traffic.name} ↗`)}
            </a>
          ) : (
            <p style={{ ...text, margin: 0 }}>{t('Fråga länets trafikbolag om närtrafik.', 'Ask the county’s public transport company.')}</p>
          )}
        </div>
      </div>

      <div style={block}>
        <span style={{ paddingTop: '2px', color: colors.textDim }} aria-hidden="true">
          <Icon name="car" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: '0.9375rem' }}>{t('Taxi', 'Taxi')}</strong>
          <p style={text}>{t('Snabbast härifrån, men dyrare. Fråga om priset när du ringer.', 'Fastest from here, but pricier. Ask for the fare when you call.')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {sthlm ? (
              <a href="tel:+46815000" onClick={() => track('funktion', 0, 'taxi_sthlm')} style={button}>
                {t('Ring Taxi Stockholm', 'Call Taxi Stockholm')}
              </a>
            ) : town ? (
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`taxi ${town}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('funktion', 0, 'taxi_ort')}
                style={button}
              >
                {t(`Taxi i ${town} ↗`, `Taxi in ${town} ↗`)}
              </a>
            ) : null}
            <a href={uberLink(lat, lon, t('Här', 'Here'))} target="_blank" rel="noopener noreferrer" onClick={() => track('funktion', 0, 'uber')} style={button}>
              Uber ↗
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
