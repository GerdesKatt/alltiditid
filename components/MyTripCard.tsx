import React from 'react';
import type { Departure } from '../lib/types';
import type { MyTrip } from '../lib/myTrip';
import { clockFor, countdownFor, lineBadge, lineName } from '../lib/lineFormat';
import { colors, fonts } from './styles';
import { lineLabel, useLang } from '../lib/i18n';

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
  const { lang, t } = useLang();
  const badge = lineBadge(trip.line);
  const name = lineLabel(lineName(trip.line, badge), lang);
  const nu = (label: string) => (label === 'Nu' ? t('Nu', 'Now') : label);
  const deviation = next.find((d) => d.deviation)?.deviation;

  const spokenTimes = next
    .map((d) =>
      d.status === 'cancelled'
        ? `${d.scheduledTime} ${t('inställd', 'cancelled')}`
        : `${nu(countdownFor(d, now))}${
            d.status === 'delayed' ? `, ${t('försenad, ny tid', 'delayed, new time')} ${clockFor(d)}` : ''
          }`
    )
    .join('; ');

  return (
    <section
      aria-label={`${t('Min resa', 'My trip')}: ${lineLabel(trip.line, lang)} ${t('mot', 'to')} ${trip.destination} ${t(
        'från',
        'from'
      )} ${trip.stopName}`}
      style={{
        marginBottom: '14px',
        padding: '14px',
        borderRadius: 'var(--radius-card)',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '-10px' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>{t('Min resa', 'My trip')}</span>
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
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('Ta bort', 'Remove')}
          <span className="sr-only"> {t('min resa', 'my trip')}</span>
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
            fontSize: '0.875rem',
            textAlign: 'center',
          }}
        >
          {lineLabel(badge, lang)}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: '1rem',
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {trip.stopName} → {trip.destination}
          </span>
          {name ? <span style={{ display: 'block', fontSize: '0.8125rem', color: colors.textDim }}>{name}</span> : null}
        </span>
      </div>

      <p className="sr-only" aria-live="polite">
        {next.length ? `${t('Nästa', 'Next')}: ${spokenTimes}` : ''}
      </p>

      <div
        aria-hidden="true"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginTop: '12px' }}
      >
        {next.length === 0 ? (
          <span style={{ gridColumn: '1 / -1', fontSize: '0.875rem', color: colors.textDim, padding: '10px 0' }}>
            {loading ? t('Hämtar avgångar…', 'Loading departures…') : t('Inga avgångar den närmaste tiden.', 'No departures in the near future.')}
          </span>
        ) : (
          next.map((d, i) => {
            const cancelled = d.status === 'cancelled';
            const delayed = d.status === 'delayed';
            const realtime = !cancelled && d.hasRealtime === true;
            const schedule = !cancelled && !delayed && d.hasRealtime === false;
            const big = nu(countdownFor(d, now));
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
                    fontSize: i === 0 ? '1.5rem' : '1.25rem',
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
                    fontSize: '0.8125rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: cancelled ? colors.cancelledText : delayed ? colors.amber : colors.textDim,
                    fontWeight: cancelled ? 600 : 500,
                  }}
                >
                  {cancelled
                    ? t('Inställd', 'Cancelled')
                    : delayed
                    ? `${clock}${d.delayMinutes ? ` +${d.delayMinutes}` : ''}`
                    : clock === big
                    ? schedule
                      ? t('ingen realtid', 'no real-time')
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
            fontSize: '0.8125rem',
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
              fontSize: '0.8125rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('Visa', 'Show')} {trip.stopName}
          </button>
        </div>
      ) : null}
    </section>
  );
}
