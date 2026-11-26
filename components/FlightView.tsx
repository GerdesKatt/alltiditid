'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { BoardDirection, Flight, SecurityQueue } from '../lib/types';
import { AIRPORTS, airportByIata } from '../lib/flights.mjs';
import { parseLocal } from '../lib/lineFormat';
import DirectionToggle from './DirectionToggle';
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
function countdown(f: Flight, now: number): string {
  const t = parseLocal(f.expectedAt);
  if (t === null || f.status === 'cancelled' || f.done) return '';
  const m = Math.floor((t - now) / 60000);
  if (m < 0 || m > 60) return '';
  return m === 0 ? 'nu' : `om ${m} min`;
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
    const t = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(t);
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
            setError(data.error || 'Kunde inte hämta flygen.');
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
          setError('Kunde inte hämta flygen. Kontrollera uppkopplingen.');
          setLoading(false);
        });
    }
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(t);
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
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [ready, airport, direction, hasQueues]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase().replace(/\s+/g, '');
    if (!q) return flights;
    return flights.filter((f) =>
      [f.flightId, ...(f.codeshare || []), f.place || '', f.airline || '']
        .map((s) => s.toLowerCase().replace(/\s+/g, ''))
        .some((s) => s.includes(q))
    );
  }, [flights, filter]);

  const airportObj = airportByIata(airport)!;
  const arrivals = direction === 'arrivals';

  return (
    <section id="flygtavla" aria-labelledby="flyg-rubrik" style={{ marginBottom: '26px' }}>
      <div
        role="group"
        aria-label="Flygplats"
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
        {arrivals ? 'Visar ankomster till' : 'Visar avgångar från'}
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
          placeholder="Flightnummer eller stad"
          aria-label="Filtrera på flightnummer, stad eller flygbolag"
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
          ? `${stale ? 'Senast hämtad' : 'Uppdaterad'} ${clock(updatedAt)} · flygtiderna uppdateras var 10:e minut`
          : ''}
      </p>

      {queues.length ? (
        <div
          aria-label="Kötider i säkerhetskontrollen"
          style={{
            marginBottom: '12px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-card)',
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim, marginBottom: '8px' }}>
            Säkerhetskontroll, väntetid nu
          </div>
          <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '6px 14px', listStyle: 'none', margin: 0, padding: 0 }}>
            {queues.map((q) => (
              <li key={`${q.name}|${q.fastTrack}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.875rem' }}>
                <span style={{ color: colors.text }}>
                  {q.name}
                  {q.fastTrack ? <span style={{ color: colors.textDim }}> FastTrack</span> : null}
                </span>
                <strong style={{ fontFamily: fonts.display, whiteSpace: 'nowrap', color: q.minutes >= 20 ? colors.amber : colors.text }}>
                  {q.minutes} min
                </strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error && flights.length === 0 ? (
        <div role="alert" style={{ ...emptyState, color: colors.errorText, backgroundColor: colors.errorBg }}>
          {error}
        </div>
      ) : loading && flights.length === 0 ? (
        <div style={emptyState}>Hämtar flyg…</div>
      ) : shown.length === 0 ? (
        <div style={emptyState}>{filter ? 'Inga flyg matchar filtret.' : 'Inga fler flyg i dag.'}</div>
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
        Flyginformation från Swedavia. Kontrollera alltid tider och gate med ditt flygbolag.
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
  const cancelled = f.status === 'cancelled';
  const delayed = f.status === 'delayed';
  const left = countdown(f, now);
  const where = [f.terminal ? `Terminal ${f.terminal}` : '', !arrivals && f.gate ? `Gate ${f.gate}` : '']
    .filter(Boolean)
    .join(' · ');
  const statusLine = cancelled
    ? 'Inställt'
    : delayed
    ? `Ny tid ${f.newTime} · +${f.delayMinutes}`
    : f.done
    ? arrivals
      ? 'Landat'
      : 'Har lyft'
    : f.gateText || f.statusText || left;

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
            {arrivals ? 'Från ' : ''}
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
          {f.codeshare?.length ? <div>Även {f.codeshare.join(', ')}</div> : null}
          {!arrivals && f.checkIn ? <div>Incheckning disk {f.checkIn}</div> : null}
          {f.statusText && f.statusText !== statusLine ? <div>{f.statusText}</div> : null}
          {f.remarks?.map((r) => (
            <div key={r}>{r}</div>
          ))}
          {left && statusLine !== left ? <div>Avgår {left}</div> : null}
          {!arrivals && queues.length ? (
            <div style={{ marginTop: '6px' }}>
              Säkerhetskontroll:{' '}
              {queues.map((q) => `${q.name}${q.fastTrack ? ' FastTrack' : ''} ${q.minutes} min`).join(' · ')}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
