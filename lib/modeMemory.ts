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
