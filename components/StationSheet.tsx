import React, { useEffect, useRef, useState } from 'react';
import type { StopOption } from '../lib/types';
import type { StopPage } from '../lib/stops';
import { modesText } from '../lib/stopText';
import { distanceKm } from '../lib/stopList.mjs';
import { colors, fonts } from './styles';
import { decimal, modesSentence, useLang, type Lang } from '../lib/i18n';
import { useTrivia } from '../lib/useTrivia';
import StopTrivia from './StopTrivia';
import { boardShareUrl, shareLink } from '../lib/share';
import { track } from '../lib/track';

type Props = {
  stop: StopOption;
  /** Stationens sida, om den finns bland de 500. Saknas för mindre hållplatser. */
  page: StopPage | undefined;
  /** Grannarna, upplösta från page.near. */
  neighbours: StopPage[];
  /** Hållplatsens läge (från tavlan eller sidan), för kuriosan om platsen. */
  coords: { lat: number; lon: number } | null;
  onSelectStop: (stop: StopOption) => void;
  onClose: () => void;
};

function km(d: number, lang: Lang): string {
  return d < 1 ? `${Math.round(d * 10) * 100} m` : `${decimal(d, 1, lang)} km`;
}

function roughDaily(n: number, lang: Lang): string {
  const r = n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10;
  return r.toLocaleString(lang === 'en' ? 'en-GB' : 'sv-SE');
}

/** Länken som delas: stationens sida om den finns, annars en vanlig tavellänk. */
export function shareUrlFor(stop: StopOption, page: StopPage | undefined): string {
  return boardShareUrl(stop, page);
}

/**
 * "Om stationen": ett blad nerifrån med fakta, grannhållplatser och dela. Samma i
 * webbläsaren och i den installerade webbappen, där det inte finns någon adressrad.
 * Spårkartan får sin plats överst här när den finns.
 */
export default function StationSheet({ stop, page, neighbours, coords, onSelectStop, onClose }: Props) {
  const { lang, t } = useLang();
  // Hämtas när bladet öppnas och cachas per hållplats, så att det räcker för alla hållplatser i landet.
  const trivia = useTrivia(stop.name, coords, lang);
  const sheetRef = useRef<HTMLElement>(null);
  const [shared, setShared] = useState<'' | 'copied' | 'failed'>('');
  const [embedCopied, setEmbedCopied] = useState(false);

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
    const title = `${stop.name} – ${t('avgångar i realtid', 'real-time departures')}`;
    const result = await shareLink({ title, url });
    if (result === 'shared' || result === 'copied') track('funktion', 0, 'dela_station');
    setShared(result === 'copied' ? 'copied' : result === 'failed' ? 'failed' : '');
  }


  const where = page?.place && !page.name.startsWith(page.place) ? ` ${t('i', 'in')} ${page.place}` : '';

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
        borderRadius: 0,
        outline: 'none',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        boxShadow: `0 -8px 28px ${colors.shadow}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 'var(--fs-2)', fontWeight: 700, color: colors.textDim }}>{t('Om stationen', 'About the station')}</span>
          <h2
            id="stationsblad-rubrik"
            style={{ fontFamily: fonts.display, fontSize: 'var(--fs-5)', fontWeight: 800, margin: '2px 0 0', color: colors.text }}
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
            fontSize: 'var(--fs-2)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('Stäng', 'Close')}
        </button>
      </div>

      {/* Plats för spårkartan (OpenStreetMap), när den finns för stationen. */}

      {/* Utan egen sida men med kuriosa räcker kuriosan; "ingen sida än" behövs inte då. */}
      {page || trivia === null ? (
      <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-3)', lineHeight: 1.55, color: colors.textDim }}>
        {page
          ? lang === 'en'
            ? `${page.name}${where}${page.modes.length ? ` is served by ${modesSentence(page.modes, 'en')}` : ''}${
                page.daily > 0 ? `, with around ${roughDaily(page.daily, lang)} departures a day on average` : ''
              }.`
            : `${page.name}${where}${page.modes.length ? ` trafikeras av ${modesText(page.modes)}` : ''}${
                page.daily > 0 ? `, med i snitt omkring ${roughDaily(page.daily, lang)} avgångar per dag` : ''
              }.`
          : t(
              `Vi har ingen egen sida för ${stop.name} än. Tavlan fungerar som vanligt, och du kan dela den.`,
              `We don't have a page for ${stop.name} yet. The board works as usual, and you can share it.`
            )}
      </p>
      ) : null}

      {trivia ? (
        <div style={page ? undefined : { marginTop: '-2px' }}>
          <StopTrivia trivia={trivia} stopName={stop.name} />
        </div>
      ) : null}

      {neighbours.length ? (
        <>
          <h3 style={{ fontSize: 'var(--fs-3)', fontWeight: 700, margin: '16px 0 8px', color: colors.text }}>
            {t('Hållplatser i närheten', 'Stops nearby')}
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
                    fontSize: 'var(--fs-3)',
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.name}
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 'var(--fs-2)', fontWeight: 400, color: colors.textDim }}>
                    {page ? km(distanceKm(page, n), lang) : ''} ›
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
            fontSize: 'var(--fs-3)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('Dela stationen', 'Share the station')}
        </button>
        <span role="status" style={{ fontSize: 'var(--fs-2)', color: colors.textDim }}>
          {shared === 'copied'
            ? t('Länken är kopierad.', 'Link copied.')
            : shared === 'failed'
            ? t('Kunde inte dela. Kopiera adressen i stället.', "Couldn't share. Copy the address instead.")
            : ''}
        </span>
      </div>

      {/* Tavlan på en annan sajt: hotell, kontor, förening (tillväxtplanen, ändring 6). */}
      <details style={{ marginTop: '14px', fontSize: 'var(--fs-2)', color: colors.textDim }}>
        <summary style={{ cursor: 'pointer', minHeight: '44px', display: 'flex', alignItems: 'center', fontWeight: 700, color: colors.text }}>
          {t('Visa tavlan på din egen sajt', 'Show the board on your own site')}
        </summary>
        <p style={{ margin: '4px 0 8px', lineHeight: 1.5 }}>
          {t(
            'Klistra in koden på hotellets, kontorets eller föreningens sida. Tavlan uppdateras av sig själv.',
            "Paste the code on your hotel's, office's or club's page. The board updates by itself."
          )}
        </p>
        <textarea
          readOnly
          value={embedCode(stop)}
          aria-label={t('Kod för att visa tavlan', 'Code to show the board')}
          onFocus={(e) => e.currentTarget.select()}
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem', padding: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.bg, color: colors.text, resize: 'vertical' }}
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(embedCode(stop));
              setEmbedCopied(true);
              track('funktion', 0, 'inbaddning_kopierad');
            } catch {
              setEmbedCopied(false);
            }
          }}
          style={{ marginTop: '6px', minHeight: '44px', padding: '0 14px', border: `1px solid ${colors.text}`, background: 'transparent', color: colors.text, fontSize: 'var(--fs-2)', fontWeight: 700, cursor: 'pointer' }}
        >
          {embedCopied ? t('✓ Koden är kopierad', '✓ Code copied') : t('Kopiera koden', 'Copy the code')}
        </button>
      </details>
    </section>
  );
}

/** iframe-koden för /tavla (components/EmbedBoard.tsx). */
function embedCode(stop: StopOption): string {
  const src = `https://alltiditid.se/tavla?h=${encodeURIComponent(stop.id)}&n=${encodeURIComponent(stop.name)}`;
  const title = `Avgångar från ${stop.name.replace(/"/g, '')}`;
  return `<iframe src="${src}" title="${title}" width="100%" height="460" style="border:0" loading="lazy"></iframe>`;
}
