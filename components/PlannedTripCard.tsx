'use client';
import React, { useEffect, useState } from 'react';
import { colors, fonts } from './styles';
import { lineLabel, useLang } from '../lib/i18n';
import { dayLabel, isNear, type PlanLeg, type PlannedTrip } from '../lib/plannedTrip';
import { nextStep } from '../lib/tripStep.mjs';
import { LegRow, LineBadge, rideLabel, trackText } from './JourneyPlan';

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

/**
 * En planerad resa överst, med nästa steg i fokus: när du ska gå, exakt vilken linje och åt
 * vilket håll, från vilket läge eller spår. Under resan går kortet vidare: kliv av, byt.
 */
export default function PlannedTripCard({ planned, now, onRemove }: Props) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const { trip } = planned;
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
      sub = t(`Bråttom: den går om ${step.departsIn} min`, `Hurry: it leaves in ${step.departsIn} min`);
    }
  } else if (step.kind === 'riding') {
    big = step.offIn <= 1 ? t('Kliv av nu', 'Get off now') : t(`Kliv av om ${step.offIn} min`, `Get off in ${step.offIn} min`);
  } else if (step.kind === 'change') {
    big = step.departsIn <= 0 ? t('Går nu', 'Leaving now') : t(`Går om ${step.departsIn} min`, `Leaves in ${step.departsIn} min`);
    sub = t('Byt här', 'Change here');
  } else {
    big = t('Framme', 'Arrived');
  }

  const ride = step.kind === 'done' ? null : step.ride;
  const later = step.kind === 'done' ? [] : step.later;
  const time = (p: { time: string; rtTime: string }) => p.rtTime || p.time;
  const trackOf = (l: Ride, p: { track: string }) => (p.track ? capital(trackText(l.mode, p.track, t)) : '');
  const line = (l: Ride) => {
    const name = lineLabel(rideLabel({ ...l, agency: '' }), lang);
    // Hårt bindestreck så att "T-bana" inte bryts.
    return lang === 'sv' ? name.replace(/^Tunnelbana\b/, 'T‑bana') : name;
  };
  // Bredvid linjerutan står numret redan: "Buss mot Fruängen".
  const kind = (l: Ride) => line(l).replace(/\s+\S+$/, '') || line(l);
  const toward = (l: Ride) => (l.direction ? ` ${t('mot', 'to')} ${l.direction}` : '');
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' };

  return (
    <section
      className="invert"
      aria-label={t(`Min resa till ${planned.to}`, `My trip to ${planned.to}`)}
      style={{ marginBottom: '18px', padding: '14px 18px 16px', maxWidth: '40rem' }}
    >
      <div style={{ ...row, gap: '12px' }}>
        <span style={{ ...label, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t('Till', 'To')} {planned.to}
          {today ? '' : ` · ${day}`}
        </span>
        <span style={label}>
          {t('Framme', 'Arrive')} {trip.arr}
        </span>
      </div>

      <div
        aria-live="polite"
        style={{
          marginTop: '6px',
          fontFamily: fonts.display,
          fontSize: 'clamp(2.25rem, 11vw, 3.5rem)',
          fontWeight: 900,
          // Proportionella siffror: fast bredd ger luft runt kolonet i den här storleken.
          fontVariantNumeric: 'proportional-nums',
          lineHeight: 1,
          letterSpacing: '-0.04em',
        }}
      >
        {big}
      </div>
      {sub ? (
        <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: hurry ? colors.amber : colors.textDim, fontWeight: hurry ? 700 : 400 }}>{sub}</p>
      ) : null}

      {ride ? (
        // Exakt vad du kliver på härnäst: linjen som på tavlan, åt vilket håll, läge eller spår.
        <div style={{ marginTop: '14px', padding: '10px 12px', border: `2px solid ${colors.text}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LineBadge leg={ride} large />
            <strong style={{ fontSize: '1.125rem', lineHeight: 1.25, textDecoration: ride.cancelled ? 'line-through' : 'none' }}>
              <span className="sr-only">{line(ride)} </span>
              <span aria-hidden="true">{kind(ride)}</span>
              {toward(ride)}
            </strong>
          </div>
          {ride.cancelled ? <p style={{ margin: '4px 0 0', color: colors.amber, fontWeight: 700, fontSize: '0.875rem' }}>{t('Inställd', 'Cancelled')}</p> : null}
          {step.kind !== 'riding' ? (
            <div style={{ ...row, marginTop: '8px', fontSize: '0.9375rem' }}>
              <span style={{ minWidth: 0 }}>
                {ride.from.name}
                {ride.from.track ? ` · ${trackOf(ride, ride.from)}` : ''}
              </span>
              <strong style={{ fontFamily: fonts.display, fontSize: '1.0625rem' }}>{time(ride.from)}</strong>
            </div>
          ) : null}
          <div style={{ ...row, marginTop: '4px', fontSize: step.kind === 'riding' ? '0.9375rem' : '0.875rem', color: step.kind === 'riding' ? colors.text : colors.textDim }}>
            <span style={{ minWidth: 0 }}>
              {t('Kliv av', 'Get off at')} {ride.to.name}
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
                {time(l.from)} {l.from.name} – {time(l.to)} {l.to.name}
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
        {t(
          'Tiderna är från när du sparade resan. Kolla avgångarna under Avgångar innan du går.',
          'Times are from when you saved the trip. Check the board under Departures before you leave.'
        )}
      </p>
    </section>
  );
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
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.16em',
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
