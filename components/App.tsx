'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
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
import { loadMyTrain, myTrainFor, storeMyTrain, type MyTrain } from '../lib/myTrain';
import SheetBackdrop from './SheetBackdrop';
import { colors, textInput } from './styles';
import ModeTabs, { type AppTab } from './ModeTabs';
import { loadStopIndex, stopPageFor, type StopIndex } from '../lib/stopIndex';
import SearchPanel from './SearchPanel';
import StopAbout from './StopAbout';
import type { StopPage } from '../lib/stops';
import { groupedStop, mergeStops, sameStation } from '../lib/stationGroups.mjs';
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

// Det som inte behövs för första tavlan hämtas först när det öppnas:
// flyg, tågets hela resa, stationsarket, ombordpanelen och Mitt tåg.
const FlightView = dynamic(() => import('./FlightView'), { ssr: false });
const TrainSheet = dynamic(() => import('./TrainSheet'), { ssr: false });
const StationSheet = dynamic(() => import('./StationSheet'), { ssr: false });
const OnBoardPanel = dynamic(() => import('./OnBoardPanel'), { ssr: false });
const MyTrainCard = dynamic(() => import('./MyTrainCard'), { ssr: false });

/** Lista eller per linje, sparat i webbläsaren. */
const VIEW_KEY = 'alltiditid:vy';
/** Samma brytpunkt som .layout i globals.css. */
const WIDE_QUERY = '(min-width: 1100px)';
import { buildShareMessage } from '../lib/shareMessage';
import { lineLabel, useLang } from '../lib/i18n';
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
  /** Hållplatssidan som sidan gäller (/gullmarsplan). */
  page?: StopPage;
  /** Text om sidans hållplats under tavlan, renderad på servern för sökmotorerna. */
  intro?: React.ReactNode;
};

/** Trafikslagen som kan väljas på tavlan, i den ordning de visas. */
const BOARD_MODES: { key: Exclude<TransportMode, 'all'>; label: string }[] = [
  { key: 'train', label: 'Tåg' },
  { key: 'commuter', label: 'Pendel' },
  { key: 'subway', label: 'T-bana' },
  { key: 'tram', label: 'Spårvagn' },
  { key: 'bus', label: 'Buss' },
  { key: 'ferry', label: 'Båt' },
];

export default function App({ initialStop, page, intro }: AppProps) {
  const { lang, t } = useLang();
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
  const [myTrain, setMyTrain] = useState<MyTrain | null>(null);
  useEffect(() => {
    setMyTrain(loadMyTrain());
  }, []);
  // Kollektivtrafik eller flyg, och flygplatsen som sökningen pekade på.
  const [tab, setTab] = useState<AppTab>('trafik');
  const [journeyQuery, setJourneyQuery] = useState('');
  const [flightAirport, setFlightAirport] = useState<string | undefined>(undefined);
  useEffect(() => {
    try {
      if (!initialStop && ['flyg', 'resa'].includes(window.localStorage.getItem('alltiditid:flik') || '')) {
        setTab(window.localStorage.getItem('alltiditid:flik') as AppTab);
      }
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

  // Sidans egen hållplats så länge tavlan visar den (eller stationen den hör till, så att
  // /t-centralen-t-bana stannar på sin sida), annars den valda hållplatsens sida.
  const stationPage =
    page && sameStation(page.id, selectedStop.id) ? page : stopPageFor(stopIndex, selectedStop.id);

  useEffect(() => {
    if (!restored || !hasStop) return;
    saveState({ stop: selectedStop, direction, region }, initialStop, stationPage?.slug);
  }, [restored, hasStop, selectedStop, direction, region, stationPage?.slug]);

  /** Byt hållplats från stationsbladet (grannhållplatserna). */
  function selectStopFromSheet(picked: StopOption) {
    const stop = groupedStop(picked);
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
          setSuggestions(mergeStops(data.stops || []));
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
          if (!res.ok) throw new Error(t(data.error || 'Fel vid hämtning', 'Could not load the board.'));
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
            setErrorMsg(err.message || t('Kunde inte hämta trafikinformation just nu.', 'Could not load traffic information right now.'));
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

  // Trafikslagen som faktiskt går från hållplatsen just nu, för valen på tavlan.
  // Det valda visas alltid, så att det går att välja bort även om det inte längre finns.
  const boardModes = useMemo(
    () => BOARD_MODES.filter((m) => m.key === mode || departures.some((d) => d.transportMode === m.key)),
    [departures, mode]
  );

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
      (lang === 'en' && lineLabel(d.line, 'en').toLowerCase().includes(queryLower)) ||
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
    const text = buildShareMessage(trip, selectedStop.name, riderStatus, riderNote, lang);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `${t('Resestatus', 'Trip status')}: ${selectedStop.name}`,
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
        {t('Hoppa till avgångar', 'Skip to departures')}
      </a>
      <Header onContactClick={() => setActiveInfoTab('contact')} />
      <main id="innehall">
      <ModeTabs tab={tab} onChange={changeTab} hasJourney={Boolean(myTrain || myTrip)} />
      {tab === 'flyg' ? <FlightView initialAirport={flightAirport} /> : null}
      {tab === 'resa' ? (
        <section aria-label={t('Min resa', 'My trip')} style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, margin: '0 0 12px' }}>{t('Min resa', 'My trip')}</h1>
      {myTrain ? (
        <MyTrainCard
          train={myTrain}
          onOpen={() => {
            setStationOpen(false);
            setTrainNumber(myTrain.number);
          }}
          onRemove={() => {
            setMyTrain(null);
            storeMyTrain(null);
          }}
        />
      ) : null}
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
            setTab('trafik');
          }}
          onRemove={() => {
            setMyTrip(null);
            storeMyTrip(null);
          }}
        />
      ) : null}
          {!myTrain && !myTrip ? (
            <div
              style={{
                padding: '20px',
                borderRadius: 'var(--radius-card)',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.surface,
              }}
            >
              <p style={{ margin: '0 0 14px', fontSize: '0.9375rem', lineHeight: 1.5, color: colors.textDim }}>
                {t(
                  'Här följer du ett tåg hela vägen: var det är, när det är framme och om du hinner bytet.',
                  "Follow a train all the way: where it is, when it arrives and whether you'll make your connection."
                )}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = journeyQuery.replace(/\D/g, '');
                  if (n.length < 2) return;
                  setStationOpen(false);
                  setTrainNumber(n);
                }}
                style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}
              >
                <label style={{ flex: '1 1 10rem', fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>
                  {t('Tågnummer', 'Train number')}
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={journeyQuery}
                    onChange={(e) => setJourneyQuery(e.target.value)}
                    placeholder={t('t.ex. 532', 'e.g. 532')}
                    style={{ ...textInput(colors.borderStrong), display: 'block', marginTop: '4px', minHeight: '48px', fontSize: '1rem' }}
                  />
                </label>
                <button
                  type="submit"
                  style={{
                    minHeight: '48px',
                    padding: '0 18px',
                    borderRadius: 'var(--radius-control)',
                    border: 'none',
                    backgroundColor: colors.accentStrong,
                    color: colors.onAccent,
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t('Visa tåget', 'Show train')}
                </button>
              </form>
              <p style={{ margin: '14px 0 0', fontSize: '0.875rem', lineHeight: 1.5, color: colors.textDim }}>
                {t(
                  'Tågnumret står på biljetten. Välj Spara som mitt tåg när tåget visas. En buss- eller tunnelbanelinje sparar du från tavlan: tryck på avgången och välj Spara som min resa.',
                  'The train number is on your ticket. Choose Save as my train when the train is shown. Save a bus or metro line from the board: tap the departure and choose Save as my trip.'
                )}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
      <div>

      {trainNumber && !onBoardTrip ? <SheetBackdrop onClose={() => setTrainNumber(null)} /> : null}
      {stationOpen && !onBoardTrip && !trainNumber ? <SheetBackdrop onClose={() => setStationOpen(false)} /> : null}
      {trainNumber && !onBoardTrip ? (
        <TrainSheet
          number={trainNumber}
          onClose={() => setTrainNumber(null)}
          saved={myTrain?.number === trainNumber}
          onToggleSaved={() => {
            const next = myTrain?.number === trainNumber ? null : myTrainFor(trainNumber);
            setMyTrain(next);
            storeMyTrain(next);
          }}
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
                const station = groupedStop({ id: hit.id, name: hit.name });
                setSelectedStop(station);
                setRecentStops((list) => rememberStop(list, station));
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
          neighbours={mergeStops(
            (stationPage?.near || [])
              .map((id) => stopIndex?.byId.get(id))
              .filter((n): n is NonNullable<typeof n> => Boolean(n) && !sameStation(n.id, selectedStop.id))
          )}
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
          shareMessage={buildShareMessage(onBoardTrip, selectedStop.name, riderStatus, riderNote, lang)}
          copied={copiedMsg}
          onShare={() => handleShareTrip(onBoardTrip)}
          onClose={() => {
            setOnBoardTrip(null);
            setRiderNote('');
            setCopiedMsg(false);
          }}
        />
      ) : null}

      <div style={tab === 'trafik' ? undefined : { display: 'none' }}>
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
          onSuggestionSelect={(picked) => {
            // Sökförslagen är redan ihopslagna; närmaste hållplatserna kommer också hit.
            const stop = groupedStop(picked);
            setSelectedStop({ id: stop.id, name: stop.name, ...(stop.shortName ? { shortName: stop.shortName } : {}) });
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
            activeFilter={filterText.trim() !== ''}
          />
        </div>
      )}
      </div>

      <div className="layout-board">
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
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 6px' }}>{t('Välj en hållplats', 'Choose a stop')}</h1>
          <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: colors.textDim }}>
            {t(
              'Sök på en station, en hållplats eller ett tågnummer, välj ett snabbval eller tryck på',
              'Search for a station, a stop or a train number, pick a shortcut or tap'
            )}{' '}
            <strong style={{ color: colors.text }}>{t('Nära mig', 'Near me')}</strong>.
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
        modes={boardModes}
        mode={mode}
        onModeChange={setMode}
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
            activeFilter={filterText.trim() !== ''}
          />
        </div>
      ) : null}
      </div>
      </div>

      {/* Texten om hållplatsen följer tavlan: byter man hållplats på en hållplatssida visas
          den nya hållplatsens text (eller ingen, om den saknar egen sida). */}
      {page && stationPage?.id === page.id ? (
        intro
      ) : page && stationPage && stopIndex ? (
        <StopAbout stop={stationPage} pages={stopIndex.list} />
      ) : null}
      <AboutSection />
      </div>
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
