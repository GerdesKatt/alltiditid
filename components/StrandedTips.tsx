'use client';
import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import { colors, fonts } from './styles';
import { useLang } from '../lib/i18n';
import { inStockholm, uberLink } from '../lib/mobility.mjs';
import { track } from '../lib/track';

/** Orter där Bolt kör (bolt.eu/sv-se/cities, november 2026). Bolt har ingen öppen länk med upphämtning ifylld. */
const BOLT_TOWNS = ['borås', 'enköping', 'eskilstuna', 'göteborg', 'helsingborg', 'kristianstad', 'linköping', 'lund', 'malmö', 'norrköping', 'stockholm', 'södertälje', 'trelleborg', 'uppsala', 'västerås', 'örebro'];

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
  // Länet avgör när det är känt (rutan runt Stockholm når ända till Uppsala); annars den ungefärliga rutan.
  const sthlm = area?.county ? /stockholm/i.test(area.county) : inStockholm(lat, lon);
  // Stad: appar för taxi först. Landet: lokal taxi först, Uber som reserv (bilar kan saknas där).
  const city = sthlm || (town ? BOLT_TOWNS.includes(town.toLowerCase()) : false);
  const uber = (
    <a href={uberLink(lat, lon, t('Här', 'Here'))} target="_blank" rel="noopener noreferrer" onClick={() => track('funktion', 0, 'uber')} style={button}>
      Uber ↗
    </a>
  );
  const localTaxi = town ? (
    <a
      href={`https://www.google.com/search?q=${encodeURIComponent(`taxi ${town}`)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('funktion', 0, 'taxi_ort')}
      style={button}
    >
      {t(`Taxi i ${town} ↗`, `Taxi in ${town} ↗`)}
    </a>
  ) : null;

  const block: React.CSSProperties = { display: 'flex', gap: '12px', padding: '14px 0', borderTop: `1px solid ${colors.border}` };
  const text: React.CSSProperties = { margin: '2px 0 10px', fontSize: '0.875rem', color: colors.textSoft, lineHeight: 1.5 };

  return (
    <section aria-label={t('Så kommer du vidare', 'How to get onward')} style={{ marginTop: '16px' }}>
      <h3 style={{ margin: '0 0 2px', fontFamily: fonts.text, fontSize: '1rem', fontWeight: 800, color: colors.text }}>
        {t('Strandad? Inte länge till.', 'Stranded? Not for long.')}
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
          <p style={text}>
            {city
              ? t('Snabbast, inte billigast. Jämför i apparna.', 'Fastest, not cheapest. Compare in the apps.')
              : t('Snabbast, inte billigast. Ring en lokal taxi, Uber har sällan bilar här ute.', 'Fastest, not cheapest. Call a local taxi, Uber rarely has cars out here.')}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {sthlm ? (
              <a href="tel:+46815000" onClick={() => track('funktion', 0, 'taxi_sthlm')} style={button}>
                {t('Ring Taxi Stockholm', 'Call Taxi Stockholm')}
              </a>
            ) : null}
            {city ? (
              <>
                {uber}
                <a href="https://bolt.eu/sv-se/rides/" target="_blank" rel="noopener noreferrer" onClick={() => track('funktion', 0, 'bolt')} style={button}>
                  Bolt ↗
                </a>
              </>
            ) : (
              <>
                {localTaxi}
                {uber}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
