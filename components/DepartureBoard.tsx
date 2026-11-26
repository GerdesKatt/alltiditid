import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardDirection, BoardSource, Departure, Disruption } from '../lib/types';
import DepartureRow from './DepartureRow';
import LineGroupRow from './LineGroupRow';
import DisruptionBox from './DisruptionBox';
import { groupKey } from '../lib/lineFormat';
import DirectionToggle from './DirectionToggle';
import { colors, emptyState } from './styles';
import { isMyTrip, type MyTrip } from '../lib/myTrip';

type Props = {
  stopName: string;
  direction: BoardDirection;
  onDirectionChange: (direction: BoardDirection) => void;
  departures: Departure[];
  disruptions: Disruption[];
  loading: boolean;
  errorMsg: string | null;
  updatedAt: Date | null;
  /** Ingen uppkoppling: tavlan är den som service workern sparade senast. */
  offline: boolean;
  now: number;
  source: BoardSource;
  selectedTripId: string | null;
  onSelectOnBoard: (item: Departure) => void;
  /** Sparad "Min resa" (bara vid avgångar), hållplatsen som visas och växlingen. */
  myTrip: MyTrip | null;
  stopId: string;
  onToggleMyTrip: (item: Departure) => void;
  isFavorite: boolean;
  /** Listan är full och hållplatsen är inte sparad: knappen förklarar i stället för att spara. */
  favoritesFull: boolean;
  onToggleFavorite: () => void;
  /** Öppnar bladet "Om stationen". */
  onOpenStation: () => void;
  /** Öppnar ett tågs hela resa. */
  onShowTrain: (trainNumber: string) => void;
  /** Filtret i sökpanelen, så att en tom tavla kan säga varför. */
  filterText: string;
  onClearFilter: () => void;
  view: BoardView;
  onViewChange: (view: BoardView) => void;
};

export type BoardView = 'list' | 'lines';

/** Så många rader visas först; "Visa fler" lägger till lika många till. */
const PAGE_SIZE = 20;

const STALE_AFTER_MS = 2 * 60_000;
/** Platshållare medan tavlan hämtas, ungefär en skärm. */
const SKELETON_ROWS = 8;

const emptyButton = {
  minHeight: '44px',
  padding: '0 14px',
  borderRadius: 'var(--radius-control)',
  border: `1px solid ${colors.borderStrong}`,
  backgroundColor: colors.surface,
  color: colors.text,
  fontSize: '0.875rem',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

export default function DepartureBoard({
  stopName,
  direction,
  onDirectionChange,
  departures,
  disruptions,
  loading,
  errorMsg,
  updatedAt,
  offline,
  now,
  source,
  selectedTripId,
  onSelectOnBoard,
  myTrip,
  stopId,
  onToggleMyTrip,
  isFavorite,
  favoritesFull,
  onToggleFavorite,
  onOpenStation,
  onShowTrain,
  filterText,
  onClearFilter,
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
        <div style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px' }}>
          <div style={{ flex: '1 1 7rem', minWidth: 0 }}>
            <span style={{ fontSize: '0.8125rem', color: colors.textDim, display: 'block' }}>
              {direction === 'arrivals' ? 'Visar ankomster till' : 'Visar avgångar från'}
            </span>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 800, margin: 0, color: colors.text, overflowWrap: 'anywhere' }}>
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
              borderRadius: 'var(--radius-control)',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: colors.surface,
              color: colors.text,
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: favoritesFull ? 'not-allowed' : 'pointer',
              opacity: favoritesFull ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            <span aria-hidden="true" style={{ color: colors.brand, marginRight: '6px' }}>
              {isFavorite ? '★' : '☆'}
            </span>
            {isFavorite ? 'Sparad' : favoritesFull ? 'Listan full' : 'Spara'}
          </button>
          <button
            type="button"
            onClick={onOpenStation}
            style={{
              flexShrink: 0,
              minHeight: '44px',
              minWidth: '44px',
              padding: '0 12px',
              borderRadius: 'var(--radius-control)',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: colors.surface,
              color: colors.text,
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
Stationen
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <DirectionToggle direction={direction} onChange={onDirectionChange} />
          {/* C2: ett enda av/på-val i stället för en egen rad med Lista/Per linje. */}
          <button
            type="button"
            aria-pressed={view === 'lines'}
            onClick={() => onViewChange(view === 'lines' ? 'list' : 'lines')}
            style={{
              minHeight: '44px',
              padding: '0 12px',
              borderRadius: '10px',
              border: view === 'lines' ? `1px solid ${colors.accent}` : `1px solid ${colors.borderMuted}`,
              backgroundColor: view === 'lines' ? colors.accentTint : 'transparent',
              color: colors.text,
              fontWeight: view === 'lines' ? 800 : 600,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {view === 'lines' ? '✓ ' : ''}Per linje
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {updatedAt && !stale && !offline ? (
            <span style={{ fontSize: '0.8125rem', color: colors.textDim }}>{`Uppdaterad ${updatedLabel}`}</span>
          ) : null}
          {updatedAt && !stale && !offline ? (
            // Ingen färgad bricka: bara avvikelser får färg. Pricken betyder realtid.
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: limited ? colors.amber : colors.textDim,
              }}
            >
              {limited ? null : <span className="rt-dot" aria-hidden="true" />}
              {limited ? 'Begränsad realtid' : 'Realtid'}
            </span>
          ) : null}
        </div>
      </div>

      {updatedAt && (stale || offline) ? (
        // Gamla tider ska inte gå att missa: en stressad resenär läser inte grå småtext.
        <div
          role="alert"
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
            marginBottom: '12px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-card)',
            border: `2px solid ${colors.amber}`,
            backgroundColor: colors.noticeBg,
            color: colors.noticeText,
            fontSize: '0.9375rem',
            lineHeight: 1.4,
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span>
            <strong style={{ display: 'block' }}>
              {offline ? 'Ingen anslutning' : 'Tavlan uppdateras inte just nu'}
            </strong>
            Tiderna är från {updatedLabel} och kan ha ändrats. Försöker igen…
          </span>
        </div>
      ) : null}

      {!errorMsg ? <DisruptionBox disruptions={disruptions} /> : null}

      {errorMsg ? (
        <div
          style={{
            backgroundColor: colors.errorBg,
            color: colors.errorText,
            padding: '16px',
            borderRadius: '12px',
            fontSize: '0.875rem',
          }}
        >
          {errorMsg}
        </div>
      ) : loading ? (
        <div role="status" aria-label="Hämtar tidtabell i realtid" style={{ display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-card)', border: `1px solid ${colors.border}`, borderBottom: 'none', overflow: 'hidden', margin: 0, padding: 0 }}>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="skeleton-row"
              style={{
                minHeight: '64px',
                borderBottom: `1px solid ${colors.border}`,
                backgroundColor: colors.surface,
              }}
            />
          ))}
        </div>
      ) : departures.length === 0 ? (
        <div style={emptyState}>
          {filterText.trim() ? (
            <>
              Inga avgångar här matchar <strong>{filterText.trim()}</strong>.
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '10px' }}>
                {/^\d{2,5}$/.test(filterText.trim()) ? (
                  <button type="button" onClick={() => onShowTrain(filterText.trim())} style={emptyButton}>
                    Visa tåg {filterText.trim()}, var det än är
                  </button>
                ) : null}
                <button type="button" onClick={onClearFilter} style={emptyButton}>
                  Rensa filtret
                </button>
              </span>
            </>
          ) : (
            <>
              Inga träffar hittades för valt trafikslag på denna station. Prova att välja <strong>Alla</strong> eller
              byt station.
            </>
          )}
        </div>
      ) : (
        <>
          {view === 'lines' ? (
            <ul style={{ display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-card)', border: `1px solid ${colors.border}`, borderBottom: 'none', overflow: 'hidden', margin: 0, padding: 0 }}>
              {groups.slice(0, limit).map((items) => (
                <LineGroupRow key={groupKey(items[0])} items={items} direction={direction} now={now} />
              ))}
            </ul>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-card)', border: `1px solid ${colors.border}`, borderBottom: 'none', overflow: 'hidden', margin: 0, padding: 0 }}>
              {departures.slice(0, limit).map((item) => (
                <DepartureRow
                  key={item.id}
                  item={item}
                  direction={direction}
                  now={now}
                  isSelectedTrip={selectedTripId === item.id}
                  onSelectOnBoard={onSelectOnBoard}
                  isMyTrip={isMyTrip(myTrip, item, stopId)}
                  onToggleMyTrip={direction === 'departures' ? onToggleMyTrip : undefined}
                  onShowTrain={onShowTrain}
                  stale={stale || offline}
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
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Visa fler ({hidden} till)
            </button>
          ) : null}
        </>
      )}

      <p style={{ fontSize: '0.8125rem', color: colors.textFaint, margin: '12px 0 0 0' }}>
        Trafikdata från{' '}
        <a
          href="https://www.trafiklab.se"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: colors.textDim }}
        >
          Trafiklab.se
        </a>
        , Trafikverket, SL och Västtrafik. Hallonpricken betyder realtid. Tider med ~ och
        &quot;ingen realtid&quot; kommer från tidtabellen.
      </p>
    </section>
  );
}
