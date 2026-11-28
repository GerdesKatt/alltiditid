import React from 'react';
import type { Departure } from '../lib/types';
import type { MyTrip } from '../lib/myTrip';
import { clockFor, countdownFor, lineBadge, lineName, isAlarmDelay, parseLocal } from '../lib/lineFormat';
import { badgeLook, colors, fonts, labelStyle } from './styles';
import { platformMinutes, walkVerdict } from '../lib/walk.mjs';
import { lineLabel, trackLabel, useLang } from '../lib/i18n';
import { trackText } from '../lib/lineNames.mjs';

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
  /** Inte sparad: ett förslag (den du brukar ta, eller nästa avgång). Visar Spara i stället för Ta bort. */
  auto?: 'habit' | 'next';
  onSave?: () => void;
  /** Förslaget valdes efter trafikslag och är inte den allra första avgången. */
  autoMode?: Departure['transportMode'];
  /** Gångtid till hållplatsen i minuter, när "Gångtid" är på. */
  walkMinutes?: number | null;
};

/**
 * "Min resa" överst: de tre nästa avgångarna för en sparad linje och riktning,
 * så att svaret på "när går nästa?" syns utan ett enda tryck.
 */
export default function MyTripCard({
  trip,
  next,
  loading,
  now,
  showingStop,
  onShowStop,
  onRemove,
  alternative = null,
  auto,
  autoMode,
  onSave,
  walkMinutes = null,
}: Props) {
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
  const look = badgeLook({ line: trip.line, transportMode: head?.transportMode, operator: head?.operator });
  const headCancelled = head?.status === 'cancelled';
  const headDelayed = Boolean(head && isAlarmDelay(head));
  const headLate = head?.status === 'delayed' && !headDelayed;
  const headSchedule = head && !headCancelled && !headDelayed && head.hasRealtime === false;
  const headBig = head ? nu(countdownFor(head, now)) : '';
  // Gå nu / Gå om X min / Hinner inte: samma regel som på tavlan.
  const headAt = head ? parseLocal(head.expectedAt) : null;
  const verdict =
    head && walkMinutes !== null && headAt !== null && !headCancelled
      ? walkVerdict(Math.floor((headAt - now) / 60000), walkMinutes, platformMinutes(head.transportMode))
      : null;
  const label = (text: string) => (
    <span style={{ ...labelStyle, flexShrink: 0 }}>
      {text}
    </span>
  );

  return (
    <section
      className="invert hero-card"
      aria-label={`${auto ? t('Din avgång', 'Your departure') : t('Min resa', 'My trip')}: ${lineLabel(trip.line, lang)} ${t('mot', 'to')} ${trip.destination} ${t(
        'från',
        'from'
      )} ${trip.stopName}`}
      style={{
        marginBottom: '8px',
        padding: '12px 16px 12px',
        // På tavlan lika brett som tavlan under; annars en lagom läsbredd.
        maxWidth: showingStop ? undefined : '40rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <span style={{ minWidth: 0, fontSize: 'var(--fs-3)', fontWeight: 700, display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 8px' }}>
          {/* Linjebrickan i linjens färg, samma som på tavlan. */}
          <span
            style={{
              ...look,
              display: 'inline-block',
              minWidth: '40px',
              padding: '1px 6px',
              boxSizing: 'border-box',
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: 'var(--fs-2)',
              textAlign: 'center',
            }}
          >
            {lineLabel(badge, lang)}
          </span>
          <span>
            {t('mot', 'to')} {trip.destination}
          </span>
          {name ? <span className="sr-only">, {name}</span> : null}
        </span>
        {label(
          auto === 'habit'
            ? t('Du brukar ta', 'You usually take')
            : auto === 'next'
            ? nextLabel(autoMode, t)
            : t('Din avgång', 'Your departure')
        )}
      </div>

      <p className="sr-only" aria-live={auto ? undefined : 'polite'}>
        {next.length ? `${t('Nästa', 'Next')}: ${spokenTimes}` : ''}
      </p>

      {!head ? (
        <p style={{ margin: '14px 0 4px', fontSize: 'var(--fs-3)', color: colors.textDim }}>
          {loading ? t('Hämtar avgångar…', 'Loading departures…') : t('Inga avgångar den närmaste tiden.', 'No departures in the near future.')}
        </p>
      ) : (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '6px',
              fontFamily: fonts.display,
              fontSize: 'var(--fs-6)',
              fontStretch: 'var(--stretch-head)',
              fontWeight: 800,
              // Proportionella siffror: fast bredd ger luft runt kolonet i den här storleken.
              fontVariantNumeric: 'proportional-nums',
              lineHeight: 0.95,
              letterSpacing: '-0.015em',
              // Siffran är alltid svart (ljust) eller ljus (mörkt): signalfärg bara i raden under strecket.
              color: headSchedule ? colors.textDim : colors.text,
              textDecoration: headCancelled ? 'line-through' : 'none',
              overflowWrap: 'anywhere',
            }}
          >
            <span aria-hidden="true" style={{ flex: 1, minWidth: 0, whiteSpace: !verdict && auto && showingStop ? 'nowrap' : undefined }}>
              {/* Siffran rullar upp när den byts (av vid "minska rörelse"). */}
              <span key={headBig} className="tick-in">
                {headBig}
              </span>
            </span>
            {!verdict && auto && showingStop ? (
              // Spara står bredvid siffran i stället för på en egen rad: kortet blir en rad lägre
              // och tavlan får plats högre upp.
              <button type="button" onClick={onSave} style={{ ...textButton, alignSelf: 'flex-end', marginBottom: '-10px', fontFamily: 'var(--font-text)', fontStretch: '100%', letterSpacing: 0, lineHeight: 1.2, fontVariantNumeric: 'normal', flexShrink: 1, maxWidth: '10rem', textAlign: 'right' }}>
                {t('Spara som min resa', 'Save as my trip')}
              </button>
            ) : null}
            {verdict ? (
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                  padding: '8px 10px',
                  backgroundColor: verdict.kind === 'missed' ? 'transparent' : colors.text,
                  color: verdict.kind === 'missed' ? colors.amber : colors.bg,
                  border: verdict.kind === 'missed' ? `1px solid ${colors.amber}` : 'none',
                  fontFamily: fonts.display,
                  fontStretch: 'var(--stretch-wide)',
                  fontSize: 'var(--fs-1)',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  textDecoration: 'none',
                }}
              >
                {verdict.kind === 'go'
                  ? t('Gå nu', 'Go now')
                  : verdict.kind === 'missed'
                  ? t('Hinner inte', "Won't make it")
                  : t(`Gå om ${verdict.leaveIn} min`, `Leave in ${verdict.leaveIn} min`)}
              </span>
            ) : null}
          </div>
          <div
            aria-hidden="true"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: '4px 12px',
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: `1px solid ${colors.text}`,
              fontSize: 'var(--fs-2)',
            }}
          >
            <span style={{ color: headCancelled || headDelayed ? colors.amber : colors.text, fontWeight: headCancelled ? 700 : 400 }}>
              {headCancelled
                ? t('Inställd', 'Cancelled')
                : headDelayed
                ? `⚠ ${t('Försenad', 'Delayed')}${head.delayMinutes ? ` +${head.delayMinutes}` : ''} · ${t('ny tid', 'new time')} ${clockFor(head)}`
                : headLate
                ? `${t('Väntas', 'Expected')} ${clockFor(head)} · +${head.delayMinutes} min`
                : headSchedule
                ? `${t('Enligt tidtabell', 'Scheduled')} · ${clockFor(head)}`
                : `${t('I tid', 'On time')} · ${clockFor(head)}`}
              {head.track ? ` · ${trackLabel(trackText(head.track, head.transportMode), lang)}` : ''}
            </span>
            {rest.length ? (
              <span style={{ color: colors.textDim }}>
                {t('Därefter', 'Then')}{' '}
                {andList(
                  rest.map((d) => (d.status === 'cancelled' ? t('inställd', 'cancelled') : nu(countdownFor(d, now)))),
                  t('och', 'and')
                )}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {verdict && !headCancelled ? (
        // En torr replik i annonsernas röst, under strecket (Apple-juryn, punkt 9).
        <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-2)', fontWeight: 700, color: verdict.kind === 'missed' ? colors.amber : colors.text }}>
          {verdict.kind === 'relax'
            ? t('Du hinner. Gå, spring inte.', "You'll make it. Walk, don't run.")
            : verdict.kind === 'go'
            ? t('Gå nu, så hinner du.', "Leave now and you'll make it.")
            : rest.length
            ? t('Den hinner du inte. Ta nästa.', "You won't make that one. Take the next.")
            : t('Den hinner du inte.', "You won't make that one.")}
        </p>
      ) : null}

      {next[0]?.status === 'cancelled' && alternative ? (
        // Inställt: alltid ett nästa steg.
        <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-3)', color: colors.amber }}>
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
            fontSize: 'var(--fs-2)',
          }}
        >
          <span aria-hidden="true">⚠ </span>
          {deviation}
        </p>
      ) : null}

      {!verdict && auto && showingStop && head ? null : (
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0 12px', marginTop: '6px', marginBottom: '-10px' }}>
        {/* På hållplatsens egen tavla står namnet redan under kortet. */}
        {showingStop ? (
          <span />
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', fontSize: 'var(--fs-2)', color: colors.textDim }}>
            {t('från', 'from')} {trip.stopName}
          </span>
        )}
        <span style={{ display: 'flex' }}>
          {!showingStop ? (
            <button type="button" onClick={onShowStop} style={textButton}>
              {t('Visa tavlan', 'Show board')}
            </button>
          ) : null}
          {auto ? (
            <button type="button" onClick={onSave} style={textButton}>
              {t('Spara som min resa', 'Save as my trip')}
            </button>
          ) : (
            <button type="button" onClick={onRemove} style={textButton}>
              {t('Ta bort', 'Remove')}
              <span className="sr-only"> {t('min resa', 'my trip')}</span>
            </button>
          )}
        </span>
      </div>
      )}

    </section>
  );
}

const textButton: React.CSSProperties = {
  minHeight: '44px',
  padding: '0 0 0 14px',
  border: 'none',
  background: 'none',
  color: colors.text,
  fontSize: 'var(--fs-2)',
  fontWeight: 700,
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
};

/** "Nästa tåg" när förslaget valts efter trafikslag, annars "Nästa avgång". */
function nextLabel(mode: Departure['transportMode'] | undefined, t: (sv: string, en: string) => string): string {
  switch (mode) {
    case 'train':
      return t('Nästa tåg', 'Next train');
    case 'commuter':
      return t('Nästa pendeltåg', 'Next commuter train');
    case 'subway':
      return t('Nästa tunnelbana', 'Next metro');
    case 'tram':
      return t('Nästa spårvagn', 'Next tram');
    case 'ferry':
      return t('Nästa båt', 'Next boat');
    case 'bus':
      return t('Nästa buss', 'Next bus');
    default:
      return t('Nästa avgång', 'Next departure');
  }
}

/** "15 och 30 min" i stället för "15 min, 30 min". */
function andList(items: string[], and: string): string {
  const unit = (x: string) => /^\d+ min$/.test(x);
  const all = items.every(unit);
  const parts = all ? items.map((x) => x.replace(/ min$/, '')) : items;
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}` : parts[0] || '';
  return all ? `${joined} min` : joined;
}
