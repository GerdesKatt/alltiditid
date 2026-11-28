import React, { useState } from 'react';
import type { BoardDirection, Departure } from '../lib/types';
import { COMPENSATION_DELAY_MIN } from '../lib/byte';
import { compensationLink } from '../lib/compensation';
import Icon from './Icon';
import { badgeLook, colors, fonts } from './styles';
import { COUNTDOWN_MAX_MIN, lineBadge, operatorShort, parseLocal, isAlarmDelay, rowLineName, shownDeviation, splitProduct } from '../lib/lineFormat';
import { lineLabel, trackLabel, useLang } from '../lib/i18n';
import { trackText } from '../lib/lineNames.mjs';
import { platformMinutes, walkVerdict } from '../lib/walk.mjs';
import { sameAsBoard } from '../lib/nextPick.mjs';
import { secondsLabel } from '../lib/countdown.mjs';
import { useLiveNow } from '../lib/useLiveNow';

type Props = {
  item: Departure;
  direction: BoardDirection;
  now: number;
  isSelectedTrip: boolean;
  onSelectOnBoard: (item: Departure) => void;
  isMyTrip?: boolean;
  /** Saknas vid ankomster: Min resa gäller avgångar. */
  onToggleMyTrip?: (item: Departure) => void;
  /** Öppnar tågets hela resa (bara tåg med tågnummer). */
  onShowTrain?: (trainNumber: string) => void;
  /** Öppnar turens hela resa (buss, T-bana, spårvagn, båt). */
  onShowTrip?: (trip: { id: string; date: string }) => void;
  /** Tavlan är gammal (ingen anslutning): pricken släcks och tiderna tonas ned. */
  stale?: boolean;
  /** Gångtid till hållplatsen i minuter när "Hinner jag dit?" är på, annars null. */
  walkMinutes?: number | null;
  /** Inställd: nästa avgång som tar en dit i stället. */
  alternative?: Departure | null;
  /** Raden fälldes ut. */
  onOpen?: (item: Departure) => void;
  /** Filtret Tåg: fjärr- och regionaltåg med klockslaget stort, som på biljetten. */
  clockFirst?: boolean;
  /** Tavlans namn, så att delhållplatsen inte upprepas när den är samma plats. */
  boardName?: string;
  /** Marginalen för bytet från Mitt tåg, när raden är anslutningen. */
  transferNote?: { text: string; urgent: boolean } | null;
};

/** Länkarna under strecket i en utfälld rad: text med understrykning, som i Nästa-kortet. */
const rowLink: React.CSSProperties = {
  minHeight: '44px',
  padding: 0,
  border: 'none',
  background: 'none',
  color: colors.text,
  fontSize: 'var(--fs-2)',
  fontWeight: 700,
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
};

/** Beskedet visas bara för avgångar inom den här tiden; längre fram spelar gångtiden ingen roll än. */
const WALK_HORIZON_MIN = 60;


/**
 * En avgång. Störst är hur länge det är kvar ("3 min"), sedan destination och linje.
 * Avvikelser (försenad, inställd, bara tidtabell) syns; "i tid" behöver inget märke.
 * Ett tryck på raden visar mer: operatör, "Jag är ombord" och ersättning.
 */
export default function DepartureRow({
  item,
  direction,
  now: nowProp,
  isSelectedTrip,
  onSelectOnBoard,
  isMyTrip = false,
  onToggleMyTrip,
  onShowTrain,
  onShowTrip,
  stale = false,
  walkMinutes = null,
  alternative = null,
  onOpen,
  clockFirst = false,
  boardName = '',
  transferNote = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const { lang, t } = useLang();
  const line = lineLabel(item.line, lang);
  // En eller två minuter sent visas som väntad tid ('11:11 → 11:12'), inte som larm.
  const isDelayed = isAlarmDelay(item);
  const isCancelled = item.status === 'cancelled';
  const onlySchedule = !isCancelled && !isDelayed && item.hasRealtime === false;
  // Realtid är normalfallet och får inget märke. Bara undantaget syns: tidtabellstider är grå med "tidtabell".
  const newTime = isDelayed ? item.newTime || item.estimatedTime : '';
  // Väntad klocktid: ny tid om försenad, annars prognosen (kan vara en minut eller två från tidtabellen).
  const clock = newTime || (!isCancelled && item.estimatedTime) || item.scheduledTime;
  const early = !isCancelled && !isDelayed ? item.earlyMinutes || 0 : 0;

  const expected = parseLocal(item.expectedAt);
  // De sista två minuterna tickar raden varje sekund och visar tiotal sekunder (Vägen till 10, idé 2).
  const liveNow = useLiveNow(nowProp, isCancelled || item.pending ? null : expected);
  const now = liveNow;
  const minutesLeft = expected !== null ? Math.floor((expected - now) / 60000) : null;
  const seconds = !isCancelled && !item.pending && expected !== null ? secondsLabel(expected - now) : null;
  const bigTime = isCancelled
    ? item.scheduledTime
    : minutesLeft === null || minutesLeft >= COUNTDOWN_MAX_MIN
    ? clock
    : seconds
    ? seconds
    : minutesLeft <= 0
    ? t('Nu', 'Now')
    : `${minutesLeft} min`;
  // En enhet i tidskolumnen: minuter kvar för alla trafikslag. Bara i filtret Tåg visas bokade tåg
  // (fjärr- och regionaltåg) som på stationsskylten och biljetten: ordinarie tid stort, nedräkningen smått.
  const booked = clockFirst && item.transportMode === 'train';
  const countdown =
    minutesLeft === null || minutesLeft >= COUNTDOWN_MAX_MIN
      ? ''
      : minutesLeft <= 0
      ? t('nu', 'now')
      : t(`om ${minutesLeft} min`, `in ${minutesLeft} min`);
  // Ordinarie tid → väntad tid, när de skiljer sig (t.ex. en buss 2 min sen: "18:35 → 18:37").
  const shifted = !isCancelled && !isDelayed && clock !== item.scheduledTime;

  // "Hinner jag dit?": gångtid plus tid ner till perrongen mot minuterna kvar.
  const walk =
    walkMinutes !== null && !isCancelled && !item.pending && minutesLeft !== null && minutesLeft < WALK_HORIZON_MIN
      ? walkVerdict(minutesLeft, walkMinutes, platformMinutes(item.transportMode))
      : null;
  const walkText = !walk
    ? ''
    : walk.kind === 'missed'
    ? t('Hinner inte', "Won't make it")
    : walk.kind === 'go'
    ? t('Gå nu', 'Leave now')
    : t(`Gå om ${walk.leaveIn} min`, `Leave in ${walk.leaveIn} min`);

  // Hela resan: tåg från Trafikverket (tågnummer), övriga från Trafiklab (tur).
  const showsTrain = Boolean(
    onShowTrain && item.trainNumber && (item.transportMode === 'train' || item.transportMode === 'commuter')
  );
  const showsTrip = Boolean(!showsTrain && onShowTrip && item.tripId && item.tripDate);
  const badge = lineBadge(item.line);
  const { product, place } = splitProduct(item.destination);
  const name = product || lineLabel(rowLineName(item, badge), lang);
  const towards = direction === 'arrivals' ? `${t('Från', 'From')} ${place}` : place;
  // Alltid "Spår 2" eller "Läge D", aldrig en ensam siffra.
  const details = [item.stopLabel, trackLabel(trackText(item.track, item.transportMode), lang)].filter(Boolean).join(' · ');
  // Spåret först i undertexten, så att det aldrig är det som klipps bort på en smal telefon
  // ("Spår 3 · Röda linjen · T-Centralen", UX-revisionen, fynd 4).
  // Delhållplatsen bara när den är en annan plats än tavlan ("City", inte "T-Centralen" på Stockholm C).
  const ownLabel = item.stopLabel && !sameAsBoard(item.stopLabel, boardName) ? item.stopLabel : '';
  const subline = [trackLabel(trackText(item.track, item.transportMode), lang), name, ownLabel].filter(Boolean).join(' · ');
  // Utfälld rad: linjen med det namn raden redan använder ("SJ 574", inte "Tåg 574 · SJ AB"),
  // och bolaget bara om det inte redan står där ("Arlanda Express 7934", en gång).
  const fullLine = name && badge && !line.toLowerCase().includes(name.toLowerCase()) ? `${name} ${badge}` : line;
  const company = operatorShort(item.operator);
  const openInfo = [fullLine, company && !fullLine.toLowerCase().includes(company.toLowerCase()) ? item.operator : '']
    .filter(Boolean)
    .join(' · ');
  // "Ny tid saknas" betyder bara något för ett tåg som står kvar, och där säger tidskolumnen det redan.
  const deviation = shownDeviation(item);
  const compensation =
    isCancelled || (isDelayed && (item.delayMinutes || 0) >= COMPENSATION_DELAY_MIN);

  // Tidtabellstider: grå siffra och ordet "tidtabell" under, inget tilde.
  // Ett tåg som står kvar har ingen nedräkning: ordinarie tid under alla filter (inte "Nu" under Alla
  // och "10:51" under Tåg, UX-revisionen, fynd 2).
  const shownBig = booked || item.pending ? item.scheduledTime : bigTime;
  // Sent bokat tåg med känd ny tid som skiljer sig från den ordinarie.
  const lateBooked = booked && isDelayed && !!newTime && newTime !== item.scheduledTime;
  // "Nu" är rätt men går inte att hinna: mindre och i sten, så att den stora siffran
  // står på det man kan hinna med (Apple-juryn, punkt 3).
  const goingNow = !isCancelled && !item.pending && !booked && minutesLeft !== null && minutesLeft <= 0;
  const timeColor = isCancelled
    ? colors.textDim
    : isDelayed && booked
    ? colors.text // den ordinarie tiden står kvar; "Ny tid" är orange under
    : isDelayed
    ? colors.amber
    : onlySchedule || stale || goingNow
    ? colors.textDim
    : colors.text;

  // Status för skärmläsare, t.ex. "ordinarie 14:05" eller "försenad 5 min, ny tid 14:10, ordinarie 14:05".
  const spokenStatus = `${
    isCancelled
      ? `${t('inställd, ordinarie tid', 'cancelled, scheduled time')} ${item.scheduledTime}`
      : isDelayed
      ? `${t('försenad', 'delayed')}${item.delayMinutes ? ` ${item.delayMinutes} min` : ''}, ${t('ny tid', 'new time')} ${newTime}, ${t(
          'ordinarie',
          'scheduled'
        )} ${item.scheduledTime}`
      : `${
          booked
            ? countdown || t('ordinarie avgångstid', 'scheduled departure time')
            : `${t('ordinarie', 'scheduled')} ${item.scheduledTime}`
        }${shifted && !early ? `, ${t('väntas', 'expected')} ${clock}` : ''}${
          early ? `, ${early} ${t('min tidig, väntas', 'min early, expected')} ${clock}` : ''
        }${onlySchedule ? t(', enligt tidtabell', ', according to timetable') : ''}`
  }`;
  // Knappens namn: ett kort namn som börjar med det som syns först på raden (linjemärke och mål,
  // så att röststyrning hittar den, WCAG 2.5.3) och läses en gång, utan den synliga texten två gånger.
  const badgeText = lineLabel(badge, lang);
  const spokenTime = isCancelled ? '' : String(shownBig || '');
  const ariaLabel = [
    `${badgeText} ${towards}`,
    line && line !== badgeText ? line : '',
    spokenTime,
    spokenStatus,
    details,
    deviation,
    walkText ? `${t('gångtid', 'walking')}: ${walkText}` : '',
    transferNote ? `${t('ditt byte', 'your connection')}: ${transferNote.text}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      style={{
        // Raderna glider till sin nya plats när listan ändras (View Transitions, lib/motion.ts).
        viewTransitionName: `dep-${item.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        // Klassen låter CSS ge rader som gått en egen utgång (glider åt vänster, globals.css).
        ...({ viewTransitionClass: 'dep' } as React.CSSProperties),
        // En rad i listan: tunn avdelare i stället för ett eget kort.
        backgroundColor: isSelectedTrip ? colors.selectedRowBg : colors.surface,
        borderBottom: `1px solid ${colors.border}`,
        boxShadow: isSelectedTrip ? `inset 4px 0 0 ${colors.accent}` : 'none',
      }}
    >
      <button
        type="button"
        className="press"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (!open) onOpen?.(item);
          setOpen((v) => !v);
        }}
        style={{
          width: '100%',
          display: 'flex',
          // Vid stor text hamnar tiden på en egen rad i stället för att klippas.
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '4px 12px',
          padding: '12px 14px',
          minHeight: '64px',
          border: 'none',
          background: 'none',
          color: colors.text,
          textAlign: 'left',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        {/* Linjemärke */}
        <span
          style={{
            flexShrink: 0,
            // Samma bredd för upp till fyra siffror, så att målen bildar en rak kolumn.
            minWidth: '52px',
            padding: '4px 6px',
            boxSizing: 'border-box',
            borderRadius: 'var(--radius-badge)',
            // Tunnelbana, pendeltåg och spårvagn i Göteborg: kontur med linjens färg som streck till vänster.
            // Annan spårtrafik fylld, buss och båt med kontur. Inställda är grå.
            ...badgeLook(item, { cancelled: isCancelled }),
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: 'var(--fs-2)',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {lineLabel(badge, lang)}
        </span>

        {/* Destination och detaljer */}
        {/* Normal textstorlek: minst 5rem. Förstorad text (rot över 16 px): målet tar hela raden och tiden hamnar under. */}
        <span style={{ flex: '1 1 clamp(5rem, (1rem - 16px) * 1000, 7rem)', minWidth: 0 }}>
          <span
            style={{
              fontSize: 'var(--fs-3)',
              fontWeight: 700,
              color: isCancelled ? colors.textDim : colors.text,
              textDecoration: isCancelled ? 'line-through' : 'none',
              // Målet är andra frågan efter tiden: två rader hellre än "Västra hamnen vi…".
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflowWrap: 'anywhere',
              lineHeight: 1.25,
            }}
          >
            {towards}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--fs-2)',
              // Smal Archivo i täta rader: "Spår 3 · Röda linjen" ryms utan att klippas.
              fontStretch: 'var(--stretch-tight)',
              color: colors.textDim,
              marginTop: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {walk ? (
              // Gångbeskedet är en egen bricka med gubbe, så att det inte blandas ihop med avgångstiden.
              <span
                style={{
                  display: 'inline-block',
                  marginRight: '6px',
                  padding: '0 6px',
                  borderRadius: 'var(--radius-badge)',
                  backgroundColor:
                    walk.kind === 'go' ? colors.accentStrong : walk.kind === 'relax' ? colors.okBg : colors.surfaceRaised,
                  color: walk.kind === 'go' ? colors.onAccent : walk.kind === 'relax' ? colors.okText : colors.textDim,
                  fontWeight: 700,
                }}
              >
                <Icon name="walk" size={14} /> 
                {walkText}
              </span>
            ) : null}
            {transferNote ? (
              // Bytet från Mitt tåg: marginalen direkt på anslutningens rad (Vägen till 10, idé 18).
              <span
                style={{
                  display: 'inline-block',
                  marginRight: '6px',
                  padding: '0 6px',
                  borderRadius: 'var(--radius-badge)',
                  backgroundColor: transferNote.urgent ? 'transparent' : colors.okBg,
                  border: transferNote.urgent ? `1px solid ${colors.amber}` : 'none',
                  color: transferNote.urgent ? colors.amber : colors.okText,
                  fontWeight: 700,
                }}
              >
                {transferNote.text}
              </span>
            ) : null}
            {subline}
          </span>
          {deviation ? (
            // Avvikelsen är skälet att titta: egen rad, högst två, aldrig avklippt efter ett ord.
            <span
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                marginTop: '2px',
                fontSize: 'var(--fs-2)',
                lineHeight: 1.3,
                color: colors.amber,
                fontWeight: 700,
              }}
            >
              {deviation}
            </span>
          ) : null}
        </span>

        {/* Tid: minuter kvar störst */}
        <span style={{ flexShrink: 0, marginLeft: 'auto', textAlign: 'right' }}>
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: goingNow ? 'var(--fs-3)' : 'var(--fs-5)',
              fontWeight: goingNow ? 700 : 800,
              letterSpacing: goingNow ? 0 : '-0.015em',
              lineHeight: goingNow ? '1.75rem' : undefined,
              fontVariantNumeric: 'tabular-nums',
              color: timeColor,
              textDecoration: isCancelled ? 'line-through' : 'none',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '6px',
            }}
          >
            {lateBooked ? (
              // Sent bokat tåg: ordinarie tid står kvar överstruken, den nya tiden är lika stor.
              <>
                <s style={{ color: colors.textDim, fontWeight: 700 }}>{item.scheduledTime}</s>
                <span style={{ color: colors.amber }}>{newTime}</span>
              </>
            ) : (
              shownBig
            )}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--fs-2)',
              fontWeight: 400,
              fontVariantNumeric: 'tabular-nums',
              color: isCancelled ? colors.cancelledText : isDelayed ? colors.amber : colors.textDim,
              whiteSpace: 'nowrap',
            }}
          >
            {isCancelled ? (
              t('Inställd', 'Cancelled')
            ) : item.pending ? (
              <span style={{ color: colors.amber, fontWeight: 700 }}>{t('Väntar på ny tid', 'Awaiting new time')}</span>
            ) : booked ? (
              // Bokat tåg: ordinarie tid står stort ovanför.
              <>
                {lateBooked ? (
                  <span style={{ fontWeight: 700 }}>{item.delayMinutes ? `+${item.delayMinutes} min` : t('Ny tid', 'New time')}</span>
                ) : isDelayed ? (
                  t('Försenad', 'Delayed')
                ) : (
                  ''
                )}
                {early ? <span style={{ color: colors.okText }}>{`${clock} · ${early} ${t('min tidig', 'min early')}`}</span> : ''}
                {early && countdown ? ' · ' : ''}
                {/* En eller två minuter efter tidtabellen: väntad tid utan larmfärg, så att raden och kortet säger samma minut. */}
                {shifted && !early && !isDelayed ? `${t('väntas', 'exp.')} ${clock}${countdown ? ' · ' : ''}` : ''}
                {isDelayed ? '' : countdown}
                {onlySchedule ? `${countdown ? ' · ' : ''}${t('tidtabell', 'timetable')}` : ''}
              </>
            ) : isDelayed ? (
              <>
                <s style={{ color: colors.textFaint }}>{item.scheduledTime}</s> {newTime}
                {item.delayMinutes ? ` +${item.delayMinutes}` : ''}
              </>
            ) : early ? (
              <span style={{ color: colors.okText }}>
                {item.scheduledTime} → {clock} · {early} {t('min tidig', 'min early')}
              </span>
            ) : bigTime === clock ? (
              // Långt fram står klockslaget redan stort.
              onlySchedule ? t('tidtabell', 'timetable') : null
            ) : (
              <>
                {item.scheduledTime}
                {shifted ? ` → ${clock}` : ''}
                {onlySchedule ? ` · ${t('tidtabell', 'timetable')}` : ''}
              </>
            )}
          </span>
        </span>
      </button>
      {isCancelled && alternative ? (
        // Alltid ett nästa steg: det inställda följs av vad man tar i stället.
        <p
          style={{
            margin: '-4px 14px 10px',
            padding: '8px 10px',
            borderRadius: 'var(--radius-control)',
            backgroundColor: colors.surfaceRaised,
            fontSize: 'var(--fs-2)',
            lineHeight: 1.35,
            color: colors.text,
          }}
        >
          <strong>{t('Ta istället:', 'Take instead:')}</strong>{' '}
          {lineLabel(alternative.line, lang)} {t('mot', 'to')} {alternative.destination} ·{' '}
          {alternative.newTime || alternative.estimatedTime || alternative.scheduledTime}
          {alternative.track ? ` · ${trackLabel(alternative.track, lang)}` : ''}
        </p>
      ) : null}
      {open ? (
        // Utfälld rad: en knapp (spara), två länkar. Namnet sägs en gång (Apple-juryn, punkt 6).
        <div
          className="expand-in"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '0 14px 14px 78px',
            fontSize: 'var(--fs-2)',
            color: colors.textDim,
          }}
        >
          <span>
            {openInfo}
            {onlySchedule ? t(' · Realtid kommer när avgången närmar sig.', ' · Real-time appears as departure approaches.') : ''}
          </span>
          {onToggleMyTrip ? (
            <button
              type="button"
              className="press-fill"
              aria-pressed={isMyTrip}
              aria-label={`${isMyTrip ? t('Min resa', 'My trip') : t('Spara som min resa', 'Save as my trip')}: ${line} ${t(
                'mot',
                'to'
              )} ${item.destination}`}
              onClick={() => onToggleMyTrip(item)}
              style={{
                width: '100%',
                minHeight: '48px',
                padding: '0 14px',
                borderRadius: 'var(--radius-control)',
                // Sparad är rosé (det som är mitt), osparad är natt: den enda knappen i raden.
                border: 'none',
                backgroundColor: isMyTrip ? 'var(--rose)' : colors.accentStrong,
                color: isMyTrip ? 'var(--rose-ink)' : colors.onAccent,
                fontSize: 'var(--fs-3)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isMyTrip ? `✓ ${t('Min resa', 'My trip')}` : t('Spara som min resa', 'Save as my trip')}
            </button>
          ) : null}
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0 20px', borderTop: `1px solid ${colors.border}` }}>
            <button
              type="button"
              className="tap-44 row-link"
              aria-pressed={isSelectedTrip}
              aria-label={`${isSelectedTrip ? t('Vald resa', 'Selected trip') : t('Jag är ombord', "I'm on board")}: ${line} ${
                direction === 'arrivals' ? t('från', 'from') : t('mot', 'to')
              } ${item.destination} ${item.scheduledTime}`}
              onClick={() => onSelectOnBoard(item)}
              style={rowLink}
            >
              {isSelectedTrip ? `✓ ${t('Vald resa', 'Selected trip')}` : t('Jag är ombord', "I'm on board")}
            </button>
            {showsTrain || showsTrip ? (
              <button
                type="button"
                className="tap-44 row-link"
                onClick={() =>
                  showsTrain
                    ? onShowTrain!(item.trainNumber!)
                    : onShowTrip!({ id: item.tripId!, date: item.tripDate! })
                }
                style={rowLink}
              >
                {t('Hela resan', 'Whole journey')}
              </button>
            ) : null}
          </span>
          {compensation ? (
            <a
              href={compensationLink(item.operator, item.line).url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 'var(--fs-2)', fontWeight: 700, color: colors.amber }}
            >
              {compensationLink(item.operator, item.line).name
                ? t(
                    `Rätt till ersättning? Så söker du hos ${compensationLink(item.operator, item.line).name}`,
                    `Entitled to compensation? How to claim from ${compensationLink(item.operator, item.line).name}`
                  )
                : t('Rätt till ersättning?', 'Entitled to compensation?')}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
