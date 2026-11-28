'use client';
import React, { useEffect, useState } from 'react';
import type { Departure } from '../lib/types';
import { boardUrl } from '../lib/prefetch';
import { countdownFor, lineBadge } from '../lib/lineFormat';
import { lineLabel, useLang } from '../lib/i18n';
import { badgeLook, colors, fonts } from './styles';

const REFRESH_MS = 30_000;
const VALID_ID = /^\d{6,12}(,\d{6,12}){0,3}$/;

/** Antal rader: ?rader=5 (3–15), annars 8. */
function rowCount(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 3 && n <= 15 ? Math.round(n) : 8;
}

/**
 * Tavlan för en iframe: bara hållplatsens namn, nästa avgångar och en länk tillbaka.
 * Ingen meny, ingen Hem, inget som sparas. Uppdateras var 30:e sekund.
 * Länken tillbaka bär utm_source=inbaddad, så att vi ser hur många som kommer den vägen.
 */
export default function EmbedBoard() {
  const { lang, t } = useLang();
  const [stop, setStop] = useState<{ id: string; name: string } | null>(null);
  const [rows, setRows] = useState(8);
  const [items, setItems] = useState<Departure[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = (p.get('h') || '').trim();
    const name = (p.get('n') || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80);
    setRows(rowCount(p.get('rader')));
    if (VALID_ID.test(id) && name) setStop({ id, name });
    else setFailed(true);
  }, []);

  useEffect(() => {
    if (!stop) return;
    let alive = true;
    async function load() {
      try {
        const res = await fetch(boardUrl(stop!.id, stop!.name, 'departures'));
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { departures?: Departure[] };
        if (!alive) return;
        setItems(Array.isArray(data.departures) ? data.departures : []);
        setFailed(false);
      } catch {
        if (alive) setFailed(true);
      }
      if (alive) setNow(Date.now());
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [stop]);

  const home = stop
    ? `https://alltiditid.se/?h=${encodeURIComponent(stop.id)}&n=${encodeURIComponent(stop.name)}&utm_source=inbaddad`
    : 'https://alltiditid.se/?utm_source=inbaddad';

  return (
    <main style={{ padding: '14px 16px', minHeight: '100vh', boxSizing: 'border-box', backgroundColor: colors.bg, color: colors.text }}>
      <h1 style={{ fontFamily: fonts.display, fontSize: 'var(--fs-5)', fontWeight: 800, fontStretch: 'var(--stretch-head)', lineHeight: 1.05, margin: '0 0 10px' }}>
        {stop ? stop.name : t('Avgångar', 'Departures')}
      </h1>
      {!stop && failed ? (
        <p style={{ color: colors.textDim, fontSize: 'var(--fs-3)' }}>
          {t('Hållplatsen saknas i länken. Hämta koden under Om stationen på alltiditid.se.', 'The stop is missing from the link. Get the code under About the station on alltiditid.se.')}
        </p>
      ) : null}
      {stop && items === null && !failed ? <p style={{ color: colors.textDim, fontSize: 'var(--fs-3)' }}>{t('Hämtar avgångar …', 'Loading departures …')}</p> : null}
      {stop && failed && items === null ? (
        <p style={{ color: colors.textDim, fontSize: 'var(--fs-3)' }}>{t('Avgångarna går inte att hämta just nu.', "Departures can't be loaded right now.")}</p>
      ) : null}
      {items && items.length === 0 ? <p style={{ color: colors.textDim, fontSize: 'var(--fs-3)' }}>{t('Inga fler avgångar just nu.', 'No more departures right now.')}</p> : null}
      {items && items.length ? (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${colors.text}` }}>
          {items.slice(0, rows).map((d) => {
            const cancelled = d.status === 'cancelled';
            return (
              <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderBottom: `1px solid ${colors.border}` }}>
                <span
                  style={{
                    ...badgeLook(d, { cancelled }),
                    minWidth: '44px',
                    padding: '2px 6px',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                    fontFamily: fonts.display,
                    fontWeight: 800,
                    fontSize: 'var(--fs-2)',
                  }}
                >
                  {lineLabel(lineBadge(d.line), lang)}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-3)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: cancelled ? 'line-through' : undefined }}>
                  {d.destination}
                </span>
                <span style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 'var(--fs-3)', fontVariantNumeric: 'tabular-nums', color: cancelled ? colors.textDim : d.status === 'delayed' ? colors.amber : colors.text }}>
                  {cancelled ? t('Inställd', 'Cancelled') : countdownFor(d, now)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-2)', color: colors.textDim, display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <span>{t('Realtid från Trafiklab.se', 'Real time from Trafiklab.se')}</span>
        <a href={home} target="_blank" rel="noopener" style={{ color: colors.text, fontWeight: 700 }}>
          alltid i tid ↗
        </a>
      </p>
    </main>
  );
}
