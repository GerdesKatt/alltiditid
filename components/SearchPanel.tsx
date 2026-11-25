import React from 'react';
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
}: Props) {
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
      <h1
        style={{
          fontSize: '26px',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          margin: '0 0 4px 0',
          color: colors.text,
        }}
      >
        Koll på resan i realtid
      </h1>
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
                padding: '6px 12px',
                borderRadius: '9px',
                border: active ? `1px solid ${colors.accent}` : `1px solid ${colors.borderStrong}`,
                backgroundColor: active ? colors.accentTint : colors.surface,
                color: active ? colors.accentSoft : colors.textDim,
                fontWeight: 800,
                fontSize: '12px',
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
                padding: '5px 12px',
                borderRadius: '999px',
                border: active ? `1px solid ${colors.green}` : `1px solid ${colors.borderStrong}`,
                backgroundColor: active ? colors.greenTint : colors.chipBg,
                color: active ? colors.greenSoft : colors.textMuted,
                fontWeight: 600,
                fontSize: '12px',
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
                  padding: '7px 12px',
                  borderRadius: '9px',
                  border: active ? `1px solid ${colors.accent}` : `1px solid ${colors.borderStrong}`,
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
            value={stationQuery}
            onChange={(e) => onStationQueryChange(e.target.value)}
            placeholder="Sök valfri station eller hållplats i Sverige..."
            style={textInput(colors.accent)}
          />

          {searchingStops || suggestions.length > 0 ? (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '6px',
                backgroundColor: colors.surface,
                border: `1px solid ${colors.accent}`,
                borderRadius: '11px',
                zIndex: 20,
                overflow: 'hidden',
                boxShadow: `0 14px 30px ${colors.shadow}`,
              }}
            >
              {searchingStops ? (
                <div style={{ padding: '11px 14px', color: colors.textDim, fontSize: '13px' }}>
                  Söker platser...
                </div>
              ) : (
                suggestions.map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    onClick={() => onSuggestionSelect(stop)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '11px 14px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderBottom: `1px solid ${colors.border}`,
                      color: colors.text,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {stop.name}
                  </button>
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
