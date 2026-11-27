import React from 'react';
import { colors } from './styles';
import StopLinks from './StopLinks';
import Tr from './Tr';
import { decimal, modesSentence, type Lang } from '../lib/lang';
import type { StopPage } from '../lib/stops';
import { modesText } from '../lib/stopText';
import { distanceKm } from '../lib/stopList.mjs';
import { groupFor, sameStation } from '../lib/stationGroups.mjs';

const paragraph = { color: colors.textDim, fontSize: '0.9375rem', lineHeight: 1.6, margin: '0 0 12px 0' } as const;

function roughDaily(n: number, lang: Lang = 'sv'): string {
  const r = n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10;
  return r.toLocaleString(lang === 'en' ? 'en-GB' : 'sv-SE');
}

function km(d: number): string {
  return d < 1 ? `${Math.round(d * 10) * 100} m` : `${decimal(d, 1, 'sv')} km`;
}

function listText(parts: string[], and: string): string {
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`;
}

/**
 * Text om hållplatsen under tavlan. Renderas på servern för hållplatsens egen sida, så att
 * sökmotorer ser vad sidan handlar om, och i webbläsaren när man byter hållplats på sidan.
 * `pages` är alla hållplatssidor (data/stops.json på servern, /stops.json i webbläsaren).
 */
export default function StopAbout({ stop, pages }: { stop: StopPage; pages: StopPage[] }) {
  const byId = new Map(pages.map((s) => [s.id, s]));
  // Hållplatser som hör till samma station som denna visas inte som grannar, och flera
  // delar av en annan station (T-Centralen, Stockholm C) blir en rad.
  const seenStations: string[] = [];
  const near = stop.near
    .map((id) => byId.get(id))
    .filter((s): s is StopPage => Boolean(s))
    .filter((s) => {
      if (sameStation(s.id, stop.id) || seenStations.some((id) => sameStation(id, s.id))) return false;
      seenStations.push(s.id);
      return true;
    })
    .map((s) => ({ slug: s.slug, name: groupFor(s.id)?.name || s.name, note: km(distanceKm(stop, s)) }));
  const nearIds = new Set([stop.id, ...stop.near]);
  const samePlace = stop.place
    ? pages
        .filter((s) => s.place === stop.place && !nearIds.has(s.id) && !sameStation(s.id, stop.id))
        .slice(0, 8)
        .map((s) => ({ slug: s.slug, name: s.name }))
    : [];
  const group = groupFor(stop.id);

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
      {group ? (
        <p style={paragraph}>
          <Tr
            sv={`Tavlan visar hela stationen: ${listText(group.parts, 'och')}.`}
            en={`The board shows the whole station: ${listText(group.parts, 'and')}.`}
          />
        </p>
      ) : null}
      <p style={paragraph}>
        <Tr
          sv={
            <>
              Åker du härifrån ofta? Spara hållplatsen med stjärnan, eller tryck på en avgång och välj{' '}
              <strong style={{ color: colors.text }}>Spara som min resa</strong>, så syns de tre nästa avgångarna
              direkt när du öppnar alltid i tid.
            </>
          }
          en={
            <>
              Travel from here often? Save the stop with the star, or tap a departure and choose{' '}
              <strong style={{ color: colors.text }}>Save as my trip</strong>, and the next three departures show up
              as soon as you open alltid i tid.
            </>
          }
        />
      </p>
      <StopLinks title="Hållplatser i närheten" titleEn="Stops nearby" links={near} />
      <StopLinks title={`Fler hållplatser i ${stop.place}`} titleEn={`More stops in ${stop.place}`} links={samePlace} />
    </section>
  );
}
