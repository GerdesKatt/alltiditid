import React, { useEffect, useState } from 'react';
import { REGIONS } from '../lib/regions';
import NearbyStops from './NearbyStops';
import type { Region, RegionKey, StopOption, TransportMode } from '../lib/types';
import { colors, textInput } from './styles';

type Props = {
  region: RegionKey;
  currentRegion: Region;
  onRegionChange: (region: RegionKey) => void;
  selectedStop: StopOption;
  onQuickStopSelect: (stop: StopOption) => void;
  /** Stänger panelen (visas bara när det finns något att gå tillbaka till). */
  onClose?: () => void;
  mode: TransportMode;
  onModeChange: (mode: TransportMode) => void;
  stationQuery: string;
  onStationQueryChange: (query: string) => void;
  searchingStops: boolean;
  suggestions: StopOption[];
  onSuggestionSelect: (stop: StopOption) => void;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  /** Senast sökta hållplatser, visas när sökfältet är tomt. */
  recentStops: StopOption[];
};

export default function SearchPanel({
  region,
  currentRegion,
  onRegionChange,
  selectedStop,
  onQuickStopSelect,
  onClose,
  mode,
  onModeChange,
  stationQuery,
  onStationQueryChange,
  searchingStops,
  suggestions,
  onSuggestionSelect,
  filterText,
  onFilterTextChange,
  recentStops,
}: Props) {
  // Kombobox för sökförslagen (ARIA-mönstret): piltangenter, Enter och Esc.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setActiveIndex(-1);
    setDismissed(false);
  }, [suggestions]);
  const listOpen = !dismissed && (searchingStops || suggestions.length > 0);
  const optionId = (i: number) => `hallplats-forslag-${i}`;

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setDismissed(false);
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setDismissed(false);
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && listOpen && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault();
      onSuggestionSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape' && listOpen) {
      e.preventDefault();
      setDismissed(true);
      setActiveIndex(-1);
    }
  }

  return (
    <section
      id="sok-och-filter"
      style={{
        marginBottom: '20px',
        padding: '18px 20px',
        borderRadius: '18px',
        background: `linear-gradient(180deg, ${colors.panelTop} 0%, ${colors.panelBottom} 100%)`,
        border: `1px solid ${colors.borderStrong}`,
        boxShadow: `0 14px 35px ${colors.shadow}`,
      }}
    >
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          style={{
            float: 'right',
            minHeight: '44px',
            padding: '0 16px',
            borderRadius: '10px',
            border: `1px solid ${colors.borderMuted}`,
            backgroundColor: colors.surface,
            color: colors.text,
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Klar
        </button>
      ) : null}
      <h2
        style={{
          fontSize: '26px',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          margin: '0 0 4px 0',
          color: colors.text,
        }}
      >
        Koll på resan i realtid
      </h2>
      <p style={{ color: colors.textDim, margin: '0 0 14px 0', fontSize: '14px', lineHeight: 1.45 }}>
        Välj stad eller sök hållplats för T-bana, spårvagn, pendel, tåg och buss i realtid.
      </p>

      {/* Närmaste hållplatser via plats (frågar först när knappen trycks) */}
      <NearbyStops onSelect={onSuggestionSelect} />

      {/* Regioner */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        {REGIONS.map((reg) => {
          const active = region === reg.key;
          return (
            <button
              key={reg.key}
              type="button"
              aria-pressed={active}
              onClick={() => onRegionChange(reg.key)}
              style={{
                minHeight: '36px',
                padding: '0 12px',
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${active ? colors.accentStrong : colors.borderStrong}`,
                backgroundColor: active ? colors.accentStrong : colors.surface,
                color: active ? colors.onAccent : colors.text,
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {active ? '✓ ' : ''}
              {reg.label}
            </button>
          );
        })}
      </div>

      {/* Snabbval av station */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '12px' }}>
        {currentRegion.stations.map((stop) => {
          const active = selectedStop.id === stop.id;
          return (
            <button
              key={stop.id}
              type="button"
              aria-pressed={active}
              onClick={() => onQuickStopSelect(stop)}
              style={{
                minHeight: '36px',
                padding: '0 12px',
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${active ? colors.accentStrong : colors.borderStrong}`,
                backgroundColor: active ? colors.accentStrong : colors.chipBg,
                color: active ? colors.onAccent : colors.text,
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {active ? '✓ ' : ''}
              {stop.shortName || stop.name}
            </button>
          );
        })}
      </div>

      {/* Trafikslag */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {currentRegion.modes.map((m) => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={active}
                onClick={() => onModeChange(m.key)}
                style={{
                  minHeight: '36px',
                  padding: '0 12px',
                  borderRadius: 'var(--radius-control)',
                  border: `1px solid ${active ? colors.accentStrong : colors.borderStrong}`,
                  backgroundColor: active ? colors.accentStrong : colors.surface,
                  color: active ? colors.onAccent : colors.text,
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {active ? '✓ ' : ''}
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sök station + filtrera */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '10px',
        }}
      >
        <div style={{ position: 'relative' }}>
          <label htmlFor="sok-hallplats" className="sr-only">
            Sök hållplats eller station
          </label>
          <input
            id="sok-hallplats"
            type="search"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls="hallplats-forslag"
            aria-activedescendant={listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            value={stationQuery}
            onKeyDown={onSearchKeyDown}
            onChange={(e) => onStationQueryChange(e.target.value)}
            placeholder="Sök valfri station eller hållplats i Sverige..."
            style={textInput(colors.borderStrong)}
          />

          {!stationQuery && recentStops.some((s) => s.id !== selectedStop.id) ? (
            <div style={{ marginTop: '10px' }}>
              <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: colors.textDim, marginBottom: '6px' }}>
                Senast
              </span>
              <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', listStyle: 'none', margin: 0, padding: 0 }}>
                {recentStops
                  .filter((s) => s.id !== selectedStop.id)
                  .map((stop) => (
                    <li key={stop.id}>
                      <button
                        type="button"
                        onClick={() => onSuggestionSelect(stop)}
                        style={{
                          minHeight: '40px',
                          padding: '0 14px',
                          borderRadius: 'var(--radius-control)',
                          border: 'none',
                          backgroundColor: colors.surfaceRaised,
                          color: colors.text,
                          fontSize: '14px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {stop.name}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {listOpen ? (
            <div
              id="hallplats-forslag"
              role="listbox"
              aria-label="Förslag på hållplatser"
              aria-busy={searchingStops}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '6px',
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: 'var(--radius-card)',
                zIndex: 20,
                overflow: 'hidden',
                boxShadow: `0 14px 30px ${colors.shadow}`,
              }}
            >
              {searchingStops ? (
                <div role="status" style={{ padding: '11px 14px', color: colors.textDim, fontSize: '13px' }}>
                  Söker platser...
                </div>
              ) : (
                suggestions.map((stop, i) => (
                  <div
                    key={stop.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    // mousedown, så att sökfältet inte tappar fokus innan valet registreras.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSuggestionSelect(stop)}
                    onMouseEnter={() => setActiveIndex(i)}
                    style={{
                      display: 'block',
                      width: '100%',
                      boxSizing: 'border-box',
                      textAlign: 'left',
                      padding: '9px 14px',
                      minHeight: '52px',
                      backgroundColor: i === activeIndex ? colors.accentTint : 'transparent',
                      border: 'none',
                      borderBottom: `1px solid ${colors.border}`,
                      color: colors.text,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: '15px', fontWeight: 700 }}>{stop.name}</span>
                    {stop.place || stop.modes?.length ? (
                      <span style={{ display: 'block', fontSize: '13px', color: colors.textDim, marginTop: '1px' }}>
                        {[stop.place, stop.modes?.join(', ')].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>

        <label htmlFor="filtrera-avgangar" className="sr-only">
          Filtrera avgångar på linje, destination eller stopp
        </label>
        <input
          id="filtrera-avgangar"
          type="search"
          autoComplete="off"
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          placeholder="Filtrera linje (t.ex. 19, 4, 535), destination eller stopp..."
          style={textInput(colors.borderStrong)}
        />
      </div>
    </section>
  );
}
