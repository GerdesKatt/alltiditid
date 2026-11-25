import React, { useState } from 'react';
import type { BoardDirection, Departure } from '../lib/types';
import { colors } from './styles';
import { COUNTDOWN_MAX_MIN, lineBadge, lineName, parseLocal } from '../lib/lineFormat';

type Props = {
  item: Departure;
  direction: BoardDirection;
  now: number;
  isSelectedTrip: boolean;
  onSelectOnBoard: (item: Departure) => void;
};

/** Från så här många minuters försening visas en länk om reseersättning. */
const COMPENSATION_DELAY_MIN = 20;

/**
 * En avgång. Störst är hur länge det är kvar ("3 min"), sedan destination och linje.
 * Avvikelser (försenad, inställd, bara tidtabell) syns; "i tid" behöver inget märke.
 * Ett tryck på raden visar mer: operatör, "Jag är ombord" och ersättning.
 */
export default function DepartureRow({ item, direction, now, isSelectedTrip, onSelectOnBoard }: Props) {
  const [open, setOpen] = useState(false);
  const isDelayed = item.status === 'delayed';
  const isCancelled = item.status === 'cancelled';
  const onlySchedule = !isCancelled && !isDelayed && item.hasRealtime === false;
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

  const shownBig = booked ? item.scheduledTime : bigTime;
  const timeColor = isCancelled
    ? colors.cancelledText
    : isDelayed && booked
    ? colors.text // den ordinarie tiden står kvar; "Ny tid" är orange under
    : isDelayed
    ? colors.amber
    : onlySchedule
    ? colors.textDim
    : colors.text;

  // Hela raden läses upp som en mening, t.ex. "Buss 160 mot Årstaberg, 3 min, Läge J".
  const spoken = `${item.line} ${direction === 'arrivals' ? 'från' : 'mot'} ${item.destination}, ${
    isCancelled
      ? `inställd, ordinarie tid ${item.scheduledTime}`
      : isDelayed
      ? `försenad${item.delayMinutes ? ` ${item.delayMinutes} min` : ''}, ny tid ${newTime}, ordinarie ${item.scheduledTime}`
      : `${
          booked
            ? `avgår ${item.scheduledTime}${countdown ? `, ${countdown}` : ''}`
            : `${bigTime === 'Nu' ? 'avgår nu' : bigTime}, ordinarie ${item.scheduledTime}`
        }${shifted && !early ? `, väntas ${clock}` : ''}${early ? `, ${early} min tidig, väntas ${clock}` : ''}${
          onlySchedule ? ', enligt tidtabell' : ''
        }`
  }${details ? `, ${details}` : ''}${item.deviation ? `, ${item.deviation}` : ''}`;

  return (
    <div
      style={{
        backgroundColor: isSelectedTrip ? colors.selectedRowBg : colors.surface,
        border: isSelectedTrip ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
        borderRadius: '13px',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={spoken}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
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
          aria-hidden="true"
          style={{
            flexShrink: 0,
            minWidth: '44px',
            padding: '4px 6px',
            borderRadius: '8px',
            border: `1px solid ${colors.accent}`,
            backgroundColor: colors.accentTint,
            color: colors.text,
            fontWeight: 800,
            fontSize: '14px',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {badge}
        </span>

        {/* Destination och detaljer */}
        <span aria-hidden="true" style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: '16px',
              fontWeight: 700,
              color: colors.text,
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
              fontSize: '12px',
              color: colors.textDim,
              marginTop: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {[name, details].filter(Boolean).join(' · ')}
            {item.deviation ? (
              <span style={{ color: colors.amber, fontWeight: 600 }}>
                {name || details ? ' · ' : ''}
                {item.deviation}
              </span>
            ) : null}
          </span>
        </span>

        {/* Tid: minuter kvar störst */}
        <span aria-hidden="true" style={{ flexShrink: 0, textAlign: 'right' }}>
          <span
            style={{
              display: 'block',
              fontSize: '20px',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: timeColor,
              textDecoration: isCancelled ? 'line-through' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {shownBig}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: isCancelled ? colors.cancelledText : isDelayed ? colors.amber : colors.textDim,
              whiteSpace: 'nowrap',
            }}
          >
            {isCancelled ? (
              'Inställd'
            ) : booked ? (
              // Bokat tåg: ordinarie tid står stort ovanför.
              <>
                {isDelayed ? `Ny tid ${newTime}${item.delayMinutes ? ` +${item.delayMinutes}` : ''}` : ''}
                {early ? <span style={{ color: colors.okText }}>{`${clock} · ${early} min tidig`}</span> : ''}
                {(isDelayed || early) && countdown ? ' · ' : ''}
                {countdown}
                {onlySchedule ? `${countdown ? ' · ' : ''}tidtabell` : ''}
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
              onlySchedule ? 'tidtabell' : null
            ) : (
              <>
                {item.scheduledTime}
                {shifted ? ` → ${clock}` : ''}
                {onlySchedule ? ' · tidtabell' : ''}
              </>
            )}
          </span>
        </span>
      </button>

      {open ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px',
            padding: '0 14px 12px 70px',
            fontSize: '13px',
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
              borderRadius: '8px',
              border: isSelectedTrip ? `1px solid ${colors.accent}` : `1px solid ${colors.borderStrong}`,
              backgroundColor: isSelectedTrip ? colors.accentStrong : colors.surfaceRaised,
              color: isSelectedTrip ? colors.onAccent : colors.text,
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isSelectedTrip ? 'Vald resa' : 'Jag är ombord'}
          </button>
          {compensation ? (
            <a
              href="https://www.hallakonsument.se/varor-och-tjanster/resor/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '13px', fontWeight: 600, color: colors.amber }}
            >
              Rätt till ersättning?
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
