'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { BoardDirection, Flight, SecurityQueue } from '../lib/types';
import { AIRPORTS, airportByIata, flightMatches } from '../lib/flights.mjs';
import { parseLocal } from '../lib/lineFormat';
import DirectionToggle from './DirectionToggle';
import QueueForecast from './QueueForecast';
import { gatePlan } from '../lib/gateTime.mjs';
import { isMyFlight, loadMyFlight, MY_FLIGHT_EVENT, storeMyFlight, type MyFlight } from '../lib/myFlight';
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
  const [securityOpen, setSecurityOpen] = useState(false);
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 8px', alignItems: 'center', marginBottom: '10px' }}>
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

      {/* Samma statusrad som tavlan: små versaler, en rad. Ingen prick: flygtiderna är inte realtid. */}
      <p
        style={{
          margin: '0 0 12px',
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: stale ? colors.amber : colors.textDim,
        }}
      >
        {updatedAt
          ? `${stale ? t('Senast hämtad', 'Last fetched') : t('Uppdaterad', 'Updated')} ${clock(updatedAt)} · ${t(
              'var 10:e min',
              'every 10 min'
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
          {/* Hopfälld som standard: tavlan är det man oftast är ute efter. Raden visar väntetiden nu. */}
          <button
            type="button"
            aria-expanded={securityOpen}
            onClick={() => setSecurityOpen(!securityOpen)}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              gap: '8px',
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: colors.text,
              fontSize: '0.875rem',
              textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 600, color: colors.textDim, whiteSpace: 'nowrap' }}>{t('Säkerhetskontroll', 'Security')}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {queues
                .filter((q) => !q.fastTrack)
                .map((q) => (
                  <span key={q.name} style={{ marginRight: '12px' }}>
                    {q.name.replace(/^Terminal\s*/i, 'T')}{' '}
                    <strong style={{ fontFamily: fonts.display, color: q.minutes >= 20 ? colors.amber : colors.text }}>{q.minutes} min</strong>
                  </span>
                ))}
            </span>
            <span aria-hidden="true" style={{ color: colors.textDim, transform: securityOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>
          {securityOpen ? (
          <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim, marginBottom: '8px' }}>
            {t('Väntetid nu', 'Current wait')}
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
        // Samma radmönster som tavlan: tunna linjer mellan raderna, inga kort.
        <ul style={{ display: 'flex', flexDirection: 'column', listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${colors.text}` }}>
          {shown.map((f) => (
            <FlightRow
              key={f.id}
              flight={f}
              arrivals={arrivals}
              now={now}
              open={openId === f.id}
              onToggle={() => setOpenId(openId === f.id ? null : f.id)}
              queues={queues.filter((q) => !f.terminal || !q.terminal || q.terminal === f.terminal)}
              airport={airport}
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
  airport,
}: {
  flight: Flight;
  arrivals: boolean;
  now: number;
  open: boolean;
  onToggle: () => void;
  queues: SecurityQueue[];
  airport: string;
}) {
  const { lang, t } = useLang();
  const cancelled = f.status === 'cancelled';
  const delayed = f.status === 'delayed';
  const left = countdown(f, now, lang);
  const statusText = flightStatus(f.statusText, lang);
  const where = !arrivals && f.gate ? `Gate ${f.gate}` : '';
  // Kötiden nu gäller bara om flyget går inom tre timmar; senare säger "Brukar vara" mer.
  const departsAt = parseLocal(f.expectedAt);
  const soon = departsAt !== null && departsAt - now < 3 * 3600_000;
  const regular = queues.filter((q) => !q.fastTrack);
  const queueNow = soon && regular.length ? Math.max(...regular.map((q) => q.minutes)) : null;
  const plan = arrivals ? null : gatePlan(f, airport, queueNow);
  const [mine, setMine] = useState<MyFlight | null>(null);
  useEffect(() => {
    const sync = () => setMine(loadMyFlight());
    sync();
    window.addEventListener(MY_FLIGHT_EVENT, sync);
    return () => window.removeEventListener(MY_FLIGHT_EVENT, sync);
  }, []);
  const saved = isMyFlight(mine, airport, f.flightId, f.scheduledAt);
  const statusLine = cancelled
    ? t('Inställt', 'Cancelled')
    : delayed
    ? `${t('Ny tid', 'New time')} ${f.newTime} · +${f.delayMinutes}`
    : f.done
    ? arrivals
      ? t('Landat', 'Landed')
      : t('Har lyft', 'Departed')
    : flightStatus(f.gateText, lang) || statusText || (plan ? `${t('Boarding ca', 'Boarding ~')} ${plan.boarding}` : left);

  // Status och anmärkningar utan upprepning ("Startat" och "Startat 17:40" blir en rad).
  const notes = [...(statusText && statusText !== statusLine ? [statusText] : []), ...(f.remarks || [])].filter(
    (n, i, all) => all.indexOf(n) === i && !all.some((o) => o !== n && o.startsWith(n))
  );
  // Säkerhetskontrollen per terminal: "Terminal 5F: 5 min · FastTrack 0 min".
  const queueText = [...new Set(queues.map((q) => q.name))]
    .map((name) => {
      const regular = queues.find((q) => q.name === name && !q.fastTrack);
      const fast = queues.find((q) => q.name === name && q.fastTrack);
      return `${name}: ${[regular ? `${regular.minutes} min` : '', fast ? `FastTrack ${fast.minutes} min` : '']
        .filter(Boolean)
        .join(' · ')}`;
    })
    .join(', ');
  const details: [string, string][] = [];
  if (plan) {
    details.push([t('Boarding', 'Boarding'), `${t('ca', '~')} ${plan.boarding}`]);
    details.push([t('Gaten stänger', 'Gate closes'), `${t('ca', '~')} ${plan.gateCloses}`]);
  }
  if (f.via?.length) details.push([t('Via', 'Via'), f.via.join(', ')]);
  if (notes.length) details.push([t('Status', 'Status'), notes.join(' · ')]);
  if (left && statusLine !== left) details.push([arrivals ? t('Landar', 'Lands') : t('Avgår', 'Departs'), left]);
  if (!arrivals && f.checkIn) details.push([t('Incheckning', 'Check-in'), `${t('Disk', 'Desk')} ${f.checkIn}`]);
  if (!arrivals && queueText) details.push([t('Säkerhet nu', 'Security now'), queueText]);
  if (f.codeshare?.length) details.push([t('Även som', 'Also as'), f.codeshare.join(', ')]);

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
          padding: '12px 14px',
          minHeight: '64px',
          border: 'none',
          borderBottom: `1px solid ${colors.border}`,
          borderRadius: 0,
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
            // Samma bricka som linjen på tavlan: kontur i bläck, grå och grå yta när flyget är inställt.
            border: `1.5px solid ${cancelled ? colors.borderStrong : colors.badgeBorder}`,
            backgroundColor: cancelled ? colors.surfaceRaised : colors.badgeBg,
            color: cancelled ? colors.textDim : colors.badgeText,
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
            {f.terminal ? (
              <span
                style={{
                  display: 'inline-block',
                  marginRight: '6px',
                  padding: '0 5px',
                  borderRadius: 'var(--radius-badge)',
                  border: `1.5px solid ${colors.text}`,
                  color: colors.text,
                  fontWeight: 800,
                  fontFamily: fonts.display,
                  lineHeight: 1.35,
                }}
                aria-label={`Terminal ${f.terminal}`}
              >
                T{f.terminal}
              </span>
            ) : null}
            {[where, shortAirline(f.airline)].filter(Boolean).join(' · ')}
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
        // Detaljerna under raden, i linje med målet och utan eget kort: först svaret (när du ska vara vid
        // säkerheten), sedan fakta som etikett och värde, sist knappen. Samma sak sägs bara en gång.
        <div style={{ padding: '0 14px 14px 88px', borderBottom: `1px solid ${colors.border}`, fontSize: '0.8125rem', lineHeight: 1.45 }}>
          {plan ? (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: colors.text }}>
                {t('Var vid säkerheten senast', 'Be at security by')} {plan.atSecurity}
              </div>
              <div style={{ color: colors.textDim, marginTop: '2px' }}>
                {plan.queue !== null
                  ? t(
                      `Med ${plan.queue} min kötid i säkerheten just nu och ${plan.walkMin}–${plan.walkMax} min till gaten. Uppskattat.`,
                      `With the queue now (${plan.queue} min) and ${plan.walkMin}–${plan.walkMax} min to the gate. Estimated.`
                    )
                  : t(
                      `Med ${plan.walkMin}–${plan.walkMax} min till gaten, utan kötid (se Brukar vara). Uppskattat.`,
                      `With ${plan.walkMin}–${plan.walkMax} min to the gate, without the queue (see Usually). Estimated.`
                    )}
              </div>
            </div>
          ) : null}
          {details.length ? (
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '14px', rowGap: '4px', margin: 0 }}>
              {details.map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt style={{ color: colors.textDim }}>{label}</dt>
                  <dd style={{ margin: 0, color: colors.text }}>{value}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : null}
          {plan ? (
            <>
              <button
                type="button"
                aria-pressed={saved}
                onClick={() => storeMyFlight(saved ? null : { airport, flightId: f.flightId, scheduledAt: f.scheduledAt })}
                style={{
                  marginTop: '12px',
                  minHeight: '44px',
                  padding: '0 14px',
                  borderRadius: 'var(--radius-control)',
                  border: `1px solid ${colors.borderStrong}`,
                  backgroundColor: saved ? colors.accentTint : colors.surface,
                  color: colors.text,
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {saved ? t('✓ Mitt flyg (ta bort)', '✓ My flight (remove)') : t('Spara som mitt flyg', 'Save as my flight')}
              </button>
              {saved ? (
                <div style={{ color: colors.textDim, marginTop: '4px' }}>
                  {t('Syns under Min resa tills planet lyft.', 'Shown under My trip until the plane has left.')}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Kända långa bolagsnamn i kort form, och bolagsformen bort: "Ryanair Ltd" → "Ryanair". */
const AIRLINE_SHORT: Record<string, string> = {
  'sas scandinavian airlines': 'SAS',
  'scandinavian airlines': 'SAS',
  'scandinavian airlines system': 'SAS',
  'norwegian air shuttle': 'Norwegian',
  'norwegian air sweden': 'Norwegian',
  'norwegian air international': 'Norwegian',
};
function shortAirline(name: string | undefined): string {
  const raw = String(name || '').trim();
  const low = raw.toLowerCase();
  const known = AIRLINE_SHORT[low];
  if (known) return known;
  if (low.startsWith('sas ')) return 'SAS';
  if (low.startsWith('norwegian ')) return 'Norwegian';
  return raw.replace(/\s+(ltd|limited|ab|asa|as|inc|plc|s\.?a\.?|gmbh)\.?$/i, '').trim();
}
