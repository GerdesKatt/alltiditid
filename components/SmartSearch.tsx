'use client';
import React, { useEffect, useState } from 'react';
import type { StopOption } from '../lib/types';
import { colors, fonts } from './styles';
import { useLang } from '../lib/i18n';
import { mergeStops } from '../lib/stationGroups.mjs';
import { AIRPORTS } from '../lib/flights.mjs';
import { track } from '../lib/track';
import { loadStopIndex } from '../lib/stopIndex';
import { fuzzyStops } from '../lib/fuzzyStops.mjs';

type Props = {
  onOpenStop: (stop: StopOption) => void;
  onGoal: (text: string) => void;
  onOpenTrain: (number: string) => void;
  onOpenAirport: (iata: string) => void;
};

const TRAIN = /^(?:tåg|sj|tag|train)?\s*(\d{2,5})$/i;

type Row =
  | { kind: 'train'; number: string }
  | { kind: 'airport'; iata: string; name: string }
  | { kind: 'stop'; stop: StopOption; guess?: boolean }
  | { kind: 'trip'; text: string };

/**
 * Ett enda fält för allt: hållplatser (se avgångar), "Resa till …" (planera), tågnummer och flyg.
 * Man behöver aldrig välja rätt fält; förslagen säger vad man kan göra.
 * Enter gör det mest sannolika: tåget för ett nummer, tavlan när namnet är en hållplats, annars resan.
 */
export default function SmartSearch({ onOpenStop, onGoal, onOpenTrain, onOpenAirport }: Props) {
  const { t } = useLang();
  const [q, setQ] = useState('');
  const [stops, setStops] = useState<StopOption[]>([]);
  // "Menade du …?" när sökningen inte gav någon träff (UX-revisionen, fynd 5).
  const [guesses, setGuesses] = useState<StopOption[]>([]);
  const [active, setActive] = useState(-1);
  // Sant när hållplatssöket svarade fel, så att "inga träffar" inte visas när det är servern som felar.
  const [failed, setFailed] = useState(false);
  const text = q.trim();

  useEffect(() => {
    if (text.length < 2 || TRAIN.test(text)) {
      setStops([]);
      setGuesses([]);
      setFailed(false);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      fetch(`/api/trafik?action=search&q=${encodeURIComponent(text)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(async (d) => {
          if (!alive) return;
          const found = (mergeStops(d.stops || []) as StopOption[]).slice(0, 4);
          setFailed(false);
          if (found.length) {
            setStops(found);
            setGuesses([]);
            return;
          }
          // Ingen träff: kanske ett stavfel. Jämför mot hållplatslistan ("uppsla" → Uppsala C).
          setStops([]);
          const index = await loadStopIndex();
          if (!alive) return;
          setGuesses(
            index ? fuzzyStops(text, index.list, 2).map((p) => ({ id: p.id, name: p.name, place: p.place, modes: p.modes })) : []
          );
        })
        .catch(() => {
          if (!alive) return;
          setStops([]);
          setFailed(true);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [text]);

  const train = TRAIN.exec(text)?.[1];
  const airport =
    text.length >= 3
      ? AIRPORTS.find((a: { short: string; name: string; iata: string }) =>
          [a.short, a.name, a.iata].some((w) => w.toLowerCase().startsWith(text.toLowerCase()))
        )
      : null;
  const rows: Row[] = [];
  if (train) rows.push({ kind: 'train', number: train });
  if (airport) rows.push({ kind: 'airport', iata: airport.iata, name: airport.name });
  for (const s of stops) rows.push({ kind: 'stop', stop: s });
  for (const s of guesses) rows.push({ kind: 'stop', stop: s, guess: true });
  if (text.length >= 2 && !train) rows.push({ kind: 'trip', text });

  // Vad Enter gör: tåg > flygplats > hållplats som börjar så > resan.
  const lower = text.toLowerCase();
  const best =
    rows.find((r) => r.kind === 'train') ||
    rows.find((r) => r.kind === 'airport') ||
    rows.find((r) => r.kind === 'stop' && r.stop.name.toLowerCase().startsWith(lower)) ||
    rows.find((r) => r.kind === 'stop' && r.guess) ||
    rows.find((r) => r.kind === 'trip');

  function choose(r: Row) {
    track('funktion', 0, `sok_${r.kind}`);
    setQ('');
    setStops([]);
    setGuesses([]);
    if (r.kind === 'train') onOpenTrain(r.number);
    else if (r.kind === 'airport') onOpenAirport(r.iata);
    else if (r.kind === 'stop') onOpenStop(r.stop);
    else onGoal(r.text);
  }

  const rowStyle = (on: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    minHeight: '52px',
    padding: '8px 12px',
    border: 'none',
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: on ? colors.surfaceRaised : 'transparent',
    color: colors.text,
    fontSize: 'var(--fs-3)',
    textAlign: 'left',
    cursor: 'pointer',
  });
  const hint: React.CSSProperties = { flexShrink: 0, fontSize: 'var(--fs-2)', fontWeight: 700, color: colors.textDim };

  return (
    <section aria-label={t('Sök', 'Search')} style={{ marginBottom: '22px' }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const r = active >= 0 ? rows[active] : best;
          if (r) choose(r);
        }}
        role="search"
        style={{ position: 'relative' }}
      >
        <label htmlFor="sok-allt" className="sr-only">
          {t('Vart ska du, eller vilken hållplats?', 'Where to, or which stop?')}
        </label>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
          style={{ position: 'absolute', left: '14px', top: '19px', color: colors.textDim }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <input
          id="sok-allt"
          type="text"
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls="sok-allt-lista"
          aria-activedescendant={active >= 0 ? `sok-allt-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="go"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(rows.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(-1, i - 1));
            } else if (e.key === 'Escape') {
              setQ('');
            }
          }}
          // Kort nog för 375 px (förut klipptes "…eller tå"). Frågan "Vart ska du?" står i etiketten.
          placeholder={t('Hållplats, adress eller tåg', 'Stop, address or train')}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            minHeight: '56px',
            padding: '0 44px 0 42px',
            border: `1px solid ${colors.text}`,
            borderRadius: 0,
            background: 'transparent',
            color: colors.text,
            fontSize: 'var(--fs-3)',
            fontFamily: 'inherit',
          }}
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label={t('Rensa', 'Clear')}
            style={{ position: 'absolute', right: 0, top: 0, width: '48px', height: '56px', border: 'none', background: 'none', color: colors.textDim, fontSize: 'var(--fs-5)', cursor: 'pointer' }}
          >
            ×
          </button>
        ) : null}
      </form>

      {rows.length > 0 ? (
        <ul id="sok-allt-lista" role="listbox" style={{ listStyle: 'none', margin: 0, padding: 0, border: `1px solid ${colors.text}`, borderTop: 'none' }}>
          {rows.map((r, i) => (
            <li key={i} id={`sok-allt-${i}`} role="option" aria-selected={i === active}>
              <button type="button" onClick={() => choose(r)} style={rowStyle(i === active || (active < 0 && r === best))}>
                {r.kind === 'train' ? (
                  <>
                    <span style={{ flex: 1, fontWeight: 700 }}>
                      {t('Tåg', 'Train')} {r.number}
                    </span>
                    <span style={hint}>{t('Hela resan →', 'Whole journey →')}</span>
                  </>
                ) : r.kind === 'airport' ? (
                  <>
                    <span style={{ flex: 1, fontWeight: 700 }}>{r.name}</span>
                    <span style={hint}>{t('Flyg →', 'Flights →')}</span>
                  </>
                ) : r.kind === 'stop' ? (
                  <>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.guess ? <span style={{ fontWeight: 400, color: colors.textDim }}>{t('Menade du ', 'Did you mean ')}</span> : null}
                        {r.stop.name}
                        {r.guess ? '?' : ''}
                      </span>
                      {r.stop.place || r.stop.modes?.length ? (
                        <span style={{ display: 'block', fontSize: 'var(--fs-2)', color: colors.textDim }}>
                          {[r.stop.place, r.stop.modes?.join(', ')].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </span>
                    <span style={hint}>{t('Avgångar →', 'Departures →')}</span>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: colors.textDim }}>{t('Resa till', 'Trip to')} </span>
                      <span style={{ fontFamily: fonts.display, fontWeight: 800 }}>{r.text}</span>
                    </span>
                    <span style={hint}>{t('Planera →', 'Plan →')}</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {failed ? (
        <p role="status" style={{ margin: '8px 0 0', fontSize: 'var(--fs-2)', color: colors.textDim }}>
          {t(
            'Hållplatssöket fungerar inte just nu. Försök igen om en stund, eller välj en sparad hållplats.',
            'Stop search is not working right now. Try again in a moment, or pick a saved stop.'
          )}
        </p>
      ) : null}
    </section>
  );
}
