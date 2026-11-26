'use client';
import React, { useState } from 'react';
import { colors, fonts } from './styles';
import { useLang } from '../lib/i18n';
import { lineColor } from '../lib/lineFormat';
import { track } from '../lib/track';
import type { TransportMode } from '../lib/types';

type Point = { name: string; time: string; rtTime: string; track: string };
type Leg =
  | { kind: 'walk'; from: Point; to: Point; minutes: number; meters: number }
  | {
      kind: 'ride';
      mode: TransportMode;
      line: string;
      direction: string;
      from: Point;
      to: Point;
      minutes: number;
      cancelled: boolean;
    };
type Trip = { dep: string; arr: string; minutes: number; changes: number; legs: Leg[] };
type Plan = { to: string; fromHere: boolean; trips: Trip[] };

type Props = {
  /** Det man skrev under "Vart ska du?". */
  goal: string;
  /** Tavlans hållplats: start om positionen inte går att få. */
  fromId: string;
  fromName: string;
};

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
export default function JourneyPlan({ goal, fromId, fromName }: Props) {
  const { t } = useLang();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(0);
  const [asked, setAsked] = useState('');

  const target = goal.trim();
  const stale = plan !== null && asked !== target;

  async function find(fromPosition: boolean) {
    if (target.length < 2) return;
    setLoading(true);
    setError('');
    setPlan(null);
    setOpen(0);
    setAsked(target);
    const pos = fromPosition ? await position() : null;
    if (fromPosition && !pos && !fromId) {
      setLoading(false);
      setError(t('Kunde inte få din position. Välj en hållplats under Nu.', 'Could not get your location. Choose a stop under Now.'));
      return;
    }
    try {
      const res = await fetch('/api/trafik?action=plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pos ? { to: target, ...pos } : { to: target, fromId, fromName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '');
      setPlan(data as Plan);
      track('funktion', 0, 'reseplan');
    } catch (e) {
      setError((e as Error).message || t('Kunde inte hitta en resa just nu.', 'Could not find a trip right now.'));
    } finally {
      setLoading(false);
    }
  }

  if (target.length < 2) return null;

  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button type="button" onClick={() => find(true)} disabled={loading} style={primary}>
          {loading ? t('Söker resa…', 'Finding a trip…') : t(`Resa till ${target}`, `Trip to ${target}`)}
        </button>
        {fromId ? (
          <button type="button" onClick={() => find(false)} disabled={loading} style={secondary}>
            {t(`Från ${fromName}`, `From ${fromName}`)}
          </button>
        ) : null}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: '0.8125rem', color: colors.textDim }}>
        {t(
          'Startar där du står. Positionen används bara för sökningen och sparas inte.',
          'Starts where you are. Your location is only used for the search and is not stored.'
        )}
      </p>

      <div aria-live="polite">
        {error ? <p style={{ margin: '12px 0 0', fontSize: '0.9375rem', color: colors.amber }}>{error}</p> : null}

        {plan && !stale ? (
          <section aria-label={t(`Resor till ${plan.to}`, `Trips to ${plan.to}`)} style={{ marginTop: '16px' }}>
            <p style={label}>
              {plan.fromHere ? t('Från din position', 'From your location') : t(`Från ${fromName}`, `From ${fromName}`)} ·{' '}
              {plan.to}
            </p>
            <ol style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
              {plan.trips.map((trip, i) => {
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
                      </span>
                      <span style={{ fontSize: '0.875rem', color: colors.textDim }}>
                        {duration(trip.minutes)} ·{' '}
                        {trip.changes === 0
                          ? t('inga byten', 'direct')
                          : t(`${trip.changes} byte${trip.changes > 1 ? 'n' : ''}`, `${trip.changes} change${trip.changes > 1 ? 's' : ''}`)}
                      </span>
                      <span style={{ flexBasis: '100%', fontSize: '0.8125rem', color: colors.textDim }}>
                        {rides.map((r) => (r.kind === 'ride' ? r.line : '')).join(' → ')}
                      </span>
                    </button>
                    {expanded ? (
                      <ol style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
                        {trip.legs.map((l, j) => (
                          <LegRow key={j} leg={l} />
                        ))}
                      </ol>
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

function LegRow({ leg }: { leg: Leg }) {
  const { t } = useLang();
  if (leg.kind === 'walk') {
    return (
      <li style={{ display: 'flex', gap: '12px', padding: '8px 0', fontSize: '0.875rem', color: colors.textDim }}>
        <span aria-hidden="true" style={{ width: '44px', flexShrink: 0, textAlign: 'center' }}>
          🚶
        </span>
        <span>
          {t('Gå', 'Walk')} {leg.minutes} min{leg.meters ? ` (${leg.meters} m)` : ''} {t('till', 'to')} {leg.to.name}
        </span>
      </li>
    );
  }
  const tint = lineColor({ line: leg.line, transportMode: leg.mode });
  const num = leg.line.match(/\S+$/)?.[0] || leg.line;
  const late = (p: Point) => p.rtTime && p.rtTime !== p.time;
  const time = (p: Point) => (
    <span style={{ fontWeight: 700, color: late(p) ? colors.amber : colors.text }}>{p.rtTime || p.time}</span>
  );
  return (
    <li style={{ display: 'flex', gap: '12px', padding: '8px 0', borderTop: `1px solid ${colors.border}` }}>
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          alignSelf: 'flex-start',
          minWidth: '44px',
          padding: '3px 6px',
          paddingLeft: tint ? '10px' : '6px',
          boxSizing: 'border-box',
          border: `1.5px solid ${colors.badgeBorder}`,
          boxShadow: tint ? `inset 5px 0 0 ${tint}` : 'none',
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: '0.875rem',
          textAlign: 'center',
        }}
      >
        {num}
      </span>
      <span style={{ minWidth: 0, fontSize: '0.875rem', lineHeight: 1.45 }}>
        <strong style={{ display: 'block', fontSize: '0.9375rem', textDecoration: leg.cancelled ? 'line-through' : 'none' }}>
          {leg.line}
          {leg.direction ? ` ${t('mot', 'to')} ${leg.direction}` : ''}
        </strong>
        {leg.cancelled ? <span style={{ display: 'block', color: colors.amber, fontWeight: 700 }}>{t('Inställd', 'Cancelled')}</span> : null}
        <span style={{ display: 'block' }}>
          {time(leg.from)} {leg.from.name}
          {leg.from.track ? `, ${t('spår', 'track')} ${leg.from.track}` : ''}
        </span>
        <span style={{ display: 'block' }}>
          {time(leg.to)} {leg.to.name}
        </span>
      </span>
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
