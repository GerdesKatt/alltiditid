import React from 'react';
import type { Departure } from '../lib/types';
import type { MyTrip } from '../lib/myTrip';
import { clockFor, countdownFor, lineBadge, lineName } from '../lib/lineFormat';
import { colors, fonts } from './styles';

type Props = {
  trip: MyTrip;
  next: Departure[];
  loading: boolean;
  now: number;
  /** Sant när tavlan nedanför redan visar resans hållplats. */
  showingStop: boolean;
  onShowStop: () => void;
  onRemove: () => void;
};

/**
 * "Min resa" överst: de tre nästa avgångarna för en sparad linje och riktning,
 * så att svaret på "när går nästa?" syns utan ett enda tryck.
 */
export default function MyTripCard({ trip, next, loading, now, showingStop, onShowStop, onRemove }: Props) {
  const badge = lineBadge(trip.line);
  const name = lineName(trip.line, badge);
  const deviation = next.find((d) => d.deviation)?.deviation;

  const spokenTimes = next
    .map((d) =>
      d.status === 'cancelled'
        ? `${d.scheduledTime} inställd`
        : `${countdownFor(d, now)}${d.status === 'delayed' ? `, försenad, ny tid ${clockFor(d)}` : ''}`
    )
    .join('; ');

  return (
    <section
      aria-label={`Min resa: ${trip.line} mot ${trip.destination} från ${trip.stopName}`}
      style={{
        marginBottom: '14px',
        padding: '14px',
        borderRadius: 'var(--radius-card)',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '-10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: colors.textDim }}>Min resa</span>
        <button
          type="button"
          onClick={onRemove}
          style={{
            minHeight: '44px',
            padding: '0 4px 0 12px',
            marginRight: '-4px',
            borderRadius: 'var(--radius-control)',
            border: 'none',
            background: 'none',
            color: colors.textDim,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Ta bort<span className="sr-only"> min resa</span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            minWidth: '44px',
            padding: '4px 6px',
            boxSizing: 'border-box',
            borderRadius: 'var(--radius-badge)',
            backgroundColor: colors.badgeBg,
            color: colors.badgeText,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: '14px',
            textAlign: 'center',
          }}
        >
          {badge}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: '16px',
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {trip.stopName} → {trip.destination}
          </span>
          {name ? <span style={{ display: 'block', fontSize: '13px', color: colors.textDim }}>{name}</span> : null}
        </span>
      </div>

      <p className="sr-only" aria-live="polite">
        {next.length ? `Nästa: ${spokenTimes}` : ''}
      </p>

      <div
        aria-hidden="true"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginTop: '12px' }}
      >
        {next.length === 0 ? (
          <span style={{ gridColumn: '1 / -1', fontSize: '14px', color: colors.textDim, padding: '10px 0' }}>
            {loading ? 'Hämtar avgångar…' : 'Inga avgångar den närmaste tiden.'}
          </span>
        ) : (
          next.map((d, i) => {
            const cancelled = d.status === 'cancelled';
            const delayed = d.status === 'delayed';
            const realtime = !cancelled && d.hasRealtime === true;
            const schedule = !cancelled && !delayed && d.hasRealtime === false;
            const big = countdownFor(d, now);
            const shown = schedule && /min$/.test(big) ? `~${big}` : big;
            const clock = clockFor(d);
            return (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  padding: '10px',
                  borderRadius: 'var(--radius-control)',
                  backgroundColor: colors.bg,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: fonts.display,
                    fontSize: i === 0 ? '24px' : '20px',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap',
                    color: cancelled ? colors.textDim : delayed ? colors.amber : schedule ? colors.textDim : colors.text,
                    textDecoration: cancelled ? 'line-through' : 'none',
                  }}
                >
                  {realtime ? <span key={d.expectedAt} className="rt-dot" /> : null}
                  {shown}
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: cancelled ? colors.cancelledText : delayed ? colors.amber : colors.textDim,
                    fontWeight: cancelled ? 600 : 500,
                  }}
                >
                  {cancelled
                    ? 'Inställd'
                    : delayed
                    ? `${clock}${d.delayMinutes ? ` +${d.delayMinutes}` : ''}`
                    : clock === big
                    ? schedule
                      ? 'ingen realtid'
                      : ''
                    : clock}
                </span>
              </div>
            );
          })
        )}
      </div>

      {deviation ? (
        <p
          style={{
            margin: '10px 0 0',
            padding: '6px 10px',
            borderRadius: '8px',
            backgroundColor: colors.delayedBg,
            color: colors.delayedText,
            fontSize: '13px',
          }}
        >
          <span aria-hidden="true">⚠ </span>
          {deviation}
        </p>
      ) : null}

      {!showingStop ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button
            type="button"
            onClick={onShowStop}
            style={{
              minHeight: '44px',
              padding: '0 14px',
              borderRadius: 'var(--radius-control)',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: colors.surface,
              color: colors.text,
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Visa {trip.stopName}
          </button>
        </div>
      ) : null}
    </section>
  );
}
