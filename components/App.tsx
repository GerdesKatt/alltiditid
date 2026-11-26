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
import ModeTabs, { type AppTab, type MenuKey } from './ModeTabs';
import { loadModeFor, storeModeFor } from '../lib/modeMemory';
import { habitFor, recordOpen } from '../lib/habits';
import { useWalk } from '../lib/useWalk';
import Home from './Home';
import { homeStops, markBoardShown, recordVisit } from '../lib/visits';
import { platformMinutes, walkVerdict } from '../lib/walk.mjs';
import { track } from '../lib/track';
import { alternativeFor } from '../lib/alternative.mjs';
import { matchConnection } from '../lib/transferMatch.mjs';
import { groupKey } from '../lib/lineFormat';
import JourneyPlan from './JourneyPlan';
import PlannedTripCard from './PlannedTripCard';
import { isNear, loadPlannedTrip, storePlannedTrip, type PlannedTrip } from '../lib/plannedTrip';
import { loadStopIndex, stopPageFor, type StopIndex } from '../lib/stopIndex';
import SearchPanel from './SearchPanel';
import StopAbout from './StopAbout';
import type { StopPage } from '../lib/stops';
import { groupedStop, mergeStops, sameStation } from '../lib/stationGroups.mjs';
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
      track('forsta_avgang', ms);
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
  const [mode, setModeRaw] = useState<TransportMode>('all');
  // Trafikslaget minns per hållplats: den som tar T-banan från Slussen slipper välja om.
  const selectedStopIdRef = React.useRef('');
  function setMode(next: TransportMode) {
    setModeRaw(next);
    if (selectedStopIdRef.current) storeModeFor(selectedStopIdRef.current, next);
  }
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
  // Tågets resa öppnad från kortet för att välja byte.
  // En turs hela resa (buss, T-bana, spårvagn, båt).
  const [tripRef, setTripRef] = useState<{ id: string; date: string } | null>(null);
  const [pickByte, setPickByte] = useState(false);
  useEffect(() => {
    if (!trainNumber) setPickByte(false);
  }, [trainNumber]);
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

  useEffect(() => {
    if (!hasStop) return;
    selectedStopIdRef.current = selectedStop.id;
    setModeRaw(loadModeFor(selectedStop.id));
  }, [hasStop, selectedStop.id]);

  const walk = useWalk(hasStop ? selectedStop.id : '');
  const [restored, setRestored] = useState(false);
  // Hem eller en hållplats tavla. Hem är startplatsen; Nu och ordmärket leder alltid dit.
  const [screen, setScreen] = useState<'home' | 'board'>(initialStop ? 'board' : 'home');
  const [offline, setOffline] = useState(false);
  const [view, setView] = useState<BoardView>('list');
  // Har man själv valt lista eller per linje gäller det. Annars visas stora stationer per linje
  // och riktning, så att man hittar sin riktning bland många avgångar.
  const [viewChosen, setViewChosen] = useState(false);
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
  // En planerad resa från reseplaneraren (t.ex. i morgon), sparad som Min resa.
  const [planned, setPlanned] = useState<PlannedTrip | null>(null);
  const [recentStops, setRecentStops] = useState<StopOption[]>([]);
  // Resans egna avgångar när tavlan visar en annan hållplats.
  const [tripDepartures, setTripDepartures] = useState<Departure[]>([]);
  const [tripLoading, setTripLoading] = useState(false);
  // Inställningarna (region, snabbval, sök, filter) är öppna vid första besöket och
  // fälls ihop när det finns en sparad hållplats, så att tavlan kommer först.
  // Sökpanelen öppnas när man trycker på sök; Hem har ett eget sökfält.
  const [controlsOpen, setControlsOpen] = useState(false);
  useEffect(() => {
    setFavorites(loadFavorites());
    setMyTrip(loadMyTrip());
    setPlanned(loadPlannedTrip());
    setRecentStops(loadRecentStops());
    try {
      const savedView = window.localStorage.getItem(VIEW_KEY);
      if (savedView === 'lines') setView('lines');
      if (savedView === 'lines' || savedView === 'list') setViewChosen(true);
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
    // Återkommande besökare: bara om en hållplats redan var sparad (ingen ny lagring för mätningen).
    track('aterkommande', 0, saved ? 'ja' : 'nej');
    // Sidan öppnas alltid på Hem (utom hållplatssidor, som öppnar sin tavla).
    if (saved) {
      setRegion(saved.region);
      setSelectedStop(saved.stop);
      // Ankomster är ett sällanval (hämta någon): sidan öppnas alltid med avgångar.
      setControlsOpen(false);
    }
    setRestored(true);
  }, []);

  // Väljer man en hållplats (sök, favorit, byte, tåg) visas dess tavla.
  const lastStopId = React.useRef<string | null>(null);
  useEffect(() => {
    if (!restored) return;
    if (lastStopId.current !== null && lastStopId.current !== selectedStop.id && hasStop) setScreen('board');
    lastStopId.current = selectedStop.id;
  }, [restored, selectedStop.id, hasStop]);

  // Dina hållplatser för Hem: läses ur webbläsaren först efter laddningen (servern vet inget om dem).
  const [homeList, setHomeList] = useState<StopOption[]>([]);
  useEffect(() => {
    if (!restored) return;
    setHomeList(homeStops(favorites, Date.now()));
  }, [restored, favorites, screen]);

  // Hem lär sig vilka tavlor man tittar på, och när en tavla senast visades.
  useEffect(() => {
    if (!restored || screen !== 'board' || tab !== 'trafik' || !hasStop) return;
    recordVisit({ id: selectedStop.id, name: selectedStop.name });
    markBoardShown();
    const timer = setInterval(() => markBoardShown(), 60_000);
    return () => clearInterval(timer);
  }, [restored, screen, tab, hasStop, selectedStop.id, selectedStop.name]);

  // Mätpunkter utan kakor (lib/track.ts).
  const startedAt = React.useRef(Date.now());
  const interacted = React.useRef(false);
  const cardShownRef = React.useRef(false);
  useEffect(() => {
    const onDown = () => {
      interacted.current = true;
    };
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const secs = (Date.now() - startedAt.current) / 1000;
      // Tittade och gick: under 15 s utan ett enda tryck. Med ett kort överst är det ett bra besök.
      if (!interacted.current && secs < 15) track('tittade_och_gick', secs, cardShownRef.current ? 'kort' : 'utan');
    };
    document.addEventListener('pointerdown', onDown, { once: true });
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);
  const firstStopId = React.useRef<string | null>(null);
  useEffect(() => {
    if (!restored || !hasStop) return;
    if (firstStopId.current === null) {
      firstStopId.current = selectedStop.id;
      return;
    }
    // Fel hållplats öppnades: byte inom 10 sekunder från start.
    if (selectedStop.id !== firstStopId.current && Date.now() - startedAt.current < 10_000) track('byte_snabbt');
  }, [restored, hasStop, selectedStop.id]);

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
    if (!restored) return;
    if (hasStop) saveState({ stop: selectedStop, direction, region }, initialStop, stationPage?.slug);
    // På Hem är adressen startsidan: en omladdning ger Hem, och ingen hållplatstext följer med.
    if (screen === 'home' && tab === 'trafik' && typeof window !== 'undefined' && window.location.pathname + window.location.search !== '/') {
      window.history.replaceState(null, '', `/${window.location.hash}`);
    }
  }, [restored, hasStop, selectedStop, direction, region, stationPage?.slug, screen, tab]);

  /** Byt hållplats från stationsbladet (grannhållplatserna). */
  function selectStopFromSheet(picked: StopOption) {
    const stop = groupedStop(picked);
    setSelectedStop(stop);
    setRecentStops((list) => rememberStop(list, stop));
    const stopRegion = regionForStop(stop.id);
    if (stopRegion !== 'all') setRegion(stopRegion);
    setStationOpen(false);
    showBoard();
  }

  const currentRegionObj = REGIONS.find((r) => r.key === region) || REGIONS[0];

  function handleRegionChange(newRegion: RegionKey) {
    setRegion(newRegion);
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

    // Sökavhopp: ett sökord som står kvar i 30 sekunder utan att något valts.
    const gaveUp = setTimeout(() => track('sokavhopp'), 30_000);
    return () => {
      clearTimeout(timer);
      clearTimeout(gaveUp);
    };
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

  /** Till Hem: från menyn (Nu), ordmärket och ← Hem på tavlan. */
  function goHome() {
    setScreen('home');
    setControlsOpen(false);
    setTab('trafik');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }

  function openStopFromHome(stop: StopOption) {
    setSelectedStop(stop);
    const stopRegion = regionForStop(stop.id);
    if (stopRegion !== 'all') setRegion(stopRegion);
    setDirection('departures');
    setControlsOpen(false);
    setScreen('board');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }

  /** Menyn: Nu, Min resa och Sök. Sök öppnar sökfältet ovanpå tavlan. */
  function onMenu(key: MenuKey) {
    if (key === 'resa') {
      changeTab('resa');
      return;
    }
    changeTab('trafik');
    if (key === 'trafik') {
      goHome();
      return;
    }
    track('funktion', 0, 'sok');
    setControlsOpen(true);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      document.getElementById('sok-hallplats')?.focus();
    });
  }

  // Min resa: nästa avgångar för den sparade linjen, och vad man tar om den är inställd.
  const tripList = tripOnBoard ? departures : tripDepartures;
  const tripNext = myTrip ? nextForTrip(myTrip, tripList, now, DEPARTED_GRACE_MS) : [];
  const tripAlternative = tripNext[0] ? alternativeFor(tripNext[0], tripList) : null;

  // "Du brukar ta …": samma linje öppnad tre gånger härifrån vid den här tiden.
  const habit = useMemo(() => {
    if (!restored || !hasStop || direction !== 'departures') return null;
    const h = habitFor(selectedStop.id, now);
    if (!h || (myTrip && myTrip.stopId === selectedStop.id && myTrip.key === h.key)) return null;
    return departures.some((d) => groupKey(d) === h.key) ? h : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, hasStop, direction, selectedStop.id, myTrip, departures]);

  // Min resa utan något sparat: "Vart ska du?" bland avgångarna från tavlans hållplats.
  const [goal, setGoal] = useState('');
  const goalHits = useMemo(() => {
    if (goal.trim().length < 2 || !hasStop) return [];
    return departures.filter((d) => d.status !== 'cancelled' && matchConnection(d, goal).hit).slice(0, 5);
  }, [goal, departures, hasStop]);

  const walkMin = direction === 'departures' && walk.state.kind === 'ready' ? walk.state.minutes : null;
  const journeyCards = (
    <>
      {planned ? (
        <PlannedTripCard
          planned={planned}
          now={now}
          onRemove={() => {
            setPlanned(null);
            storePlannedTrip(null);
          }}
        />
      ) : null}
      {myTrain ? (
        <MyTrainCard
          train={myTrain}
          onOpen={() => {
            setStationOpen(false);
            setPickByte(false);
            setTrainNumber(myTrain.number);
          }}
          onPickByte={() => {
            setStationOpen(false);
            setPickByte(true);
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
          walkMinutes={myTrip.stopId === selectedStop.id ? walkMin : null}
          trip={myTrip}
          next={tripNext}
          alternative={tripAlternative}
          loading={tripOnBoard ? loading : tripLoading}
          now={now}
          showingStop={myTrip.stopId === selectedStop.id}
          onShowStop={() => {
            setSelectedStop({ id: myTrip.stopId, name: myTrip.stopName });
            const stopRegion = regionForStop(myTrip.stopId);
            if (stopRegion !== 'all') setRegion(stopRegion);
            setDirection('departures');
            setControlsOpen(false);
            setTab('trafik');
          }}
          onRemove={() => {
            setMyTrip(null);
            storeMyTrip(null);
          }}
        />
      ) : null}
    </>
  );
  // Din avgång utan att något är sparat: linjen du brukar ta, annars nästa avgång du hinner.
  // Svaret på "när går min?" står då alltid överst, utan ett enda tryck.
  const autoTrip = useMemo(() => {
    if (!restored || !hasStop || direction !== 'departures' || departures.length === 0) return null;
    // En planerad resa långt fram (i morgon) är en kompakt rad: då behövs ändå svaret för nu.
    if (myTrain || (planned && isNear(planned, now)) || (myTrip && myTrip.stopId === selectedStop.id)) return null;
    const upcoming = departures.filter((d) => {
      const at = parseLocal(d.expectedAt);
      if (d.status === 'cancelled' || at === null) return false;
      // Samma trafikslag som tavlan visar.
      if (mode !== 'all' && d.transportMode !== mode) return false;
      // En avgång som går nu hinner man inte: minst en minut kvar.
      if (walkMin === null) return at >= now + 60_000;
      return walkVerdict(Math.floor((at - now) / 60000), walkMin, platformMinutes(d.transportMode)).kind !== 'missed';
    });
    const pick = (habit && upcoming.find((d) => groupKey(d) === habit.key)) || upcoming[0];
    if (!pick) return null;
    return { trip: tripFrom(pick, selectedStop.id, selectedStop.name), reason: habit && groupKey(pick) === habit.key ? ('habit' as const) : ('next' as const) };
  }, [restored, hasStop, direction, departures, myTrain, planned, myTrip, selectedStop.id, selectedStop.name, habit, walkMin, now, mode]);
  // Samma regel som valet: de avgångar som går om minst en minut (gångtid av).
  const autoNext = autoTrip
    ? nextForTrip(
        autoTrip.trip,
        walkMin === null ? departures.filter((d) => (parseLocal(d.expectedAt) ?? Infinity) >= now + 60_000) : departures,
        now,
        DEPARTED_GRACE_MS
      )
    : [];
  const autoCard = autoTrip ? (
    <MyTripCard
      trip={autoTrip.trip}
      next={autoNext}
      alternative={autoNext[0] ? alternativeFor(autoNext[0], departures) : null}
      loading={loading}
      now={now}
      showingStop
      onShowStop={() => {}}
      onRemove={() => {}}
      auto={autoTrip.reason}
      walkMinutes={walkMin}
      onSave={() => {
        setMyTrip(autoTrip.trip);
        storeMyTrip(autoTrip.trip);
        track('funktion', 0, autoTrip.reason === 'habit' ? 'vanor' : 'min_resa');
      }}
    />
  ) : null;
  cardShownRef.current = Boolean(myTrain || myTrip || planned || autoTrip);

  return (
    <div id="alltiditid-app" className="app-shell" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <a href="#avgangstavla" className="skip-link">
        {t('Hoppa till avgångar', 'Skip to departures')}
      </a>
      <Header onContactClick={() => setActiveInfoTab('contact')} onHome={goHome} />
      <main id="innehall">
      <ModeTabs
        active={tab === 'resa' ? 'resa' : tab === 'flyg' ? 'sok' : !wide && controlsOpen ? 'sok' : 'trafik'}
        onChange={onMenu}
        hasJourney={Boolean(myTrain || myTrip || planned)}
      />
      {tab === 'flyg' ? <FlightView initialAirport={flightAirport} /> : null}
      {tab === 'resa' ? (
        <section aria-label={t('Min resa', 'My trip')} style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, margin: '0 0 12px' }}>{t('Min resa', 'My trip')}</h1>
      {journeyCards}
            <div
              style={{
                padding: '20px',
                borderRadius: 'var(--radius-card)',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.surface,
              }}
            >
              <label htmlFor="vart-ska-du" style={{ display: 'block', fontSize: '0.9375rem', fontWeight: 700 }}>
                {t('Vart ska du?', 'Where are you going?')}
              </label>
              <input
                id="vart-ska-du"
                type="text"
                autoComplete="off"
                value={goal}
                enterKeyHint="search"
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => {
                  // Sök på tangentbordet startar resesökningen.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).blur();
                    document.getElementById('sok-resa')?.click();
                  }
                }}
                placeholder={t('Ort, hållplats eller adress', 'Town, stop or address')}
                style={{ ...textInput(colors.borderStrong), display: 'block', marginTop: '6px', minHeight: '48px', fontSize: '1rem' }}
              />
              <JourneyPlan
                goal={goal}
                fromId={hasStop ? selectedStop.id : ''}
                fromName={hasStop ? selectedStop.name : ''}
                savedKey={planned ? `${planned.trip.depDate} ${planned.trip.dep}` : ''}
                onSave={(to, from, trip) => {
                  const next = { to, from, trip, savedAt: Date.now() };
                  setPlanned(next);
                  storePlannedTrip(next);
                }}
              />
              {goal.trim().length >= 2 && hasStop && goalHits.length > 0 ? (
                <p
                  style={{
                    margin: '18px 0 0',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: colors.textDim,
                  }}
                >
                  {t(`Direkt från ${selectedStop.name}`, `Direct from ${selectedStop.name}`)}
                </p>
              ) : null}
              {goal.trim().length >= 2 ? (
                !hasStop || goalHits.length === 0 ? null : (
                  <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                    {goalHits.map((d) => (
                      <li
                        key={d.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '52px', borderBottom: `1px solid ${colors.border}` }}
                      >
                        <span style={{ flex: 1, minWidth: 0, fontSize: '0.9375rem' }}>
                          <strong>{lineLabel(d.line, lang)}</strong> {t('mot', 'to')} {d.destination}
                          <span style={{ display: 'block', fontSize: '0.8125rem', color: colors.textDim }}>
                            {t('från', 'from')} {selectedStop.name} · {d.newTime || d.estimatedTime || d.scheduledTime}
                            {d.track ? ` · ${d.track}` : ''}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (d.trainNumber && (d.transportMode === 'train' || d.transportMode === 'commuter')) {
                              const next = myTrainFor(d.trainNumber);
                              setMyTrain(next);
                              storeMyTrain(next);
                              track('funktion', 0, 'mitt_tag');
                            } else {
                              const next = tripFrom(d, selectedStop.id, selectedStop.name);
                              setMyTrip(next);
                              storeMyTrip(next);
                              track('funktion', 0, 'min_resa');
                            }
                            setGoal('');
                          }}
                          style={{
                            minHeight: '44px',
                            padding: '0 14px',
                            borderRadius: 'var(--radius-control)',
                            border: 'none',
                            backgroundColor: colors.accentStrong,
                            color: colors.onAccent,
                            fontSize: '0.875rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {t('Följ', 'Follow')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
              <p style={{ margin: '18px 0 8px', fontSize: '0.875rem', fontWeight: 600, color: colors.textDim }}>
                {t('Har du ett tågnummer?', 'Do you have a train number?')}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = journeyQuery.replace(/\D/g, '');
                  if (n.length < 2) return;
                  // Avsikten är tydlig här: följ tåget direkt, utan ett extra steg.
                  const next = myTrainFor(n);
                  setMyTrain(next);
                  storeMyTrain(next);
                  setJourneyQuery('');
                }}
                style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}
              >
                <label style={{ flex: '1 1 10rem', fontSize: '0.8125rem', fontWeight: 600, color: colors.textDim }}>
                  <span className="sr-only">{t('Tågnummer', 'Train number')}</span>
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
                  {t('Följ tåget', 'Follow train')}
                </button>
              </form>
              <p style={{ margin: '14px 0 0', fontSize: '0.875rem', lineHeight: 1.5, color: colors.textDim }}>
                {t(
                  'Tågnumret står på biljetten. En buss- eller tunnelbanelinje sparar du från tavlan: tryck på avgången och välj Spara som min resa.',
                  'The train number is on your ticket. Save a bus or metro line from the board: tap the departure and choose Save as my trip.'
                )}
              </p>
            </div>
        </section>
      ) : null}
      <div>

      {trainNumber && !onBoardTrip ? <SheetBackdrop onClose={() => { setTrainNumber(null); setPickByte(false); }} /> : null}
      {stationOpen && !onBoardTrip && !trainNumber && !tripRef ? <SheetBackdrop onClose={() => setStationOpen(false)} /> : null}
      {tripRef && !trainNumber && !onBoardTrip ? <SheetBackdrop onClose={() => setTripRef(null)} /> : null}
      {tripRef && !trainNumber && !onBoardTrip ? (
        <TrainSheet
          number=""
          trip={tripRef}
          onClose={() => setTripRef(null)}
          onOpenStation={(name, areaId) => {
            if (!areaId) return;
            setTripRef(null);
            setTab('trafik');
            setSelectedStop({ id: areaId, name });
            setRecentStops((list) => rememberStop(list, { id: areaId, name }));
            showBoard();
          }}
        />
      ) : null}
      {trainNumber && !onBoardTrip ? (
        <TrainSheet
          number={trainNumber}
          onClose={() => {
            setTrainNumber(null);
            setPickByte(false);
          }}
          pickByte={pickByte}
          onByteSaved={
            pickByte
              ? () => {
                  setTrainNumber(null);
                  setPickByte(false);
                }
              : undefined
          }
          offStation={myTrain?.number === trainNumber ? myTrain.off : undefined}
          onSetOff={(name) => {
            // Att välja avstigning sparar också tåget som Mitt tåg.
            const next = { ...myTrainFor(trainNumber), ...(name ? { off: name } : {}) };
            setMyTrain(next);
            storeMyTrain(next);
          }}
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
                showBoard();
              })
              .catch(() => {});
          }}
        />
      ) : null}

      {stationOpen && !onBoardTrip && !trainNumber && !tripRef ? (
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
      {controlsOpen || (wide && screen === 'board') ? (
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
          onOpenFlights={() => {
            track('funktion', 0, 'flyg');
            changeTab('flyg');
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
            setStationQuery('');
            setSuggestions([]);
            showBoard();
          }}
          filterText={filterText}
          onFilterTextChange={setFilterText}
        />
      ) : null}
      </div>

      <div className="layout-board">
      {tab === 'trafik' ? journeyCards : null}
      {tab === 'trafik' && screen === 'home' ? (
        <Home
          stops={homeList}
          now={now}
          onOpenStop={openStopFromHome}
          onSearch={() => onMenu('sok')}
          onOpenFlights={() => {
            track('funktion', 0, 'flyg');
            changeTab('flyg');
          }}
        />
      ) : (
        <>
      {tab === 'trafik' ? (
        <button type="button" onClick={goHome} className="back-home">
          <span aria-hidden="true">←</span> {t('Hem', 'Home')}
        </button>
      ) : null}
      {tab === 'trafik' ? autoCard : null}

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
          setTripRef(null);
          setTrainNumber(n);
        }}
        onShowTrip={(tr) => {
          setStationOpen(false);
          setTrainNumber(null);
          setTripRef(tr);
        }}
        filterText={filterText}
        onClearFilter={() => setFilterText('')}
        onOpenStation={() => {
          setTrainNumber(null);
          setTripRef(null);
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
        view={viewChosen ? view : 'list'}
        walk={walk}
        onRowOpen={(item) => {
          if (direction === 'departures') recordOpen(selectedStop.id, item);
        }}
        onViewChange={(next) => {
          setView(next);
          setViewChosen(true);
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
          if (next) track('funktion', 0, 'min_resa');
        }}
      />
      </div>
        </>
      )}

      </div>
      </div>

      {/* Texten om hållplatsen följer tavlan: byter man hållplats på en hållplatssida visas
          den nya hållplatsens text (eller ingen, om den saknar egen sida). */}
      {tab === 'trafik' && screen === 'home' ? null : page && stationPage?.id === page.id ? (
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
