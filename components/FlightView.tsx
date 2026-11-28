'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { BoardDirection, Flight, SecurityQueue } from '../lib/types';
import { AIRPORTS, airportByIata, flightMatches } from '../lib/flights.mjs';
import { parseLocal } from '../lib/lineFormat';
import DirectionToggle from './DirectionToggle';
import QueueForecast from './QueueForecast';
import { gatePlan, gateStage, queueNowFor, typicalQueueFor, gateClosedByAirport } from '../lib/gateTime.mjs';
import { stockholmMinute } from '../lib/sweTime.mjs';
import { isMyFlight, loadMyFlight, MY_FLIGHT_EVENT, storeMyFlight, type MyFlight } from '../lib/myFlight';
import { flightStatus, translator, useLang, type Lang } from '../lib/i18n';
import { colors, emptyState, fonts, labelStyle } from './styles';

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
/** Kötid som text: "Ingen kö" i stället för "0 min", som läses som ett fel. */
function queueLabel(minutes: number, t: (sv: string, en: string) => string): string {
  return minutes <= 0 ? t('Ingen kö', 'No queue') : `${minutes} min`;
}

/**
 * "T5" i stället för Swedavias "Terminal 5F" (kontroll F i terminal 5). Bokstaven behålls bara
 * när samma terminal har flera kontroller, så att de går att skilja åt (N10).
 */
function queueShortName(q: { name: string; terminal?: string; fastTrack?: boolean }, all: { name: string; terminal?: string; fastTrack?: boolean }[]): string {
  const short = q.name.replace(/^Terminal\s*/i, 'T');
  if (!q.terminal) return short;
  const sameTerminal = new Set(all.filter((o) => !o.fastTrack && o.terminal === q.terminal).map((o) => o.name));
  return sameTerminal.size > 1 ? short : `T${q.terminal}`;
}

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
  const [retryTick, setRetryTick] = useState(0);
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
            // Egen text, aldrig serverns feltext rakt av (UX-revisionen, fynd 3).
            setError(t('Flygen gick inte att hämta just nu.', 'The flights could not be loaded right now.'));
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
          setError(t('Flygen gick inte att hämta just nu. Kontrollera uppkopplingen.', 'The flights could not be loaded right now. Check your connection.'));
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
  }, [ready, airport, direction, retryTick]);

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
    const list = filter.trim() ? flights.filter((f) => flightMatches(f, filter)) : flights;
    // Flyg som har lyft viker undan: sist, så att det man kan hinna med står överst (Apple-juryn, punkt 11).
    if (direction === 'arrivals') return list;
    return [...list.filter((f) => !f.done), ...list.filter((f) => f.done)];
  }, [flights, filter, direction]);

  const airportObj = airportByIata(airport)!;
  const arrivals = direction === 'arrivals';

  return (
    <section id="flygtavla" aria-labelledby="flyg-rubrik" style={{ marginBottom: '26px' }}>
      <div
        role="group"
        aria-label={t('Flygplats', 'Airport')}
        className="chip-scroll"
        style={{ display: 'flex', gap: '2px 18px', marginBottom: '14px', overflowX: 'auto', paddingBottom: '2px' }}
      >
        {AIRPORTS.map((a) => {
          const active = a.iata === airport;
          return (
            <button
              key={a.iata}
              type="button"
              aria-pressed={active}
              onClick={() => setAirport(a.iata)}
              // Flygplatserna som text, vald med ett streck under: inga knappar som konkurrerar med listan.
              style={{
                minHeight: '44px',
                padding: '0',
                border: 'none',
                borderRadius: 0,
                backgroundColor: 'transparent',
                color: active ? colors.text : colors.textDim,
                boxShadow: active ? `inset 0 -2px 0 ${colors.text}` : 'none',
                fontFamily: 'inherit',
                fontSize: 'var(--fs-3)',
                fontWeight: active ? 800 : 700,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {a.short}
            </button>
          );
        })}
      </div>

      {/* Samma överrad som tavlan: "Avgångar · 11:52 · var 10:e min". */}
      <span style={{ ...labelStyle, display: 'block', marginBottom: '4px' }}>
        {arrivals ? t('Ankomster', 'Arrivals') : t('Avgångar', 'Departures')}
        {updatedAt ? (
          <span style={{ color: stale ? colors.amber : undefined, letterSpacing: '0.04em' }}>
            {' · '}
            {stale ? `${t('senast hämtad', 'last fetched')} ` : ''}
            {clock(updatedAt)} · {t('var 10:e min', 'every 10 min')}
          </span>
        ) : null}
      </span>
      <h1 id="flyg-rubrik" style={{ fontSize: 'var(--fs-5)', fontStretch: 'var(--stretch-head)', fontWeight: 800, lineHeight: 1.05, margin: '0 0 12px', color: colors.text }}>
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
            fontSize: 'var(--fs-3)',
          }}
        />
      </div>

      {queues.length ? (
        <div
          aria-label={t('Kötider i säkerhetskontrollen', 'Security queue times')}
          style={{
            // Under ett streck, som resten av appen: ingen ruta.
            marginBottom: '12px',
            padding: '2px 0 0',
            borderTop: `1px solid ${colors.text}`,
            backgroundColor: 'transparent',
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
              fontSize: 'var(--fs-2)',
              textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 700, color: colors.textDim, whiteSpace: 'nowrap' }}>{t('Säkerhetskontroll', 'Security')}</span>
            {/* Bryter rad hellre än att klippa "T4 In…" (N10). */}
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: '0 12px' }}>
              {queues
                .filter((q) => !q.fastTrack)
                .map((q) => (
                  <span key={q.name} style={{ whiteSpace: 'nowrap' }}>
                    {queueShortName(q, queues)}{' '}
                    <strong style={{ fontFamily: fonts.display, color: q.minutes >= 20 ? colors.amber : colors.text }}>{queueLabel(q.minutes, t)}</strong>
                  </span>
                ))}
            </span>
            <span aria-hidden="true" style={{ color: colors.textDim, transform: securityOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>
          {securityOpen ? (
          <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: 'var(--fs-2)', fontWeight: 700, color: colors.textDim, marginBottom: '8px' }}>
            {t('Väntetid nu', 'Current wait')}
          </div>
          {/* En rad per terminal: vanlig kö och FastTrack bredvid varandra, så att samma terminal inte syns två gånger. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-2)' }}>
            {queues.some((q) => q.fastTrack) ? (
              <thead>
                <tr style={{ color: colors.textDim, fontSize: 'var(--fs-1)' }}>
                  <th scope="col" style={{ textAlign: 'left', fontWeight: 700, padding: '0 0 4px' }}>
                    <span className="sr-only">{t('Terminal', 'Terminal')}</span>
                  </th>
                  <th scope="col" style={{ textAlign: 'right', fontWeight: 700, padding: '0 0 4px' }}>
                    {t('Vanlig', 'Regular')}
                  </th>
                  <th scope="col" style={{ textAlign: 'right', fontWeight: 700, padding: '0 0 4px 16px' }}>
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
                      <strong style={{ fontFamily: fonts.display, color: q.minutes >= 20 ? colors.amber : colors.text }}>{queueLabel(q.minutes, t)}</strong>
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
          <strong style={{ display: 'block' }}>{error}</strong>
          <span style={{ display: 'block', marginTop: '4px' }}>
            {t('Vi försöker igen automatiskt om två minuter.', 'We retry automatically in two minutes.')}
          </span>
          <button
            type="button"
            onClick={() => setRetryTick((n) => n + 1)}
            style={{ marginTop: '12px', minHeight: '44px', padding: '0 14px', border: `1px solid ${colors.borderStrong}`, borderRadius: 'var(--radius-control)', backgroundColor: colors.surface, color: colors.text, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
          >
            {t('Försök igen', 'Try again')}
          </button>
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

      <p style={{ fontSize: 'var(--fs-2)', color: colors.textDim, marginTop: '14px' }}>
        {airportByIata(airport)?.source === 'avinor' ? (
          <>
            {t('Flygdata från ', 'Flight data from ')}
            <a href="https://www.avinor.no" target="_blank" rel="noopener noreferrer" style={{ color: colors.accent }}>
              Avinor
            </a>
            {t(
              ' (Flydata fra Avinor). Kontrollera alltid tider och gate med ditt flygbolag.',
              ' (Flydata fra Avinor). Always check times and gate with your airline.'
            )}
          </>
        ) : (
          t(
            'Flyginformation från Swedavia. Kontrollera alltid tider och gate med ditt flygbolag.',
            'Flight information from Swedavia. Always check times and gate with your airline.'
          )
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
  const queueNow = soon ? queueNowFor(queues, f.terminal) : null;
  // Längre fram: den typiska kötiden ("Brukar vara") för terminalen timmen före avgång.
  const [typical, setTypical] = useState<number | null>(null);
  const day = (f.expectedAt || f.scheduledAt || '').slice(0, 10);
  const needTypical = open && !arrivals && !soon && queues.length > 0 && Boolean(day);
  useEffect(() => {
    if (!needTypical) return;
    let active = true;
    fetch(`/api/trafik?action=queueforecast&airport=${airport}&date=${day}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => active && setTypical(typicalQueueFor(d, f)))
      .catch(() => active && setTypical(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needTypical, airport, day, f.terminal]);
  const usingTypical = queueNow === null && !soon && typical !== null;
  const plan = arrivals ? null : gatePlan(f, airport, queueNow ?? (usingTypical ? typical : null));
  // För sent för planen? Då säger kortet det i stället för en tid som redan passerat (UX-revisionen, fynd 1).
  const stage = gateStage(f, plan, stockholmMinute(now));
  // Gaten stängd och avgångstiden passerad: flyget räknas som avgånget, nedtonat.
  const gone = !arrivals && !f.done && !cancelled && stage === 'closed' && departsAt !== null && departsAt <= now;
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
    : gone
    ? t('Gate stängd', 'Gate closed')
    : delayed
    ? `${t('Ny tid', 'New time')} ${f.newTime} · +${f.delayMinutes}`
    : f.done
    ? arrivals
      ? t('Landat', 'Landed')
      : t('Har lyft', 'Departed')
    : stage === 'closed'
    ? t('Gate stängd', 'Gate closed')
    : flightStatus(f.gateText, lang) || statusText || (plan ? `${t('Boarding ca', 'Boarding ~')} ${plan.boarding}` : left);

  // Status och anmärkningar utan upprepning ("Startat" och "Startat 17:40" blir en rad).
  const notes = [...(statusText && statusText !== statusLine ? [statusText] : []), ...(f.remarks || [])].filter(
    (n, i, all) => all.indexOf(n) === i && !all.some((o) => o !== n && o.startsWith(n))
  );
  // Högst en tid i Status: flygplatsen skriver ibland "Beräknad 12:45" och "Försenad till 12:35" om
  // samma flyg. Den som stämmer med raden får stå; annars den första. En stängd gate behöver ingen tid (N6).
  const clockIn = (n: string) => (/\b(\d{1,2})[:.](\d{2})\b/.exec(n) || []).slice(1, 3).map((x, i) => (i === 0 ? x.padStart(2, '0') : x)).join(':');
  const timed = notes.filter((n) => clockIn(n));
  if (gone || stage === 'closed' || new Set(timed.map(clockIn)).size > 1) {
    const keep = gone || stage === 'closed' ? null : timed.find((n) => clockIn(n) === f.newTime) || timed[0];
    for (const n of timed) if (n !== keep) notes.splice(notes.indexOf(n), 1);
  }
  // "Gate stängd" står redan i rutan ovanför.
  if (stage === 'closed') for (const n of [...notes]) if (/^gate stängd\.?$/i.test(n)) notes.splice(notes.indexOf(n), 1);
  // Säkerhetskontrollen per terminal: "Terminal 5F: 5 min · FastTrack 0 min".
  const queueText = [...new Set(queues.map((q) => q.name))]
    .map((name) => {
      const regular = queues.find((q) => q.name === name && !q.fastTrack);
      const fast = queues.find((q) => q.name === name && q.fastTrack);
      return `${name}: ${[regular ? queueLabel(regular.minutes, t) : '', fast ? `FastTrack ${queueLabel(fast.minutes, t)}` : '']
        .filter(Boolean)
        .join(' · ')}`;
    })
    .join(', ');
  const details: [string, string][] = [];
  if (plan && stage === 'ok') {
    details.push([t('Boarding', 'Boarding'), `${t('ca', '~')} ${plan.boarding}`]);
    details.push([t('Gaten stänger', 'Gate closes'), `${t('ca', '~')} ${plan.gateCloses}`]);
  }
  if (f.via?.length) details.push([t('Via', 'Via'), f.via.join(', ')]);
  if (notes.length) details.push([t('Status', 'Status'), notes.join(' · ')]);
  if (left && statusLine !== left) details.push([arrivals ? t('Landar', 'Lands') : t('Avgår', 'Departs'), left]);
  if (!arrivals && f.checkIn) details.push([t('Incheckning', 'Check-in'), `${t('Disk', 'Desk')} ${f.checkIn}`]);
  // Kötiden i säkerheten visas i raden ovanför tavlan och i förklaringen, inte en tredje gång här.
  if (!arrivals && queueText && !plan) details.push([t('Säkerhet nu', 'Security now'), queueText]);
  if (f.codeshare?.length) details.push([t('Även som', 'Also as'), f.codeshare.join(', ')]);

  return (
    <li style={open ? { backgroundColor: colors.accentTint } : undefined}>
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
          borderBottom: open ? 'none' : `1px solid ${colors.border}`,
          borderRadius: 0,
          backgroundColor: open ? 'transparent' : colors.surface,
          color: colors.text,
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
          opacity: f.done || gone ? 0.7 : 1,
        }}
      >
        <span
          style={{
            flexShrink: 0,
            minWidth: '64px',
            padding: '4px 6px',
            boxSizing: 'border-box',
            borderRadius: 'var(--radius-badge)',
            // Samma bricka som linjen på tavlan: kontur i bläck, rosa för mitt flyg, grå när flyget är inställt.
            border: `1.5px solid ${cancelled ? colors.borderStrong : saved ? 'var(--rose)' : colors.badgeBorder}`,
            backgroundColor: cancelled ? colors.surfaceRaised : saved ? 'var(--rose)' : colors.badgeBg,
            color: cancelled ? colors.textDim : saved ? 'var(--rose-ink)' : colors.badgeText,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: 'var(--fs-2)',
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
              fontSize: 'var(--fs-3)',
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
          {/* En bricka per rad (flightnumret). Terminal och gate som text, flygbolaget på egen rad, aldrig avklippt. */}
          <span style={{ display: 'block', fontSize: 'var(--fs-2)', color: colors.text, fontWeight: 700, marginTop: '2px', overflowWrap: 'anywhere' }}>
            {[f.terminal ? `T${f.terminal}` : '', where].filter(Boolean).join(' · ')}
          </span>
          {shortAirline(f.airline) ? (
            <span style={{ display: 'block', fontSize: 'var(--fs-2)', color: colors.textDim, overflowWrap: 'anywhere' }}>{shortAirline(f.airline)}</span>
          ) : null}
        </span>
        <span style={{ flexShrink: 0, textAlign: 'right' }}>
          <span
            style={{
              display: 'block',
              fontFamily: fonts.display,
              fontSize: 'var(--fs-5)',
              fontWeight: 800,
              letterSpacing: '-0.015em',
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
                fontSize: 'var(--fs-2)',
                fontWeight: cancelled || delayed ? 700 : 400,
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
        // Utfälld rad blir ett eget kort (samma tonade bakgrund som raden): först svaret, när du ska
        // vara vid säkerheten, sedan fakta som etikett och värde, sist knappen över hela bredden.
        <div style={{ padding: '0 14px 16px', borderBottom: `1px solid ${colors.border}`, fontSize: 'var(--fs-2)', lineHeight: 1.45 }}>
          {plan && stage !== 'ok' ? (
            <div style={{ padding: '12px 0 14px', borderTop: `1px solid ${colors.border}` }}>
              <div style={labelStyle}>{stage === 'closed' ? t('Gaten är stängd', 'The gate is closed') : t('Security-tiden har passerat', 'Security time has passed')}</div>
              <div style={{ fontFamily: fonts.display, fontStretch: 'var(--stretch-head)', fontSize: 'var(--fs-5)', fontWeight: 800, lineHeight: 1.15, marginTop: '4px', color: colors.text }}>
                {stage === 'closed'
                  ? t('Fråga flygbolaget om du inte hunnit fram', 'Ask the airline if you have not made it')
                  : f.gate
                  ? t(`Gå direkt till gate ${f.gate}`, `Go straight to gate ${f.gate}`)
                  : t('Gå direkt till gaten', 'Go straight to the gate')}
              </div>
              <div style={{ color: colors.textDim, marginTop: '4px', fontSize: 'var(--fs-2)' }}>
                {stage === 'closed'
                  ? gateClosedByAirport(f)
                    ? t('Flygplatsen anger att gaten är stängd.', 'The airport says the gate is closed.')
                    : t(`Gaten stängde ca ${plan.gateCloses}.`, `The gate closed around ${plan.gateCloses}.`)
                  : t(`Gaten stänger ca ${plan.gateCloses}. Uppskattat.`, `The gate closes around ${plan.gateCloses}. Estimated.`)}
              </div>
            </div>
          ) : plan ? (
            <div style={{ padding: '12px 0 14px', borderTop: `1px solid ${colors.border}` }}>
              <div style={labelStyle}>{t('Var vid security senast', 'Be at security by')}</div>
              <div style={{ fontFamily: fonts.display, fontStretch: 'var(--stretch-head)', fontSize: 'var(--fs-6)', fontWeight: 800, lineHeight: 1.05, marginTop: '4px', fontVariantNumeric: 'tabular-nums', color: colors.text }}>
                {plan.atSecurity}
              </div>
              <div style={{ color: colors.textDim, marginTop: '4px', fontSize: 'var(--fs-2)' }}>
                {plan.queue !== null && usingTypical
                  ? t(
                      `Med ${plan.queue} min kötid, som det brukar vara då, och ${plan.walkMin}–${plan.walkMax} min till gaten. Uppskattat.`,
                      `With ${plan.queue} min at security, as it usually is then, and ${plan.walkMin}–${plan.walkMax} min to the gate. Estimated.`
                    )
                  : plan.queue !== null
                  ? t(
                      `Med ${plan.queue} min kötid just nu och ${plan.walkMin}–${plan.walkMax} min till gaten. Uppskattat.`,
                      `With ${plan.queue} min at security now and ${plan.walkMin}–${plan.walkMax} min to the gate. Estimated.`
                    )
                  : t(
                      `Med ${plan.walkMin}–${plan.walkMax} min till gaten, utan kötid (se Brukar vara). Uppskattat.`,
                      `With ${plan.walkMin}–${plan.walkMax} min to the gate, without the queue (see Usually). Estimated.`
                    )}
              </div>
            </div>
          ) : null}
          {details.length ? (
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                columnGap: '16px',
                rowGap: '6px',
                margin: 0,
                padding: '12px 0 0',
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              {details.map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt style={{ color: colors.textDim }}>{label}</dt>
                  <dd style={{ margin: 0, color: colors.text, fontWeight: 700 }}>{value}</dd>
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
                  marginTop: '16px',
                  width: '100%',
                  minHeight: '48px',
                  padding: '0 14px',
                  borderRadius: 'var(--radius-control)',
                  border: `1px solid ${colors.text}`,
                  backgroundColor: saved ? 'transparent' : colors.text,
                  color: saved ? colors.text : colors.bg,
                  fontSize: 'var(--fs-3)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {saved ? t('✓ Sparat under Min resa', '✓ Saved under My trip') : t('Spara som mitt flyg', 'Save as my flight')}
              </button>
              <div style={{ color: colors.textDim, marginTop: '6px', fontSize: 'var(--fs-2)', textAlign: 'center' }}>
                {saved
                  ? t('Tryck igen för att ta bort. Ligger kvar tills planet lyft.', 'Tap again to remove. Stays until the plane has left.')
                  : t('Hamnar under Min resa med gate och tider.', 'Goes under My trip with gate and times.')}
              </div>
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
