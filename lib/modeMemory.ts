import type { TransportMode } from './types';

/**
 * Trafikslaget man valt på en hållplats, så att den som tar T-banan från Slussen
 * slipper trycka T-bana varje gång. Bara i webbläsaren, högst 40 hållplatser.
 */
const KEY = 'alltiditid:trafikslag';
const MODES: TransportMode[] = ['all', 'subway', 'commuter', 'tram', 'bus', 'train', 'ferry'];

function read(): Record<string, TransportMode> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function loadModeFor(stopId: string): TransportMode {
  if (typeof window === 'undefined' || !stopId) return 'all';
  const m = read()[stopId];
  return MODES.includes(m) ? m : 'all';
}

export function storeModeFor(stopId: string, mode: TransportMode): void {
  if (typeof window === 'undefined' || !stopId) return;
  try {
    const map = read();
    delete map[stopId];
    if (mode !== 'all') map[stopId] = mode;
    const entries = Object.entries(map).slice(-40);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Valet gäller tills sidan laddas om.
  }
}

/** Trafikslagen man kan välja, i samma ordning på tavlan och på Avgångar. */
export const MODE_CHOICES: { key: Exclude<TransportMode, 'all'>; label: string }[] = [
  { key: 'train', label: 'Tåg' },
  { key: 'commuter', label: 'Pendel' },
  { key: 'subway', label: 'T-bana' },
  { key: 'tram', label: 'Spårvagn' },
  { key: 'bus', label: 'Buss' },
  { key: 'ferry', label: 'Båt' },
];

/**
 * Trafikslaget man valt på Avgångar (Dina hållplatser och Linjer nära dig). Ett val för hela
 * sidan, så att den som bara tar T-banan slipper bussarna varje morgon.
 */
const HOME_KEY = 'alltiditid:trafikslag-hem';

export function loadHomeMode(): TransportMode {
  if (typeof window === 'undefined') return 'all';
  try {
    const m = window.localStorage.getItem(HOME_KEY) as TransportMode | null;
    return m && MODES.includes(m) ? m : 'all';
  } catch {
    return 'all';
  }
}

export function storeHomeMode(mode: TransportMode): void {
  if (typeof window === 'undefined') return;
  try {
    if (mode === 'all') window.localStorage.removeItem(HOME_KEY);
    else window.localStorage.setItem(HOME_KEY, mode);
  } catch {
    // Valet gäller tills sidan laddas om.
  }
}
