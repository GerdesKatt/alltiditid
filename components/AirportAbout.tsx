import React from 'react';
import { colors } from './styles';
import Tr from './Tr';
import type { AirportPage } from '../lib/airportPages';

const paragraph = { color: colors.textDim, fontSize: 'var(--fs-3)', lineHeight: 1.6, margin: '0 0 12px 0' } as const;

/**
 * Text om flygplatsen under flygtavlan. Renderas på servern för flygplatsens egen sida
 * (/flyg/arlanda), så att sökmotorer ser vad sidan handlar om. Samma form som StopAbout.
 */
export default function AirportAbout({ airport, pages }: { airport: AirportPage; pages: AirportPage[] }) {
  const others = pages.filter((p) => p.iata !== airport.iata);
  return (
    <section
      aria-labelledby="om-flygplatsen"
      style={{ borderTop: `1px solid ${colors.text}`, paddingTop: '14px', margin: '28px 0 18px' }}
    >
      <h2 id="om-flygplatsen" style={{ fontSize: 'var(--fs-4)', fontWeight: 800, margin: '0 0 10px 0', color: colors.text }}>
        <Tr sv={`Om ${airport.name}`} en={`About ${airport.name}`} />
      </h2>
      <p style={paragraph}>
        <Tr
          sv={
            <>
              Avgångar och ankomster på {airport.name} ({airport.iata}) i realtid, med gate, nya tider och inställda
              flyg.
              {airport.waitTimes
                ? ' Här ser du också hur lång kön i säkerhetskontrollen är just nu, och hur lång den brukar vara.'
                : ''}{' '}
              Spara ditt flyg, så räknar appen ut när du behöver gå hemifrån.
            </>
          }
          en={
            <>
              Real-time departures and arrivals at {airport.name} ({airport.iata}), with gate, new times and cancelled
              flights.
              {airport.waitTimes ? ' You also see how long the security queue is right now, and how long it usually is.' : ''}{' '}
              Save your flight and the app works out when you need to leave home.
            </>
          }
        />
      </p>
      <h3 style={{ fontSize: 'var(--fs-3)', fontWeight: 800, margin: '16px 0 6px', color: colors.text }}>
        <Tr sv="Fler flygplatser" en="More airports" />
      </h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0 18px' }}>
        {others.map((p) => (
          <li key={p.iata}>
            <a
              href={`/flyg/${p.slug}`}
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px', color: colors.text, fontWeight: 600, fontSize: 'var(--fs-3)' }}
            >
              {p.short === 'Malmö' ? p.name : p.short}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
