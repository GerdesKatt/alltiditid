import React, { useEffect, useRef, useState } from 'react';
import type { StopOption } from '../lib/types';
import type { StopPage } from '../lib/stops';
import { modesText } from '../lib/stopText';
import { distanceKm } from '../lib/stopList.mjs';
import { colors, fonts } from './styles';

type Props = {
  stop: StopOption;
  /** Stationens sida, om den finns bland de 500. Saknas för mindre hållplatser. */
  page: StopPage | undefined;
  /** Grannarna, upplösta från page.near. */
  neighbours: StopPage[];
  onSelectStop: (stop: StopOption) => void;
  onClose: () => void;
};

function km(d: number): string {
  return d < 1 ? `${Math.round(d * 10) * 100} m` : `${d.toFixed(1).replace('.', ',')} km`;
}

function roughDaily(n: number): string {
  const r = n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10;
  return r.toLocaleString('sv-SE');
}

/** Länken som delas: stationens sida om den finns, annars en vanlig tavellänk. */
export function shareUrlFor(stop: StopOption, page: StopPage | undefined): string {
  if (page) return `https://alltiditid.se/${page.slug}`;
  return `https://alltiditid.se/?h=${encodeURIComponent(stop.id)}&n=${encodeURIComponent(stop.name)}`;
}

/**
 * "Om stationen": ett blad nerifrån med fakta, grannhållplatser och dela. Samma i
 * webbläsaren och i den installerade webbappen, där det inte finns någon adressrad.
 * Spårkartan får sin plats överst här när den finns.
 */
export default function StationSheet({ stop, page, neighbours, onSelectStop, onClose }: Props) {
  const sheetRef = useRef<HTMLElement>(null);
  const [shared, setShared] = useState<'' | 'copied' | 'failed'>('');

  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
  }, [stop.id]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function share() {
    const url = shareUrlFor(stop, page);
    const title = `${stop.name} – avgångar i realtid`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared('copied');
    } catch (err) {
      // Avbrutet delningsfönster är inget fel.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setShared('failed');
    }
  }

  const where = page?.place && !page.name.startsWith(page.place) ? ` i ${page.place}` : '';

  return (
    <section
      ref={sheetRef}
      className="onboard-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="stationsblad-rubrik"
      tabIndex={-1}
      style={{
        padding: '18px',
        borderRadius: '18px 18px 0 0',
        outline: 'none',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        boxShadow: `0 -8px 28px ${colors.shadow}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: colors.textDim }}>Om stationen</span>
          <h2
            id="stationsblad-rubrik"
            style={{ fontFamily: fonts.display, fontSize: '22px', fontWeight: 800, margin: '2px 0 0', color: colors.text }}
          >
            {stop.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            flexShrink: 0,
            minHeight: '44px',
            padding: '0 12px',
            borderRadius: 'var(--radius-control)',
            border: `1px solid ${colors.borderStrong}`,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Stäng
        </button>
      </div>

      {/* Plats för spårkartan (OpenStreetMap), när den finns för stationen. */}

      <p style={{ margin: '12px 0 0', fontSize: '15px', lineHeight: 1.55, color: colors.textDim }}>
        {page
          ? `${page.name}${where}${page.modes.length ? ` trafikeras av ${modesText(page.modes)}` : ''}${
              page.daily > 0 ? `, med i snitt omkring ${roughDaily(page.daily)} avgångar per dag` : ''
            }.`
          : `Vi har ingen egen sida för ${stop.name} än. Tavlan fungerar som vanligt, och du kan dela den.`}
      </p>

      {neighbours.length ? (
        <>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '16px 0 8px', color: colors.text }}>
            Hållplatser i närheten
          </h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', listStyle: 'none', margin: 0, padding: 0 }}>
            {neighbours.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onSelectStop({ id: n.id, name: n.name })}
                  style={{
                    width: '100%',
                    minHeight: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '0 14px',
                    borderRadius: 'var(--radius-control)',
                    border: 'none',
                    backgroundColor: colors.surfaceRaised,
                    color: colors.text,
                    fontSize: '15px',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.name}
                  </span>
                  <span style={{ flexShrink: 0, fontSize: '13px', fontWeight: 500, color: colors.textDim }}>
                    {page ? km(distanceKm(page, n)) : ''} ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
        <button
          type="button"
          onClick={share}
          style={{
            minHeight: '48px',
            padding: '0 18px',
            borderRadius: 'var(--radius-card)',
            border: 'none',
            backgroundColor: colors.accentStrong,
            color: colors.onAccent,
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Dela stationen
        </button>
        <span role="status" style={{ fontSize: '13px', color: colors.textDim }}>
          {shared === 'copied' ? 'Länken är kopierad.' : shared === 'failed' ? 'Kunde inte dela. Kopiera adressen i stället.' : ''}
        </span>
      </div>
    </section>
  );
}
