import React from 'react';
import type { Departure } from '../lib/types';
import type { MyTrip } from '../lib/myTrip';
import { clockFor, countdownFor, lineBadge, lineColor, lineName } from '../lib/lineFormat';
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
  /** Nästa avgång är inställd: det man tar i stället. */
  alternative?: Departure | null;
};

/**
 * "Min resa" överst: de tre nästa avgångarna för en sparad linje och riktning,
 * så att svaret på "när går nästa?" syns utan ett enda tryck.
 */
export default function MyTripCard({ trip, next, loading, now, showingStop, onShowStop, onRemove, alternative = null }: Props) {
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

  const [head, ...rest] = next;
  const tint = lineColor({ line: trip.line, transportMode: head?.transportMode });
  const headCancelled = head?.status === 'cancelled';
  const headDelayed = head?.status === 'delayed';
  const headSchedule = head && !headCancelled && !headDelayed && head.hasRealtime === false;
  const headBig = head ? nu(countdownFor(head, now)) : '';
  const label = (text: string) => (
    <span style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.textDim }}>
      {text}
    </span>
  );

  return (
    <section
      className="invert"
      aria-label={`${t('Min resa', 'My trip')}: ${lineLabel(trip.line, lang)} ${t('mot', 'to')} ${trip.destination} ${t(
        'från',
        'from'
      )} ${trip.stopName}`}
      style={{
        marginBottom: '18px',
        padding: '14px 18px 16px',
        maxWidth: '40rem',
        // Linjens färg som en kant, samma som på brickan.
        boxShadow: tint ? `inset 6px 0 0 ${tint}` : 'none',
        paddingLeft: tint ? '24px' : '18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <span style={{ minWidth: 0, fontSize: '0.9375rem', fontWeight: 600 }}>
          {lineLabel(badge, lang)} {t('mot', 'to')} {trip.destination}
          {name ? <span className="sr-only">, {name}</span> : null}
        </span>
        {label(t('Din avgång', 'Your departure'))}
      </div>

      <p className="sr-only" aria-live="polite">
        {next.length ? `${t('Nästa', 'Next')}: ${spokenTimes}` : ''}
      </p>

      {!head ? (
        <p style={{ margin: '14px 0 4px', fontSize: '0.9375rem', color: colors.textDim }}>
          {loading ? t('Hämtar avgångar…', 'Loading departures…') : t('Inga avgångar den närmaste tiden.', 'No departures in the near future.')}
        </p>
      ) : (
        <div aria-hidden="true">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '6px',
              fontFamily: fonts.display,
              fontSize: 'clamp(3rem, 16vw, 4.5rem)',
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: '-0.05em',
              color: headCancelled || headDelayed ? colors.amber : colors.text,
              textDecoration: headCancelled ? 'line-through' : 'none',
              overflowWrap: 'anywhere',
            }}
          >
            {headSchedule && /min$/.test(headBig) ? `~${headBig}` : headBig}
          </div>
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
            <span style={{ color: headCancelled || headDelayed ? colors.amber : colors.text, fontWeight: headCancelled ? 700 : 500 }}>
              {headCancelled
                ? t('Inställd', 'Cancelled')
                : headDelayed
                ? `${t('Försenad', 'Delayed')}${head.delayMinutes ? ` +${head.delayMinutes}` : ''} · ${clockFor(head)}`
                : headSchedule
                ? `${t('Enligt tidtabell', 'Scheduled')} · ${clockFor(head)}`
                : `${t('I tid', 'On time')} · ${clockFor(head)}`}
              {head.track ? ` · ${head.track}` : ''}
            </span>
            {rest.length ? (
              <span style={{ color: colors.textDim }}>
                {t('sedan', 'then')}{' '}
                {rest
                  .map((d) => (d.status === 'cancelled' ? t('inställd', 'cancelled') : nu(countdownFor(d, now))))
                  .join(', ')}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {next[0]?.status === 'cancelled' && alternative ? (
        // Inställt: alltid ett nästa steg.
        <p style={{ margin: '10px 0 0', fontSize: '0.9375rem', color: colors.amber }}>
          <strong>{t('Ta istället:', 'Take instead:')}</strong>{' '}
          {lineLabel(alternative.line, lang)} {t('mot', 'to')} {alternative.destination} ·{' '}
          {alternative.newTime || alternative.estimatedTime || alternative.scheduledTime}
        </p>
      ) : null}

      {deviation ? (
        <p
          style={{
            margin: '10px 0 0',
            color: colors.delayedText,
            fontSize: '0.8125rem',
          }}
        >
          <span aria-hidden="true">⚠ </span>
          {deviation}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0 12px', marginTop: '6px', marginBottom: '-10px' }}>
        <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.8125rem', color: colors.textDim }}>
          {t('från', 'from')} {trip.stopName}
        </span>
        <span style={{ display: 'flex' }}>
          {!showingStop ? (
            <button type="button" onClick={onShowStop} style={textButton}>
              {t('Visa tavlan', 'Show board')}
            </button>
          ) : null}
          <button type="button" onClick={onRemove} style={textButton}>
            {t('Ta bort', 'Remove')}
            <span className="sr-only"> {t('min resa', 'my trip')}</span>
          </button>
        </span>
      </div>
    </section>
  );
}

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
