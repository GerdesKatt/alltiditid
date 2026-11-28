import type { Metadata } from 'next';
import React from 'react';
import { notFound } from 'next/navigation';
import App from '../../../components/App';
import AirportAbout from '../../../components/AirportAbout';
import { AIRPORT_PAGES, airportBySlug, airportDescription } from '../../../lib/airportPages';

// En sida per flygplats (/flyg/arlanda), byggda i förväg (statisk export). Tillväxtplanen, ändring 3.
export const dynamicParams = false;

export function generateStaticParams() {
  return AIRPORT_PAGES.map((a) => ({ flygplats: a.slug }));
}

type Params = { params: Promise<{ flygplats: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const airport = airportBySlug((await params).flygplats);
  if (!airport) return {};
  const title = `${airport.name} – avgångar och ankomster i realtid`;
  const url = `/flyg/${airport.slug}`;
  const description = airportDescription(airport);
  return {
    title: `${title} | alltid i tid`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'sv_SE',
      siteName: 'alltid i tid',
      url,
      title,
      description,
      images: [{ url: '/og-v5.png', width: 1200, height: 630, alt: 'alltid i tid: nästa avgång, i realtid' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/og-v5.png'] },
  };
}

export default async function AirportPageRoute({ params }: Params) {
  const airport = airportBySlug((await params).flygplats);
  if (!airport) notFound();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Airport',
    name: airport.name,
    iataCode: airport.iata,
    url: `https://alltiditid.se/flyg/${airport.slug}`,
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <App initialAirport={airport.iata} intro={<AirportAbout airport={airport} pages={AIRPORT_PAGES} />} />
    </>
  );
}
