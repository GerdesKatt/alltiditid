import React from 'react';
import { colors } from './styles';
import StopLinks from './StopLinks';
import Tr from './Tr';
import { decimal, modesSentence, type Lang } from '../lib/lang';
import { modesText, STOP_PAGES, stopById, type StopPage } from '../lib/stops';
import { distanceKm } from '../lib/stopList.mjs';

const paragraph = { color: colors.textDim, fontSize: '0.9375rem', lineHeight: 1.6, margin: '0 0 12px 0' } as const;

function roughDaily(n: number, lang: Lang = 'sv'): string {
  const r = n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10;
  return r.toLocaleString(lang === 'en' ? 'en-GB' : 'sv-SE');
}

function km(d: number): string {
  return d < 1 ? `${Math.round(d * 10) * 100} m` : `${decimal(d, 1, 'sv')} km`;
}

/**
 * Text om hållplatsen under tavlan. Renderas på servern, så att sökmotorer ser vad
 * sidan handlar om även om tavlan laddas med JavaScript.
 */
export default function StopAbout({ stop }: { stop: StopPage }) {
  const near = stop.near
    .map((id) => stopById(id))
    .filter((s): s is StopPage => Boolean(s))
    .map((s) => ({ slug: s.slug, name: s.name, note: km(distanceKm(stop, s)) }));
  const nearIds = new Set([stop.id, ...stop.near]);
  const samePlace = stop.place
    ? STOP_PAGES.filter((s) => s.place === stop.place && !nearIds.has(s.id))
        .slice(0, 8)
        .map((s) => ({ slug: s.slug, name: s.name }))
    : [];

  const inPlace = Boolean(stop.place && !stop.name.startsWith(stop.place));

  return (
    <section
      aria-labelledby="om-hallplatsen"
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 'var(--radius-card)',
        padding: '20px',
        margin: '18px 0',
      }}
    >
      <h2 id="om-hallplatsen" style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 10px 0', color: colors.text }}>
        <Tr sv={`Om ${stop.name}`} en={`About ${stop.name}`} />
      </h2>
      <p style={paragraph}>
        <Tr
          sv={
            <>
              {stop.name}
              {inPlace ? ` i ${stop.place}` : ''}
              {stop.modes.length ? ` trafikeras av ${modesText(stop.modes)}` : ''}
              {stop.daily > 0 ? `, med i snitt omkring ${roughDaily(stop.daily)} avgångar per dag` : ''}. Tavlan visar
              nästa avgång i realtid, med förseningar, inställda turer och spår eller läge, och uppdateras var 30:e
              sekund.
            </>
          }
          en={
            <>
              {stop.name}
              {inPlace ? ` in ${stop.place}` : ''}
              {stop.modes.length ? ` is served by ${modesSentence(stop.modes, 'en')}` : ''}
              {stop.daily > 0 ? `, with around ${roughDaily(stop.daily, 'en')} departures a day on average` : ''}. The
              board shows the next departure in real time, with delays, cancellations and track or stand, and updates
              every 30 seconds.
            </>
          }
        />
      </p>
      <p style={paragraph}>
        <Tr
          sv={
            <>
              Åker du härifrån ofta? Spara hållplatsen med stjärnan, eller tryck på en avgång och välj{' '}
              <strong style={{ color: colors.text }}>Spara som min resa</strong>, så syns de tre nästa avgångarna
              direkt när du öppnar alltiditid.se.
            </>
          }
          en={
            <>
              Travel from here often? Save the stop with the star, or tap a departure and choose{' '}
              <strong style={{ color: colors.text }}>Save as my trip</strong>, and the next three departures show up
              as soon as you open alltiditid.se.
            </>
          }
        />
      </p>
      <StopLinks title="Hållplatser i närheten" titleEn="Stops nearby" links={near} />
      <StopLinks title={`Fler hållplatser i ${stop.place}`} titleEn={`More stops in ${stop.place}`} links={samePlace} />
    </section>
  );
}
