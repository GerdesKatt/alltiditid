'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { BoardDirection, Flight, SecurityQueue } from '../lib/types';
import { AIRPORTS, airportByIata, flightMatches } from '../lib/flights.mjs';
import { parseLocal } from '../lib/lineFormat';
import DirectionToggle from './DirectionToggle';
import QueueForecast from './QueueForecast';
import { flightStatus, translator, useLang, type Lang } from '../lib/i18n';
import { colors, emptyState, fonts } from './styles';

const AIRPORT_KEY = 'alltiditid:flygplats';
/** Appen frågar var 2:a minut; servern hämtar från Swedavia högst var 10:e. */
const REFRESH_MS = 120_000;
const CLOCK_TICK_MS = 15_000;

function loadAirport(initial?: string): string {
  if (initial && airportByIata(initial)) return initial.toUpperCase();
  try {
    const saved = window.localStorage.getItem(AIRPORT_KEY);
    if (saved && airportByIata(saved)) return saved;
  } catch {
    // Ingen lagring: Arlanda.
  }
  return 'ARN';
}

function clock(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
}

/** "om 25 min" upp till en timme, annars inget (klockslaget räcker). */
function countdown(f: Flight, now: number, lang: Lang): string {
  const at = parseLocal(f.expectedAt);
  if (at === null || f.status === 'cancelled' || f.done) return '';
  const m = Math.floor((at - now) / 60000);
  if (m < 0 || m > 60) return '';
  const t = translator(lang);
  return m === 0 ? t('nu', 'now') : t(`om ${m} min`, `in ${m} min`);
}

type Props = {
  /** Flygplats att börja på, t.ex. från sökningen. */
  initialAirport?: string;
};

/**
 * Flygfliken: avgångar och ankomster på Swedavias flygplatser, och kötiderna i
 * säkerhetskontrollen på Arlanda, Landvetter och Bromma.
 */
export default function FlightView({ initialAirport }: Props) {
  const { lang, t } = useLang();
  const [airport, setAirport] = useState('ARN');
  const [direction, setDirection] = useState<BoardDirection>('departures');
  const [flights, setFlights] = useState<Flight[]>([]);
  const [queues, setQueues] = useState<SecurityQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [filter, setFilter] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAirport(loadAirport(initialAirport));
    setReady(true);
  }, [initialAirport]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(AIRPORT_KEY, airport);
    } catch {
      // Valet gäller tills sidan laddas om.
    }
  }, [ready, airport]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setLoading(true);
    setFlights([]);
    setOpenId(null);
    function load() {
      fetch(`/api/trafik?action=flights&airport=${airport}&direction=${direction}`)
        .then(async (res) => ({ ok: res.ok, data: await res.json() }))
        .then(({ ok, data }) => {
          if (!active) return;
          if (!ok && !Array.isArray(data.flights)) {
            setError(t(data.error || 'Kunde inte hämta flygen.', 'Could not load flights.'));
          } else {
            setFlights(Array.isArray(data.flights) ? data.flights : []);
            setUpdatedAt(data.updatedAt || null);
            setStale(Boolean(data.stale));
            setError(null);
          }
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setError(t('Kunde inte hämta flygen. Kontrollera uppkopplingen.', 'Could not load flights. Check your connection.'));
          setLoading(false);
        });
    }
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [ready, airport, direction]);

  const hasQueues = Boolean(airportByIata(airport)?.waitTimes);
  useEffect(() => {
    if (!ready || !hasQueues || direction !== 'departures') {
      setQueues([]);
      return;
    }
    let active = true;
    function load() {
      fetch(`/api/trafik?action=waittimes&airport=${airport}`)
        .then((res) => res.json())
        .then((data) => active && setQueues(Array.isArray(data.queues) ? data.queues : []))
        .catch(() => active && setQueues([]));
    }
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [ready, airport, direction, hasQueues]);

  const shown = useMemo(() => {
    if (!filter.trim()) return flights;
    return flights.filter((f) => flightMatches(f, filter));
  }, [flights, filter]);

  const airportObj = airportByIata(airport)!;
  const arrivals = direction === 'arrivals';

  return (
    <section id="flygtavla" aria-labelledby="flyg-rubrik" style={{ marginBottom: '26px' }}>
      <div
        role="group"
        aria-label={t('Flygplats', 'Airport')}
        className="chip-scroll"
        style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto', paddingBottom: '2px' }}
      >
        {AIRPORTS.map((a) => {
          const active = a.iata === airport;
          return (
            <button
              key={a.iata}
              type="button"
              aria-pressed={active}
              onClick={() => setAirport(a.iata)}
              style={{
                minHeight: '36px',
                padding: '0 12px',
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${active ? colors.accentStrong : colors.borderStrong}`,
                backgroundColor: active ? colors.accentStrong : colors.surface,
                color: active ? colors.onAccent : colors.text,
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {a.short}
            </button>
          );
        })}
      </div>

      <span style={{ fontSize: '0.8125rem', color: colors.textDim, display: 'block' }}>
        {arrivals ? t('Visar ankomster till', 'Showing arrivals at') : t('Visar avgångar från', 'Showing departures from')}
      </span>
      <h1 id="flyg-rubrik" style={{ fontSize: '1.375rem', fontWeight: 800, margin: '0 0 10px', color: colors.text }}>
        {airportObj.name}
      </h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
        <DirectionToggle direction={direction} onChange={setDirection} />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('Flightnummer, stad eller flygplats (t.ex. CPH)', 'Flight number, city or airport (e.g. CPH)')}
          aria-label={t('Filtrera på flightnummer, stad, flygplats eller flygbolag', 'Filter by flight number, city, airport or airline')}
          style={{
            flex: '1 1 160px',
            minHeight: '44px',
            padding: '0 12px',
            borderRadius: 'var(--radius-control)',
            border: `1px solid ${colors.borderStrong}`,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: '0.9375rem',
          }}
        />
      </div>

      <p style={{ margin: '0 0 12px', fontSize: '0.8125rem', color: stale ? colors.amber : colors.textDim }}>
        {updatedAt
          ? `${stale ? t('Senast hämtad', 'Last fetched') : t('Uppdaterad', 'Updated')} ${clock(updatedAt)} · ${t(
              'flygtiderna uppdateras var 10:e minut',
              'flight times update every 10 minutes'
            )}`
          : ''}
      </p>

      {queues.length ? (
        <div
          aria-label={t('Kötider i säkerhetskontrollen', 'Security queue times')}
          style={{
            marginBottom: '12px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-card)',
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim, marginBottom: '8px' }}>
            {t('Säkerhetskontroll, väntetid nu', 'Security check, current wait')}
          </div>
          {/* En rad per terminal: vanlig kö och FastTrack bredvid varandra, så att samma terminal inte syns två gånger. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            {queues.some((q) => q.fastTrack) ? (
              <thead>
                <tr style={{ color: colors.textDim, fontSize: '0.75rem' }}>
                  <th scope="col" style={{ textAlign: 'left', fontWeight: 600, padding: '0 0 4px' }}>
                    <span className="sr-only">{t('Terminal', 'Terminal')}</span>
                  </th>
                  <th scope="col" style={{ textAlign: 'right', fontWeight: 600, padding: '0 0 4px' }}>
                    {t('Vanlig', 'Regular')}
                  </th>
                  <th scope="col" style={{ textAlign: 'right', fontWeight: 600, padding: '0 0 4px 16px' }}>
                    FastTrack
                  </th>
                </tr>
              </thead>
            ) : null}
            <tbody>
              {[...new Set(queues.map((q) => q.name))].map((name) => {
                const regular = queues.find((q) => q.name === name && !q.fastTrack);
                const fast = queues.find((q) => q.name === name && q.fastTrack);
                const cell = (q: typeof regular, pad: string) => (
                  <td style={{ textAlign: 'right', padding: pad, whiteSpace: 'nowrap' }}>
                    {q ? (
                      <strong style={{ fontFamily: fonts.display, color: q.minutes >= 20 ? colors.amber : colors.text }}>{q.minutes} min</strong>
                    ) : (
                      <span style={{ color: colors.textDim }}>–</span>
                    )}
                  </td>
                );
                return (
                  <tr key={name} style={{ borderTop: `1px solid ${colors.border}` }}>
                    <th scope="row" style={{ textAlign: 'left', fontWeight: 400, padding: '6px 0', color: colors.text }}>
                      {name}
                    </th>
                    {cell(regular, '6px 0')}
                    {queues.some((q) => q.fastTrack) ? cell(fast, '6px 0 6px 16px') : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <QueueForecast airport={airport} />
        </div>
      ) : null}

      {error && flights.length === 0 ? (
        <div role="alert" style={{ ...emptyState, color: colors.errorText, backgroundColor: colors.errorBg }}>
          {error}
        </div>
      ) : loading && flights.length === 0 ? (
        <div style={emptyState}>{t('Hämtar flyg…', 'Loading flights…')}</div>
      ) : shown.length === 0 ? (
        <div style={emptyState}>
          {filter ? t('Inga flyg matchar filtret.', 'No flights match the filter.') : t('Inga fler flyg i dag.', 'No more flights today.')}
        </div>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((f) => (
            <FlightRow
              key={f.id}
              flight={f}
              arrivals={arrivals}
              now={now}
              open={openId === f.id}
              onToggle={() => setOpenId(openId === f.id ? null : f.id)}
              queues={queues.filter((q) => !f.terminal || !q.terminal || q.terminal === f.terminal)}
            />
          ))}
        </ul>
      )}

      <p style={{ fontSize: '0.8125rem', color: colors.textDim, marginTop: '14px' }}>
        {t(
          'Flyginformation från Swedavia. Kontrollera alltid tider och gate med ditt flygbolag.',
          'Flight information from Swedavia. Always check times and gate with your airline.'
        )}
      </p>
    </section>
  );
}

function FlightRow({
  flight: f,
  arrivals,
  now,
  open,
  onToggle,
  queues,
}: {
  flight: Flight;
  arrivals: boolean;
  now: number;
  open: boolean;
  onToggle: () => void;
  queues: SecurityQueue[];
}) {
  const { lang, t } = useLang();
  const cancelled = f.status === 'cancelled';
  const delayed = f.status === 'delayed';
  const left = countdown(f, now, lang);
  const statusText = flightStatus(f.statusText, lang);
  const where = [f.terminal ? `Terminal ${f.terminal}` : '', !arrivals && f.gate ? `Gate ${f.gate}` : '']
    .filter(Boolean)
    .join(' · ');
  const statusLine = cancelled
    ? t('Inställt', 'Cancelled')
    : delayed
    ? `${t('Ny tid', 'New time')} ${f.newTime} · +${f.delayMinutes}`
    : f.done
    ? arrivals
      ? t('Landat', 'Landed')
      : t('Har lyft', 'Departed')
    : flightStatus(f.gateText, lang) || statusText || left;

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px',
          borderRadius: 'var(--radius-card)',
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          color: colors.text,
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
          opacity: f.done ? 0.7 : 1,
        }}
      >
        <span
          style={{
            flexShrink: 0,
            minWidth: '64px',
            padding: '4px 6px',
            boxSizing: 'border-box',
            borderRadius: 'var(--radius-badge)',
            border: `1.5px solid ${cancelled ? colors.borderStrong : colors.badgeBg}`,
            color: cancelled ? colors.textDim : colors.text,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: '0.8125rem',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {f.flightId}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: '1rem',
              fontWeight: 700,
              color: cancelled ? colors.textDim : colors.text,
              textDecoration: cancelled ? 'line-through' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {arrivals ? `${t('Från', 'From')} ` : ''}
            {f.place || f.flightId}
          </span>
          <span style={{ display: 'block', fontSize: '0.8125rem', color: colors.textDim, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[f.airline, where].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span style={{ flexShrink: 0, textAlign: 'right' }}>
          <span
            style={{
              display: 'block',
              fontFamily: fonts.display,
              fontSize: '1.375rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: cancelled ? colors.textDim : colors.text,
              textDecoration: cancelled ? 'line-through' : 'none',
            }}
          >
            {f.scheduledTime}
          </span>
          {statusLine ? (
            <span
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: cancelled || delayed ? 600 : 500,
                color: cancelled ? colors.cancelledText : delayed ? colors.amber : colors.textDim,
                whiteSpace: 'nowrap',
              }}
            >
              {statusLine}
            </span>
          ) : null}
        </span>
      </button>

      {open ? (
        <div
          style={{
            margin: '4px 0 0',
            padding: '12px 14px',
            borderRadius: 'var(--radius-control)',
            backgroundColor: colors.surfaceRaised,
            fontSize: '0.875rem',
            lineHeight: 1.6,
            color: colors.text,
          }}
        >
          {f.via?.length ? <div>Via {f.via.join(', ')}</div> : null}
          {f.codeshare?.length ? (
            <div>
              {t('Även', 'Also')} {f.codeshare.join(', ')}
            </div>
          ) : null}
          {!arrivals && f.checkIn ? (
            <div>
              {t('Incheckning disk', 'Check-in desk')} {f.checkIn}
            </div>
          ) : null}
          {statusText && statusText !== statusLine ? <div>{statusText}</div> : null}
          {f.remarks?.map((r) => (
            <div key={r}>{r}</div>
          ))}
          {left && statusLine !== left ? (
            <div>
              {t('Avgår', 'Departs')} {left}
            </div>
          ) : null}
          {!arrivals && queues.length ? (
            <div style={{ marginTop: '6px' }}>
              {t('Säkerhetskontroll', 'Security check')}:{' '}
              {queues.map((q) => `${q.name}${q.fastTrack ? ' FastTrack' : ''} ${q.minutes} min`).join(' · ')}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
