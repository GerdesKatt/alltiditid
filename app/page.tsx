'use client';

import React, { useEffect, useState } from 'react';
import AboutSection from '../components/AboutSection';
import DepartureBoard from '../components/DepartureBoard';
import DisruptionBanner from '../components/DisruptionBanner';
import Header from '../components/Header';
import InfoFooter from '../components/InfoFooter';
import OnBoardPanel from '../components/OnBoardPanel';
import SearchPanel from '../components/SearchPanel';
import { REGIONS } from '../lib/regions';
import { loadSavedState, regionForStop, saveState } from '../lib/savedStop';
import { buildShareMessage } from '../lib/shareMessage';
import type {
  BoardDirection,
  BoardSource,
  Departure,
  InfoTab,
  RegionKey,
  RiderMood,
  StopOption,
  TransportMode,
} from '../lib/types';

/** Hur ofta tavlan hämtas på nytt (ms). */
const REFRESH_INTERVAL_MS = 30_000;
/** Hur ofta klockan i appen tickar, så att avgångna rader försvinner mellan hämtningarna (ms). */
const CLOCK_TICK_MS = 15_000;
/** Avgångar vars förväntade tid passerats med mer än så här döljs (ms). */
const DEPARTED_GRACE_MS = 60_000;

/** 'YYYY-MM-DDTHH:MM' i lokal tid → millisekunder, eller null. */
function parseLocal(value?: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

export default function HomePage() {
  const [region, setRegion] = useState<RegionKey>('all');
  const [selectedStop, setSelectedStop] = useState<StopOption>(REGIONS[0].stations[0]);
  const [direction, setDirection] = useState<BoardDirection>('departures');
  const [mode, setMode] = useState<TransportMode>('all');
  const [stationQuery, setStationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StopOption[]>([]);
  const [searchingStops, setSearchingStops] = useState(false);

  const [filterText, setFilterText] = useState('');
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [source, setSource] = useState<BoardSource>('');
  const [now, setNow] = useState(() => Date.now());
  const [activeInfoTab, setActiveInfoTab] = useState<InfoTab>('about');

  const [onBoardTrip, setOnBoardTrip] = useState<Departure | null>(null);
  const [riderStatus, setRiderStatus] = useState<RiderMood>('on-time');
  const [riderNote, setRiderNote] = useState('');
  const [copiedMsg, setCopiedMsg] = useState(false);

  // Senaste hållplats (eller hållplatsen i adressen) läses in innan tavlan hämtas första gången,
  // så att standardhållplatsen inte hinner visas och hämtas i onödan.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = loadSavedState();
    if (saved) {
      setRegion(saved.region);
      setSelectedStop(saved.stop);
      setDirection(saved.direction);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    saveState({ stop: selectedStop, direction, region });
  }, [restored, selectedStop, direction, region]);

  const currentRegionObj = REGIONS.find((r) => r.key === region) || REGIONS[0];

  function handleRegionChange(newRegion: RegionKey) {
    setRegion(newRegion);
    setMode('all');
    const regObj = REGIONS.find((r) => r.key === newRegion);
    if (regObj && regObj.stations.length > 0) {
      setSelectedStop(regObj.stations[0]);
    }
    setStationQuery('');
    setSuggestions([]);
  }

  useEffect(() => {
    const q = stationQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearchingStops(true);
      fetch(`/api/trafik?action=search&q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data) => {
          setSuggestions(data.stops || []);
          setSearchingStops(false);
        })
        .catch(() => {
          setSearchingStops(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [stationQuery]);

  useEffect(() => {
    if (!restored) return;
    let active = true;
    let hasData = false;
    setLoading(true);
    setErrorMsg(null);
    setUpdatedAt(null);

    function load() {
      fetch(
        `/api/trafik?action=departures&stopId=${encodeURIComponent(
          selectedStop.id
        )}&stopName=${encodeURIComponent(selectedStop.name)}&mode=all&direction=${direction}`
      )
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Fel vid hämtning');
          return data;
        })
        .then((data) => {
          if (!active) return;
          const list: Departure[] = Array.isArray(data.departures) ? data.departures : [];
          hasData = true;
          setDepartures(list);
          setErrorMsg(null);
          setLoading(false);
          setUpdatedAt(new Date());
          setNow(Date.now());
          setSource(data.source === 'resrobot' ? 'resrobot' : 'trafiklab-realtime');

          setOnBoardTrip((prev) => {
            if (!prev) return null;
            const match = list.find((item) => item.id === prev.id);
            // Finns resan inte längre på tavlan (t.ex. har gått) slutar den uppdateras: markera det.
            return match || { ...prev, gone: true };
          });
        })
        .catch((err) => {
          if (!active) return;
          // Vid en misslyckad automatisk uppdatering behålls den senaste tavlan.
          if (!hasData) {
            setErrorMsg(err.message || 'Kunde inte hämta trafikinformation just nu.');
          }
          setLoading(false);
        });
    }

    load();

    // Uppdatera tavlan automatiskt, men bara när fliken syns.
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) load();
    }, REFRESH_INTERVAL_MS);
    function handleVisibility() {
      if (!document.hidden) load();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [restored, selectedStop, direction]);

  // Klockan tickar så att avgångar som redan gått försvinner även mellan hämtningarna.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const queryLower = filterText.trim().toLowerCase();
  const filtered = departures.filter((d) => {
    const expected = parseLocal(d.expectedAt);
    if (expected !== null && expected < now - DEPARTED_GRACE_MS) {
      return false;
    }

    if (mode !== 'all' && d.transportMode !== mode) {
      return false;
    }

    if (!queryLower) return true;
    const viaMatch = Array.isArray(d.viaStops)
      ? d.viaStops.some((stopName) => stopName.toLowerCase().includes(queryLower))
      : false;
    return (
      d.destination.toLowerCase().includes(queryLower) ||
      d.line.toLowerCase().includes(queryLower) ||
      (d.trainNumber ? d.trainNumber.toLowerCase().includes(queryLower) : false) ||
      d.operator.toLowerCase().includes(queryLower) ||
      (d.deviation ? d.deviation.toLowerCase().includes(queryLower) : false) ||
      viaMatch
    );
  });

  const hasDisruptions = filtered.some(
    (d) => d.status === 'delayed' || d.status === 'cancelled'
  );

  function handleSelectOnBoard(item: Departure) {
    setOnBoardTrip(item);
    if (item.status === 'on-time') {
      setRiderStatus('on-time');
    } else if (item.status === 'delayed') {
      setRiderStatus('slightly-late');
    } else {
      setRiderStatus('delayed');
    }
    setCopiedMsg(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }


  async function handleShareTrip(trip: Departure) {
    const text = buildShareMessage(trip, selectedStop.name, riderStatus, riderNote);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `Resestatus: ${selectedStop.name}`,
          text,
          url: 'https://alltiditid.se',
        });
        return;
      }
    } catch {
      // Fallback till urklipp
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 3000);
    }
  }

  return (
    <div id="alltiditid-app" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <Header onContactClick={() => setActiveInfoTab('contact')} />

      {onBoardTrip ? (
        <OnBoardPanel
          trip={onBoardTrip}
          stopName={selectedStop.name}
          riderStatus={riderStatus}
          onRiderStatusChange={setRiderStatus}
          riderNote={riderNote}
          onRiderNoteChange={setRiderNote}
          shareMessage={buildShareMessage(onBoardTrip, selectedStop.name, riderStatus, riderNote)}
          copied={copiedMsg}
          onShare={() => handleShareTrip(onBoardTrip)}
          onClose={() => {
            setOnBoardTrip(null);
            setRiderNote('');
            setCopiedMsg(false);
          }}
        />
      ) : null}

      <SearchPanel
        region={region}
        currentRegion={currentRegionObj}
        onRegionChange={handleRegionChange}
        selectedStop={selectedStop}
        onQuickStopSelect={(stop) => {
          setSelectedStop(stop);
          setStationQuery('');
          setSuggestions([]);
        }}
        direction={direction}
        onDirectionChange={setDirection}
        mode={mode}
        onModeChange={setMode}
        stationQuery={stationQuery}
        onStationQueryChange={setStationQuery}
        searchingStops={searchingStops}
        suggestions={suggestions}
        onSuggestionSelect={(stop) => {
          setSelectedStop(stop);
          // Behåll vald region (och dess snabbval) om hållplatsen inte hör till en annan region.
          const stopRegion = regionForStop(stop.id);
          if (stopRegion !== 'all') setRegion(stopRegion);
          setMode('all');
          setStationQuery('');
          setSuggestions([]);
        }}
        filterText={filterText}
        onFilterTextChange={setFilterText}
      />

      {hasDisruptions ? <DisruptionBanner /> : null}

      <DepartureBoard
        stopName={selectedStop.name}
        direction={direction}
        departures={filtered}
        loading={loading}
        errorMsg={errorMsg}
        updatedAt={updatedAt}
        now={now}
        source={source}
        selectedTripId={onBoardTrip ? onBoardTrip.id : null}
        onSelectOnBoard={handleSelectOnBoard}
      />

      <AboutSection />

      <InfoFooter activeTab={activeInfoTab} onTabChange={setActiveInfoTab} />
    </div>
  );
}
