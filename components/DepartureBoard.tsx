import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardDirection, BoardSource, Departure, Disruption, TransportMode } from '../lib/types';
import DepartureRow from './DepartureRow';
import LineGroupRow from './LineGroupRow';
import DisruptionBox from './DisruptionBox';
import WalkBar from './WalkBar';
import FindTrip from './FindTrip';
import FallbackRow from './FallbackRow';
import WaitTrivia from './WaitTrivia';
import { sparseBoard } from '../lib/mobility.mjs';
import type { Walk } from '../lib/useWalk';
import { platformMinutes, walkVerdict } from '../lib/walk.mjs';
import { parseLocal } from '../lib/lineFormat';
import { groupKey } from '../lib/lineFormat';
import { alternativeFor } from '../lib/alternative.mjs';
import { colors, emptyState } from './styles';
import { isMyTrip, type MyTrip } from '../lib/myTrip';
import { modeLabel, useLang } from '../lib/i18n';

type Props = {
  stopName: string;
  direction: BoardDirection;
  onDirectionChange: (direction: BoardDirection) => void;
  /** Trafikslagen som går från hållplatsen (svenska etiketter), och det valda. */
  modes: { key: TransportMode; label: string }[];
  mode: TransportMode;
  onModeChange: (mode: TransportMode) => void;
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
  onShowTrip: (trip: { id: string; date: string }) => void;
  /** Filtret i sökpanelen, så att en tom tavla kan säga varför. */
  filterText: string;
  onClearFilter: () => void;
  view: BoardView;
  onViewChange: (view: BoardView) => void;
  /** En rad fälldes ut (för "Brukar du ta …?"). */
  onRowOpen?: (item: Departure) => void;
  /** Gångtiden till hållplatsen (App äger den, så att Din avgång också kan säga Gå nu). */
  walk: Walk;
  /** Hållplatsens läge från tavlans svar, för raden "Annat sätt härifrån". */
  stopCoords: { lat: number; lon: number } | null;
};

export type BoardView = 'list' | 'lines';

/** Så många rader visas först; "Visa fler" lägger till lika många till. */
const PAGE_SIZE = 20;

const STALE_AFTER_MS = 2 * 60_000;
/** "När du väntar" visas när nästa avgång dröjer mer än så här många minuter. */
const WAIT_TRIVIA_AFTER_MIN = 15;
/** Platshållare medan tavlan hämtas, ungefär en skärm. */
const SKELETON_ROWS = 8;

/**
 * Tavlans lista. På bred skärm läggs raderna i två kolumner (globals.css, .board-list):
 * först nedåt i vänster kolumn, sedan höger, så att tidsordningen behålls.
 */
function listStyle(count: number): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    // En lista med linjer emellan, inga rutor: bara en linje överst.
    borderTop: `1px solid ${colors.text}`,
    overflow: 'hidden',
    margin: 0,
    padding: 0,
    ['--rows' as string]: Math.ceil(count / 2),
  };
}

const iconButton = {
  flexShrink: 0,
  width: '44px',
  height: '44px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: 'var(--radius-control)',
  border: `1px solid ${colors.borderStrong}`,
  backgroundColor: colors.surface,
  color: colors.text,
  cursor: 'pointer',
} as const;

const menuItem = {
  display: 'block',
  width: '100%',
  minHeight: '44px',
  padding: '0 12px',
  border: 'none',
  borderRadius: 'var(--radius-control)',
  background: 'none',
  color: colors.text,
  fontFamily: 'inherit',
  fontSize: '0.9375rem',
  fontWeight: 600,
  textAlign: 'left',
  cursor: 'pointer',
} as const;

const chipOff = {
  minHeight: '32px',
  marginLeft: '4px',
  padding: '0 10px',
  borderRadius: 'var(--radius-control)',
  border: `1px solid ${colors.borderStrong}`,
  backgroundColor: 'transparent',
  color: colors.text,
  fontFamily: 'inherit',
  fontSize: '0.75rem',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

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
  modes,
  mode,
  onModeChange,
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
  onShowTrip,
  filterText,
  onClearFilter,
  view,
  onViewChange,
  onRowOpen,
  walk,
  stopCoords,
}: Props) {
  const { lang, t } = useLang();
  const walkMin = direction === 'departures' && walk.state.kind === 'ready' ? walk.state.minutes : null;
  // Gångbeskedet visas bara på den första avgången man hinner till, så att tavlan inte blir rörig.
  const walkTargetId = useMemo(() => {
    if (walkMin === null) return null;
    const hit = departures.find((d) => {
      const expected = parseLocal(d.expectedAt);
      if (d.status === 'cancelled' || d.pending || expected === null) return false;
      const minutesLeft = Math.floor((expected - now) / 60000);
      return walkVerdict(minutesLeft, walkMin, platformMinutes(d.transportMode)).kind !== 'missed';
    });
    return hit ? hit.id : null;
  }, [departures, walkMin, now]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Menyn med det man gör ibland: ankomster, per linje, stationen.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  // Inställda avgångar: nästa som tar en dit i stället.
  const alternatives = useMemo(() => {
    const map = new Map<string, Departure>();
    for (const d of departures) {
      if (d.status !== 'cancelled') continue;
      const alt = alternativeFor(d, departures);
      if (alt) map.set(d.id, alt);
    }
    return map;
  }, [departures]);
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
    if (errorMsg) summary = `${t('Fel', 'Error')}: ${errorMsg}`;
    else if (offline) summary = t('Ingen uppkoppling. Visar senast sparade tavla.', 'No connection. Showing the last saved board.');
    else if (!loading && updatedAt) {
      const delayed = departures.filter((d) => d.status === 'delayed').length;
      const cancelled = departures.filter((d) => d.status === 'cancelled').length;
      const parts = [
        delayed ? `${delayed} ${delayed === 1 ? t('försenad', 'delayed') : t('försenade', 'delayed')}` : '',
        cancelled ? `${cancelled} ${cancelled === 1 ? t('inställd', 'cancelled') : t('inställda', 'cancelled')}` : '',
      ].filter(Boolean);
      summary = `${stopName}: ${parts.length ? parts.join(', ') : t('inga förseningar', 'no delays')}.`;
    }
    if (summary && summary !== lastSummary.current) {
      lastSummary.current = summary;
      setAnnouncement(summary);
    }
  }, [departures, errorMsg, offline, loading, updatedAt, stopName, lang]);
  const hidden = Math.max(0, total - limit);


  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })
    : '';
  // Data äldre än så här räknas som inaktuell och visas som en varning.
  const stale = updatedAt ? now - updatedAt.getTime() > STALE_AFTER_MS : false;
  // Hur gammal den visade tavlan är, i hela minuter (minst 1).
  const ageMin = updatedAt ? Math.max(1, Math.floor((now - updatedAt.getTime()) / 60000)) : 0;
  const limited = source === 'resrobot';

  // Glest just nu (nästa avgång om mer än 20 min, eller inga alls): visa taxi och lånecykel.
  // Bara för avgångar, utan filter och när tavlan är färsk, så att vanliga tavlor står lugna.
  const sparse =
    direction === 'departures' && !loading && !errorMsg && !stale && !offline && updatedAt && !filterText.trim()
      ? sparseBoard(departures, now, parseLocal)
      : null;
  // Glest men under taxigränsen, eller över den: "När du väntar" efter 15 minuter.
  const waiting =
    direction === 'departures' && !loading && !errorMsg && !stale && !offline && updatedAt && !filterText.trim()
      ? sparseBoard(departures, now, parseLocal, WAIT_TRIVIA_AFTER_MIN)
      : null;
  const fallback =
    sparse || waiting?.kind === 'wait' ? (
      <>
        {sparse ? <FallbackRow stopId={stopId} stopName={stopName} coords={stopCoords} sparse={sparse} /> : null}
        {waiting?.kind === 'wait' ? (
          <WaitTrivia stopName={stopName} coords={stopCoords} onOpen={onOpenStation} first={!sparse} />
        ) : null}
      </>
    ) : null;

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
        <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: colors.textDim,
              }}
            >
              {direction === 'arrivals' ? t('Ankomster till', 'Arrivals at') : t('Avgångar från', 'Departures from')}
            </span>
            <h1 style={{ fontSize: stopName.length > 16 ? 'clamp(1.5rem, 6.5vw, 2rem)' : 'clamp(2rem, 9vw, 2.75rem)', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.045em', margin: 0, color: colors.text, overflowWrap: 'anywhere' }}>
              {stopName}
            </h1>
          </div>
          <button
            type="button"
            aria-pressed={isFavorite}
            aria-label={
              isFavorite
                ? t(`${stopName} är sparad`, `${stopName} is saved`)
                : favoritesFull
                ? t('Listan är full', 'The list is full')
                : t(`Spara ${stopName}`, `Save ${stopName}`)
            }
            disabled={favoritesFull}
            title={
              favoritesFull
                ? t('Du kan spara högst 8 hållplatser. Ta bort en först.', 'You can save at most 8 stops. Remove one first.')
                : isFavorite
                ? t('Sparad', 'Saved')
                : t('Spara', 'Save')
            }
            onClick={onToggleFavorite}
            style={{ ...iconButton, cursor: favoritesFull ? 'not-allowed' : 'pointer', opacity: favoritesFull ? 0.6 : 1 }}
          >
            <span aria-hidden="true" style={{ fontSize: '1.125rem', lineHeight: 1, color: colors.brand }}>
              {isFavorite ? '★' : '☆'}
            </span>
          </button>
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t('Mer', 'More')}
              title={t('Ankomster, per linje, stationen', 'Arrivals, by line, station')}
              onClick={() => setMenuOpen((v) => !v)}
              style={iconButton}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.9" />
                <circle cx="12" cy="12" r="1.9" />
                <circle cx="19" cy="12" r="1.9" />
              </svg>
            </button>
            {menuOpen ? (
              <div
                role="menu"
                aria-label={t('Mer', 'More')}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 30,
                  minWidth: '13rem',
                  padding: '4px',
                  borderRadius: 'var(--radius-card)',
                  border: `1px solid ${colors.borderStrong}`,
                  backgroundColor: colors.surface,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
                }}
              >
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={direction === 'arrivals'}
                  onClick={() => {
                    onDirectionChange(direction === 'arrivals' ? 'departures' : 'arrivals');
                    setMenuOpen(false);
                  }}
                  style={menuItem}
                >
                  {direction === 'arrivals' ? t('Visa avgångar', 'Show departures') : t('Visa ankomster', 'Show arrivals')}
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={view === 'lines'}
                  onClick={() => {
                    onViewChange(view === 'lines' ? 'list' : 'lines');
                    setMenuOpen(false);
                  }}
                  style={menuItem}
                >
                  {view === 'lines' ? t('Visa som lista', 'Show as a list') : t('Per linje och riktning', 'By line and direction')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenStation();
                  }}
                  style={menuItem}
                >
                  {t('Om stationen', 'About the station')}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Trafikslag direkt på tavlan: vid Stockholm C ska man kunna se bara tågen
            utan att öppna sökpanelen. Visas bara när hållplatsen har mer än ett slag. */}
        {modes.length > 1 || mode !== 'all' ? (
          <div
            role="group"
            aria-label={t('Trafikslag', 'Mode of transport')}
            // Ingen scrollbar rad: Safari ritar ibland inte om en sådan efter ett tryck (trasiga bokstäver).
            style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', columnGap: '18px', borderBottom: `1px solid ${colors.border}` }}
          >
            {[{ key: 'all' as TransportMode, label: 'Alla' }, ...modes].map((m) => {
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onModeChange(m.key)}
                  style={{
                    // Ett lätt reglage: text, och en linje under det valda.
                    flexShrink: 0,
                    minHeight: '44px',
                    padding: '0 2px',
                    border: 'none',
                    borderBottom: `2px solid ${active ? colors.text : 'transparent'}`,
                    backgroundColor: 'transparent',
                    color: active ? colors.text : colors.textDim,
                    fontWeight: active ? 700 : 600,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {modeLabel(m.label, lang)}
                </button>
              );
            })}
          </div>
        ) : null}

        {direction === 'arrivals' ? (
          // Ankomster är ett sällanval: alltid en tydlig väg tillbaka till avgångar.
          <div
            style={{
              flexBasis: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: colors.surfaceRaised,
              fontSize: '0.875rem',
            }}
          >
            <span>{t('Du ser ankomster, inte avgångar.', 'You are viewing arrivals, not departures.')}</span>
            <button
              type="button"
              onClick={() => onDirectionChange('departures')}
              style={{
                minHeight: '40px',
                padding: '0 12px',
                border: `1px solid ${colors.text}`,
                background: 'transparent',
                color: colors.text,
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t('Visa avgångar', 'Show departures')}
            </button>
          </div>
        ) : null}

        {/* En rad: när tavlan uppdaterades, och de två verktygen. Öppnade tar de hela bredden. */}
        <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', columnGap: '4px', rowGap: '6px', flexWrap: 'wrap' }}>
          {updatedAt && !stale && !offline ? (
            // Ingen färgad bricka: bara avvikelser får färg. Pricken betyder realtid.
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginRight: 'auto',
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: limited ? colors.amber : colors.textDim,
              }}
            >
              {limited ? null : <span className="rt-dot" aria-hidden="true" />}
              {limited ? t('Begränsad realtid', 'Limited real-time') : `${t('Realtid', 'Real-time')} · ${updatedLabel}`}
              {view === 'lines' ? (
                <button
                  type="button"
                  onClick={() => onViewChange('list')}
                  aria-label={t('Per linje är på. Visa som lista', 'By line is on. Show as a list')}
                  style={{ ...chipOff }}
                >
                  {t('Per linje', 'By line')} ✕
                </button>
              ) : null}
            </span>
          ) : (
            <span style={{ marginRight: 'auto' }} />
          )}
          {direction === 'departures' && !errorMsg ? (
            <>
              <WalkBar
                stopName={stopName}
                state={walk.state}
                pace={walk.pace}
                onTurnOn={walk.turnOn}
                onTurnOff={walk.turnOff}
                onPace={walk.setPace}
              />
              <FindTrip stop={{ id: stopId, name: stopName }} mode={mode} onShowTrain={onShowTrain} onShowTrip={onShowTrip} />
            </>
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
              {offline ? t('Ingen anslutning', 'No connection') : t('Tavlan uppdateras inte just nu', 'The board is not updating right now')}
            </strong>
            {t(
              `Tiderna är från ${updatedLabel}, ${ageMin} min gamla, och kan ha ändrats. Försöker igen…`,
              `These times are from ${updatedLabel}, ${ageMin} min old, and may have changed. Retrying…`
            )}
          </span>
        </div>
      ) : null}

      {!errorMsg ? (
        <DisruptionBox
          disruptions={mode === 'all' ? disruptions : disruptions.filter((d) => d.lines.length === 0 || d.lines.some((l) => lineMode(l) === mode))}
        />
      ) : null}

      {errorMsg ? (
        <div
          style={{
            backgroundColor: colors.errorBg,
            color: colors.errorText,
            padding: '16px',
            borderRadius: 0,
            fontSize: '0.875rem',
          }}
        >
          {errorMsg}
        </div>
      ) : loading ? (
        <div role="status" aria-label={t('Hämtar tidtabell i realtid', 'Loading real-time timetable')} className="board-list" style={listStyle(SKELETON_ROWS)}>
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
              {t('Inga avgångar här matchar', 'No departures here match')} <strong>{filterText.trim()}</strong>.
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '10px' }}>
                {/^\d{2,5}$/.test(filterText.trim()) ? (
                  <button type="button" onClick={() => onShowTrain(filterText.trim())} style={emptyButton}>
                    {t(
                      `Visa tåg ${filterText.trim()}, var det än är`,
                      `Show train ${filterText.trim()}, wherever it is`
                    )}
                  </button>
                ) : null}
                <button type="button" onClick={onClearFilter} style={emptyButton}>
                  {t('Rensa filtret', 'Clear filter')}
                </button>
              </span>
            </>
          ) : mode === 'all' ? (
            t(
              'Inga avgångar härifrån de närmaste timmarna, varken i realtid eller i tidtabellen.',
              'No departures from here in the next few hours, in real time or in the timetable.'
            )
          ) : (
            t(
              <>
                Inga träffar hittades för valt trafikslag på denna station. Prova att välja <strong>Alla</strong> eller
                byt station.
              </>,
              <>
                Nothing found for the selected mode at this station. Try choosing <strong>All</strong> or change
                station.
              </>
            )
          )}
        </div>
      ) : (
        <>
          {view === 'lines' ? (
            <ul className="board-list" style={listStyle(Math.min(limit, groups.length))}>
              {groups.slice(0, limit).map((items) => (
                <LineGroupRow key={groupKey(items[0])} items={items} direction={direction} now={now} />
              ))}
            </ul>
          ) : (
            <div className="board-list" style={listStyle(Math.min(limit, departures.length))}>
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
                  onShowTrip={onShowTrip}
                  stale={stale || offline}
                  walkMinutes={item.id === walkTargetId ? walkMin : null}
                  alternative={alternatives.get(item.id) || null}
                  onOpen={onRowOpen}
                  clockFirst={mode === 'train'}
                />
              ))}
            </div>
          )}
          {fallback}
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
              style={{
                display: 'block',
                width: '100%',
                minHeight: '44px',
                marginTop: '10px',
                borderRadius: 0,
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: colors.surface,
                color: colors.text,
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t(`Visa fler (${hidden} till)`, `Show more (${hidden} more)`)}
            </button>
          ) : null}
        </>
      )}
      {departures.length === 0 && mode === 'all' ? fallback : null}

      <p style={{ fontSize: '0.8125rem', color: colors.textFaint, margin: '12px 0 0 0' }}>
        {t('Trafikdata från', 'Traffic data from')}{' '}
        <a
          href="https://www.trafiklab.se"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: colors.textDim }}
        >
          Trafiklab.se
        </a>
        {t(
          ', Trafikverket, SL och Västtrafik. Pricken betyder realtid. Tider med ~ och "tidtabell" är inte i realtid.',
          ', Trafikverket, SL and Västtrafik. The dot means real-time. Times with ~ and "timetable" are not live.'
        )}
      </p>
    </section>
  );
}

/** "Pendeltåg 41" → commuter, "Gröna linjen 17" → subway: för att visa störningar för valt trafikslag. */
function lineMode(line: string): TransportMode | null {
  const l = line.toLowerCase();
  if (l.includes('linjen') || l.startsWith('tunnelbana')) return 'subway';
  if (l.startsWith('pendeltåg')) return 'commuter';
  if (l.startsWith('buss')) return 'bus';
  if (l.includes('spårv') || l.includes('tvärbana') || l.includes('lidingöbana') || l.includes('nockebybana')) return 'tram';
  if (l.includes('båt') || l.includes('färja')) return 'ferry';
  if (l.includes('tåg')) return 'train';
  return null;
}
