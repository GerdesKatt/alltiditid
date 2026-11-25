import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardDirection, BoardSource, Departure } from '../lib/types';
import DepartureRow from './DepartureRow';
import LineGroupRow from './LineGroupRow';
import { groupKey } from '../lib/lineFormat';
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
  /** Ingen uppkoppling: tavlan är den som service workern sparade senast. */
  offline: boolean;
  now: number;
  source: BoardSource;
  selectedTripId: string | null;
  onSelectOnBoard: (item: Departure) => void;
  isFavorite: boolean;
  /** Listan är full och hållplatsen är inte sparad: knappen förklarar i stället för att spara. */
  favoritesFull: boolean;
  onToggleFavorite: () => void;
  view: BoardView;
  onViewChange: (view: BoardView) => void;
};

export type BoardView = 'list' | 'lines';

/** Så många rader visas först; "Visa fler" lägger till lika många till. */
const PAGE_SIZE = 20;

const STALE_AFTER_MS = 2 * 60_000;

export default function DepartureBoard({
  stopName,
  direction,
  onDirectionChange,
  departures,
  loading,
  errorMsg,
  updatedAt,
  offline,
  now,
  source,
  selectedTripId,
  onSelectOnBoard,
  isFavorite,
  favoritesFull,
  onToggleFavorite,
  view,
  onViewChange,
}: Props) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Ny hållplats, riktning eller vy: börja om från de första raderna.
  useEffect(() => setLimit(PAGE_SIZE), [stopName, direction, view]);

  const groups = useMemo(() => {
    const map = new Map<string, Departure[]>();
    for (const d of departures) {
      const key = groupKey(d);
      const list = map.get(key);
      if (list) list.push(d);
      else map.set(key, [d]);
    }
    return Array.from(map.values());
  }, [departures]);
  const total = view === 'lines' ? groups.length : departures.length;

  // Skärmläsare: säg bara det som ändrats ("2 försenade"), inte hela tavlan varje minut.
  const [announcement, setAnnouncement] = useState('');
  const lastSummary = useRef('');
  useEffect(() => {
    let summary = '';
    if (errorMsg) summary = `Fel: ${errorMsg}`;
    else if (offline) summary = 'Ingen uppkoppling. Visar senast sparade tavla.';
    else if (!loading && updatedAt) {
      const delayed = departures.filter((d) => d.status === 'delayed').length;
      const cancelled = departures.filter((d) => d.status === 'cancelled').length;
      const parts = [
        delayed ? `${delayed} ${delayed === 1 ? 'försenad' : 'försenade'}` : '',
        cancelled ? `${cancelled} ${cancelled === 1 ? 'inställd' : 'inställda'}` : '',
      ].filter(Boolean);
      summary = `${stopName}: ${parts.length ? parts.join(', ') : 'inga förseningar'}.`;
    }
    if (summary && summary !== lastSummary.current) {
      lastSummary.current = summary;
      setAnnouncement(summary);
    }
  }, [departures, errorMsg, offline, loading, updatedAt, stopName]);
  const hidden = Math.max(0, total - limit);

  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    : '';
  // Data äldre än så här räknas som inaktuell och visas som en varning.
  const stale = updatedAt ? now - updatedAt.getTime() > STALE_AFTER_MS : false;
  const limited = source === 'resrobot';

  return (
    <section id="avgangstavla" style={{ marginBottom: '36px', scrollMarginTop: '12px' }}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
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
        <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '12px', color: colors.textDim, display: 'block' }}>
              {direction === 'arrivals' ? 'Visar ankomster till' : 'Visar avgångar från'}
            </span>
            <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: colors.text }}>
              {stopName}
            </h1>
          </div>
          <button
            type="button"
            aria-pressed={isFavorite}
            disabled={favoritesFull}
            title={favoritesFull ? 'Du kan spara högst 8 hållplatser. Ta bort en först.' : undefined}
            onClick={onToggleFavorite}
            style={{
              flexShrink: 0,
              minHeight: '44px',
              padding: '0 14px',
              borderRadius: '999px',
              border: isFavorite ? `1px solid ${colors.amber}` : `1px solid ${colors.borderStrong}`,
              backgroundColor: colors.surface,
              color: colors.text,
              fontSize: '14px',
              fontWeight: 700,
              cursor: favoritesFull ? 'not-allowed' : 'pointer',
              opacity: favoritesFull ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            <span aria-hidden="true" style={{ color: colors.amber, marginRight: '6px' }}>
              {isFavorite ? '★' : '☆'}
            </span>
            {isFavorite ? 'Sparad' : favoritesFull ? 'Listan full' : 'Spara'}
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <DirectionToggle direction={direction} onChange={onDirectionChange} />
          <div role="group" aria-label="Visning" style={{ display: 'flex', gap: '4px' }}>
            {(
              [
                ['list', 'Lista'],
                ['lines', 'Per linje'],
              ] as const
            ).map(([key, label]) => {
              const active = view === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onViewChange(key)}
                  style={{
                    minHeight: '44px',
                    padding: '0 12px',
                    borderRadius: '10px',
                    border: active ? `1px solid ${colors.accent}` : `1px solid ${colors.borderMuted}`,
                    backgroundColor: active ? colors.accentTint : 'transparent',
                    color: colors.text,
                    fontWeight: active ? 800 : 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {updatedAt ? (
            <span
              role={stale || offline ? 'alert' : undefined}
              style={{
                fontSize: '12px',
                fontWeight: stale || offline ? 700 : 400,
                color: stale || offline ? colors.amber : colors.textDim,
              }}
            >
              {offline
                ? `Ingen uppkoppling. Visar tavlan från ${updatedLabel}.`
                : stale
                ? `Ej uppdaterad sedan ${updatedLabel}. Försöker igen…`
                : `Uppdaterad ${updatedLabel}`}
            </span>
          ) : null}
          {updatedAt && !stale && !offline ? (
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
        <>
          {view === 'lines' ? (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: 0, padding: 0 }}>
              {groups.slice(0, limit).map((items) => (
                <LineGroupRow key={groupKey(items[0])} items={items} direction={direction} now={now} />
              ))}
            </ul>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {departures.slice(0, limit).map((item) => (
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
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
              style={{
                display: 'block',
                width: '100%',
                minHeight: '44px',
                marginTop: '10px',
                borderRadius: '11px',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: colors.surface,
                color: colors.text,
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Visa fler ({hidden} till)
            </button>
          ) : null}
        </>
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
        , Trafikverket, SL och Västtrafik. Avgångar märkta &quot;tidtabell&quot; saknar
        realtidsdata.
      </p>
    </section>
  );
}
