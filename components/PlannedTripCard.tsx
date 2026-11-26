'use client';
import React, { useState } from 'react';
import { colors, fonts } from './styles';
import { useLang } from '../lib/i18n';
import { at, dayLabel, type PlannedTrip } from '../lib/plannedTrip';
import { LegRow, rideLabel } from './JourneyPlan';

type Props = { planned: PlannedTrip; now: number; onRemove: () => void };

/**
 * En planerad resa överst, som Din avgång: när du ska gå, hela vägen dit och när du är framme.
 * Samma dag räknar den ner till första avgången.
 */
export default function PlannedTripCard({ planned, now, onRemove }: Props) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const { trip } = planned;
  const start = at(trip.depDate, trip.dep);
  const minutes = Math.round((start - now) / 60_000);
  const day = dayLabel(trip.depDate, now, lang);
  const today = day === t('i dag', 'today');
  const rides = trip.legs.filter((l) => l.kind === 'ride');
  const firstWalk = trip.legs[0]?.kind === 'walk';

  // Stort: nedräkning de närmaste två timmarna samma dag, annars klockslaget.
  const big =
    today && minutes <= 0 && minutes > -10
      ? firstWalk
        ? t('Gå nu', 'Go now')
        : t('Nu', 'Now')
      : today && minutes > 0 && minutes < 120
      ? `${minutes} min`
      : trip.dep;
  const started = today && minutes <= -10;

  return (
    <section
      className="invert"
      aria-label={t(`Min resa till ${planned.to}`, `My trip to ${planned.to}`)}
      style={{ marginBottom: '18px', padding: '14px 18px 16px', maxWidth: '40rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <span style={{ minWidth: 0, fontSize: '0.9375rem', fontWeight: 600 }}>
          {t('Till', 'To')} {planned.to}
        </span>
        <span style={label}>
          {t('Din resa', 'Your trip')} · {day}
        </span>
      </div>

      <div
        style={{
          marginTop: '6px',
          fontFamily: fonts.display,
          fontSize: 'clamp(3rem, 16vw, 4.5rem)',
          fontWeight: 900,
          lineHeight: 0.95,
          letterSpacing: '-0.05em',
        }}
      >
        {started ? t('På väg', 'Under way') : big}
      </div>
      {!started && big !== trip.dep ? (
        <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: colors.textDim }}>
          {firstWalk ? t('Gå hemifrån', 'Leave') : t('Avgång', 'Departure')} {trip.dep}
        </p>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '4px 12px',
          marginTop: '12px',
          paddingTop: '10px',
          borderTop: `1px solid ${colors.text}`,
          fontSize: '0.875rem',
        }}
      >
        <span>
          {t('Framme', 'Arrive')} {trip.arr} ·{' '}
          {trip.changes === 0 ? t('inga byten', 'direct') : t(`${trip.changes} byten`, `${trip.changes} changes`)}
        </span>
        <span style={{ color: colors.textDim }}>{rides.map(rideLabel).join(' → ')}</span>
      </div>

      {open ? (
        <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
          {trip.legs.map((l, i) => (
            <LegRow key={i} leg={l} />
          ))}
        </ol>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0 12px', marginTop: '6px', marginBottom: '-10px' }}>
        <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.8125rem', color: colors.textDim }}>
          {t('från', 'from')} {planned.from}
        </span>
        <span style={{ display: 'flex' }}>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={textButton}>
            {open ? t('Dölj resan', 'Hide trip') : t('Visa hela resan', 'Show whole trip')}
          </button>
          <button type="button" onClick={onRemove} style={textButton}>
            {t('Ta bort', 'Remove')}
            <span className="sr-only"> {t('resan', 'the trip')}</span>
          </button>
        </span>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: '0.75rem', color: colors.textDim }}>
        {t(
          'Tiderna är från när du sparade resan. Kolla avgångarna under Nu innan du går.',
          'Times are from when you saved the trip. Check departures under Now before you leave.'
        )}
      </p>
    </section>
  );
}

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
