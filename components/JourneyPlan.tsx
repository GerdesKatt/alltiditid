'use client';
import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import StrandedTips from './StrandedTips';
import { colors, fonts, textInput } from './styles';
import { useLang } from '../lib/i18n';
import { lineColor } from '../lib/lineFormat';
import { track } from '../lib/track';
import type { TransportMode } from '../lib/types';
import { dayLabel, type PlanLeg, type PlanPoint, type PlanTrip } from '../lib/plannedTrip';
import PlaceSuggest, { placeDetail, type ChosenPlace } from './PlaceSuggest';
import { stockholmDay } from '../lib/sweTime.mjs';
import TicketPicker from './TicketPicker';
import { AIRPORT_PLACES, clockOf, deadline, pickFeeder, ticketTrip, type Anchor } from '../lib/ticket.mjs';
import type { TicketBackup } from '../lib/plannedTrip';

type Point = PlanPoint;
type Leg = PlanLeg;
type Trip = PlanTrip;
type Plan = {
  to: string;
  /** Vad texten tolkades som: hållplats, plats (hotell, arena), adress eller område. */
  toKind?: ChosenPlace['kind'];
  toDetail?: string;
  toType?: string;
  /** false: inget passade orden säkert, så resultatet visar andra tänkbara mål. */
  sure?: boolean;
  alternatives?: ChosenPlace[];
  fromHere: boolean;
  /** Den inskrivna starten som den tolkades, t.ex. "Blåklintsvägen 4, Stockholm". */
  from?: string;
  /** Ingen hållplats inom gångavstånd: resan går från närmaste hållplats, så här långt bort. */
  farStart?: { name: string; meters: number };
  date: string;
  time: string;
  arrive: boolean;
  trips: Trip[];
};

type Props = {
  /** Det man skrev under "Vart ska du?". */
  goal: string;
  /** Ett valt förslag under fältet: då söks resan dit direkt, utan att gissa. */
  place?: ChosenPlace | null;
  /** Välj ett annat mål ("Menade du …?"). */
  onPlace?: (place: ChosenPlace) => void;
  /** Tavlans hållplats: start om positionen inte går att få. */
  fromId: string;
  fromName: string;
  /** Platsen man skrev in under Avgångar när positionen är avstängd: används i stället för positionen. */
  startAt?: { name: string; lat: number; lon: number } | null;
  /** Spara en resa som Min resa. Med en bokad biljett följer biljetten och reserven med. */
  onSave: (to: string, from: string, trip: Trip, ticket?: { anchor: Anchor; backup: TicketBackup | null }) => void;
  /** Rensa: tömmer Vart ska du? och resultaten. */
  onClear?: () => void;
  /** Avgångstiden för den resa som redan är sparad, så att knappen visar Sparad. */
  savedKey: string;
};

/** "SL buss 144": bolaget först, sedan slag och nummer. Utan bolag: "Buss 144". */
export function rideLabel(leg: Leg): string {
  if (leg.kind !== 'ride') return '';
  // "Snabbtåg tåg 566" (äldre sparade resor) → "Snabbtåg 566"
  const line = leg.line.replace(/^(\S*?(tåg|buss|båt))\s+\2\b/i, '$1');
  if (line !== leg.line) return rideLabel({ ...leg, line });
  // Resor sparade före bolagsnamnen: "Länstrafik buss 144" → "Buss 144".
  if (/^länstrafik\s/i.test(leg.line) && !leg.agency) {
    const rest = leg.line.replace(/^länstrafik\s+/i, '');
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  if (!leg.agency || leg.line.toLowerCase().startsWith(leg.agency.toLowerCase())) return leg.line;
  return `${leg.agency} ${leg.line.charAt(0).toLowerCase()}${leg.line.slice(1)}`;
}

/** "spår 2" för tåg och T-bana, "läge A" för buss och spårvagn. */
export function trackText(mode: string, value: string, t: (sv: string, en: string) => string): string {
  if (/^(spår|läge|track|stand)\b/i.test(value)) return value;
  // Flyg: terminalen står redan med ord ("terminal 5").
  if (mode === 'flight') return value;
  return mode === 'bus' || mode === 'tram' ? `${t('läge', 'stand')} ${value}` : `${t('spår', 'track')} ${value}`;
}

/** Datumet i svensk tid, så att "i dag" och "i morgon" stämmer även på en telefon i en annan tidszon. */
const isoDay = (d: Date) => stockholmDay(d.getTime());

const duration = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`;

/** Telefonens position, eller null om den nekas eller dröjer. Frågar bara när man trycker. */
function position(): Promise<{ lat: number; lon: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

/**
 * Hela resan dit man ska, med byten och gång: buss till Fruängen, T-bana till T-Centralen,
 * regionaltåg till Karlstad. Startar där man står (positionen) eller vid tavlans hållplats.
 */
export default function JourneyPlan({ goal, place, onPlace, fromId, fromName, startAt, onSave, savedKey, onClear }: Props) {
  const { t, lang } = useLang();
  // Tid: nu, eller ett valt datum och klockslag, som avgång eller senaste ankomst.
  const [whenMode, setWhenMode] = useState<'now' | 'later' | 'ticket'>('now');
  // "Jag har en biljett": den fasta avgången som resten byggs runt.
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const ticketMode = whenMode === 'ticket';
  const [date, setDate] = useState(() => isoDay(new Date(Date.now() + 86_400_000)));
  const [time, setTime] = useState('08:00');
  const [arrive, setArrive] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(0);
  const [asked, setAsked] = useState('');
  // Var sökningen startade (position eller inskriven plats), för tipsen när man är strandad.
  // Ingen resa alls från platsen (inte fel mål): då visas tipsen för den som är strandad.
  const [noTrip, setNoTrip] = useState(false);
  const [lastPos, setLastPos] = useState<{ lat: number; lon: number } | null>(null);
  // Start: där man står (positionen) eller tavlans hållplats.
  // Annan plats: man skriver var man startar, t.ex. när positionen är avstängd.
  const [fromMode, setFromMode] = useState<'here' | 'stop' | 'other'>('here');
  const [fromText, setFromText] = useState('');
  const [fromPick, setFromPick] = useState<ChosenPlace | null>(null);
  const [fromOpen, setFromOpen] = useState(false);
  const useStop = fromMode === 'stop' && Boolean(fromId);
  const useOther = fromMode === 'other';
  // Bara ett valt förslag räknas, så att man inte söker om för varje bokstav man skriver.
  const fromKey = fromPick ? fromPick.id || `${fromPick.lat},${fromPick.lon}` : '';

  // Positionen redan nekad i webbläsaren: börja med hållplatsen eller ett fält att skriva i,
  // i stället för att fråga och få ett fel.
  useEffect(() => {
    if (startAt || typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((r) => {
        if (r.state === 'denied') setFromMode((m) => (m === 'here' ? (fromId ? 'stop' : 'other') : m));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusFrom = () => setTimeout(() => document.getElementById('fran-plats')?.focus(), 0);

  const target = goal.trim();
  const placeKey = place ? place.id || `${place.lat},${place.lon}` : '';
  const anchorKey = ticketMode && anchor ? `${anchor.number}/${anchor.date}/${anchor.dep}/${anchor.from}/${anchor.margin}` : '';
  const query = `${target}|${whenMode}|${anchorKey}|${date}|${time}|${arrive}|${useOther ? `other:${fromKey}` : useStop ? fromId : startAt ? `${startAt.lat},${startAt.lon}` : 'here'}|${placeKey}`;
  const hereName = startAt ? startAt.name : '';
  const stale = plan !== null && asked !== query;

  async function find() {
    const fromPosition = !useStop && !useOther;
    if (target.length < 2) return;
    if (ticketMode && !anchor) {
      setError(t('Skriv numret på biljetten först.', 'Type the number on your ticket first.'));
      return;
    }
    if (useOther && fromText.trim().length < 2) {
      setError(t('Skriv var du startar.', 'Type where you start.'));
      focusFrom();
      return;
    }
    setLoading(true);
    setError('');
    setNoTrip(false);
    setPlan(null);
    setOpen(0);
    setAsked(query);
    const pos = fromPosition ? (startAt ? { lat: startAt.lat, lon: startAt.lon } : await position()) : null;
    setLastPos(pos ? { lat: pos.lat, lon: pos.lon } : null);
    if (fromPosition && !pos && !fromId) {
      // Ingen position och ingen hållplats: låt en skriva var man startar, direkt här.
      setLoading(false);
      setFromMode('other');
      setError(t('Kunde inte få din position. Skriv var du startar under Från.', 'Could not get your location. Type where you start under From.'));
      focusFrom();
      return;
    }
    const start = useOther
      ? fromPick
        ? fromPick.kind === 'stop' && fromPick.id
          ? { fromId: fromPick.id, fromName: fromPick.name }
          : { lat: fromPick.lat, lon: fromPick.lon, fromName: fromPick.name }
        : { from: fromText.trim() }
      : pos
        ? pos
        : { fromId, fromName };
    try {
      const res = await fetch('/api/trafik?action=plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          ticketMode && anchor
            ? {
                // Baklänges: till stationen eller flygplatsen, framme senast avgången minus marginalen.
                ...ticketTarget(anchor),
                ...start,
                ...(() => {
                  const by = clockOf(deadline(anchor));
                  return { date: by.date, time: by.time, arrive: true, ticket: true };
                })(),
              }
            : {
                to: target,
                ...(place ? { place } : {}),
                ...start,
                ...(whenMode === 'later' ? { date, time, arrive } : {}),
              }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setNoTrip(res.status === 404 && Boolean(data.to));
        throw new Error(data.error || '');
      }
      setPlan(data as Plan);
      track('funktion', 0, ticketMode ? 'reseplan_biljett' : 'reseplan');
    } catch (e) {
      setError((e as Error).message || t('Hittade ingen resa just nu. Prova en annan tid eller ett mål i närheten.', 'No trip found right now. Try another time or a destination nearby.'));
    } finally {
      setLoading(false);
    }
  }

  // Tömt fält: glöm förra sökningen, så att ett nytt mål börjar från början.
  useEffect(() => {
    if (target.length === 0) {
      setPlan(null);
      setAsked('');
      setError('');
    }
  }, [target]);

  // Valt ett förslag: sök resan dit direkt.
  useEffect(() => {
    if (place && !loading && asked !== query && !(ticketMode && !anchor)) find();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey]);

  // Har man redan sökt och byter tid eller start: sök om av sig själv (samma mål).
  useEffect(() => {
    if (!asked || loading || asked === query || asked.split('|')[0] !== target) return;
    if (ticketMode && !anchor) return;
    const timer = setTimeout(() => find(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (target.length < 2) return null;

  // Med en biljett: en förbindelse med god marginal, och den sista som hinner som reserv.
  const ticketPick = ticketMode && anchor && plan ? pickFeeder(plan.trips, deadline(anchor)) : null;
  const shown: { trip: Trip; tag?: string }[] = ticketPick
    ? [
        { trip: ticketPick.main, tag: ticketPick.tight ? t('Snålt, men först fram', 'Tight, but earliest') : t('Rekommenderas', 'Recommended') },
        ...(ticketPick.backup ? [{ trip: ticketPick.backup, tag: t('Reserv om du missar den', 'Backup if you miss it') }] : []),
      ]
    : (plan?.trips || []).map((trip) => ({ trip }));
  const backupOf = (trip: Trip): TicketBackup | null => {
    if (!ticketPick || !ticketPick.backup || trip !== ticketPick.main) return null;
    const first = ticketPick.backup.legs.find((l) => l.kind === 'ride');
    return first && first.kind === 'ride' ? { dep: first.from.time, line: rideLabel(first), from: first.from.name } : null;
  };

  const tomorrow = isoDay(new Date(Date.now() + 86_400_000));
  const chip = (on: boolean): React.CSSProperties => ({
    minHeight: '40px',
    padding: '0 12px',
    border: `1px solid ${on ? colors.text : colors.borderStrong}`,
    backgroundColor: on ? colors.accentStrong : 'transparent',
    color: on ? colors.onAccent : colors.text,
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
  });

  return (
    <div style={{ marginTop: '14px' }}>
      <fieldset style={{ border: 'none', margin: '0 0 12px', padding: 0 }}>
        <legend style={{ ...label, marginBottom: '6px' }}>{t('När', 'When')}</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <button type="button" aria-pressed={whenMode === 'now'} onClick={() => setWhenMode('now')} style={chip(whenMode === 'now')}>
            {t('Nu', 'Now')}
          </button>
          <button
            type="button"
            aria-pressed={whenMode === 'later' && date === tomorrow}
            onClick={() => {
              setWhenMode('later');
              setDate(tomorrow);
            }}
            style={chip(whenMode === 'later' && date === tomorrow)}
          >
            {t('I morgon', 'Tomorrow')}
          </button>
          <button
            type="button"
            aria-pressed={whenMode === 'later' && date !== tomorrow}
            onClick={() => setWhenMode('later')}
            style={chip(whenMode === 'later' && date !== tomorrow)}
          >
            {t('Annan dag', 'Other day')}
          </button>
          <button type="button" aria-pressed={ticketMode} onClick={() => setWhenMode('ticket')} style={chip(ticketMode)}>
            {t('Jag har en biljett', 'I have a ticket')}
          </button>
        </div>
        {ticketMode ? <TicketPicker goal={target} onAnchor={(a) => setAnchor(a)} /> : null}
        {whenMode === 'later' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <label style={fieldLabel}>
              {t('Datum', 'Date')}
              <input type="date" value={date} min={isoDay(new Date())} onChange={(e) => setDate(e.target.value)} style={field} />
            </label>
            <label style={fieldLabel}>
              {t('Tid', 'Time')}
              <input type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} style={field} />
            </label>
            <label style={fieldLabel}>
              <span className="sr-only">{t('Tiden gäller', 'The time is')}</span>
              <select value={arrive ? 'arr' : 'dep'} onChange={(e) => setArrive(e.target.value === 'arr')} style={field}>
                <option value="dep">{t('Åk efter', 'Leave after')}</option>
                <option value="arr">{t('Framme senast', 'Arrive by')}</option>
              </select>
            </label>
          </div>
        ) : null}
      </fieldset>
      <fieldset style={{ border: 'none', margin: '0 0 14px', padding: 0 }}>
        <legend style={{ ...label, marginBottom: '6px' }}>{t('Från', 'From')}</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <button type="button" aria-pressed={fromMode === 'here'} onClick={() => setFromMode('here')} style={chip(fromMode === 'here')}>
            {hereName || t('Där jag är', 'Where I am')}
          </button>
          {fromId && fromName !== hereName ? (
            <button type="button" aria-pressed={useStop} onClick={() => setFromMode('stop')} style={chip(useStop)}>
              {fromName}
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={useOther}
            onClick={() => {
              setFromMode('other');
              focusFrom();
            }}
            style={chip(useOther)}
          >
            {t('Annan plats', 'Somewhere else')}
          </button>
        </div>
        {useOther ? (
          <div style={{ marginTop: '8px' }}>
            <label htmlFor="fran-plats" className="sr-only">
              {t('Var startar du?', 'Where do you start?')}
            </label>
            <input
              id="fran-plats"
              type="text"
              value={fromText}
              autoComplete="off"
              enterKeyHint="search"
              role="combobox"
              aria-expanded={fromOpen && fromText.trim().length >= 2}
              aria-controls="fran-plats-lista"
              onChange={(e) => {
                setFromText(e.target.value);
                setFromPick(null);
                setFromOpen(true);
              }}
              onFocus={() => setFromOpen(true)}
              onBlur={() => setFromOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFromOpen(false);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setFromOpen(false);
                  (e.currentTarget as HTMLInputElement).blur();
                  find();
                }
              }}
              placeholder={t('Var startar du? Hållplats eller adress', 'Where do you start? Stop or address')}
              style={{ ...textInput(colors.borderStrong), display: 'block', width: '100%', minHeight: '48px', fontSize: '1rem' }}
            />
            {fromOpen ? (
              <PlaceSuggest
                text={fromText}
                nearStopId={fromId || undefined}
                listId="fran-plats-lista"
                onPick={(p) => {
                  setFromText(p.name);
                  setFromPick(p);
                  setFromOpen(false);
                }}
              />
            ) : null}
          </div>
        ) : null}
      </fieldset>
      <button
        id="sok-resa"
        type="button"
        onClick={() => find()}
        disabled={loading}
        style={{ ...primary, width: '100%', minHeight: '52px', fontSize: '1rem', opacity: loading ? 0.7 : 1 }}
      >
        {loading ? t('Söker resa…', 'Finding a trip…') : `${t('Sök resa', 'Find trip')} →`}
      </button>
      {fromMode === 'here' ? (
        <p style={{ margin: '6px 0 0', fontSize: '0.8125rem', color: colors.textDim }}>
          {hereName
            ? t(`Startar vid ${hereName}, som du skrev under Avgångar.`, `Starts at ${hereName}, as you typed under Departures.`)
            : t(
                'Startar där du står. Positionen används bara för sökningen och sparas inte.',
                'Starts where you are. Your location is only used for the search and is not stored.'
              )}
        </p>
      ) : null}

      <div aria-live="polite">
        {error ? <p style={{ margin: '12px 0 0', fontSize: '0.9375rem', color: colors.textSoft }}>{error}</p> : null}
        {error && noTrip && lastPos ? <StrandedTips lat={lastPos.lat} lon={lastPos.lon} /> : null}

        {plan && !stale ? (
          <section aria-label={t(`Resor till ${plan.to}`, `Trips to ${plan.to}`)} style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Vad texten tolkades som, tydligt, så att man ser om det blev fel mål. */}
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                <span style={{ fontWeight: 400, color: colors.textDim }}>{t('Till', 'To')} </span>
                {ticketMode && anchor ? anchor.to || target : plan.to}
              </p>
              {ticketMode && anchor ? (
                <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: colors.textDim }}>
                  {t(`Via ${anchor.from}, med din biljett`, `Via ${anchor.from}, with your ticket`)}
                </p>
              ) : plan.toKind ? (
                <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: colors.textDim }}>
                  {placeDetail({ kind: plan.toKind, name: plan.to, detail: plan.toDetail, type: plan.toType || place?.type }, lang)}
                </p>
              ) : null}
            <p style={{ ...label, marginTop: '8px' }}>
              {plan.fromHere ? (hereName ? t(`Från ${hereName}`, `From ${hereName}`) : t('Från din position', 'From your location')) : t(`Från ${plan.from || fromName}`, `From ${plan.from || fromName}`)}
              {plan.date ? ` · ${dayLabel(plan.date, Date.now(), lang)}` : ''}
              {plan.time ? ` · ${plan.arrive ? t('framme', 'arrive') : t('efter', 'after')} ${plan.time}` : ''}
            </p>
            </div>
            {onClear ? (
              <button
                type="button"
                onClick={() => {
                  setPlan(null);
                  setAsked('');
                  onClear();
                }}
                style={{
                  flexShrink: 0,
                  minHeight: '32px',
                  marginTop: '-8px',
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  color: colors.text,
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                  cursor: 'pointer',
                }}
              >
                {t('Rensa', 'Clear')}
              </button>
            ) : null}
            </div>
            {plan.farStart ? (
              <p style={{ margin: '10px 0 4px', fontSize: '0.875rem', color: colors.textSoft, lineHeight: 1.5 }}>
                {t(
                  `Härifrån går inget. Från ${plan.farStart.name}, ${(plan.farStart.meters / 1000).toFixed(1).replace('.', ',')} km bort, kommer du hela vägen. Resorna nedan går därifrån.`,
                  `Nothing leaves from here. From ${plan.farStart.name}, ${(plan.farStart.meters / 1000).toFixed(1)} km away, you can go all the way. The trips below start there.`
                )}
              </p>
            ) : null}
            {plan.farStart && lastPos ? <StrandedTips lat={lastPos.lat} lon={lastPos.lon} /> : null}
            {plan.sure === false ? (
              <div style={{ margin: '10px 0 4px' }}>
                <p style={{ margin: '0 0 6px', fontSize: '0.875rem', color: colors.amber }}>
                  {t(`Hittade inget som heter exakt ”${target}”. Stämmer målet?`, `Found nothing named exactly “${target}”. Is this the right place?`)}
                </p>
                {plan.alternatives?.length && onPlace ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8125rem', color: colors.textDim }}>{t('Menade du', 'Did you mean')}</span>
                    {plan.alternatives.map((a, i) => (
                      <button
                        key={`${a.name}-${i}`}
                        type="button"
                        onClick={() => onPlace(a)}
                        title={placeDetail(a, lang)}
                        style={{ ...chip(false), minHeight: '36px', fontWeight: 600 }}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {ticketMode && anchor ? (
              // Biljetten är ankaret: allt annat räknas baklänges från den.
              <div style={{ margin: '10px 0 4px', padding: '10px 12px', border: `2px solid ${colors.text}` }}>
                <strong style={{ display: 'block', fontSize: '0.9375rem' }}>
                  {anchor.label}
                  {anchor.to ? ` ${t('till', 'to')} ${anchor.to}` : ''} · {anchor.dep}
                  {anchor.track ? `, ${anchor.kind === 'train' ? trackText('train', anchor.track, t) : anchor.track}` : ''}
                </strong>
                <span style={{ display: 'block', marginTop: '2px', fontSize: '0.875rem' }}>
                  {t(`Var på ${anchor.from} senast`, `Be at ${anchor.from} by`)} <strong>{clockOf(deadline(anchor)).time}</strong>
                  <span style={{ color: colors.textDim }}> · {t(`${anchor.margin} min marginal`, `${anchor.margin} min to spare`)}</span>
                </span>
                {ticketPick?.tight ? (
                  <span style={{ display: 'block', marginTop: '4px', fontSize: '0.875rem', color: colors.amber, fontWeight: 700 }}>
                    {t('Ingen resa hinner fram med hela marginalen. Åk så tidigt du kan.', 'No trip gets you there with the full margin. Leave as early as you can.')}
                  </span>
                ) : ticketPick && !ticketPick.backup ? (
                  <span style={{ display: 'block', marginTop: '4px', fontSize: '0.8125rem', color: colors.textDim }}>
                    {t('Det går glest härifrån, så det finns ingen senare som hinner.', 'Departures are sparse here, so there is no later one that makes it.')}
                  </span>
                ) : null}
              </div>
            ) : null}
            <ol style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
              {shown.map(({ trip, tag }, i) => {
                const expanded = open === i;
                const rides = trip.legs.filter((l) => l.kind === 'ride');
                return (
                  <li key={`${trip.dep}-${i}`} style={{ borderTop: `1px solid ${i === 0 ? colors.text : colors.border}` }}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? -1 : i)}
                      style={{
                        display: 'flex',
                        width: '100%',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '2px 12px',
                        minHeight: '56px',
                        padding: '10px 0',
                        border: 'none',
                        background: 'none',
                        color: colors.text,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontFamily: fonts.display, fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
                        {trip.dep}–{trip.arr}
                        {trip.arrDate && trip.depDate && trip.arrDate !== trip.depDate ? (
                          <sup style={{ fontSize: '0.75rem', marginLeft: '2px' }}>+1</sup>
                        ) : null}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: colors.textDim }}>
                        {duration(trip.minutes)} ·{' '}
                        {trip.changes === 0
                          ? t('inga byten', 'direct')
                          : t(`${trip.changes} byte${trip.changes > 1 ? 'n' : ''}`, `${trip.changes} change${trip.changes > 1 ? 's' : ''}`)}
                      </span>
                      <span style={{ flexBasis: '100%', fontSize: '0.8125rem', color: colors.textDim }}>
                        {rides.map(rideLabel).join(' → ')}
                      </span>
                      {tag ? (
                        <span style={{ ...label, flexBasis: '100%', marginTop: '2px', color: i === 0 ? colors.text : colors.textDim }}>
                          {tag}
                          {anchor ? ` · ${t('framme', 'there')} ${trip.arr}` : ''}
                        </span>
                      ) : null}
                    </button>
                    {expanded ? (
                      <>
                        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                          {trip.legs.map((l, j) => (
                            <LegRow key={j} leg={l} />
                          ))}
                        </ol>
                        <div style={{ margin: '4px 0 14px' }}>
                          {savedKey === `${trip.depDate} ${trip.dep}` ? (
                            <span style={{ ...secondary, display: 'inline-flex', alignItems: 'center' }}>✓ {t('Sparad som min resa', 'Saved as my trip')}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const from = plan.fromHere ? hereName || t('din position', 'your location') : plan.from || fromName;
                                if (ticketMode && anchor) {
                                  // Hela resan: dit, bytet med marginal och biljetten sist.
                                  onSave(anchor.to || target, from, ticketTrip(trip, anchor), { anchor, backup: backupOf(trip) });
                                } else onSave(plan.to, from, trip);
                                track('funktion', 0, 'reseplan_spara');
                              }}
                              style={primary}
                            >
                              {t('Spara som min resa', 'Save as my trip')}
                            </button>
                          )}
                        </div>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** Vart förbindelsen ska: stationen (sökt på namnet) eller flygplatsens terminal. */
function ticketTarget(anchor: Anchor): { to: string; place?: { kind: 'poi'; name: string; lat: number; lon: number } } {
  const air = anchor.kind === 'flight' && anchor.airport ? AIRPORT_PLACES[anchor.airport] : null;
  if (air) return { to: air.name, place: { kind: 'poi', name: air.name, lat: air.lat, lon: air.lon } };
  return { to: anchor.from };
}

/** Linjenumret i en ruta med linjens färg i kanten, som på tavlan. */
export function LineBadge({ leg, large = false }: { leg: Leg; large?: boolean }) {
  if (leg.kind !== 'ride') return null;
  const tint = lineColor({ line: leg.line, transportMode: leg.mode as TransportMode });
  const num = leg.line.match(/\S+$/)?.[0] || leg.line;
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        alignSelf: large ? 'center' : 'flex-start',
        minWidth: large ? '52px' : '44px',
        padding: large ? '4px 8px' : '3px 6px',
        paddingLeft: tint ? (large ? '13px' : '10px') : large ? '8px' : '6px',
        boxSizing: 'border-box',
        border: `1.5px solid ${colors.badgeBorder}`,
        boxShadow: tint ? `inset ${large ? 6 : 5}px 0 0 ${tint}` : 'none',
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: large ? '1.125rem' : '0.875rem',
        textAlign: 'center',
      }}
    >
      {num}
    </span>
  );
}

export function LegRow({ leg }: { leg: Leg }) {
  const { t } = useLang();
  if (leg.kind === 'walk') {
    return (
      <li style={{ display: 'flex', gap: '12px', padding: '8px 0', fontSize: '0.875rem', color: colors.textDim }}>
        <span aria-hidden="true" style={{ width: '44px', flexShrink: 0, textAlign: 'center' }}>
          <Icon name="walk" />
        </span>
        <span>
          {leg.transfer ? (
            // Byte: kort gång, och bytestiden (marginal) som en egen uppgift.
            <>
              {/* Bytestiden räknar med rulltrappor, spärrar och marginal. Sträckan från ResRobot är
                  ofta ett standardvärde (100 m), så den visas inte. */}
              {t('Byte till', 'Change to')} {leg.to.name}
              {leg.minutes ? ` · ${t('räkna med', 'allow')} ${leg.minutes} min` : ''}
            </>
          ) : (
            <>
              {t('Gå', 'Walk')} {leg.minutes} min{leg.meters ? ` (${leg.meters} m)` : ''} {t('till', 'to')} {leg.to.name}
              {leg.wait ? `, ${t('sedan', 'then')} ${leg.wait} min ${t('till avgång', 'until departure')}` : ''}
            </>
          )}
        </span>
      </li>
    );
  }
  const late = (p: Point) => p.rtTime && p.rtTime !== p.time;
  const time = (p: Point) => (
    <span style={{ fontWeight: 700, color: late(p) ? colors.amber : colors.text }}>{p.rtTime || p.time}</span>
  );
  return (
    <li style={{ display: 'flex', gap: '12px', padding: '8px 0', borderTop: `1px solid ${colors.border}` }}>
      <LineBadge leg={leg} />
      <span style={{ flex: 1, minWidth: 0, fontSize: '0.875rem', lineHeight: 1.45 }}>
        <strong style={{ display: 'block', fontSize: '0.9375rem', textDecoration: leg.cancelled ? 'line-through' : 'none' }}>
          {rideLabel(leg)}
          {leg.direction ? ` ${t('mot', 'to')} ${leg.direction}` : ''}
        </strong>
        {leg.cancelled ? <span style={{ display: 'block', color: colors.amber, fontWeight: 700 }}>{t('Inställd', 'Cancelled')}</span> : null}
        <span style={{ display: 'block' }}>
          {time(leg.from)} {leg.from.name}
          {leg.from.track ? `, ${trackText(leg.mode, leg.from.track, t)}` : ''}
        </span>
        <span style={{ display: 'block' }}>
          {time(leg.to)} {leg.to.name}
        </span>
      </span>
      {/* Hur länge man åker på just den här delen. */}
      {leg.minutes > 0 ? (
        <span style={{ flexShrink: 0, alignSelf: 'flex-start', fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim, whiteSpace: 'nowrap' }}>
          <span className="sr-only">{t('Restid', 'Travel time')} </span>
          {duration(leg.minutes)}
        </span>
      ) : null}
    </li>
  );
}

const label: React.CSSProperties = {
  margin: 0,
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: colors.textDim,
};

const fieldLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: colors.textDim,
};

const field: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 10px',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 0,
  backgroundColor: colors.surface,
  color: colors.text,
  fontSize: '1rem',
  fontFamily: 'inherit',
};

const primary: React.CSSProperties = {
  minHeight: '48px',
  padding: '0 16px',
  border: 'none',
  backgroundColor: colors.accentStrong,
  color: colors.onAccent,
  fontSize: '0.9375rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondary: React.CSSProperties = {
  minHeight: '48px',
  padding: '0 14px',
  border: `1px solid ${colors.borderStrong}`,
  background: 'transparent',
  color: colors.text,
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
};
