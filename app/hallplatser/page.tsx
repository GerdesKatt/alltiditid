import type { Metadata } from 'next';
import React from 'react';
import Header from '../../components/Header';
import Tr from '../../components/Tr';
import { colors } from '../../components/styles';
import { CITY_PAGES, cityBySlug, placeSlug, STOP_PAGES } from '../../lib/stops';

export const metadata: Metadata = {
  title: 'Alla hållplatser – avgångar i realtid | alltid i tid',
  description: 'Hållplatser och stationer i hela Sverige med avgångar i realtid, ordnade efter ort.',
  alternates: { canonical: '/hallplatser' },
};

/** Alla hållplatssidor, ordnade efter ort. */
export default function AllStopsPage() {
  const groups = new Map<string, typeof STOP_PAGES>();
  for (const s of STOP_PAGES) {
    const place = s.place || 'Övriga';
    if (!groups.has(place)) groups.set(place, []);
    groups.get(place)!.push(s);
  }
  const places = [...groups.keys()].sort((a, b) =>
    a === 'Övriga' ? 1 : b === 'Övriga' ? -1 : a.localeCompare(b, 'sv')
  );

  return (
    <div className="app-shell" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <Header linkBase="/" />
      <main id="innehall">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '8px 0 6px' }}>
          <Tr sv="Alla hållplatser" en="All stops" />
        </h1>
        <p style={{ color: colors.textDim, margin: '0 0 18px', fontSize: '0.9375rem' }}>
          <Tr
            sv={
              <>
                {STOP_PAGES.length} av de mest trafikerade hållplatserna i Sverige. Hittar du inte din? Sök på{' '}
                <a href="/" style={{ color: colors.text, fontWeight: 600 }}>
                  startsidan
                </a>
                , där finns alla.
              </>
            }
            en={
              <>
                {STOP_PAGES.length} of the busiest stops in Sweden. Can&apos;t find yours? Search on the{' '}
                <a href="/" style={{ color: colors.text, fontWeight: 600 }}>
                  home page
                </a>
                , where all of them are.
              </>
            }
          />
        </p>
        {CITY_PAGES.length ? (
          <section style={{ marginBottom: '18px' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 8px' }}>
              <Tr sv="Städer" en="Cities" />
            </h2>
            <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', listStyle: 'none', margin: 0, padding: 0 }}>
              {CITY_PAGES.map((c) => (
                <li key={c.slug}>
                  <a href={`/avgangar/${c.slug}`} style={{ color: colors.text, fontSize: '0.9375rem' }}>
                    {c.place}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {places.map((place) => (
          <section key={place} style={{ marginBottom: '18px' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '0 0 8px' }}>
              {place === 'Övriga' ? (
                <Tr sv="Övriga" en="Other" />
              ) : cityBySlug(placeSlug(place)) ? (
                <a href={`/avgangar/${placeSlug(place)}`} style={{ color: colors.text }}>
                  {place}
                </a>
              ) : (
                place
              )}
            </h2>
            <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', listStyle: 'none', margin: 0, padding: 0 }}>
              {groups
                .get(place)!
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
                .map((s) => (
                  <li key={s.id}>
                    <a href={`/${s.slug}`} style={{ color: colors.text, fontSize: '0.9375rem' }}>
                      {s.name}
                    </a>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
