'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { colors, textInput } from './styles';
import { useLang } from '../lib/i18n';
import { AIRPORTS, foldSearch } from '../lib/flights.mjs';
import { typicalQueueFor } from '../lib/gateTime.mjs';
import { stockholmDay } from '../lib/sweTime.mjs';
import { alightFor, boardFor, flightMargin, isBigStation, parseTicket, trainMargin, type Anchor, type FlightMargin } from '../lib/ticket.mjs';
import type { Flight } from '../lib/types';

type TrainStop = {
  name: string;
  lat?: number;
  lon?: number;
  track?: string;
  cancelled?: boolean;
  departure?: { scheduled: string; estimated?: string };
  arrival?: { scheduled: string; estimated?: string };
};
type TrainData = { number: string; date: string; product?: string; operator?: string; to?: string; stops: TrainStop[] };

type Props = {
  /** Det man skrev under "Vart ska du?": väljer stationen man kliver av på. */
  goal: string;
  /** Den färdiga biljetten med marginal, eller null så länge den inte är klar. */
  onAnchor: (anchor: Anchor | null, info?: { why: string }) => void;
  /** Där man startar, om det redan är känt (inskriven plats). Annars frågar appen telefonen. */
  near?: { lat: number; lon: number } | null;
};

/** Telefonens position, utan att vänta länge. null om den nekas. */
function locate(): Promise<{ lat: number; lon: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 }
    );
  });
}

/** Flygplatserna där resan dit går att planera (ResRobot täcker bara Sverige). */
const SWEDISH_AIRPORTS = AIRPORTS.filter((a) => a.source !== 'avinor');

/**
 * "Jag har en biljett": tågnummer eller flightnummer och dag. Appen hämtar avgången
 * (Trafikverket för tåg, flygplatsens tavla för flyg), räknar marginalen och lämnar
 * en färdig biljett till reseplaneraren. Hittas den inte skriver man tiden själv.
 */
export default function TicketPicker({ goal, onAnchor, near = null }: Props) {
  const { t } = useLang();
  const today = stockholmDay(Date.now());
  const tomorrow = stockholmDay(Date.now() + 86_400_000);
  const [text, setText] = useState('');
  const [date, setDate] = useState(today);
  const [airport, setAirport] = useState('ARN');
  const [bags, setBags] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [train, setTrain] = useState<TrainData | null>(null);
  const [board, setBoard] = useState(0);
  const [alight, setAlight] = useState(-1);
  // Var man är, för att föreslå påstigning närmast en.
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(near);
  // Påstigningen ligger långt härifrån: sitter man redan på tåget, eller ska man dit?
  const [onboard, setOnboard] = useState<boolean | null>(null);
  const [boardTouched, setBoardTouched] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [queue, setQueue] = useState<number | null>(null);
  // Hittades inte (annan dag, annat bolag): skriv in tiden från biljetten.
  const [manual, setManual] = useState(false);
  const [manualFrom, setManualFrom] = useState('');
  const [manualTime, setManualTime] = useState('');

  const parsed = parseTicket(text);
  const isFlight = parsed?.kind === 'flight';
  const lookupKey = parsed ? `${parsed.kind}|${parsed.number}|${date}|${isFlight ? airport : ''}` : '';

  // Hämta avgången när numret ser rätt ut, en stund efter att man slutat skriva.
  useEffect(() => {
    setTrain(null);
    setFlight(null);
    setError('');
    setManual(false);
    if (!parsed) return;
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        if (parsed.kind === 'train') {
          const res = await fetch(`/api/trafik?action=train&number=${parsed.number}&date=${date}`);
          const data = await res.json();
          if (!active) return;
          if (!res.ok || !Array.isArray(data.stops) || data.stops.length < 2) {
            setError(data.error || t(`Hittade inget tåg ${parsed.number}.`, `Found no train ${parsed.number}.`));
            setManual(true);
            return;
          }
          const stops = data.stops as TrainStop[];
          setTrain(data as TrainData);
          // Påstigning: tågets station närmast där du är, annars första.
          const where = near || pos || (await locate());
          if (!active) return;
          if (where) setPos(where);
          const b = boardFor(stops, where).board;
          setBoard(b);
          setBoardTouched(false);
          setOnboard(null);
          setAlight(alightFor(stops, goal, b));
        } else {
          // Flygtavlan visar bara dagens flyg. En annan dag: tiden från biljetten.
          if (date !== today) {
            setError(t('Flygtavlan visar bara dagens flyg. Skriv avgångstiden från biljetten.', 'The flight board only shows today. Type the departure time from your ticket.'));
            setManual(true);
            return;
          }
          const res = await fetch(`/api/trafik?action=flights&airport=${airport}&direction=departures`);
          const data = await res.json();
          if (!active) return;
          const want = foldSearch(parsed.number);
          const hit = Array.isArray(data.flights)
            ? (data.flights as Flight[]).find((f) => foldSearch(f.flightId) === want || (f.codeshare || []).some((c) => foldSearch(c) === want))
            : null;
          if (!hit) {
            const name = SWEDISH_AIRPORTS.find((a) => a.iata === airport)?.short || airport;
            setError(t(`Hittade inte ${parsed.number} från ${name} i dag. Fel flygplats? Annars skriv tiden från biljetten.`, `Could not find ${parsed.number} from ${name} today. Wrong airport? Otherwise type the time from your ticket.`));
            setManual(true);
            return;
          }
          setFlight(hit);
        }
      } catch {
        if (active) {
          setError(t('Kunde inte hämta avgången just nu. Skriv tiden från biljetten.', 'Could not fetch the departure right now. Type the time from your ticket.'));
          setManual(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey]);

  // Säkerhetskön som den brukar vara timmen före avgång (Swedavias öppna kötider).
  const hasQueues = Boolean(SWEDISH_AIRPORTS.find((a) => a.iata === airport)?.waitTimes);
  const flightTime = flight ? flight.scheduledAt : manual && isFlight && manualTime ? `${date}T${manualTime}` : '';
  useEffect(() => {
    setQueue(null);
    if (!isFlight || !hasQueues || !flightTime) return;
    let active = true;
    fetch(`/api/trafik?action=queueforecast&airport=${airport}&date=${flightTime.slice(0, 10)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setQueue(typicalQueueFor(d, { id: '', flightId: '', scheduledTime: '', status: 'on-time', scheduledAt: flightTime, expectedAt: flightTime, terminal: flight?.terminal || '' })))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isFlight, hasQueues, airport, flightTime, flight?.terminal]);

  const departing = useMemo(() => (train ? train.stops.map((s, i) => ({ s, i })).filter(({ s }) => s.departure) : []), [train]);

  // Den färdiga biljetten.
  // Hur långt bort påstigningen ligger. Långt bort: fråga innan något planeras.
  const boardStop = train ? train.stops[board] : null;
  const away = boardStop && pos ? boardFor([boardStop], pos) : null;
  const far = Boolean(away && away.far);

  const result = useMemo((): { anchor: Anchor; why: string; fm?: FlightMargin } | null => {
    if (!parsed) return null;
    if (train) {
      const from = train.stops[board];
      const to = train.stops[alight];
      if (!from?.departure || !to) return null;
      if (far && onboard === null) return null;
      const on = far && onboard === true;
      const margin = on ? 0 : trainMargin(from.name);
      const product = train.product ? train.product.replace(/\s*tåg$/i, 'tåg') : '';
      return {
        anchor: {
          kind: 'train',
          number: train.number,
          label: `${t('Tåg', 'Train')} ${train.number}`,
          operator: [train.operator, product].filter(Boolean).join(' · ') || undefined,
          date: train.date,
          dep: from.departure.scheduled,
          from: from.name,
          track: from.track || '',
          to: to.name,
          arr: (to.arrival || to.departure)?.scheduled,
          arrDate: train.date,
          margin,
          ...(on ? { onboard: true } : {}),
        },
        why: on
          ? t('Du sitter redan på tåget.', 'You are already on the train.')
          : isBigStation(from.name)
          ? t(`${margin} min före: stor station, långt mellan spåren`, `${margin} min early: big station, long walks between tracks`)
          : t(`${margin} min före avgång`, `${margin} min before departure`),
      };
    }
    if (flight) {
      const fm = flightMargin(flight, airport, { queue, bags });
      if (!fm) return null;
      return {
        anchor: {
          kind: 'flight',
          number: flight.flightId,
          label: `${t('Flyg', 'Flight')} ${flight.flightId}`,
          operator: flight.airline,
          date: flight.scheduledAt.slice(0, 10),
          dep: flight.scheduledTime || flight.scheduledAt.slice(11, 16),
          from: SWEDISH_AIRPORTS.find((a) => a.iata === airport)?.name || airport,
          track: flight.terminal ? `${t('terminal', 'terminal')} ${flight.terminal}` : '',
          to: flight.place || '',
          margin: fm.minutes,
          airport,
          scheduledAt: flight.scheduledAt,
        },
        fm,
        why: '',
      };
    }
    if (manual && /^\d{2}:\d{2}$/.test(manualTime)) {
      if (isFlight) {
        const fm = flightMargin({ airlineIata: parsed.number.slice(0, 2), domestic: false }, airport, { queue, bags });
        if (!fm) return null;
        return {
          anchor: {
            kind: 'flight',
            number: parsed.number,
            label: `${t('Flyg', 'Flight')} ${parsed.number}`,
            date,
            dep: manualTime,
            from: SWEDISH_AIRPORTS.find((a) => a.iata === airport)?.name || airport,
            to: goal.trim(),
            margin: fm.minutes,
            airport,
            manual: true,
          },
          fm,
          why: '',
        };
      }
      if (manualFrom.trim().length < 2) return null;
      const margin = trainMargin(manualFrom);
      return {
        anchor: {
          kind: 'train',
          number: parsed.number,
          label: `${t('Tåg', 'Train')} ${parsed.number}`,
          date,
          dep: manualTime,
          from: manualFrom.trim(),
          to: goal.trim(),
          margin,
          manual: true,
        },
        why: t(`${margin} min före avgång`, `${margin} min before departure`),
      };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.number, train, board, alight, far, onboard, flight, airport, queue, bags, manual, manualFrom, manualTime, date, goal, t]);

  const anchorKey = result ? JSON.stringify(result.anchor) : '';
  useEffect(() => {
    onAnchor(result ? result.anchor : null, result ? { why: result.why } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey]);

  const time = (p?: { scheduled: string; estimated?: string }) => (p ? p.scheduled : '');

  return (
    <div style={{ marginTop: '10px' }}>
      <label style={fieldLabel}>
        {t('Tågnummer eller flightnummer', 'Train or flight number')}
        <input
          type="text"
          value={text}
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          placeholder={t('T.ex. 7063 eller SK1415', 'E.g. 7063 or SK1415')}
          style={{ ...textInput(colors.borderStrong), display: 'block', width: '100%', minHeight: '48px', fontSize: 'var(--fs-3)', fontWeight: 400, color: colors.text }}
        />
      </label>
      {text.trim().length >= 2 && !parsed ? (
        <p style={note}>{t('Skriv bara numret, som på biljetten: 7063 för tåg, SK1415 för flyg.', 'Type just the number from the ticket: 7063 for a train, SK1415 for a flight.')}</p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '6px', marginTop: '10px' }}>
        <button type="button" aria-pressed={date === today} onClick={() => setDate(today)} style={chip(date === today)}>
          {t('I dag', 'Today')}
        </button>
        <button type="button" aria-pressed={date === tomorrow} onClick={() => setDate(tomorrow)} style={chip(date === tomorrow)}>
          {t('I morgon', 'Tomorrow')}
        </button>
        <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center' }}>
          <span className="sr-only">{t('Datum', 'Date')}</span>
          <input type="date" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} style={field} />
        </label>
      </div>

      {isFlight ? (
        <label style={{ ...fieldLabel, marginTop: '10px' }}>
          {t('Från flygplats', 'From airport')}
          <select value={airport} onChange={(e) => setAirport(e.target.value)} style={field}>
            {SWEDISH_AIRPORTS.map((a) => (
              <option key={a.iata} value={a.iata}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div aria-live="polite">
        {loading ? <p style={note}>{t('Letar upp avgången…', 'Looking up the departure…')}</p> : null}
        {error ? <p style={{ ...note, color: colors.textSoft }}>{error}</p> : null}

        {train && departing.length > 0 ? (
          <div style={box}>
            <strong style={{ display: 'block', fontSize: 'var(--fs-3)' }}>
              {t('Tåg', 'Train')} {train.number}
              {train.to ? ` ${t('mot', 'to')} ${train.to}` : ''}
            </strong>
            {train.operator || train.product ? (
              <span style={{ display: 'block', fontSize: 'var(--fs-2)', color: colors.textDim }}>{[train.operator, train.product].filter(Boolean).join(' · ')}</span>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
              <label style={{ ...fieldLabel, flex: '1 1 10rem' }}>
                {t('Du kliver på', 'You board at')}
                <select
                  value={board}
                  onChange={(e) => {
                    const b = Number(e.target.value);
                    setBoard(b);
                    setBoardTouched(true);
                    setOnboard(null);
                    setAlight((a) => (a > b ? a : alightFor(train.stops, goal, b)));
                  }}
                  style={field}
                >
                  {departing.map(({ s, i }) => (
                    <option key={i} value={i}>
                      {time(s.departure)} {s.name}
                      {s.track ? ` · ${t('spår', 'track')} ${s.track}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ ...fieldLabel, flex: '1 1 10rem' }}>
                {t('Du kliver av', 'You get off at')}
                <select value={alight} onChange={(e) => setAlight(Number(e.target.value))} style={field}>
                  {train.stops.map((s, i) =>
                    i > board ? (
                      <option key={i} value={i}>
                        {time(s.arrival || s.departure)} {s.name}
                      </option>
                    ) : null
                  )}
                </select>
              </label>
            </div>
            {far && away?.meters ? (
              // Påstigningen ligger långt bort: sitter man redan på tåget, eller ska man dit?
              <div style={{ marginTop: '10px' }}>
                <p style={{ margin: 0, fontSize: 'var(--fs-2)', lineHeight: 1.45 }}>
                  {t(
                    `${train.stops[board].name} ligger ${Math.round(away.meters / 1000)} km härifrån. Är du redan på tåget?`,
                    `${train.stops[board].name} is ${Math.round(away.meters / 1000)} km from here. Are you already on the train?`
                  )}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  <button type="button" aria-pressed={onboard === true} onClick={() => setOnboard(true)} style={chip(onboard === true)}>
                    {t('Ja, jag är på tåget', 'Yes, I am on the train')}
                  </button>
                  <button type="button" aria-pressed={onboard === false} onClick={() => setOnboard(false)} style={chip(onboard === false)}>
                    {t(`Nej, jag ska till ${train.stops[board].name}`, `No, I am going to ${train.stops[board].name}`)}
                  </button>
                </div>
                {!boardTouched && onboard === null ? (
                  <p style={note}>{t('Kliver du på någon annanstans? Välj stationen ovan.', 'Boarding somewhere else? Pick the station above.')}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {flight ? (
          <div style={box}>
            <strong style={{ display: 'block', fontSize: 'var(--fs-3)' }}>
              {t('Flyg', 'Flight')} {flight.flightId}
              {flight.place ? ` ${t('till', 'to')} ${flight.place}` : ''} · {flight.scheduledTime}
            </strong>
            <span style={{ display: 'block', fontSize: 'var(--fs-2)', color: colors.textDim }}>
              {[flight.airline, flight.terminal ? `${t('Terminal', 'Terminal')} ${flight.terminal}` : '', flight.newTime ? `${t('ny tid', 'new time')} ${flight.newTime}` : '']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ) : null}

        {manual && parsed ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '8px', marginTop: '10px' }}>
            {!isFlight ? (
              <label style={{ ...fieldLabel, flex: '1 1 12rem' }}>
                {t('Station där du kliver på', 'Station where you board')}
                <input
                  type="text"
                  value={manualFrom}
                  onChange={(e) => setManualFrom(e.target.value)}
                  placeholder={t('T.ex. Stockholm C', 'E.g. Stockholm C')}
                  style={{ ...field, width: '100%' }}
                />
              </label>
            ) : null}
            <label style={fieldLabel}>
              {t('Avgång enligt biljetten', 'Departure on the ticket')}
              <input type="time" value={manualTime} step={60} onChange={(e) => setManualTime(e.target.value)} style={field} />
            </label>
          </div>
        ) : null}

        {isFlight && (flight || manual) ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', marginTop: '6px', fontSize: 'var(--fs-2)' }}>
            <input type="checkbox" checked={bags} onChange={(e) => setBags(e.target.checked)} style={{ width: '20px', height: '20px' }} />
            {t('Jag lämnar in bagage', 'I am checking a bag')}
          </label>
        ) : null}

        {result && result.anchor.onboard ? (
          <p style={{ ...note, color: colors.text }}>
            <strong>
              {t(`Du kliver av i ${result.anchor.to} ${result.anchor.arr || ''}`, `You get off at ${result.anchor.to} ${result.anchor.arr || ''}`)}
            </strong>
          </p>
        ) : result ? (
          <p style={{ ...note, color: colors.text }}>
            <strong>
              {t(`Var på ${result.anchor.from} senast`, `Be at ${result.anchor.from} by`)} {clockMinus(result.anchor.dep, result.anchor.margin)}
            </strong>
            <span style={{ display: 'block', color: colors.textDim }}>
              {result.fm
                ? t(
                    `${result.fm.minutes} min före: boarding ${result.fm.boarding} min före avgång, ${result.fm.walk} min till gaten, säkerhetskö ${result.fm.queueKnown ? 'som den brukar vara' : 'ca'} ${result.fm.queue} min, ${result.fm.toSecurity} min in från tåg eller buss${result.fm.bags ? `, ${result.fm.bags} min för bagaget` : ''}. Uppskattat.`,
                    `${result.fm.minutes} min early: boarding ${result.fm.boarding} min before departure, ${result.fm.walk} min to the gate, security ${result.fm.queueKnown ? 'as usual' : 'about'} ${result.fm.queue} min, ${result.fm.toSecurity} min in from the train or bus${result.fm.bags ? `, ${result.fm.bags} min for bag drop` : ''}. Estimated.`
                  )
                : result.why}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** "08:40" minus 20 min → "08:20". */
function clockMinus(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const chip = (on: boolean): React.CSSProperties => ({
  minHeight: '44px',
  padding: '0 12px',
  border: `1px solid ${on ? colors.text : colors.borderStrong}`,
  backgroundColor: on ? colors.accentStrong : 'transparent',
  color: on ? colors.onAccent : colors.text,
  fontSize: 'var(--fs-2)',
  fontWeight: 700,
  cursor: 'pointer',
});

const note: React.CSSProperties = { margin: '8px 0 0', fontSize: 'var(--fs-2)', lineHeight: 1.45, color: colors.textDim };

const box: React.CSSProperties = { marginTop: '10px', padding: '10px 12px', border: `1px solid ${colors.borderStrong}` };

const fieldLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: 'var(--fs-2)',
  fontWeight: 700,
  color: colors.textDim,
};

const field: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 10px',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 0,
  backgroundColor: colors.surface,
  color: colors.text,
  fontSize: 'var(--fs-3)',
  fontFamily: 'inherit',
};
