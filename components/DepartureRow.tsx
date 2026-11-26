import React, { useState } from 'react';
import type { BoardDirection, Departure } from '../lib/types';
import { colors, fonts } from './styles';
import { COUNTDOWN_MAX_MIN, lineBadge, lineName, parseLocal } from '../lib/lineFormat';

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
  /** Tavlan är gammal (ingen anslutning): pricken släcks och tiderna tonas ned. */
  stale?: boolean;
};

/** Från så här många minuters försening visas en länk om reseersättning. */
const COMPENSATION_DELAY_MIN = 20;

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
  stale = false,
}: Props) {
  const [open, setOpen] = useState(false);
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
    ? 'Nu'
    : `${minutesLeft} min`;
  // Bokade tåg (fjärr- och regionaltåg) visas som på stationsskylten och biljetten:
  // ordinarie avgångstid stort, nedräkningen smått. Lokaltrafik tvärtom.
  const booked = item.transportMode === 'train';
  const countdown =
    minutesLeft === null || minutesLeft >= COUNTDOWN_MAX_MIN ? '' : minutesLeft <= 0 ? 'nu' : `om ${minutesLeft} min`;
  // Ordinarie tid → väntad tid, när de skiljer sig (t.ex. en buss 2 min sen: "18:35 → 18:37").
  const shifted = !isCancelled && !isDelayed && clock !== item.scheduledTime;

  const badge = lineBadge(item.line);
  const name = lineName(item.line, badge);
  const towards = direction === 'arrivals' ? `Från ${item.destination}` : item.destination;
  const details = [item.stopLabel, item.track].filter(Boolean).join(' · ');
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
  const spokenExtra = `${item.line}, ${
    isCancelled
      ? `inställd, ordinarie tid ${item.scheduledTime}`
      : isDelayed
      ? `försenad${item.delayMinutes ? ` ${item.delayMinutes} min` : ''}, ny tid ${newTime}, ordinarie ${item.scheduledTime}`
      : `${
          booked
            ? countdown || 'ordinarie avgångstid'
            : `ordinarie ${item.scheduledTime}`
        }${shifted && !early ? `, väntas ${clock}` : ''}${early ? `, ${early} min tidig, väntas ${clock}` : ''}${
          onlySchedule ? ', enligt tidtabell' : ''
        }`
  }`;

  return (
    <div
      style={{
        backgroundColor: isSelectedTrip ? colors.selectedRowBg : colors.surface,
        border: isSelectedTrip ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
            // Bokade tåg har kontur, inställda är grå, övriga fyllda i bläck.
            border: `1.5px solid ${isCancelled ? colors.borderStrong : colors.badgeBg}`,
            backgroundColor: isCancelled ? colors.surfaceRaised : booked ? 'transparent' : colors.badgeBg,
            color: isCancelled ? colors.textDim : booked ? colors.text : colors.badgeText,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: '0.875rem',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {badge}
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
              'Inställd'
            ) : item.pending ? (
              <span style={{ color: colors.amber, fontWeight: 600 }}>Står kvar</span>
            ) : booked ? (
              // Bokat tåg: ordinarie tid står stort ovanför.
              <>
                {lateBooked ? (
                  <span style={{ fontWeight: 700 }}>{item.delayMinutes ? `+${item.delayMinutes} min` : 'Ny tid'}</span>
                ) : isDelayed ? (
                  'Försenad'
                ) : (
                  ''
                )}
                {early ? <span style={{ color: colors.okText }}>{`${clock} · ${early} min tidig`}</span> : ''}
                {early && countdown ? ' · ' : ''}
                {isDelayed ? '' : countdown}
                {onlySchedule ? `${countdown ? ' · ' : ''}ingen realtid` : ''}
              </>
            ) : isDelayed ? (
              <>
                <s style={{ color: colors.textFaint }}>{item.scheduledTime}</s> {newTime}
                {item.delayMinutes ? ` +${item.delayMinutes}` : ''}
              </>
            ) : early ? (
              <span style={{ color: colors.okText }}>
                {item.scheduledTime} → {clock} · {early} min tidig
              </span>
            ) : bigTime === clock ? (
              // Långt fram står klockslaget redan stort.
              onlySchedule ? 'ingen realtid' : null
            ) : (
              <>
                {item.scheduledTime}
                {shifted ? ` → ${clock}` : ''}
                {onlySchedule ? ' · ingen realtid' : ''}
              </>
            )}
          </span>
        </span>
        <span className="sr-only">, {spokenExtra}</span>
      </button>

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
            {item.line} · {item.operator}
            {onlySchedule ? ' · Realtid kommer när avgången närmar sig.' : ''}
          </span>
          <button
            type="button"
            aria-pressed={isSelectedTrip}
            aria-label={`${isSelectedTrip ? 'Vald resa' : 'Jag är ombord'}: ${item.line} ${
              direction === 'arrivals' ? 'från' : 'mot'
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
            {isSelectedTrip ? 'Vald resa' : 'Jag är ombord'}
          </button>
          {onShowTrain && item.trainNumber && (item.transportMode === 'train' || item.transportMode === 'commuter') ? (
            <button
              type="button"
              onClick={() => onShowTrain(item.trainNumber!)}
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
              Hela resan
            </button>
          ) : null}
          {onToggleMyTrip ? (
            <button
              type="button"
              aria-pressed={isMyTrip}
              aria-label={`${isMyTrip ? 'Min resa' : 'Spara som min resa'}: ${item.line} mot ${item.destination}`}
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
              {isMyTrip ? '✓ Min resa' : 'Spara som min resa'}
            </button>
          ) : null}
          {compensation ? (
            <a
              href="https://www.hallakonsument.se/varor-och-tjanster/resor/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.amber }}
            >
              Rätt till ersättning?
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
