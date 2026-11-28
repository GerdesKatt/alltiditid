import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Departure } from '../lib/types';
import type { MyTrip } from '../lib/myTrip';
import { clockFor, countdownFor, lineBadge, lineName, isAlarmDelay, parseLocal } from '../lib/lineFormat';
import { badgeLook, colors, fonts, labelStyle } from './styles';
import { platformMinutes, walkVerdict } from '../lib/walk.mjs';
import { lineLabel, trackLabel, useLang } from '../lib/i18n';
import { trackText } from '../lib/lineNames.mjs';
import { secondsLabel, timelineFill } from '../lib/countdown.mjs';
import { useLiveNow } from '../lib/useLiveNow';
import { useWakeLock } from '../lib/wakeLock';
import Icon from './Icon';

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
  const headAt = head ? parseLocal(head.expectedAt) : null;
  // De sista två minuterna tickar kortet varje sekund och visar tiotal sekunder ("1:40").
  const liveNow = useLiveNow(now, headCancelled ? null : headAt);
  const headSeconds = head && headAt !== null && !headCancelled && !head.pending ? secondsLabel(headAt - liveNow) : null;
  const headBig = head ? headSeconds ?? nu(countdownFor(head, liveNow)) : '';
  // Gå nu / Gå om X min / Hinner inte: samma regel som på tavlan.
  const verdict =
    head && walkMinutes !== null && headAt !== null && !headCancelled
      ? walkVerdict(Math.floor((headAt - liveNow) / 60000), walkMinutes, platformMinutes(head.transportMode))
      : null;
  // Strecket som tidslinje: fylls de sista tio minuterna före "gå senast" (med gångtid)
  // eller före avgången (utan). Varumärkets ornament blir svaret (Vägen till 10, idé 1).
  const deadline =
    head && headAt !== null && !headCancelled
      ? headAt - (walkMinutes !== null ? (walkMinutes + platformMinutes(head.transportMode)) * 60_000 : 0)
      : null;
  const fill = deadline !== null ? timelineFill(deadline - liveNow) : 0;

  // Telefonen vibrerar kort när beskedet blir "Gå nu" medan appen är öppen (idé 6). Ingen notis:
  // bara när gångtid är på och sidan syns, och bara i webbläsare som kan (Android).
  const lastKind = useRef<string | null>(null);
  const kind = verdict?.kind ?? null;
  useEffect(() => {
    const before = lastKind.current;
    lastKind.current = kind;
    if (kind !== 'go' || before !== 'relax' || typeof navigator === 'undefined' || document.hidden) return;
    try {
      navigator.vibrate?.([140, 90, 140]);
    } catch {
      // Ingen vibration i den här webbläsaren.
    }
  }, [kind]);

  // Storläge: bara siffran, så stor det går (idé 21). Skärmen hålls tänd där och vid "Gå nu" (idé 15).
  const [big, setBig] = useState(false);
  useWakeLock(big || kind === 'go');

  // Läs upp med webbläsarens egen talsyntes (idé 19). Knappen visas bara där den finns.
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => setCanSpeak(typeof window !== 'undefined' && 'speechSynthesis' in window), []);
  const spoken = head
    ? [
        `${lineLabel(name || badge, lang)} ${t('mot', 'to')} ${trip.destination}`,
        headCancelled
          ? t('inställd', 'cancelled')
          : spokenWhen(headAt, liveNow, clockFor(head), t),
        headDelayed ? `${t('försenad, ny tid', 'delayed, new time')} ${clockFor(head)}` : '',
        head.track ? trackLabel(trackText(head.track, head.transportMode), lang) : '',
        verdict
          ? verdict.kind === 'go'
            ? t('Gå nu.', 'Leave now.')
            : verdict.kind === 'missed'
            ? t('Den hinner du inte.', "You won't make it.")
            : t(`Gå om ${verdict.leaveIn} minuter.`, `Leave in ${verdict.leaveIn} minutes.`)
          : '',
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  function speak() {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(spoken);
      u.lang = lang === 'en' ? 'en-GB' : 'sv-SE';
      u.rate = 1;
      synth.speak(u);
    } catch {
      // Talsyntesen svarade inte.
    }
  }
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
        {canSpeak && head ? (
          <button
            type="button"
            onClick={speak}
            className="row-link"
            aria-label={t('Läs upp nästa avgång', 'Read the next departure aloud')}
            style={iconButton}
          >
            <Icon name="speaker" size={18} />
          </button>
        ) : null}
        {label(
          auto === 'habit'
            ? t('Du brukar ta', 'You usually take')
            : auto === 'next'
            ? nextLabel(autoMode, t)
            : t('Din avgång', 'Your departure')
        )}
        </span>
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
            {/* Ett tryck på siffran visar storläget (idé 21). */}
            <button
              type="button"
              onClick={() => setBig(true)}
              aria-label={t('Visa nästa avgång i storläge', 'Show the next departure full screen')}
              className="big-open"
              style={{ flex: 1, minWidth: 0, whiteSpace: !verdict && auto && showingStop ? 'nowrap' : undefined }}
            >
              {/* Siffran rullar upp när den byts (av vid "minska rörelse"). */}
              <span aria-hidden="true" key={headBig} className="tick-in">
                {headBig}
              </span>
            </button>
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
              position: 'relative',
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
            {/* Strecket som tidslinje: fylls från vänster tills det är dags att gå. */}
            {deadline !== null ? <span className="timeline-fill" style={{ width: `${(fill * 100).toFixed(2)}%` }} /> : null}
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

      {big && head ? (
        <BigView
          onClose={() => setBig(false)}
          badge={lineLabel(badge, lang)}
          look={look}
          destination={trip.destination}
          big={headBig}
          cancelled={headCancelled}
          status={
            headCancelled
              ? t('Inställd', 'Cancelled')
              : `${headDelayed || headLate ? t('Väntas', 'Expected') : t('Går', 'Departs')} ${clockFor(head)}${
                  head.track ? ` · ${trackLabel(trackText(head.track, head.transportMode), lang)}` : ''
                }`
          }
          verdict={
            verdict
              ? verdict.kind === 'go'
                ? t('Gå nu', 'Go now')
                : verdict.kind === 'missed'
                ? t('Hinner inte', "Won't make it")
                : t(`Gå om ${verdict.leaveIn} min`, `Leave in ${verdict.leaveIn} min`)
              : ''
          }
          fill={deadline !== null ? fill : null}
          closeLabel={t('Stäng', 'Close')}
          title={t('Nästa avgång', 'Next departure')}
        />
      ) : null}
    </section>
  );
}

/** "om 3 minuter", "nu" eller "klockan 11:42", för uppläsningen. */
function spokenWhen(at: number | null, now: number, clock: string, t: (sv: string, en: string) => string): string {
  if (at === null) return `${t('klockan', 'at')} ${clock}`;
  const s = Math.floor((at - now) / 1000);
  if (s < 30) return t('går nu', 'departing now');
  if (s < 120) return t(`om ${Math.floor(s / 10) * 10} sekunder`, `in ${Math.floor(s / 10) * 10} seconds`);
  const m = Math.floor(s / 60);
  if (m >= 60) return `${t('klockan', 'at')} ${clock}`;
  return t(`om ${m} minuter`, `in ${m} minutes`);
}

/**
 * Storläget: Nästa-kortet i helskärm med bara det som behövs, siffran så stor det går.
 * För den som ser dåligt, på håll från ett bord, eller för att visa vännen bredvid.
 */
function BigView(props: {
  onClose: () => void;
  badge: string;
  look: React.CSSProperties;
  destination: string;
  big: string;
  cancelled: boolean;
  status: string;
  verdict: string;
  fill: number | null;
  closeLabel: string;
  title: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { onClose } = props;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={props.title} className="hero-card big-view expand-in" onClick={onClose}>
      <button ref={closeRef} type="button" onClick={onClose} className="row-link big-view-close">
        {props.closeLabel}
      </button>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', fontSize: 'var(--fs-5)', fontWeight: 700 }}>
        <span
          style={{
            ...props.look,
            display: 'inline-block',
            minWidth: '48px',
            padding: '2px 8px',
            fontFamily: fonts.display,
            fontWeight: 800,
            textAlign: 'center',
          }}
        >
          {props.badge}
        </span>
        <span>{props.destination}</span>
      </div>
      <div
        aria-live="off"
        className="big-view-number"
        // Så stor det går: bredden räcker för texten ("1:40", "3 min", "11:42"), högst 42 % av höjden.
        style={{ textDecoration: props.cancelled ? 'line-through' : 'none', fontSize: `min(${Math.floor(140 / Math.max(2, props.big.length))}vw, 42vh)` }}
      >
        <span key={props.big} className="tick-in">
          {props.big}
        </span>
      </div>
      <div style={{ position: 'relative', borderTop: `1px solid ${colors.text}`, paddingTop: '12px', fontSize: 'var(--fs-4)' }}>
        {props.fill !== null ? <span className="timeline-fill" style={{ width: `${(props.fill * 100).toFixed(2)}%`, height: '5px', top: '-3px' }} /> : null}
        {props.status}
        {props.verdict ? <strong style={{ display: 'block', marginTop: '6px', fontSize: 'var(--fs-5)' }}>{props.verdict}</strong> : null}
      </div>
    </div>,
    document.body
  );
}

const iconButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '44px',
  height: '44px',
  margin: '-12px 0 -12px -8px',
  padding: 0,
  border: 'none',
  background: 'none',
  color: colors.text,
  cursor: 'pointer',
};

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
