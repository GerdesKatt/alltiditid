import React from 'react';
import type { BoardDirection, Departure } from '../lib/types';
import { badgeLook, colors, fonts } from './styles';
import { countdownFor, lineBadge, lineName } from '../lib/lineFormat';
import { lineLabel, trackLabel, translator, useLang, type Lang } from '../lib/i18n';

type Props = {
  items: Departure[];
  direction: BoardDirection;
  now: number;
};

/** Så många kommande avgångar visas per linje. */
const TIMES_PER_GROUP = 3;

/** En linje mot ett mål, med de närmaste avgångarna i rad: "3 min · 11 min · 19 min". */
/** "om 12 min" / "nu" för tåg, där avgångstiden står stort; tomt om det är en timme eller mer. */
function relativeLabel(d: Departure, now: number, lang: Lang): string {
  const t = translator(lang);
  const label = countdownFor(d, now);
  if (label === 'Nu') return t('nu', 'now');
  return /min$/.test(label) ? t(`om ${label}`, `in ${label}`) : '';
}

export default function LineGroupRow({ items, direction, now }: Props) {
  const { lang, t } = useLang();
  const first = items[0];
  const badge = lineBadge(first.line);
  const trainNumber = first.transportMode === 'train' && /^\d{3,5}$/.test(badge);
  const name = lineLabel(lineName(first.line, badge), lang);
  const shownBadge = trainNumber ? t('Tåg', 'Train') : lineLabel(badge, lang);
  const towards = direction === 'arrivals' ? `${t('Från', 'From')} ${first.destination}` : first.destination;
  const now_ = (label: string) => (label === 'Nu' ? t('nu', 'now') : label);
  const tracks = Array.from(new Set(items.map((i) => i.track).filter(Boolean)));
  const subline = [name, first.stopLabel, tracks.length === 1 ? trackLabel(tracks[0], lang) : ''].filter(Boolean).join(' · ');
  const times = items.slice(0, TIMES_PER_GROUP);

  // Skärmläsaren får både nedräkning och ordinarie tid, som på raden i listan.
  const spoken = `${trainNumber ? name || t('Tåg', 'Train') : lineLabel(first.line, lang)} ${
    direction === 'arrivals' ? t('från', 'from') : t('mot', 'to')
  } ${first.destination}: ${times
    .map((d) => {
      const label = countdownFor(d, now);
      if (d.status === 'cancelled') return `${d.scheduledTime} ${t('inställd', 'cancelled')}`;
      if (d.status === 'delayed')
        return `${now_(label)}, ${t('försenad, ordinarie', 'delayed, scheduled')} ${d.scheduledTime}`;
      return `${now_(label)}, ${d.scheduledTime}`;
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
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          minWidth: '44px',
          padding: '4px 6px',
          borderRadius: 'var(--radius-badge)',
          boxSizing: 'border-box',
          ...badgeLook(first),
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
          {times.map((d, i) => {
            const cancelled = d.status === 'cancelled';
            const delayed = d.status === 'delayed';
            const schedule = !cancelled && !delayed && d.hasRealtime === false;
            return (
              <span
                key={d.id}
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
                    ? d.scheduledTime
                    : now_(countdownFor(d, now))}
                </span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>
                  {trainNumber
                    ? cancelled
                      ? t('inställd', 'cancelled')
                      : delayed
                      ? `${t('ny', 'new')} ${d.newTime || d.estimatedTime}`
                      : relativeLabel(d, now, lang)
                    : cancelled
                    ? t('inställd', 'cancelled')
                    : delayed
                    ? `${d.scheduledTime}→${d.newTime || d.estimatedTime}`
                    : d.scheduledTime}
                </span>
              </span>
            );
          })}
        </span>
      </span>
    </li>
  );
}
