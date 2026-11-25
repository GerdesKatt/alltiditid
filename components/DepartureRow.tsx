import React from 'react';
import type { BoardDirection, Departure } from '../lib/types';
import { colors } from './styles';

type Props = {
  item: Departure;
  direction: BoardDirection;
  isSelectedTrip: boolean;
  onSelectOnBoard: (item: Departure) => void;
};

const STATUS_COLORS = {
  cancelled: { bg: 'rgba(127, 29, 29, 0.8)', border: '#dc2626', text: '#fca5a5' },
  delayed: { bg: 'rgba(120, 53, 15, 0.85)', border: '#d97706', text: '#fcd34d' },
  'on-time': { bg: 'rgba(6, 78, 59, 0.7)', border: '#059669', text: '#6ee7b7' },
  scheduled: { bg: 'rgba(30, 41, 59, 0.9)', border: '#475569', text: '#cbd5e1' },
} as const;

/** Från så här många minuters försening visas en länk om reseersättning. */
const COMPENSATION_DELAY_MIN = 20;

export default function DepartureRow({ item, direction, isSelectedTrip, onSelectOnBoard }: Props) {
  const isDelayed = item.status === 'delayed';
  const isCancelled = item.status === 'cancelled';
  const displayedNewTime = isDelayed ? item.newTime || item.estimatedTime : '';

  // Utan realtidsdata vet vi inte om avgången är i tid – visa då bara tidtabellen.
  const onlySchedule = !isCancelled && !isDelayed && item.hasRealtime === false;

  const badge =
    STATUS_COLORS[
      isCancelled ? 'cancelled' : isDelayed ? 'delayed' : onlySchedule ? 'scheduled' : 'on-time'
    ];
  const statusLabel = isCancelled
    ? 'Inställd'
    : isDelayed
    ? `Ny tid ${displayedNewTime}${item.delayMinutes ? ` (+${item.delayMinutes} min)` : ''}`
    : onlySchedule
    ? 'Enligt tidtabell'
    : 'I tid';

  const metaParts = [item.line, item.operator, item.stopLabel, item.track].filter(Boolean);

  return (
    <div
      style={{
        backgroundColor: isSelectedTrip ? 'rgba(2, 132, 199, 0.14)' : colors.surface,
        border: isSelectedTrip ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
        borderRadius: '13px',
        padding: '13px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Tider */}
        <div
          style={{
            minWidth: '82px',
            paddingRight: '12px',
            borderRight: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ fontSize: '12px', color: colors.textFaint, fontWeight: 700 }}>
            ORD. TID
          </div>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              textDecoration: isDelayed || isCancelled ? 'line-through' : 'none',
              color: isDelayed || isCancelled ? colors.textFaint : colors.text,
            }}
          >
            {item.scheduledTime}
          </div>
          {displayedNewTime ? (
            <div style={{ marginTop: '3px' }}>
              <span
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: colors.amber,
                  fontWeight: 800,
                }}
              >
                NY TID
              </span>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  color: colors.amber,
                }}
              >
                {displayedNewTime}
              </span>
            </div>
          ) : null}
        </div>

        {/* Destination och detaljer */}
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: colors.text }}>
            {direction === 'arrivals' ? `Från ${item.destination}` : item.destination}
          </div>
          <div style={{ fontSize: '12px', color: colors.textDim, marginTop: '3px' }}>
            {metaParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 ? ' | ' : ''}
                <span style={i === 0 ? { color: colors.accent, fontWeight: 600 } : undefined}>
                  {part}
                </span>
              </React.Fragment>
            ))}
          </div>
          {isCancelled || (isDelayed && (item.delayMinutes || 0) >= COMPENSATION_DELAY_MIN) ? (
            <a
              href="https://www.hallakonsument.se/varor-och-tjanster/resor/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: '4px',
                fontSize: '12px',
                fontWeight: 600,
                color: colors.amber,
              }}
            >
              Rätt till ersättning?
            </a>
          ) : null}
          {item.deviation ? (
            <div
              style={{
                fontSize: '12px',
                color: colors.amber,
                fontWeight: 600,
                marginTop: '4px',
              }}
            >
              Avvikelse: {item.deviation}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
        <button
          type="button"
          aria-pressed={isSelectedTrip}
          aria-label={`${isSelectedTrip ? 'Vald resa' : 'Jag är ombord'}: ${item.line} ${
            direction === 'arrivals' ? 'från' : 'mot'
          } ${item.destination} ${item.scheduledTime}`}
          onClick={() => onSelectOnBoard(item)}
          style={{
            padding: '6px 11px',
            borderRadius: '8px',
            border: isSelectedTrip ? `1px solid ${colors.accent}` : `1px solid ${colors.borderStrong}`,
            backgroundColor: isSelectedTrip ? colors.accentStrong : colors.surfaceRaised,
            color: colors.text,
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {isSelectedTrip ? 'Vald resa' : 'Jag är ombord'}
        </button>

        <span
          style={{
            backgroundColor: badge.bg,
            border: `1px solid ${badge.border}`,
            color: badge.text,
            padding: '5px 11px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
