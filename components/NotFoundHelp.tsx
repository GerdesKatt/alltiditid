'use client';
import React, { useEffect, useState } from 'react';
import Tr from './Tr';
import { colors } from './styles';
import { loadStopIndex } from '../lib/stopIndex';
import { fuzzyStops } from '../lib/fuzzyStops.mjs';
import type { StopPage } from '../lib/stops';

/**
 * Hjälp på 404-sidan: en adress som /stockholm-c skickas vidare till /stockholm-centralstation,
 * annars visas de hållplatser som liknar adressen (UX-revisionen, fynd 9).
 */
export default function NotFoundHelp() {
  const [guesses, setGuesses] = useState<StopPage[]>([]);
  useEffect(() => {
    const path = decodeURIComponent(window.location.pathname).replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!path || path.includes('/')) return;
    loadStopIndex().then((index) => {
      if (!index) return;
      // Vanliga kortformer: "stockholm-c" och "stockholm-central" är centralstationen.
      const long = path.replace(/-(c|central|cst)$/, '-centralstation');
      const exact = index.list.find((s) => s.slug === long || s.slug === path);
      if (exact) {
        window.location.replace(`/${exact.slug}`);
        return;
      }
      setGuesses(fuzzyStops(path.replace(/-/g, ' '), index.list, 3));
    });
  }, []);
  if (!guesses.length) return null;
  return (
    <section style={{ marginTop: '18px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 6px' }}>
        <Tr sv="Menade du" en="Did you mean" />
      </h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${colors.text}` }}>
        {guesses.map((s) => (
          <li key={s.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
            <a href={`/${s.slug}`} style={{ display: 'flex', alignItems: 'center', minHeight: '48px', color: colors.text, fontWeight: 700, textDecoration: 'none' }}>
              {s.name} →
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
