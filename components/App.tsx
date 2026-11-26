'use client';

import React, { useEffect, useState } from 'react';
import AboutSection from './AboutSection';
import DepartureBoard from './DepartureBoard';
import Header from './Header';
import ConsentBanner from './ConsentBanner';
import InfoFooter from './InfoFooter';
import {
  ANALYTICS_ENABLED,
  clearConsent,
  loadAnalytics,
  readConsent,
  revokeAnalytics,
  storeConsent,
} from '../lib/analytics';
import OnBoardPanel from './OnBoardPanel';
import StationSheet from './StationSheet';
import FlightView from './FlightView';
import TrainSheet from './TrainSheet';
import SheetBackdrop from './SheetBackdrop';
import { colors } from './styles';
import ModeTabs, { type AppTab } from './ModeTabs';
import { loadStopIndex, stopPageFor, type StopIndex } from '../lib/stopIndex';
import SearchPanel from './SearchPanel';
import SwitchStopButton from './SwitchStopButton';
import { REGIONS } from '../lib/regions';
import { loadSavedState, regionForStop, saveState } from '../lib/savedStop';
import { loadFavorites, MAX_FAVORITES, storeFavorites, toggleFavorite } from '../lib/favorites';
import FavoritesBar from './FavoritesBar';
import MyTripCard from './MyTripCard';
import { loadRecentStops, rememberStop } from '../lib/recentStops';
import { loadMyTrip, nextForTrip, storeMyTrip, tripFrom, type MyTrip } from '../lib/myTrip';
import { boardUrl, takePrefetch } from '../lib/prefetch';
import type { BoardView } from './DepartureBoard';

/** Lista eller per linje, sparat i webbläsaren. */
const VIEW_KEY = 'alltiditid:vy';
/** Samma brytpunkt som .layout i globals.css. */
const WIDE_QUERY = '(min-width: 1100px)';
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
  Disruption,
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

let firstBoardMarked = false;

/**
 * B1: mät "tid till första avgång" en gång per sidvisning. Värdet ligger alltid i
 * performance (syns i webbläsarens utvecklarverktyg) och skickas till Google Analytics
 * som händelsen forsta_avgang bara om besökaren har godkänt statistik.
 */
function markFirstBoard(rows: number) {
  if (firstBoardMarked || typeof window === 'undefined' || rows === 0) return;
  firstBoardMarked = true;
  requestAnimationFrame(() => {
    try {
      performance.mark('alltiditid:forsta-avgang');
      const ms = Math.round(performance.now());
      if (ANALYTICS_ENABLED && readConsent() === 'granted' && window.gtag) {
        window.gtag('event', 'forsta_avgang', { value: ms });
      }
    } catch {
      // Mätningen får aldrig störa tavlan.
    }
  });
}

type AppProps = {
  /** Hållplatssidor (/gullmarsplan) startar på sin hållplats i stället för den senaste. */
  initialStop?: StopOption;
  /** Text om hållplatsen under tavlan, renderad på servern för sökmotorerna. */
  intro?: React.ReactNode;
};

export default function App({ initialStop, intro }: AppProps) {
  const [region, setRegion] = useState<RegionKey>('all');
  const [selectedStop, setSelectedStopRaw] = useState<StopOption>(initialStop || REGIONS[0].stations[0]);
  // Ingen hållplats är vald vid första besöket: Stockholm C ska inte se förvald ut.
  // Tavlan hämtas och visas först när man valt en (eller har en sparad).
  const [hasStop, setHasStop] = useState(Boolean(initialStop));
  function setSelectedStop(stop: StopOption) {
    setHasStop(true);
    setSelectedStopRaw(stop);
  }
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
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [activeInfoTab, setActiveInfoTab] = useState<InfoTab>('about');

  const [onBoardTrip, setOnBoardTrip] = useState<Departure | null>(null);
  // Hållplatslistan (för stationsbladet och adresser som /slussen-t-bana), hämtas i efterhand.
  const [stopIndex, setStopIndex] = useState<StopIndex | null>(null);
  const [stationOpen, setStationOpen] = useState(false);
  // Tåget vars hela resa visas (från tavlan eller en sökning på tågnummer).
  const [trainNumber, setTrainNumber] = useState<string | null>(null);
  // Kollektivtrafik eller flyg, och flygplatsen som sökningen pekade på.
  const [tab, setTab] = useState<AppTab>('trafik');
  const [flightAirport, setFlightAirport] = useState<string | undefined>(undefined);
  useEffect(() => {
    try {
      if (!initialStop && window.localStorage.getItem('alltiditid:flik') === 'flyg') setTab('flyg');
    } catch {
      // Ingen lagring.
    }
  }, [initialStop]);
  function changeTab(next: AppTab) {
    setTab(next);
    setStationOpen(false);
    try {
      window.localStorage.setItem('alltiditid:flik', next);
    } catch {
      // Valet gäller tills sidan laddas om.
    }
  }
  const [riderStatus, setRiderStatus] = useState<RiderMood>('on-time');
  const [riderNote, setRiderNote] = useState('');
  const [copiedMsg, setCopiedMsg] = useState(false);

  // Senaste hållplats (eller hållplatsen i adressen) läses in innan tavlan hämtas första gången,
  // så att standardhållplatsen inte hinner visas och hämtas i onödan.
  // Statistik (Google Analytics) laddas bara efter samtycke, och bara om ett mätnings-id finns.
  const [consentAsked, setConsentAsked] = useState(false);
  useEffect(() => {
    if (!ANALYTICS_ENABLED) {
      // Google Analytics är avstängt: städa bort kakor och samtycke från tidigare besök.
      if (readConsent() !== null) {
        revokeAnalytics();
        clearConsent();
      }
      return;
    }
    const choice = readConsent();
    if (choice === 'granted') loadAnalytics();
    setConsentAsked(choice === null);
  }, []);

  function acceptAnalytics() {
    storeConsent('granted');
    loadAnalytics();
    setConsentAsked(false);
  }

  function declineAnalytics() {
    storeConsent('denied');
    setConsentAsked(false);
  }

  /** Från integritetstexten: glöm valet och fråga igen. */
  function changeAnalyticsChoice() {
    const wasGranted = readConsent() === 'granted';
    clearConsent();
    if (wasGranted) revokeAnalytics();
    setConsentAsked(true);
  }

  const [restored, setRestored] = useState(false);
  const [offline, setOffline] = useState(false);
  const [view, setView] = useState<BoardView>('list');
  // Bred skärm: inställningar till vänster och tavlan till höger, alltid öppna.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.(WIDE_QUERY);
    if (!query) return;
    const update = () => setWide(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  const [favorites, setFavorites] = useState<StopOption[]>([]);
  const [myTrip, setMyTrip] = useState<MyTrip | null>(null);
  const [recentStops, setRecentStops] = useState<StopOption[]>([]);
  // Resans egna avgångar när tavlan visar en annan hållplats.
  const [tripDepartures, setTripDepartures] = useState<Departure[]>([]);
  const [tripLoading, setTripLoading] = useState(false);
  // Inställningarna (region, snabbval, sök, filter) är öppna vid första besöket och
  // fälls ihop när det finns en sparad hållplats, så att tavlan kommer först.
  const [controlsOpen, setControlsOpen] = useState(!initialStop);
  useEffect(() => {
    setFavorites(loadFavorites());
    setMyTrip(loadMyTrip());
    setRecentStops(loadRecentStops());
    try {
      if (window.localStorage.getItem(VIEW_KEY) === 'lines') setView('lines');
    } catch {
      // Ingen lagring: listvyn gäller.
    }
    // Service worker: appen startar från hemskärmen och visar senaste tavlan utan nät.
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Utan service worker fungerar sidan som vanligt.
      });
    }
    const saved = loadSavedState(initialStop);
    if (saved) {
      setRegion(saved.region);
      setSelectedStop(saved.stop);
      setDirection(saved.direction);
      setControlsOpen(false);
    }
    setRestored(true);
  }, []);

  /** Efter att en hållplats valts: fäll ihop inställningarna och visa tavlan. */
  function showBoard() {
    setControlsOpen(false);
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        document.getElementById('avgangstavla')?.scrollIntoView({
          behavior: reduce ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    }
  }

  // Listan hämtas när tavlan väl visas, så att den inte tävlar med avgångarna.
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      loadStopIndex().then((index) => {
        if (index) setStopIndex(index);
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [restored]);

  const stationPage = stopPageFor(stopIndex, selectedStop.id);

  useEffect(() => {
    if (!restored || !hasStop) return;
    saveState({ stop: selectedStop, direction, region }, initialStop, stationPage?.slug);
  }, [restored, hasStop, selectedStop, direction, region, stationPage?.slug]);

  /** Byt hållplats från stationsbladet (grannhållplatserna). */
  function selectStopFromSheet(stop: StopOption) {
    setSelectedStop(stop);
    setRecentStops((list) => rememberStop(list, stop));
    const stopRegion = regionForStop(stop.id);
    if (stopRegion !== 'all') setRegion(stopRegion);
    setMode('all');
    setStationOpen(false);
    showBoard();
  }

  const currentRegionObj = REGIONS.find((r) => r.key === region) || REGIONS[0];

  function handleRegionChange(newRegion: RegionKey) {
    setRegion(newRegion);
    setMode('all');
    // Regionen byter bara snabbvalen; tavlan står kvar tills man väljer en hållplats.
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
    if (!restored || !hasStop) return;
    let active = true;
    let hasData = false;
    setLoading(true);
    setErrorMsg(null);
    setUpdatedAt(null);
    setDisruptions([]);

    const url = boardUrl(selectedStop.id, selectedStop.name, direction);
    function load() {
      // Första gången kan svaret redan vara på väg (startat i <head>, lib/prefetch.ts).
      const early = hasData ? null : takePrefetch(url);
      (early || fetch(url))
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Fel vid hämtning');
          // Satt av service workern när nätet inte svarade och en sparad tavla visas.
          const savedAt = Number(res.headers.get('X-Alltiditid-Sparad')) || 0;
          return { ...data, savedAt };
        })
        .then((data) => {
          if (!active) return;
          setOffline(data.savedAt > 0);
          const list: Departure[] = Array.isArray(data.departures) ? data.departures : [];
          if (!hasData) markFirstBoard(list.length);
          hasData = true;
          setDepartures(list);
          setErrorMsg(null);
          setLoading(false);
          setUpdatedAt(data.savedAt > 0 ? new Date(data.savedAt) : new Date());
          setNow(Date.now());
          setSource(data.source === 'resrobot' ? 'resrobot' : 'trafiklab-realtime');
          setDisruptions(Array.isArray(data.disruptions) ? data.disruptions : []);

          setOnBoardTrip((prev) => {
            if (!prev) return null;
            const match = list.find((item) => item.id === prev.id);
            // Finns resan inte längre på tavlan (t.ex. har gått) slutar den uppdateras: markera det.
            return match || { ...prev, gone: true };
          });
        })
        .catch((err) => {
          if (!active) return;
          if (typeof navigator !== 'undefined' && navigator.onLine === false) setOffline(true);
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
  }, [restored, hasStop, selectedStop, direction]);

  // Min resa på en annan hållplats än tavlan: hämta den hållplatsen också, lika ofta.
  const tripOnBoard = Boolean(myTrip && myTrip.stopId === selectedStop.id && direction === 'departures');
  useEffect(() => {
    if (!restored || !myTrip || tripOnBoard) return;
    let active = true;
    setTripLoading(true);
    setTripDepartures([]);
    const url = boardUrl(myTrip.stopId, myTrip.stopName, 'departures');
    function load() {
      fetch(url)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('fel'))))
        .then((data) => {
          if (!active) return;
          setTripDepartures(Array.isArray(data.departures) ? data.departures : []);
          setTripLoading(false);
        })
        .catch(() => {
          if (active) setTripLoading(false);
        });
    }
    load();
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [restored, myTrip, tripOnBoard]);

  // Klockan tickar så att avgångar som redan gått försvinner även mellan hämtningarna.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const queryLower = filterText.trim().toLowerCase();
  const filtered = departures.filter((d) => {
    const expected = parseLocal(d.expectedAt);
    // Tåg som står kvar efter sin tid ligger kvar tills Trafikverket säger att de gått.
    if (!d.pending && expected !== null && expected < now - DEPARTED_GRACE_MS) {
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

  const isFavorite = favorites.some((s) => s.id === selectedStop.id);

  return (
    <div id="alltiditid-app" className="app-shell" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <a href="#avgangstavla" className="skip-link">
        Hoppa till avgångar
      </a>
      <Header onContactClick={() => setActiveInfoTab('contact')} />
      <main id="innehall">
      <ModeTabs tab={tab} onChange={changeTab} />
      {tab === 'flyg' ? <FlightView initialAirport={flightAirport} /> : null}
      <div hidden={tab === 'flyg'}>

      {trainNumber && !onBoardTrip ? <SheetBackdrop onClose={() => setTrainNumber(null)} /> : null}
      {stationOpen && !onBoardTrip && !trainNumber ? <SheetBackdrop onClose={() => setStationOpen(false)} /> : null}
      {trainNumber && !onBoardTrip ? (
        <TrainSheet
          number={trainNumber}
          onClose={() => setTrainNumber(null)}
          onOpenStation={(name) => {
            // "Linköping C" (Trafikverket) heter "Linköping Centralstation" hos Trafiklab.
            const q = name.replace(/\s+C$/i, ' Centralstation');
            fetch(`/api/trafik?action=search&q=${encodeURIComponent(q)}`)
              .then((res) => res.json())
              .then((data) => {
                const stops: StopOption[] = Array.isArray(data.stops) ? data.stops : [];
                const hit = stops.find((st) => !st.modes || st.modes.includes('Tåg')) || stops[0];
                if (!hit) return;
                setTrainNumber(null);
                setTab('trafik');
                setSelectedStop({ id: hit.id, name: hit.name });
                setRecentStops((list) => rememberStop(list, hit));
                const stopRegion = regionForStop(hit.id);
                if (stopRegion !== 'all') setRegion(stopRegion);
                setMode('all');
                showBoard();
              })
              .catch(() => {});
          }}
        />
      ) : null}

      {stationOpen && !onBoardTrip && !trainNumber ? (
        <StationSheet
          stop={selectedStop}
          page={stationPage}
          neighbours={(stationPage?.near || [])
            .map((id) => stopIndex?.byId.get(id))
            .filter((n): n is NonNullable<typeof n> => Boolean(n))}
          onSelectStop={selectStopFromSheet}
          onClose={() => setStationOpen(false)}
        />
      ) : null}

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

      <div className="layout">
      <div className="layout-side">
      {controlsOpen || wide ? (
        <SearchPanel
          region={region}
          currentRegion={currentRegionObj}
          onRegionChange={handleRegionChange}
          selectedStop={hasStop ? selectedStop : { id: '', name: '' }}
          onQuickStopSelect={(stop) => {
            setSelectedStop(stop);
            setStationQuery('');
            setSuggestions([]);
            showBoard();
          }}
          onClose={restored && !wide ? () => setControlsOpen(false) : undefined}
          mode={mode}
          onModeChange={setMode}
          stationQuery={stationQuery}
          onStationQueryChange={setStationQuery}
          searchingStops={searchingStops}
          suggestions={suggestions}
          recentStops={recentStops}
          onOpenTrain={(n) => {
            setStationQuery('');
            setSuggestions([]);
            setStationOpen(false);
            setTrainNumber(n);
          }}
          onOpenAirport={(iata) => {
            setFlightAirport(iata);
            setStationQuery('');
            setSuggestions([]);
            changeTab('flyg');
          }}
          onSuggestionSelect={(stop) => {
            setSelectedStop({ id: stop.id, name: stop.name });
            setRecentStops((list) => rememberStop(list, stop));
            // Behåll vald region (och dess snabbval) om hållplatsen inte hör till en annan region.
            const stopRegion = regionForStop(stop.id);
            if (stopRegion !== 'all') setRegion(stopRegion);
            setMode('all');
            setStationQuery('');
            setSuggestions([]);
            showBoard();
          }}
          filterText={filterText}
          onFilterTextChange={setFilterText}
        />
      ) : (
        <div className="switch-stop switch-stop--top">
          <SwitchStopButton
            onClick={() => setControlsOpen(true)}
            activeFilter={mode !== 'all' || filterText.trim() !== ''}
          />
        </div>
      )}
      </div>

      <div className="layout-board">
      {myTrip ? (
        <MyTripCard
          trip={myTrip}
          next={nextForTrip(myTrip, tripOnBoard ? departures : tripDepartures, now, DEPARTED_GRACE_MS)}
          loading={tripOnBoard ? loading : tripLoading}
          now={now}
          showingStop={myTrip.stopId === selectedStop.id}
          onShowStop={() => {
            setSelectedStop({ id: myTrip.stopId, name: myTrip.stopName });
            const stopRegion = regionForStop(myTrip.stopId);
            if (stopRegion !== 'all') setRegion(stopRegion);
            setDirection('departures');
            setMode('all');
            setControlsOpen(false);
          }}
          onRemove={() => {
            setMyTrip(null);
            storeMyTrip(null);
          }}
        />
      ) : null}
      <FavoritesBar
        favorites={favorites}
        currentId={selectedStop.id}
        onSelect={(stop) => {
          setSelectedStop(stop);
          const stopRegion = regionForStop(stop.id);
          if (stopRegion !== 'all') setRegion(stopRegion);
          setMode('all');
          setControlsOpen(false);
        }}
      />

      {!hasStop ? (
        <section
          id="avgangstavla"
          style={{
            padding: '20px',
            borderRadius: 'var(--radius-card)',
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            marginBottom: '18px',
          }}
        >
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px' }}>Välj en hållplats</h1>
          <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.5, color: colors.textDim }}>
            Sök på en station, en hållplats eller ett tågnummer, välj ett snabbval eller tryck på{' '}
            <strong style={{ color: colors.text }}>Hållplatser nära mig</strong>.
          </p>
        </section>
      ) : null}
      <div hidden={!hasStop}>
      <DepartureBoard
        isFavorite={isFavorite}
        favoritesFull={!isFavorite && favorites.length >= MAX_FAVORITES}
        onToggleFavorite={() => {
          const next = toggleFavorite(favorites, selectedStop);
          setFavorites(next);
          storeFavorites(next);
        }}
        stopName={selectedStop.name}
        onShowTrain={(n) => {
          setStationOpen(false);
          setTrainNumber(n);
        }}
        filterText={filterText}
        onClearFilter={() => setFilterText('')}
        onOpenStation={() => {
          setTrainNumber(null);
          setStationOpen(true);
          if (!stopIndex) loadStopIndex().then((index) => index && setStopIndex(index));
        }}
        direction={direction}
        onDirectionChange={setDirection}
        departures={filtered}
        disruptions={disruptions}
        loading={loading}
        errorMsg={errorMsg}
        updatedAt={updatedAt}
        offline={offline}
        view={view}
        onViewChange={(next) => {
          setView(next);
          try {
            window.localStorage.setItem(VIEW_KEY, next);
          } catch {
            // Valet gäller då bara tills sidan laddas om.
          }
        }}
        now={now}
        source={source}
        selectedTripId={onBoardTrip ? onBoardTrip.id : null}
        onSelectOnBoard={handleSelectOnBoard}
        myTrip={direction === 'departures' ? myTrip : null}
        stopId={selectedStop.id}
        onToggleMyTrip={(item) => {
          const current = myTrip && myTrip.stopId === selectedStop.id && tripFrom(item, '', '').key === myTrip.key;
          const next = current ? null : tripFrom(item, selectedStop.id, selectedStop.name);
          setMyTrip(next);
          storeMyTrip(next);
          if (next) window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      </div>

      {!controlsOpen && !wide ? (
        <div className="switch-stop switch-stop--bottom">
          <SwitchStopButton
            onClick={() => {
              setControlsOpen(true);
              window.scrollTo({ top: 0 });
            }}
            activeFilter={mode !== 'all' || filterText.trim() !== ''}
          />
        </div>
      ) : null}
      </div>
      </div>

      {intro}
      <AboutSection />
      </div>
      </main>

      <InfoFooter
        activeTab={activeInfoTab}
        onTabChange={setActiveInfoTab}
        onChangeAnalyticsChoice={changeAnalyticsChoice}
      />

      {consentAsked ? (
        <ConsentBanner
          onAccept={acceptAnalytics}
          onDecline={declineAnalytics}
          onReadMore={() => {
            setActiveInfoTab('privacy');
            document.getElementById('sidfot')?.scrollIntoView({ block: 'start' });
          }}
        />
      ) : null}
    </div>
  );
}
