import type { Metadata } from 'next';
import React from 'react';
import App from '../components/App';
import StopLinks from '../components/StopLinks';
import { colors } from '../components/styles';
import { STOP_PAGES } from '../lib/stops';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

/** Länkar till de mest trafikerade hållplatserna, så att sökmotorerna hittar sidorna. */
function PopularStops() {
  const links = STOP_PAGES.slice(0, 24).map((s) => ({ slug: s.slug, name: s.name }));
  return (
    <section style={{ margin: '18px 0' }}>
      <StopLinks title="Populära hållplatser" links={links} />
      <p style={{ margin: '12px 0 0', fontSize: '14px' }}>
        <a href="/hallplatser" style={{ color: colors.text, fontWeight: 600 }}>
          Alla hållplatser
        </a>
      </p>
    </section>
  );
}

export default function HomePage() {
  return <App intro={<PopularStops />} />;
}
