import type { Metadata } from 'next';
import React from 'react';
import { notFound } from 'next/navigation';
import Header from '../../../components/Header';
import Tr from '../../../components/Tr';
import { colors } from '../../../components/styles';
import { CITY_PAGES, cityBySlug, modesText, type CityPage } from '../../../lib/stops';

// En sida per stor ort (lib/stops.ts CITY_PAGES), byggda i förväg (statisk export).
export const dynamicParams = false;

export function generateStaticParams() {
  // Statisk export kräver minst en sida; utan stadssidor blir det en tom ort som ger 404.
  return CITY_PAGES.length ? CITY_PAGES.map((c) => ({ ort: c.slug })) : [{ ort: 'stockholm' }];
}

type Params = { params: Promise<{ ort: string }> };

function description(city: CityPage): string {
  const names = city.stops.slice(0, 4).map((s) => s.name).join(', ');
  return `Avgångar i realtid från ${city.stops.length} hållplatser i ${city.place}, bland annat ${names}. Nästa avgång, förseningar, inställda turer och spår. Gratis, utan konto.`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const city = cityBySlug((await params).ort);
  if (!city) return {};
  const title = `Avgångar i ${city.place} – i realtid`;
  const url = `/avgangar/${city.slug}`;
  return {
    title: `${title} | alltid i tid`,
    description: description(city),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'sv_SE',
      siteName: 'alltid i tid',
      url,
      title,
      description: description(city),
      images: [{ url: '/og-v3.png', width: 1200, height: 630, alt: 'alltid i tid: nästa avgång, i realtid' }],
    },
  };
}

export default async function CityPageRoute({ params }: Params) {
  const city = cityBySlug((await params).ort);
  if (!city) notFound();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Hållplatser i ${city.place}`,
    itemListElement: city.stops.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: s.name,
      url: `https://alltiditid.se/${s.slug}`,
    })),
  };
  return (
    <div className="app-shell" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <Header linkBase="/" />
      <main id="innehall">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '8px 0 6px' }}>
          <Tr sv={`Avgångar i ${city.place}`} en={`Departures in ${city.place}`} />
        </h1>
        <p style={{ color: colors.textDim, margin: '0 0 18px', fontSize: '0.9375rem' }}>
          <Tr
            sv={
              <>
                Välj hållplats för att se nästa avgång, förseningar och spår i realtid. Hittar du inte din? Sök på{' '}
                <a href="/" style={{ color: colors.text, fontWeight: 600 }}>
                  startsidan
                </a>
                .
              </>
            }
            en={
              <>
                Pick a stop to see the next departure, delays and tracks in real time. Can&apos;t find yours? Search
                on the{' '}
                <a href="/" style={{ color: colors.text, fontWeight: 600 }}>
                  home page
                </a>
                .
              </>
            }
          />
        </p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {city.stops.map((s) => (
            <li key={s.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
              <a
                href={`/${s.slug}`}
                style={{ display: 'block', padding: '12px 0', minHeight: '44px', boxSizing: 'border-box', color: colors.text, textDecoration: 'none' }}
              >
                <span style={{ display: 'block', fontWeight: 700 }}>{s.name}</span>
                {s.modes.length ? (
                  <span style={{ display: 'block', fontSize: '0.8125rem', color: colors.textDim }}>{modesText(s.modes)}</span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
        <p style={{ margin: '18px 0', fontSize: '0.9375rem' }}>
          <a href="/hallplatser" style={{ color: colors.text, fontWeight: 600 }}>
            <Tr sv="Alla hållplatser i Sverige" en="All stops in Sweden" />
          </a>
        </p>
      </main>
    </div>
  );
}
