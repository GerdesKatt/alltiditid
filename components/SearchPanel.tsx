import React, { useEffect, useState } from 'react';
import { REGIONS } from '../lib/regions';
import NearbyStops from './NearbyStops';
import type { Region, RegionKey, StopOption } from '../lib/types';
import { colors, textInput } from './styles';
import { AIRPORTS } from '../lib/flights.mjs';
import { modeLabel, REGION_EN, useLang } from '../lib/i18n';

type Props = {
  region: RegionKey;
  currentRegion: Region;
  onRegionChange: (region: RegionKey) => void;
  selectedStop: StopOption;
  onQuickStopSelect: (stop: StopOption) => void;
  /** Stänger panelen (visas bara när det finns något att gå tillbaka till). */
  onClose?: () => void;
  stationQuery: string;
  onStationQueryChange: (query: string) => void;
  searchingStops: boolean;
  suggestions: StopOption[];
  onSuggestionSelect: (stop: StopOption) => void;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  /** Senast sökta hållplatser, visas när sökfältet är tomt. */
  recentStops: StopOption[];
  /** Öppnar flygfliken på en flygplats, när sökningen ser ut att gälla en. */
  onOpenAirport?: (iata: string) => void;
  /** Öppnar ett tågs hela resa, när sökningen är ett tågnummer. */
  onOpenTrain?: (trainNumber: string) => void;
  /** Flygtavlan, som snabbval (flyg ligger inte i menyn). */
  onOpenFlights?: () => void;
};

export default function SearchPanel({
  region,
  currentRegion,
  onRegionChange,
  selectedStop,
  onQuickStopSelect,
  onClose,
  stationQuery,
  onStationQueryChange,
  searchingStops,
  suggestions,
  onSuggestionSelect,
  filterText,
  onFilterTextChange,
  recentStops,
  onOpenAirport,
  onOpenTrain,
  onOpenFlights,
}: Props) {
  const { lang, t } = useLang();
  // "532", "tåg 532", "train 532" eller "SJ 532": ett tågnummer.
  const trainPattern = /^(?:tåg|sj|tag|train)?\s*(\d{2,5})$/i;
  const trainHit = onOpenTrain ? trainPattern.exec(stationQuery.trim())?.[1] : undefined;
  // Ett tågnummer i filtret: tåget kanske inte går från den här stationen, så erbjud hela resan.
  const filterTrain = onOpenTrain ? trainPattern.exec(filterText.trim())?.[1] : undefined;
  const airportHit =
    onOpenAirport && stationQuery.trim().length >= 3
      ? AIRPORTS.find((a) =>
          [a.short, a.name, a.iata, 'flyg', 'flygplats', 'flight', 'airport'].some((w) =>
            w.toLowerCase().startsWith(stationQuery.trim().toLowerCase())
          )
        )
      : null;
  // Kombobox för sökförslagen (ARIA-mönstret): piltangenter, Enter och Esc.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setActiveIndex(-1);
    setDismissed(false);
  }, [suggestions]);
  // Textfiltret är hopfällt tills man ber om det, men öppet om det redan gäller.
  // Trafikslagen ligger direkt på tavlan (DepartureBoard), där de behövs.
  const activeFilterCount = filterText.trim() ? 1 : 0;
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0);
  const summary = filterText.trim() ? `"${filterText.trim()}"` : t('Linje, tågnummer', 'Line, train number');
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
        borderRadius: 0,
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
            marginTop: '-4px',
            padding: '0 14px',
            borderRadius: 0,
            border: 'none',
            backgroundColor: colors.surfaceRaised,
            color: colors.text,
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          {t('Klar', 'Done')}
        </button>
      ) : null}
      <h2
        style={{
          fontSize: '1.375rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          margin: '0 0 4px 0',
          color: colors.text,
        }}
      >
        {t('Koll på resan i realtid', 'Your journey in real time')}
      </h2>

      {/* Sökfältet först: det är det en stressad resenär letar efter. */}
        <div style={{ position: 'relative', margin: '12px 0 10px' }}>
          <label htmlFor="sok-hallplats" className="sr-only">
            {t('Sök hållplats eller station', 'Search stop or station')}
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
            placeholder={t('Sök hållplats eller tågnummer', 'Search stop or train number')}
            style={{ ...textInput(colors.text), minHeight: '52px', fontSize: '1rem', borderWidth: '2px' }}
          />

          {trainHit ? (
            <button
              type="button"
              onClick={() => onOpenTrain!(trainHit)}
              style={{
                marginTop: '10px',
                width: '100%',
                minHeight: '48px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '0 14px',
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: colors.surface,
                color: colors.text,
                fontSize: '0.9375rem',
                fontWeight: 700,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {t(`Tåg ${trainHit}: visa hela resan`, `Train ${trainHit}: show the whole journey`)}
            </button>
          ) : null}

          {airportHit ? (
            <button
              type="button"
              onClick={() => onOpenAirport!(airportHit.iata)}
              style={{
                marginTop: '10px',
                width: '100%',
                minHeight: '48px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '0 14px',
                borderRadius: 'var(--radius-control)',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: colors.surface,
                color: colors.text,
                fontSize: '0.9375rem',
                fontWeight: 700,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span aria-hidden="true">✈</span>
              {t(`Flyg från ${airportHit.name}`, `Flights from ${airportHit.name}`)}
            </button>
          ) : null}

          {!stationQuery && recentStops.some((s) => s.id !== selectedStop.id) ? (
            <div style={{ marginTop: '10px' }}>
              <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim, marginBottom: '6px' }}>
                {t('Senast', 'Recent')}
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
                          fontSize: '0.875rem',
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
              aria-label={t('Förslag på hållplatser', 'Suggested stops')}
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
                <div role="status" style={{ padding: '11px 14px', color: colors.textDim, fontSize: '0.8125rem' }}>
                  {t('Söker platser...', 'Searching...')}
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
                    <span style={{ display: 'block', fontSize: '0.9375rem', fontWeight: 700 }}>{stop.name}</span>
                    {stop.place || stop.modes?.length ? (
                      <span style={{ display: 'block', fontSize: '0.8125rem', color: colors.textDim, marginTop: '1px' }}>
                        {[stop.place, stop.modes?.map((m) => modeLabel(m, lang)).join(', ')].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>

      {/* Nära mig och region på en rad: två små verktyg, inte två egna block. */}
      <NearbyStops
        onSelect={onSuggestionSelect}
        trailing={
          <div style={{ position: 'relative', marginLeft: 'auto' }}>
            <label htmlFor="valj-region" className="sr-only">
              {t('Region för snabbvalen', 'Region for quick picks')}
            </label>
            <select
              id="valj-region"
              value={region}
              onChange={(e) => onRegionChange(e.target.value as RegionKey)}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                minHeight: '44px',
                maxWidth: '100%',
                padding: '0 32px 0 12px',
                borderRadius: 'var(--radius-control)',
                // Ram på ett reglage: minst 3:1 mot bakgrunden.
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: 'transparent',
                color: colors.textDim,
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              {REGIONS.map((reg) => (
                <option key={reg.key} value={reg.key}>
                  {t(reg.label, REGION_EN[reg.key])}
                </option>
              ))}
            </select>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: colors.textDim,
                fontSize: '0.625rem',
              }}
            >
              ▼
            </span>
          </div>
        }
      />

      {/* Snabbval av station: en rad som rullar i sidled i stället för flera rader. */}
      <div
        role="group"
        aria-label={t('Snabbval', 'Quick picks')}
        className="chip-scroll"
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          margin: '0 -20px',
          padding: '0 20px 2px',
          scrollPaddingInline: '20px',
        }}
      >
        {currentRegion.stations.map((stop) => {
          const active = selectedStop.id === stop.id;
          return (
            <button
              key={stop.id}
              type="button"
              aria-pressed={active}
              onClick={() => onQuickStopSelect(stop)}
              style={{
                flexShrink: 0,
                minHeight: '36px',
                padding: '0 12px',
                borderRadius: 'var(--radius-control)',
                border: active ? `1px solid ${colors.accentStrong}` : 'none',
                backgroundColor: active ? colors.accentStrong : colors.surfaceRaised,
                color: active ? colors.onAccent : colors.text,
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              {stop.shortName || stop.name}
            </button>
          );
        })}
        {onOpenFlights ? (
          <button
            type="button"
            onClick={onOpenFlights}
            style={{
              flexShrink: 0,
              minHeight: '36px',
              padding: '0 12px',
              borderRadius: 'var(--radius-control)',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: 'transparent',
              color: colors.text,
              fontWeight: 600,
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            {t('Flyg', 'Flights')}
          </button>
        ) : null}
      </div>

      {/* Filtret gäller tavlan, så det visas först när en hållplats är vald, och bara när man ber om det. */}
      {selectedStop.id ? (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${colors.border}` }}>
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="tavlans-filter"
            onClick={() => setFiltersOpen((o) => !o)}
            style={{
              width: '100%',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: 0,
              border: 'none',
              background: 'none',
              color: colors.text,
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 700,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span>{t('Filtrera tavlan', 'Filter the board')}</span>
            {activeFilterCount > 0 ? (
              <span
                style={{
                  minWidth: '20px',
                  height: '20px',
                  padding: '0 6px',
                  borderRadius: 0,
                  backgroundColor: colors.accentStrong,
                  color: colors.onAccent,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {activeFilterCount}
                <span className="sr-only">{t(' aktiva', ' active')}</span>
              </span>
            ) : null}
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: colors.textDim,
                whiteSpace: 'nowrap',
              }}
            >
              {filtersOpen ? t('Dölj', 'Hide') : summary}
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  marginLeft: '6px',
                  fontSize: '0.625rem',
                  transform: filtersOpen ? 'rotate(180deg)' : undefined,
                }}
              >
                ▼
              </span>
            </span>
          </button>

          {filtersOpen ? (
            <div id="tavlans-filter" style={{ marginTop: '8px' }}>
              <label htmlFor="filtrera-avgangar" className="sr-only">
                {t('Filtrera tavlan för', 'Filter the board for')} {selectedStop.shortName || selectedStop.name}
              </label>
              <input
                id="filtrera-avgangar"
                type="search"
                autoComplete="off"
                value={filterText}
                onChange={(e) => onFilterTextChange(e.target.value)}
                placeholder={t('Linje, tågnummer eller destination', 'Line, train number or destination')}
                style={textInput(colors.borderStrong)}
              />
              {filterTrain ? (
                <button
                  type="button"
                  onClick={() => onOpenTrain!(filterTrain)}
                  style={{
                    marginTop: '8px',
                    width: '100%',
                    minHeight: '48px',
                    padding: '0 14px',
                    borderRadius: 'var(--radius-control)',
                    border: `1px solid ${colors.borderStrong}`,
                    backgroundColor: colors.surface,
                    color: colors.text,
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {t(
                    `Tåg ${filterTrain}: visa hela resan, var tåget än är`,
                    `Train ${filterTrain}: show the whole journey, wherever it is`
                  )}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}