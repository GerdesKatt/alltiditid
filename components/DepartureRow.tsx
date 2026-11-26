import React, { useState } from 'react';
import type { BoardDirection, Departure } from '../lib/types';
import { COMPENSATION_DELAY_MIN } from '../lib/byte';
import { compensationLink } from '../lib/compensation';
import Icon from './Icon';
import { colors, fonts } from './styles';
import { COUNTDOWN_MAX_MIN, lineBadge, lineColor, lineName, parseLocal } from '../lib/lineFormat';
import { lineLabel, trackLabel, useLang } from '../lib/i18n';
import { platformMinutes, walkVerdict } from '../lib/walk.mjs';

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
  now,
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
}: Props) {
  const [open, setOpen] = useState(false);
  const { lang, t } = useLang();
  const line = lineLabel(item.line, lang);
  const isDelayed = item.status === 'delayed';
  const isCancelled = item.status === 'cancelled';
  const onlySchedule = !isCancelled && !isDelayed && item.hasRealtime === false;
  // Hallonpricken betyder realtid (brand guiden). Ingen prick: tidtabell eller okänt.
  const realtime = !stale && !isCancelled && item.hasRealtime === true;
  const newTime = isDelayed ? item.newTime || item.estimatedTime : '';
  // Väntad klocktid: ny tid om försenad, annars prognosen (kan vara en minut eller två från tidtabellen).
  const clock = newTime || (!isCancelled && item.estimatedTime) || item.scheduledTime;
  const early = !isCancelled && !isDelayed ? item.earlyMinutes || 0 : 0;

  const expected = parseLocal(item.expectedAt);
  const minutesLeft = expected !== null ? Math.floor((expected - now) / 60000) : null;
  const bigTime = isCancelled
    ? item.scheduledTime
    : minutesLeft === null || minutesLeft >= COUNTDOWN_MAX_MIN
    ? clock
    : minutesLeft <= 0
    ? t('Nu', 'Now')
    : `${minutesLeft} min`;
  // Bokade tåg (fjärr- och regionaltåg) visas som på stationsskylten och biljetten:
  // ordinarie avgångstid stort, nedräkningen smått. Lokaltrafik tvärtom.
  const booked = item.transportMode === 'train';
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
  const tint = lineColor(item);
  const name = lineLabel(lineName(item.line, badge), lang);
  const towards = direction === 'arrivals' ? `${t('Från', 'From')} ${item.destination}` : item.destination;
  const details = [item.stopLabel, trackLabel(item.track, lang)].filter(Boolean).join(' · ');
  const compensation =
    isCancelled || (isDelayed && (item.delayMinutes || 0) >= COMPENSATION_DELAY_MIN);

  // Tidtabellstider är ungefärliga: "~12 min".
  const shownBig = booked
    ? item.scheduledTime
    : onlySchedule && /min$/.test(bigTime)
    ? `~${bigTime}`
    : bigTime;
  // Sent bokat tåg med känd ny tid som skiljer sig från den ordinarie.
  const lateBooked = booked && isDelayed && !!newTime && newTime !== item.scheduledTime;
  const timeColor = isCancelled
    ? colors.textDim
    : isDelayed && booked
    ? colors.text // den ordinarie tiden står kvar; "Ny tid" är orange under
    : isDelayed
    ? colors.amber
    : onlySchedule || stale
    ? colors.textDim
    : colors.text;

  // Knappens namn är det som syns på raden (så att röststyrning hittar den, WCAG 2.5.3),
  // följt av en dold förklaring för skärmläsare, t.ex. "Buss 160, ordinarie 14:05".
  const spokenExtra = `${line}, ${
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

  return (
    <div
      style={{
        // En rad i listan: tunn avdelare i stället för ett eget kort.
        backgroundColor: isSelectedTrip ? colors.selectedRowBg : colors.surface,
        borderBottom: `1px solid ${colors.border}`,
        boxShadow: isSelectedTrip ? `inset 4px 0 0 ${colors.accent}` : 'none',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
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
            minWidth: '44px',
            padding: '4px 6px',
            boxSizing: 'border-box',
            borderRadius: 'var(--radius-badge)',
            // Kontur i bläck; inställda är grå. Bokade tåg har streckad kontur.
            border: `1.5px ${booked ? 'dashed' : 'solid'} ${isCancelled ? colors.borderStrong : colors.badgeBorder}`,
            // Linjens färg (tunnelbana, pendeltåg) som en kant i brickan, för igenkänningen.
            boxShadow: tint && !isCancelled ? `inset 5px 0 0 ${tint}` : 'none',
            paddingLeft: tint && !isCancelled ? '10px' : '6px',
            backgroundColor: isCancelled ? colors.surfaceRaised : colors.badgeBg,
            color: isCancelled ? colors.textDim : colors.badgeText,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: '0.875rem',
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
              display: 'block',
              fontSize: '1rem',
              fontWeight: 700,
              color: isCancelled ? colors.textDim : colors.text,
              textDecoration: isCancelled ? 'line-through' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {towards}
          </span>
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
            {[name, details].filter(Boolean).join(' · ')}
            {item.deviation && !(isCancelled && item.deviation === 'Inställd') ? (
              <span style={{ color: colors.amber, fontWeight: 600 }}>
                {name || details ? ' · ' : ''}
                {item.deviation}
              </span>
            ) : null}
          </span>
        </span>

        {/* Tid: minuter kvar störst */}
        <span style={{ flexShrink: 0, marginLeft: 'auto', textAlign: 'right' }}>
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: '1.375rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
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
            {realtime ? <span key={item.expectedAt} className="rt-dot" aria-hidden="true" /> : null}
            {lateBooked ? (
              // Sent bokat tåg: ordinarie tid står kvar överstruken, den nya tiden är lika stor.
              <>
                <s style={{ color: colors.textDim, fontWeight: 600 }}>{item.scheduledTime}</s>
                <span style={{ color: colors.amber }}>{newTime}</span>
              </>
            ) : (
              shownBig
            )}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
              color: isCancelled ? colors.cancelledText : isDelayed ? colors.amber : colors.textDim,
              whiteSpace: 'nowrap',
            }}
          >
            {isCancelled ? (
              t('Inställd', 'Cancelled')
            ) : item.pending ? (
              <span style={{ color: colors.amber, fontWeight: 600 }}>{t('Står kvar', 'Still at platform')}</span>
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
                {isDelayed ? '' : countdown}
                {onlySchedule ? `${countdown ? ' · ' : ''}${t('ingen realtid', 'no real-time')}` : ''}
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
              onlySchedule ? t('ingen realtid', 'no real-time') : null
            ) : (
              <>
                {item.scheduledTime}
                {shifted ? ` → ${clock}` : ''}
                {onlySchedule ? ` · ${t('ingen realtid', 'no real-time')}` : ''}
              </>
            )}
          </span>
        </span>
        <span className="sr-only">
          , {spokenExtra}
          {walkText ? `, ${t('gångtid', 'walking')}: ${walkText}` : ''}
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
            fontSize: '0.875rem',
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
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px',
            padding: '0 14px 12px 70px',
            fontSize: '0.8125rem',
            color: colors.textDim,
          }}
        >
          <span style={{ flexBasis: '100%' }}>
            {line} · {item.operator}
            {onlySchedule ? t(' · Realtid kommer när avgången närmar sig.', ' · Real-time appears as departure approaches.') : ''}
          </span>
          <button
            type="button"
            aria-pressed={isSelectedTrip}
            aria-label={`${isSelectedTrip ? t('Vald resa', 'Selected trip') : t('Jag är ombord', "I'm on board")}: ${line} ${
              direction === 'arrivals' ? t('från', 'from') : t('mot', 'to')
            } ${item.destination} ${item.scheduledTime}`}
            onClick={() => onSelectOnBoard(item)}
            style={{
              minHeight: '44px',
              padding: '0 14px',
              borderRadius: 'var(--radius-control)',
              border: isSelectedTrip ? `1px solid ${colors.accentStrong}` : `1px solid ${colors.borderStrong}`,
              backgroundColor: isSelectedTrip ? colors.accentStrong : colors.surfaceRaised,
              color: isSelectedTrip ? colors.onAccent : colors.text,
              fontSize: '0.8125rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isSelectedTrip ? t('Vald resa', 'Selected trip') : t('Jag är ombord', "I'm on board")}
          </button>
          {showsTrain || showsTrip ? (
            <button
              type="button"
              onClick={() =>
                showsTrain
                  ? onShowTrain!(item.trainNumber!)
                  : onShowTrip!({ id: item.tripId!, date: item.tripDate! })
              }
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
              {t('Hela resan', 'Whole journey')}
            </button>
          ) : null}
          {onToggleMyTrip ? (
            <button
              type="button"
              aria-pressed={isMyTrip}
              aria-label={`${isMyTrip ? t('Min resa', 'My trip') : t('Spara som min resa', 'Save as my trip')}: ${line} ${t(
                'mot',
                'to'
              )} ${item.destination}`}
              onClick={() => onToggleMyTrip(item)}
              style={{
                minHeight: '44px',
                padding: '0 14px',
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${isMyTrip ? colors.accentStrong : colors.borderStrong}`,
                backgroundColor: isMyTrip ? colors.accentStrong : colors.surface,
                color: isMyTrip ? colors.onAccent : colors.text,
                fontSize: '0.8125rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isMyTrip ? `✓ ${t('Min resa', 'My trip')}` : t('Spara som min resa', 'Save as my trip')}
            </button>
          ) : null}
          {compensation ? (
            <a
              href={compensationLink(item.operator, item.line).url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.amber }}
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
