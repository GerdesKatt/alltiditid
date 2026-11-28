import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Departure } from '../lib/types';
import type { MyTrip } from '../lib/myTrip';
import { clockFor, countdownFor, lineBadge, lineName, isAlarmDelay, parseLocal } from '../lib/lineFormat';
import { badgeLook, colors, fonts, labelStyle } from './styles';
import { platformMinutes, walkVerdict } from '../lib/walk.mjs';
import { lineLabel, trackLabel, useLang } from '../lib/i18n';
import { trackText } from '../lib/lineNames.mjs';
import { underTwoMinutes, timelineFill } from '../lib/countdown.mjs';
import { useLiveNow } from '../lib/useLiveNow';
import { useWakeLock } from '../lib/wakeLock';
import Icon from './Icon';
import { useTrivia } from '../lib/useTrivia';
import { useRain } from '../lib/useRain';
import { morphTransition } from '../lib/motion';

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
  /** Något annat på tavlan är försenat eller inställt: då är "Lugnt" en nyhet. */
  boardTrouble?: boolean;
  /** Hållplatsens läge när gångtiden är på: för regnet (idé 17). */
  stopAt?: { lat: number; lon: number } | null;
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
  stopAt = null,
  boardTrouble = false,
}: Props) {
  const { lang, t } = useLang();
  const badge = lineBadge(trip.line);
  const name = lineLabel(lineName(trip.line, badge), lang);
  const nu = (label: string) => (label === 'Nu' ? t('Nu', 'Now') : label);
  const deviationRaw = next.find((d) => d.deviation)?.deviation;

  const spokenTimes = next
    .map((d) =>
      d.status === 'cancelled'
        ? `${d.scheduledTime} ${t('inställd', 'cancelled')}`
        : `${nu(countdownFor(d, now))}${
            isAlarmDelay(d)
              ? `, ${t('försenad, ny tid', 'delayed, new time')} ${clockFor(d)}`
              : d.status === 'delayed'
              ? `, ${t('väntas', 'expected')} ${clockFor(d)}`
              : ''
          }`
    )
    .join('; ');

  const [head, ...rest] = next;
  const look = badgeLook({ line: trip.line, transportMode: head?.transportMode, operator: head?.operator });
  const tripCancelled = head?.status === 'cancelled';
  // Plan B: är avgången inställd visar kortet direkt det du tar i stället, med siffra, spår och
  // tidslinje mot den nya avgången. Det är då appen behövs mest (Vägen till 10 del 2, idé 11).
  const planB = tripCancelled && alternative && !alternative.pending ? alternative : null;
  // "Inställd" står redan i plan B-raden: avvikelsen visas bara om den säger något mer.
  const deviation = planB && /^inställd\.?$/i.test(String(deviationRaw || '').trim()) ? undefined : deviationRaw;
  const shown = planB ?? head;
  const headCancelled = shown?.status === 'cancelled';
  const headDelayed = Boolean(shown && isAlarmDelay(shown));
  const headLate = shown?.status === 'delayed' && !headDelayed;
  const headSchedule = shown && !headCancelled && !headDelayed && shown.hasRealtime === false;
  const headAt = shown ? parseLocal(shown.expectedAt) : null;
  // De sista två minuterna tickar kortet varje sekund så att tidslinjen fylls mjukt. Siffran säger
  // "under 2 min": källorna ger hela minuter, så sekunder vore en falsk precision (juryn, runda 2).
  const liveNow = useLiveNow(now, headCancelled ? null : headAt);
  const headUnder = Boolean(shown && headAt !== null && !headCancelled && !shown.pending && underTwoMinutes(headAt - liveNow));
  const headBig = shown ? (headUnder ? '2 min' : nu(countdownFor(shown, liveNow))) : '';
  // Gå nu / Gå om X min / Hinner inte: samma regel som på tavlan.
  const verdict =
    shown && walkMinutes !== null && headAt !== null && !headCancelled
      ? walkVerdict(Math.floor((headAt - liveNow) / 60000), walkMinutes, platformMinutes(shown.transportMode))
      : null;
  // Strecket som tidslinje: fylls de sista tio minuterna före "gå senast" (med gångtid)
  // eller före avgången (utan). Varumärkets ornament blir svaret (Vägen till 10, idé 1).
  const deadline =
    shown && headAt !== null && !headCancelled
      ? headAt - (walkMinutes !== null ? (walkMinutes + platformMinutes(shown.transportMode)) * 60_000 : 0)
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

  // Repliken under strecket: med gångtid beskedet, utan gångtid lugnet eller kaffet (idé 10).
  const minutesLeft = headAt !== null ? Math.floor((headAt - liveNow) / 60000) : null;
  const after = planB ? null : rest[0];
  const nextIn = after && after.status !== 'cancelled' ? parseLocal(after.expectedAt) : null;
  const nextMin = nextIn !== null ? Math.max(1, Math.floor((nextIn - liveNow) / 60000)) : null;
  const calm = !headCancelled && !headDelayed && !deviation && next.every((d) => d.status !== 'cancelled' && !isAlarmDelay(d));
  // Raden under strecket, högst en: beskedet står redan i rutan bredvid siffran, så med gångtid
  // säger raden bara det rutan inte säger (vädret, eller när nästa går). Kortet ska inte trycka ner
  // tavlan: tre avgångar i första vyn även med gångtid (UX-revisionen runda 2, N1 och N3).
  const rain = useRain(walkMinutes !== null ? stopAt : null);
  const rainLine =
    rain?.wet && verdict && verdict.kind !== 'missed'
      ? rain.snow
        ? t('Snö inom en timme.', 'Snow within the hour.')
        : t('Regn inom en timme.', 'Rain within the hour.')
      : '';
  const line = !shown || headCancelled || shown.pending || planB
    ? ''
    : verdict
    ? verdict.kind === 'missed'
      ? nextMin !== null
        ? t(`Den väntar inte, men nästa går om ${nextMin}.`, `It won't wait, but the next leaves in ${nextMin}.`)
        : t('Den hinner du inte.', "You won't make that one.")
      : rainLine
      ? ''
      : verdict.kind === 'relax' && verdict.leaveIn > 12
      ? t('Du har tid för en kaffe.', 'You have time for a coffee.')
      : ''
    : minutesLeft !== null && minutesLeft > 12 && minutesLeft < 60
    ? t('Du har tid för en kaffe.', 'You have time for a coffee.')
    : calm && boardTrouble && minutesLeft !== null && minutesLeft >= 1
    ? // Lugnet sägs bara när det är en nyhet: annat på tavlan är sent eller inställt, din går i tid
      // (juryn, runda 2, punkt 2). En replik som alltid står där slutar man läsa.
      t('Lugnt. Din avgång går i tid.', 'Calm. Yours is on time.')
    : '';
  // Väntan får innehåll: kuriosan om platsen, bara när det dröjer (idé 9).
  const waitLong = minutesLeft !== null && minutesLeft > 8 && !headCancelled && !verdict;
  const trivia = useTrivia(trip.stopName, null, lang, waitLong);

  // Storläge: bara siffran, så stor det går (idé 21). Skärmen hålls tänd där och vid "Gå nu" (idé 15).
  const [big, setBig] = useState(false);
  // Storläget växer ur kortet: siffran glider till helskärm och tillbaka (del 2, idé 1).
  const numberRef = useRef<HTMLButtonElement>(null);
  const openBig = () => morphTransition(() => setBig(true), () => numberRef.current, () => document.querySelector('.big-view .big-view-number'), 'big-number');
  const closeBig = useCallback(
    () => morphTransition(() => setBig(false), () => document.querySelector('.big-view .big-view-number'), () => numberRef.current, 'big-number'),
    []
  );
  useWakeLock(big || kind === 'go');

  // Läs upp med webbläsarens egen talsyntes (idé 19). Knappen visas bara där den finns.
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => setCanSpeak(typeof window !== 'undefined' && 'speechSynthesis' in window), []);
  const spoken = head && shown
    ? [
        `${lineLabel(name || badge, lang)} ${t('mot', 'to')} ${trip.destination}`,
        planB
          ? `${t('inställd. Ta i stället', 'cancelled. Take instead')} ${lineLabel(planB.line, lang)} ${t('mot', 'to')} ${planB.destination}`
          : '',
        headCancelled
          ? t('inställd', 'cancelled')
          : spokenWhen(headAt, liveNow, clockFor(shown), t),
        headDelayed ? `${t('försenad, ny tid', 'delayed, new time')} ${clockFor(shown)}` : '',
        shown.track ? `${shown.previousTrack ? t('nytt spår', 'new track') + ', ' : ''}${trackLabel(trackText(shown.track, shown.transportMode), lang)}` : '',
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
  // Spara bredvid siffran när det inte finns något besked i rutan (på bred skärm).
  // Gäller både Spara (Din avgång) och Ta bort (sparad resa på sin egen hållplats).
  const inlineSave = Boolean(showingStop && head);
  // Högst en rad under strecket: repliken eller vädret.
  const note = line ? (
    <strong style={{ color: verdict?.kind === 'missed' ? colors.amber : colors.text }}>{line}</strong>
  ) : rainLine ? (
    <>
      {rainLine} <span style={{ color: colors.textDim }}>· SMHI</span>
    </>
  ) : null;
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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ flex: '0 1 auto', minWidth: '7.5rem', fontSize: 'var(--fs-3)', fontWeight: 700, display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 8px' }}>
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
        {/* På smala skärmar bryts etiketten under knapparna i stället för att trycka ihop målet. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 0, minWidth: 0 }}>
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
        {head ? (
          // Storläget syns som en egen knapp, inte bara som en dold funktion på siffran (juryn, runda 2, punkt 4).
          <button
            type="button"
            onClick={openBig}
            className="row-link"
            aria-label={t('Storläge', 'Full screen')}
            title={t('Storläge', 'Full screen')}
            style={iconButton}
          >
            <Icon name="expand" size={18} />
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
          {planB && head ? (
            // Plan B: den inställda överst, i larmfärg, och sedan det du tar i stället i full storlek.
            <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-3)', color: colors.amber }}>
              <strong>
                {t('Inställd', 'Cancelled')} {head.scheduledTime}.
              </strong>{' '}
              <span style={{ color: colors.text }}>
                {t('Ta i stället', 'Take instead')} {lineLabel(planB.line, lang)} {t('mot', 'to')} {planB.destination}:
              </span>
            </p>
          ) : null}
          <div
            className="hero-big"
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
              onClick={openBig}
              aria-label={t('Visa nästa avgång i storläge', 'Show the next departure full screen')}
              className="big-open"
              style={{ flex: '1 1 auto', minWidth: 0, whiteSpace: inlineSave ? 'nowrap' : undefined }}
              ref={numberRef}
            >
              {/* Siffran rullar upp när den byts (av vid "minska rörelse"). */}
              {headUnder ? (
                <span aria-hidden="true" className="big-under">
                  {t('under', 'under')}{' '}
                </span>
              ) : null}
              <span aria-hidden="true" key={headBig} className="tick-in" style={headBig.length > 6 || headUnder ? { fontSize: '0.8em' } : undefined}>
                {headBig}
              </span>
            </button>
            {inlineSave || verdict ? (
              // Spara och beskedet står till höger om siffran i stället för på egna rader: kortet blir
              // lika lågt med gångtid som utan, och tavlan får plats högre upp (N1).
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'flex-end', gap: '6px', flexShrink: 1, minWidth: 0, marginLeft: 'auto' }}>
                {inlineSave ? (
                  <button type="button" onClick={auto ? onSave : onRemove} className="save-inline" style={{ ...textButton, minHeight: verdict ? '28px' : textButton.minHeight, marginBottom: verdict ? 0 : '-10px', fontFamily: 'var(--font-text)', fontStretch: '100%', letterSpacing: 0, lineHeight: 1.2, fontVariantNumeric: 'normal', maxWidth: '10rem', textAlign: 'right' }}>
                    {auto ? t('Spara som min resa', 'Save as my trip') : t('Ta bort', 'Remove')}
                    {auto ? null : <span className="sr-only"> {t('min resa', 'my trip')}</span>}
                  </button>
                ) : null}
            {verdict ? (
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
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
              borderTop: deadline !== null ? '1px solid var(--timeline-track)' : `1px solid ${colors.text}`,
              fontSize: 'var(--fs-2)',
            }}
          >
            {/* Strecket som tidslinje: fylls från vänster tills det är dags att gå. */}
            {deadline !== null ? (
              <>
                <span className="timeline-fill" style={{ width: `${(fill * 100).toFixed(2)}%` }} />
                {/* Målet i högerkanten: där är det dags att gå. */}
                <span className="timeline-end" />
              </>
            ) : null}
            <span style={{ color: headCancelled || headDelayed ? colors.amber : colors.text, fontWeight: headCancelled ? 700 : 400 }}>
              {headCancelled
                ? t('Inställd', 'Cancelled')
                : headDelayed
                ? `⚠ ${t('Försenad', 'Delayed')}${shown.delayMinutes ? ` +${shown.delayMinutes}` : ''} · ${t('ny tid', 'new time')} ${clockFor(shown)}`
                : headLate
                ? `${t('Väntas', 'Expected')} ${clockFor(shown)} · +${shown.delayMinutes} min`
                : headSchedule
                ? `${t('Enligt tidtabell', 'Scheduled')} · ${clockFor(shown)}`
                : `${t(planB ? 'Går' : 'I tid', planB ? 'Departs' : 'On time')} · ${clockFor(shown)}`}
              {shown.track && shown.previousTrack ? (
                // Spårbytet syns även här: gamla spåret struket, det nya i fet stil (del 2, idé 3).
                <>
                  {' · '}
                  <span className="track-changed">
                    {trackLabel(trackText(shown.track, shown.transportMode), lang).replace(/\s.*$/, '')}{' '}
                    <s className="track-old">{trackText(shown.previousTrack, shown.transportMode).replace(/^\S+\s/, '')}</s> →{' '}
                    <strong className="track-new">{trackText(shown.track, shown.transportMode).replace(/^\S+\s/, '')}</strong>
                  </span>
                </>
              ) : shown.track ? (
                ` · ${trackLabel(trackText(shown.track, shown.transportMode), lang)}`
              ) : (
                ''
              )}
            </span>
            {verdict && note ? (
              // Med gångtid står repliken eller vädret här i stället för Därefter: en rad mindre.
              <span>{note}</span>
            ) : rest.length && !planB ? (
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

      {note && !verdict ? <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-2)' }}>{note}</p> : null}

      {trivia && waitLong ? (
        // Väntan får innehåll: en rad om platsen när det är mer än åtta minuter kvar (idé 9).
        <p className="clamp-2" style={{ margin: '4px 0 0', fontSize: 'var(--fs-2)', color: colors.textDim }}>
          {t('Visste du?', 'Did you know?')} {trivia.text}
        </p>
      ) : null}

      {next[0]?.status === 'cancelled' && alternative && !planB ? (
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

      {inlineSave ? (
        // Smal skärm: Ta bort får inte plats bredvid siffran och står här i stället. Spara finns i radens meny (N2).
        <div className={auto ? 'save-below' : 'save-below save-below-keep'} style={{ justifyContent: 'flex-end', marginTop: '6px', marginBottom: '-10px' }}>
          <button type="button" onClick={auto ? onSave : onRemove} style={textButton}>
            {auto ? t('Spara som min resa', 'Save as my trip') : t('Ta bort', 'Remove')}
          </button>
        </div>
      ) : (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0 12px', marginTop: '6px', marginBottom: '-10px' }}>
        {/* På hållplatsens egen tavla står namnet redan under kortet. */}
        {showingStop ? (
          <span />
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', fontSize: 'var(--fs-2)', color: colors.textDim }}>
            {t('från', 'from')} {trip.stopName}
          </span>
        )}
        <span style={{ display: 'flex', marginLeft: 'auto' }}>
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
          onClose={closeBig}
          badge={lineLabel(planB ? lineBadge(planB.line) : badge, lang)}
          look={planB ? badgeLook({ line: planB.line, transportMode: planB.transportMode, operator: planB.operator }) : look}
          destination={planB ? planB.destination : trip.destination}
          big={headBig}
          under={headUnder ? t('under', 'under') : ''}
          towards={t('mot', 'to')}
          onSpeak={canSpeak ? speak : undefined}
          speakLabel={t('Läs upp', 'Read aloud')}
          cancelled={headCancelled}
          status={
            headCancelled
              ? t('Inställd', 'Cancelled')
              : `${planB ? `${t('Inställd', 'Cancelled')} ${head.scheduledTime}. ${t('Ta', 'Take')} ${lineLabel(planB.line, lang)} · ` : ''}${
                  headDelayed || headLate ? t('Väntas', 'Expected') : t('Går', 'Departs')
                } ${clockFor(shown!)}${shown!.track ? ` · ${trackLabel(trackText(shown!.track, shown!.transportMode), lang)}` : ''}`
          }
          verdict={
            verdict
              ? verdict.kind === 'go'
                ? t('Gå nu', 'Go now')
                : verdict.kind === 'missed'
                ? t('Hinner inte', "Won't make it")
                : t(`Gå om ${verdict.leaveIn} min`, `Leave in ${verdict.leaveIn} min`)
              : headCancelled
              ? ''
              : headDelayed
              ? t('Försenad', 'Delayed')
              : headSchedule
              ? t('Enligt tidtabell', 'Scheduled')
              : t('I tid', 'On time')
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
  if (s < 120) return t('om under två minuter', 'in under two minutes');
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
  under: string;
  towards: string;
  onSpeak?: () => void;
  speakLabel: string;
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
        <span>
          {props.towards} {props.destination}
        </span>
      </div>
      <div
        aria-live="off"
        className="big-view-number"
        // Så stor det går: bredden räcker för texten ("3 min", "11:42"), högst 42 % av höjden.
        style={{ textDecoration: props.cancelled ? 'line-through' : 'none', fontSize: `min(${Math.floor(140 / Math.max(2, props.big.length + (props.under ? 3 : 0)))}vw, 42vh)` }}
      >
        {props.under ? <span className="big-under">{props.under} </span> : null}
        <span key={props.big} className="tick-in">
          {props.big}
        </span>
      </div>
      <div style={{ position: 'relative', borderTop: `1px solid ${props.fill !== null ? 'var(--timeline-track)' : colors.text}`, paddingTop: '12px', fontSize: 'var(--fs-4)' }}>
        {props.fill !== null ? (
          <>
            <span className="timeline-fill" style={{ width: `${(props.fill * 100).toFixed(2)}%`, height: '6px', top: '-3.5px' }} />
            <span className="timeline-end" style={{ height: '11px', top: '-5px' }} />
          </>
        ) : null}
        {props.verdict ? <strong style={{ display: 'block', marginBottom: '6px', fontSize: 'var(--fs-5)' }}>{props.verdict}</strong> : null}
        {props.status}
      </div>
      {props.onSpeak ? (
        // Läs upp även i storläget: samma knapp som i kortet, med text (juryn, runda 2, punkt 4).
        <button
          type="button"
          className="row-link big-view-speak"
          onClick={(e) => {
            e.stopPropagation();
            props.onSpeak?.();
          }}
        >
          <Icon name="speaker" size={22} /> {props.speakLabel}
        </button>
      ) : null}
    </div>,
    document.body
  );
}

const iconButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
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
