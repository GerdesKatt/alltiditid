import type { Metadata } from 'next';
import React from 'react';
import { notFound } from 'next/navigation';
import App from '../../components/App';
import StopAbout from '../../components/StopAbout';
import { boardStopFor, modesText, STOP_PAGES, stopBySlug, type StopPage } from '../../lib/stops';
import { boardUrl } from '../../lib/prefetch';

// En sida per hållplats i data/stops.json, byggda i förväg (statisk export).
export const dynamicParams = false;

export function generateStaticParams() {
  return STOP_PAGES.map((s) => ({ slug: s.slug }));
}

type Params = { params: Promise<{ slug: string }> };

function description(stop: StopPage): string {
  const where = stop.place && !stop.name.startsWith(stop.place) ? ` i ${stop.place}` : '';
  const modes = stop.modes.length ? ` för ${modesText(stop.modes)}` : '';
  return `Avgångar från ${stop.name}${where} i realtid${modes}. Se nästa avgång, förseningar, inställda turer och spår. Utan reklam, utan konto.`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const stop = stopBySlug((await params).slug);
  if (!stop) return {};
  const title = `${stop.name} – avgångar i realtid`;
  const url = `/${stop.slug}`;
  return {
    title: `${title} | alltiditid`,
    description: description(stop),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'sv_SE',
      siteName: 'alltiditid',
      url,
      title,
      description: description(stop),
      images: [{ url: '/og.png', width: 1200, height: 630, alt: 'alltiditid: nästa avgång, i realtid' }],
    },
    twitter: { card: 'summary_large_image', title, description: description(stop), images: ['/og.png'] },
  };
}

/** schema.org-typ efter trafikslag: tågstation, tunnelbanestation eller busshållplats. */
function schemaType(stop: StopPage): string {
  if (stop.modes.includes('Tåg')) return 'TrainStation';
  if (stop.modes.includes('T-bana')) return 'SubwayStation';
  if (stop.modes.length === 1 && stop.modes[0] === 'Buss') return 'BusStop';
  return 'Place';
}

export default async function StopPageRoute({ params }: Params) {
  const stop = stopBySlug((await params).slug);
  if (!stop) notFound();
  const board = boardStopFor(stop);
  const url = boardUrl(board.id, board.name, 'departures');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': schemaType(stop),
    name: stop.name,
    url: `https://alltiditid.se/${stop.slug}`,
    geo: { '@type': 'GeoCoordinates', latitude: stop.lat, longitude: stop.lon },
    ...(stop.place ? { address: { '@type': 'PostalAddress', addressLocality: stop.place, addressCountry: 'SE' } } : {}),
  };

  return (
    <>
      {/* Hämta tavlan direkt, innan React har laddat (som PREFETCH_SCRIPT på startsidan). */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(!location.search)window.__alltiditidPrefetch={url:${JSON.stringify(
            url
          )},promise:fetch(${JSON.stringify(url)})}}catch(e){}`,
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <App initialStop={board} page={stop} intro={<StopAbout stop={stop} pages={STOP_PAGES} />} />
    </>
  );
}
