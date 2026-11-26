import { REGIONS } from './regions';
import type { BoardDirection, RegionKey, StopOption } from './types';

/**
 * Kommer ihåg senaste hållplats och riktning (localStorage) och speglar dem i
 * adressen, så att en tavla går att dela, bokmärka och lägga på hemskärmen:
 *   /?h=740021705&n=Gullmarsplan            (avgångar)
 *   /?h=740021705&n=Gullmarsplan&visa=ankomster
 */

const STORAGE_KEY = 'alltiditid:senaste';

export type SavedState = {
  stop: StopOption;
  direction: BoardDirection;
  region: RegionKey;
};

/** Regionen vars snabbval innehåller hållplatsen, annars "Hela Sverige". */
export function regionForStop(stopId: string): RegionKey {
  const region = REGIONS.find((r) => r.key !== 'all' && r.stations.some((s) => s.id === stopId));
  return region ? region.key : 'all';
}

function knownStop(id: string): StopOption | undefined {
  for (const region of REGIONS) {
    const stop = region.stations.find((s) => s.id === id);
    if (stop) return stop;
  }
  return undefined;
}

function isValidId(id: string): boolean {
  // Ett eller flera Trafiklab-id:n, separerade med komma.
  return /^\d{6,12}(,\d{6,12}){0,3}$/.test(id);
}

function fromUrl(): SavedState | null {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get('h') || '').trim();
  if (!id || !isValidId(id)) return null;
  const name = (params.get('n') || '').trim().slice(0, 80);
  const stop = knownStop(id) || (name ? { id, name } : null);
  if (!stop) return null;
  return {
    stop,
    direction: params.get('visa') === 'ankomster' ? 'arrivals' : 'departures',
    region: regionForStop(id),
  };
}

function fromStorage(): SavedState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const id = String(data?.stop?.id || '');
    const name = String(data?.stop?.name || '');
    if (!isValidId(id) || !name) return null;
    return {
      stop: knownStop(id) || { id, name, shortName: data.stop.shortName || undefined },
      direction: data.direction === 'arrivals' ? 'arrivals' : 'departures',
      region: REGIONS.some((r) => r.key === data.region) ? data.region : regionForStop(id),
    };
  } catch {
    // localStorage kan vara avstängt eller innehålla skräp.
    return null;
  }
}

/**
 * Adressen vinner (en delad länk). På en hållplatssida (/gullmarsplan) gäller sedan
 * sidans hållplats, annars senast använda hållplats.
 */
export function loadSavedState(pageStop?: StopOption): SavedState | null {
  if (typeof window === 'undefined') return null;
  const fromLink = fromUrl();
  if (fromLink) return fromLink;
  if (pageStop) {
    const saved = fromStorage();
    return {
      stop: pageStop,
      direction: 'departures',
      region: saved && saved.stop.id === pageStop.id ? saved.region : regionForStop(pageStop.id),
    };
  }
  return fromStorage();
}

export function saveState(state: SavedState, pageStop?: StopOption): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Privat läge eller fullt lagringsutrymme: appen fungerar ändå.
  }

  // På hållplatssidan för just den hållplatsen behåller adressen sin form (/gullmarsplan).
  // Byter man hållplats där blir adressen en vanlig länk från startsidan.
  if (pageStop && state.stop.id === pageStop.id && state.direction === 'departures') {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
    return;
  }
  const base = pageStop ? '/' : window.location.pathname;
  const params = new URLSearchParams(pageStop ? '' : window.location.search);
  params.set('h', state.stop.id);
  params.set('n', state.stop.name);
  if (state.direction === 'arrivals') params.set('visa', 'ankomster');
  else params.delete('visa');
  const next = `${base}?${params.toString()}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', next);
  }
}
