import React from 'react';
import type { BoardDirection, Departure } from '../lib/types';
import { colors, fonts } from './styles';
import { countdownFor, lineBadge, lineName } from '../lib/lineFormat';

type Props = {
  items: Departure[];
  direction: BoardDirection;
  now: number;
};

/** Så många kommande avgångar visas per linje. */
const TIMES_PER_GROUP = 3;

/** En linje mot ett mål, med de närmaste avgångarna i rad: "3 min · 11 min · 19 min". */
/** "om 12 min" / "nu" för tåg, där avgångstiden står stort; tomt om det är en timme eller mer. */
function relativeLabel(t: Departure, now: number): string {
  const label = countdownFor(t, now);
  if (label === 'Nu') return 'nu';
  return /min$/.test(label) ? `om ${label}` : '';
}

export default function LineGroupRow({ items, direction, now }: Props) {
  const first = items[0];
  const badge = lineBadge(first.line);
  const trainNumber = first.transportMode === 'train' && /^\d{3,5}$/.test(badge);
  const name = lineName(first.line, badge);
  const shownBadge = trainNumber ? 'Tåg' : badge;
  const towards = direction === 'arrivals' ? `Från ${first.destination}` : first.destination;
  const tracks = Array.from(new Set(items.map((i) => i.track).filter(Boolean)));
  const subline = [name, first.stopLabel, tracks.length === 1 ? tracks[0] : ''].filter(Boolean).join(' · ');
  const times = items.slice(0, TIMES_PER_GROUP);

  // Skärmläsaren får både nedräkning och ordinarie tid, som på raden i listan.
  const spoken = `${trainNumber ? name || 'Tåg' : first.line} ${direction === 'arrivals' ? 'från' : 'mot'} ${
    first.destination
  }: ${times
    .map((t) => {
      const label = countdownFor(t, now);
      if (t.status === 'cancelled') return `${t.scheduledTime} inställd`;
      if (t.status === 'delayed') return `${label === 'Nu' ? 'nu' : label}, försenad, ordinarie ${t.scheduledTime}`;
      return `${label === 'Nu' ? 'nu' : label}, ${t.scheduledTime}`;
    })
    .join(', ')}`;

  return (
    <li
      aria-label={spoken}
      style={{
        listStyle: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        minHeight: '64px',
        boxSizing: 'border-box',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: '13px',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          minWidth: '44px',
          padding: '4px 6px',
          borderRadius: 'var(--radius-badge)',
          backgroundColor: colors.badgeBg,
          color: colors.badgeText,
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: '0.875rem',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {shownBadge}
      </span>

      <span aria-hidden="true" style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: '1rem',
            fontWeight: 700,
            color: colors.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {towards}
        </span>
        {subline ? (
          <span
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              color: colors.textDim,
              marginTop: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subline}
          </span>
        ) : null}
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
          {times.map((t, i) => {
            const cancelled = t.status === 'cancelled';
            const delayed = t.status === 'delayed';
            const schedule = !cancelled && !delayed && t.hasRealtime === false;
            return (
              <span
                key={t.id}
                style={{
                  fontSize: i === 0 ? '0.9375rem' : '0.8125rem',
                  fontWeight: i === 0 ? 800 : 700,
                  fontVariantNumeric: 'tabular-nums',
                  display: 'inline-flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  lineHeight: 1.2,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-badge)',
                  backgroundColor: colors.surfaceRaised,
                  border: `1px solid ${
                    cancelled ? colors.cancelledBorder : delayed ? colors.delayedBorder : colors.border
                  }`,
                  color: cancelled ? colors.cancelledText : delayed ? colors.amber : schedule ? colors.textDim : colors.text,
                  whiteSpace: 'nowrap',
                }}
              >
                {/* Tåg med tågnummer: avgångstiden stort (som på biljetten), annars nedräkningen. */}
                <span style={{ textDecoration: cancelled ? 'line-through' : 'none' }}>
                  {trainNumber
                    ? t.scheduledTime
                    : `${schedule && /min$/.test(countdownFor(t, now)) ? '~' : ''}${countdownFor(t, now)}`}
                </span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>
                  {trainNumber
                    ? cancelled
                      ? 'inställd'
                      : delayed
                      ? `ny ${t.newTime || t.estimatedTime}`
                      : relativeLabel(t, now)
                    : cancelled
                    ? 'inställd'
                    : delayed
                    ? `${t.scheduledTime}→${t.newTime || t.estimatedTime}`
                    : t.scheduledTime}
                </span>
              </span>
            );
          })}
        </span>
      </span>
    </li>
  );
}
