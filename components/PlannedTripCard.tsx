'use client';
import React, { useEffect, useState } from 'react';
import { colors, fonts } from './styles';
import { lineLabel, useLang } from '../lib/i18n';
import { dayLabel, isNear, type PlanLeg, type PlannedTrip } from '../lib/plannedTrip';
import { nextStep } from '../lib/tripStep.mjs';
import { LegRow, LineBadge, rideLabel, trackText } from './JourneyPlan';
import { at, lateMinutes, withAnchorLive, type Anchor } from '../lib/ticket.mjs';
import type { Flight } from '../lib/types';
import { spotName } from '../lib/stopText';

type Ride = Extract<PlanLeg, { kind: 'ride' }>;

const LUGGAGE_KEY = 'alltiditid:bagage';
function loadLuggage(): boolean {
  try {
    return window.localStorage.getItem(LUGGAGE_KEY) === '1';
  } catch {
    return false;
  }
}
function storeLuggage(on: boolean) {
  try {
    if (on) window.localStorage.setItem(LUGGAGE_KEY, '1');
    else window.localStorage.removeItem(LUGGAGE_KEY);
  } catch {
    // Privat läge: valet gäller bara den här visningen.
  }
}

type Props = { planned: PlannedTrip; now: number; onRemove: () => void };

type Live = { rtTime?: string; track?: string; cancelled?: boolean; arrRt?: string };

/**
 * Följer den bokade biljetten: ny tid, spår eller gate, inställd. Tåg från Trafikverket varje
 * minut, flyg från flygplatsens tavla varannan. Bara de sista fyra timmarna före avgång.
 */
function useAnchorLive(anchor: Anchor | undefined, now: number): Live | null {
  const [live, setLive] = useState<Live | null>(null);
  const dep = anchor ? at(anchor.date, anchor.dep) : 0;
  const watch = Boolean(anchor && !anchor.manual && dep - now < 4 * 3600_000 && now - dep < 3 * 3600_000);
  useEffect(() => {
    if (!anchor || !watch) return;
    let active = true;
    async function load() {
      if (!anchor) return;
      try {
        if (anchor.kind === 'train') {
          const res = await fetch(`/api/trafik?action=train&number=${encodeURIComponent(anchor.number)}&date=${anchor.date}`);
          if (!res.ok) return;
          const data = await res.json();
          type S = { name: string; track?: string; cancelled?: boolean; departure?: { scheduled: string; estimated?: string; actual?: string }; arrival?: { scheduled: string; estimated?: string; actual?: string } };
          const stops: S[] = Array.isArray(data.stops) ? data.stops : [];
          const from = stops.find((x) => x.name === anchor.from);
          const to = stops.find((x) => x.name === anchor.to);
          if (!from || !active) return;
          setLive({
            rtTime: from.departure?.actual || from.departure?.estimated || '',
            track: from.track || '',
            cancelled: Boolean(from.cancelled),
            arrRt: to?.arrival?.actual || to?.arrival?.estimated || '',
          });
        } else if (anchor.airport) {
          const res = await fetch(`/api/trafik?action=flights&airport=${anchor.airport}&direction=departures`);
          if (!res.ok) return;
          const data = await res.json();
          const f = Array.isArray(data.flights)
            ? (data.flights as Flight[]).find((x) => x.flightId === anchor.number && (!anchor.scheduledAt || x.scheduledAt === anchor.scheduledAt))
            : null;
          if (!f || !active) return;
          const parts = [f.terminal ? `terminal ${f.terminal}` : '', f.gate ? `gate ${f.gate}` : ''].filter(Boolean);
          setLive({ rtTime: f.newTime || (f.expectedAt ? f.expectedAt.slice(11, 16) : ''), track: parts.join(', '), cancelled: f.status === 'cancelled' });
        }
      } catch {
        // Nästa försök om en stund.
      }
    }
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, anchor.kind === 'train' ? 60_000 : 120_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.number, anchor?.date, anchor?.from, watch]);
  return live;
}

/**
 * En planerad resa överst, med nästa steg i fokus: när du ska gå, exakt vilken linje och åt
 * vilket håll, från vilket läge eller spår. Under resan går kortet vidare: kliv av, byt.
 */
export default function PlannedTripCard({ planned, now, onRemove }: Props) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const { anchor } = planned;
  const live = useAnchorLive(anchor, now);
  // Biljettens tid och spår följs live. Förbindelsen dit ligger kvar: en försening kan krympa.
  const trip = anchor ? withAnchorLive(planned.trip, live) : planned.trip;
  const day = dayLabel(trip.depDate, now, lang);
  const today = day === t('i dag', 'today');
  const [luggage, setLuggage] = useState(loadLuggage);
  useEffect(() => storeLuggage(luggage), [luggage]);

  // Långt kvar (i morgon, eller fler än tre timmar): en kompakt rad, så att Nu-vyn visar nuet.
  const [expanded, setExpanded] = useState(false);
  if (!isNear(planned, now) && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={t(`Din resa ${day} ${trip.dep} till ${planned.to}. Visa`, `Your trip ${day} ${trip.dep} to ${planned.to}. Show`)}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '10px',
          width: '100%',
          maxWidth: '40rem',
          minHeight: '48px',
          marginBottom: '14px',
          padding: '10px 0',
          border: 'none',
          borderTop: `1px solid ${colors.text}`,
          borderBottom: `1px solid ${colors.border}`,
          background: 'none',
          color: colors.text,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span style={label}>{day}</span>
        <span style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: '1.125rem', fontVariantNumeric: 'proportional-nums' }}>
          {trip.dep}
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
          {t('till', 'to')} {planned.to}
          {anchor ? ` · ${anchor.label} ${anchor.dep}` : ''}
        </span>
        <span aria-hidden="true" style={{ fontSize: '0.875rem', color: colors.textDim }}>
          →
        </span>
      </button>
    );
  }

  const step = nextStep(trip, now, { luggage });
  const hhmm = (ms: number) =>
    new Date(ms).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  const soon = (n: number) => today && n < 120;

  // Det stora: vad du ska göra härnäst. Före resan när du ska gå, under resan när du kliver av.
  let big = trip.dep;
  let sub = '';
  let hurry = false;
  if (step.kind === 'before') {
    if (!soon(step.leaveIn) && step.walk) big = `${t('Gå', 'Leave')} ${hhmm(step.leaveAt)}`;
    else if (!soon(step.departsIn)) big = step.ride.from.rtTime || step.ride.from.time;
    else if (step.walk) big = step.leaveIn <= 0 ? t('Gå nu', 'Go now') : t(`Gå om ${step.leaveIn} min`, `Leave in ${step.leaveIn} min`);
    else big = step.departsIn <= 0 ? t('Nu', 'Now') : t(`Går om ${step.departsIn} min`, `Leaves in ${step.departsIn} min`);
    if (step.walk)
      sub = t(
        `${step.walkMinutes} min promenad + ${step.margin} min marginal`,
        `${step.walkMinutes} min walk + ${step.margin} min to spare`
      );
    if (step.walk && step.leaveIn < 0) {
      hurry = true;
      // "Gå nu" och "den går om 23 min" ska inte se ut att säga emot varandra: säg varför det är bråttom.
      sub =
        step.departsIn < step.walkMinutes
          ? t(
              `Det blir tight: promenaden tar ${step.walkMinutes} min och den går om ${step.departsIn} min. Sök en ny resa om du inte hinner.`,
              `It's tight: the walk takes ${step.walkMinutes} min and it leaves in ${step.departsIn} min. Find a new trip if you can't make it.`
            )
          : t(
              `Bråttom: promenaden tar ${step.walkMinutes} min och den går om ${step.departsIn} min`,
              `Hurry: the walk takes ${step.walkMinutes} min and it leaves in ${step.departsIn} min`
            );
    }
  } else if (step.kind === 'riding' && step.ride.anchor && step.ride.mode === 'flight') {
    big = t('Trevlig resa', 'Have a good flight');
  } else if (step.kind === 'riding') {
    big = step.offIn <= 1 ? t('Kliv av nu', 'Get off now') : t(`Kliv av om ${step.offIn} min`, `Get off in ${step.offIn} min`);
  } else if (step.kind === 'change') {
    big = step.departsIn <= 0 ? t('Går nu', 'Leaving now') : t(`Går om ${step.departsIn} min`, `Leaves in ${step.departsIn} min`);
    sub = t('Byt här', 'Change here');
  } else {
    big = t('Framme', 'Arrived');
  }

  const ride = step.kind === 'done' || (step.kind === 'riding' && step.ride.anchor && step.ride.mode === 'flight') ? null : step.ride;

  // Biljetten: vad allt det här är till för, och om den är sen eller inställd.
  const anchorRide = anchor ? (trip.legs.find((l) => l.kind === 'ride' && l.anchor) as Ride | undefined) : undefined;
  const onAnchor = Boolean(anchorRide && step.kind !== 'done' && step.ride === anchorRide);
  const anchorTrack = anchorRide?.from.track
    ? anchorRide.mode === 'flight'
      ? anchorRide.from.track
      : trackText('train', anchorRide.from.track, t)
    : '';
  const late = anchorRide ? lateMinutes(anchorRide.from.time, anchorRide.from.rtTime) : 0;
  const anchorFor =
    anchor && anchorRide && !onAnchor && step.kind !== 'done'
      ? t(
          `för att hinna ${anchor.label}${anchorTrack ? `, ${anchorTrack}` : ''}, ${anchorRide.from.rtTime || anchorRide.from.time}`,
          `to make ${anchor.label}${anchorTrack ? `, ${anchorTrack}` : ''}, ${anchorRide.from.rtTime || anchorRide.from.time}`
        )
      : '';
  const startAlt =
    planned.startAlt && step.kind === 'before' && step.walk && at(trip.depDate, planned.startAlt.dep) > now ? planned.startAlt : null;
  const backup = planned.backup && step.kind === 'before' && at(trip.depDate, planned.backup.dep) > now ? planned.backup : null;
  const later = step.kind === 'done' ? [] : step.later;
  const time = (p: { time: string; rtTime: string }) => p.rtTime || p.time;
  const place = (name: string) => shortPlace(spotName(name, t('målet', 'your destination')));
  const trackOf = (l: Ride, p: { track: string }) => (p.track ? capital(trackText(l.mode, p.track, t)) : '');
  const line = (l: Ride) => {
    const name = lineLabel(rideLabel({ ...l, agency: '' }), lang);
    // Hårt bindestreck så att "T-bana" inte bryts.
    return lang === 'sv' ? name.replace(/^Tunnelbana\b/, 'T‑bana') : name;
  };
  // Bredvid linjerutan står numret redan: "Buss mot Fruängen".
  const kind = (l: Ride) => line(l).replace(/\s+\S+$/, '') || line(l);
  const toward = (l: Ride) => (l.direction ? ` ${t('mot', 'to')} ${place(l.direction)}` : '');
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' };

  return (
    <section
      // Samma rosa kort som Nästa avgång: ett stort nästa steg, resten under strecket.
      className="invert hero-card"
      aria-label={t(`Min resa till ${planned.to}`, `My trip to ${planned.to}`)}
      // Proportionella siffror: tabulära ger glapp runt kolon och bindestreck ("08 : 55", "T - bana").
      style={{ marginBottom: '18px', padding: '14px 18px 16px', maxWidth: '40rem', fontVariantNumeric: 'proportional-nums' }}
    >
      <div style={{ ...row, gap: '12px' }}>
        <span style={{ ...label, fontStretch: '100%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t('Till', 'To')} {planned.to}
          {today ? '' : ` · ${day}`}
        </span>
        <span style={label}>
          {anchor?.kind === 'flight' ? `${t('Flyget', 'Flight')} ${anchorRide?.from.rtTime || anchor.dep}` : `${t('Framme', 'Arrive')} ${anchorRide?.to.rtTime || trip.arr}`}
        </span>
      </div>

      <div
        aria-live="polite"
        style={{
          marginTop: '6px',
          fontFamily: fonts.display,
          fontSize: 'clamp(2.25rem, 11vw, 3.5rem)',
          fontStretch: 'var(--stretch-head)',
          fontWeight: 800,
          // Proportionella siffror: fast bredd ger luft runt kolonet i den här storleken.
          fontVariantNumeric: 'proportional-nums',
          lineHeight: 1,
          letterSpacing: '-0.015em',
        }}
      >
        {big}
      </div>
      {anchorFor ? <p style={{ margin: '6px 0 0', fontSize: '1rem', fontWeight: 700, lineHeight: 1.3 }}>{anchorFor}</p> : null}
      {sub ? (
        <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: hurry ? colors.amber : colors.textDim, fontWeight: hurry ? 700 : 400 }}>{sub}</p>
      ) : null}
      {anchor && anchorRide?.cancelled ? (
        <p style={{ margin: '6px 0 0', fontSize: '0.875rem', color: colors.amber, fontWeight: 700 }}>
          {t(
            `${anchor.label} är inställt. Kolla med ${anchor.kind === 'flight' ? 'flygbolaget' : 'tågbolaget'} vilken avgång du får ta i stället.`,
            `${anchor.label} is cancelled. Check with the ${anchor.kind === 'flight' ? 'airline' : 'train company'} which departure to take instead.`
          )}
        </p>
      ) : anchor && late > 0 && step.kind !== 'done' ? (
        <p style={{ margin: '6px 0 0', fontSize: '0.875rem', color: colors.amber, fontWeight: 700 }}>
          {onAnchor
            ? t(`${anchor.label} är ${late} min sen.`, `${anchor.label} is ${late} min late.`)
            : t(
                `${anchor.label} är ${late} min sen. Håll tiden ändå: förseningar kan krympa.`,
                `${anchor.label} is ${late} min late. Keep to the plan anyway: delays can shrink.`
              )}
        </p>
      ) : null}
      {startAlt ? (
        // Lång promenad, men bussen från närmaste hållplats hinner samma resa.
        <p style={{ margin: '4px 0 0', fontSize: '0.875rem' }}>
          {t('Eller', 'Or')} <strong>{line({ ...startAlt, kind: 'ride', from: { name: startAlt.from, time: startAlt.dep, rtTime: '', track: '' }, to: { name: '', time: '', rtTime: '', track: '' }, minutes: 0, cancelled: false } as Ride)}</strong>
          {startAlt.direction ? ` ${t('mot', 'to')} ${place(startAlt.direction)}` : ''} {t('från', 'from')} {place(startAlt.from)} {startAlt.dep}
          {startAlt.walk ? t(`, ${startAlt.walk} min att gå dit`, `, ${startAlt.walk} min walk there`) : ''}
        </p>
      ) : null}
      {backup ? (
        <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: colors.textDim }}>
          {t(`Missar du den här, ta ${backup.line} ${backup.dep} från ${backup.from}.`, `If you miss it, take ${backup.line} at ${backup.dep} from ${backup.from}.`)}
        </p>
      ) : null}

      {ride ? (
        // Exakt vad du kliver på härnäst: linjen som på tavlan, åt vilket håll, läge eller spår.
        <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: `1px solid ${colors.text}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LineBadge leg={ride} large />
            <strong style={{ fontSize: '1.125rem', lineHeight: 1.25, textDecoration: ride.cancelled ? 'line-through' : 'none' }}>
              <span className="sr-only">{line(ride)} </span>
              <span aria-hidden="true">{kind(ride)}</span>
              {toward(ride)}
            </strong>
          </div>
          {step.kind === 'before' && step.walk ? (
            // Först promenaden, så att det syns var du kliver på (och att det inte är en buss dit).
            <div style={{ ...row, marginTop: '8px', fontSize: '0.875rem', color: colors.textDim }}>
              <span style={{ minWidth: 0 }}>
                {t('Gå till', 'Walk to')} {place(ride.from.name)}
              </span>
              <span>{step.walkMinutes} min</span>
            </div>
          ) : null}
          {ride.cancelled ? <p style={{ margin: '4px 0 0', color: colors.amber, fontWeight: 700, fontSize: '0.875rem' }}>{t('Inställd', 'Cancelled')}</p> : null}
          {step.kind !== 'riding' ? (
            <div style={{ ...row, marginTop: '8px', fontSize: '0.9375rem' }}>
              <span style={{ minWidth: 0 }}>
                {place(ride.from.name)}
                {ride.from.track ? ` · ${trackOf(ride, ride.from)}` : ''}
              </span>
              <strong style={{ fontFamily: fonts.display, fontSize: '1.0625rem' }}>{time(ride.from)}</strong>
            </div>
          ) : null}
          <div style={{ ...row, marginTop: '4px', fontSize: step.kind === 'riding' ? '0.9375rem' : '0.875rem', color: step.kind === 'riding' ? colors.text : colors.textDim }}>
            <span style={{ minWidth: 0 }}>
              {t('Kliv av', 'Get off at')} {place(ride.to.name)}
              {ride.to.track ? ` · ${trackOf(ride, ride.to)}` : ''}
            </span>
            <span style={{ fontWeight: step.kind === 'riding' ? 700 : 400 }}>{time(ride.to)}</span>
          </div>
        </div>
      ) : null}

      {later.length > 0 ? (
        // Resten av resan som en tidslinje: varje del med start- och sluttid.
        <ol style={{ listStyle: 'none', margin: '12px 0 0 2px', padding: '0 0 0 12px', borderLeft: `2px solid ${colors.borderStrong}` }}>
          {later.map((l, i) => (
            <li key={i} style={{ padding: i === 0 ? '0 0 8px' : '8px 0', fontSize: '0.875rem', lineHeight: 1.4 }}>
              <span style={{ display: 'block' }}>
                <strong>{line(l)}</strong>
                {toward(l)}
                {l.from.track ? (
                  <>
                    {' '}· <strong>{trackOf(l, l.from)}</strong>
                  </>
                ) : null}
              </span>
              <span style={{ display: 'block', color: colors.textDim }}>
                {time(l.from)} {place(l.from.name)} – {time(l.to)} {place(l.to.name)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div style={{ ...row, alignItems: 'center', flexWrap: 'wrap', marginTop: '12px', marginBottom: '-10px' }}>
        {step.kind === 'before' && step.walk ? (
          // Bagage: lugnare takt och mer marginal innan du ska gå. Sparas i webbläsaren.
          <button type="button" aria-pressed={luggage} onClick={() => setLuggage(!luggage)} style={chip(luggage)}>
            {luggage ? t('✓ Bagage, extra tid', '✓ Luggage, extra time') : t('+ Bagage, extra tid', '+ Luggage, extra time')}
          </button>
        ) : (
          <span style={{ fontSize: '0.8125rem', color: colors.textDim }}>
            {trip.changes === 0 ? t('Inga byten', 'Direct') : t(`${trip.changes} byten`, `${trip.changes} changes`)}
          </span>
        )}
        <span style={{ display: 'flex', marginLeft: 'auto' }}>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={textButton}>
            {open ? t('Dölj resan', 'Hide trip') : t('Hela resan', 'Whole trip')}
          </button>
          <button type="button" onClick={onRemove} style={textButton}>
            {t('Ta bort', 'Remove')}
            <span className="sr-only"> {t('resan', 'the trip')}</span>
          </button>
        </span>
      </div>

      {open ? (
        <>
          <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
            {trip.legs.map((l, i) => (
              <LegRow key={i} leg={l} />
            ))}
          </ol>
          <p style={{ margin: '6px 0 0', fontSize: '0.8125rem', color: colors.textDim }}>
            {t('från', 'from')} {planned.from}
          </p>
        </>
      ) : null}
      <p style={{ margin: '14px 0 0', fontSize: '0.75rem', color: colors.textDim }}>
        {anchor && !anchor.manual
          ? t(
              `${anchor.label} följs live. Övriga tider är från när du sparade resan, så kolla under Avgångar innan du går.`,
              `${anchor.label} is tracked live. Other times are from when you saved the trip, so check Departures before you leave.`
            )
          : t(
              'Tiderna är från när du sparade resan. Kolla avgångarna under Avgångar innan du går.',
              'Times are from when you saved the trip. Check the board under Departures before you leave.'
            )}
      </p>
    </section>
  );
}

/**
 * Kortare namn i kortet: "Mörby centrum T-bana" → "Mörby centrum", "Stockholm Centralstation" →
 * "Stockholm C". Linjen säger redan att det är T-bana.
 */
export function shortPlace(name: string): string {
  return name
    .replace(/\s+T-bana$/i, '')
    .replace(/\s+\(T-bana\)$/i, '')
    .replace(/\bCentralstation\b/, 'C')
    .trim();
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const chip = (on: boolean): React.CSSProperties => ({
  minHeight: '36px',
  padding: '0 10px',
  border: `1px solid ${on ? colors.text : colors.borderStrong}`,
  background: 'none',
  color: colors.text,
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
});

const label: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStretch: 'var(--stretch-wide)',
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: colors.textDim,
  whiteSpace: 'nowrap',
};

const textButton: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 0 0 14px',
  border: 'none',
  background: 'none',
  color: colors.text,
  fontSize: '0.8125rem',
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
};
