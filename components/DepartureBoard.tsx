import React from 'react';
import type { BoardDirection, BoardSource, Departure } from '../lib/types';
import DepartureRow from './DepartureRow';
import DirectionToggle from './DirectionToggle';
import { colors, emptyState } from './styles';

type Props = {
  stopName: string;
  direction: BoardDirection;
  onDirectionChange: (direction: BoardDirection) => void;
  departures: Departure[];
  loading: boolean;
  errorMsg: string | null;
  updatedAt: Date | null;
  now: number;
  source: BoardSource;
  selectedTripId: string | null;
  onSelectOnBoard: (item: Departure) => void;
};

const STALE_AFTER_MS = 2 * 60_000;

export default function DepartureBoard({
  stopName,
  direction,
  onDirectionChange,
  departures,
  loading,
  errorMsg,
  updatedAt,
  now,
  source,
  selectedTripId,
  onSelectOnBoard,
}: Props) {
  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    : '';
  // Data äldre än så här räknas som inaktuell och visas som en varning.
  const stale = updatedAt ? now - updatedAt.getTime() > STALE_AFTER_MS : false;
  const limited = source === 'resrobot';

  return (
    <section id="avgangstavla" style={{ marginBottom: '36px', scrollMarginTop: '12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ flexBasis: '100%' }}>
          <span style={{ fontSize: '12px', color: colors.textDim, display: 'block' }}>
            {direction === 'arrivals' ? 'Visar ankomster till' : 'Visar avgångar från'}
          </span>
          <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: colors.text }}>
            {stopName}
          </h2>
        </div>

        <DirectionToggle direction={direction} onChange={onDirectionChange} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {updatedAt ? (
            <span
              role={stale ? 'alert' : undefined}
              style={{
                fontSize: '12px',
                fontWeight: stale ? 700 : 400,
                color: stale ? colors.amber : colors.textDim,
              }}
            >
              {stale
                ? `Ej uppdaterad sedan ${updatedLabel}. Försöker igen…`
                : `Uppdaterad ${updatedLabel}`}
            </span>
          ) : null}
          {updatedAt && !stale ? (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                padding: '5px 11px',
                borderRadius: '999px',
                backgroundColor: limited ? colors.delayedBg : colors.okBg,
                border: `1px solid ${limited ? colors.delayedBorder : colors.okBorder}`,
                color: limited ? colors.delayedText : colors.okText,
              }}
            >
              {limited ? 'Begränsad realtid' : 'Realtid från Trafiklab'}
            </span>
          ) : null}
        </div>
      </div>

      {errorMsg ? (
        <div
          style={{
            backgroundColor: colors.errorBg,
            color: colors.errorText,
            padding: '16px',
            borderRadius: '12px',
            fontSize: '14px',
          }}
        >
          {errorMsg}
        </div>
      ) : loading ? (
        <div style={emptyState}>Hämtar tidtabell i realtid...</div>
      ) : departures.length === 0 ? (
        <div style={emptyState}>
          Inga träffar hittades för valt trafikslag på denna station. Prova att välja{' '}
          <strong>Alla</strong> eller byt station.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {departures.map((item) => (
            <DepartureRow
              key={item.id}
              item={item}
              direction={direction}
              now={now}
              isSelectedTrip={selectedTripId === item.id}
              onSelectOnBoard={onSelectOnBoard}
            />
          ))}
        </div>
      )}

      <p style={{ fontSize: '11px', color: colors.textFaint, margin: '12px 0 0 0' }}>
        Trafikdata från{' '}
        <a
          href="https://www.trafiklab.se"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: colors.textDim }}
        >
          Trafiklab.se
        </a>
        , Trafikverket och Västtrafik. Avgångar märkta &quot;tidtabell&quot; saknar
        realtidsdata.
      </p>
    </section>
  );
}
