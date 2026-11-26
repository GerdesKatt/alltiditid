import type { Departure } from './types';
import { groupKey, parseLocal } from './lineFormat';

/**
 * "Min resa": en linje mot ett mål från en hållplats, t.ex. 19 mot Hässelby strand
 * från Gullmarsplan. De tre nästa avgångarna visas överst utan att man trycker.
 * Sparas bara i webbläsaren (localStorage), aldrig på servern.
 */
export type MyTrip = {
  stopId: string;
  stopName: string;
  /** groupKey(): linje och mål, t.ex. "Tunnelbana 19|Hässelby strand". */
  key: string;
  line: string;
  destination: string;
};

const STORAGE_KEY = 'alltiditid:min-resa';

function isValidStopId(id: string): boolean {
  return /^\d{6,12}(,\d{6,12}){0,3}$/.test(id);
}

export function loadMyTrip(): MyTrip | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const trip: MyTrip = {
      stopId: String(d?.stopId || ''),
      stopName: String(d?.stopName || '').slice(0, 80),
      key: String(d?.key || '').slice(0, 200),
      line: String(d?.line || '').slice(0, 80),
      destination: String(d?.destination || '').slice(0, 120),
    };
    if (!isValidStopId(trip.stopId) || !trip.stopName || !trip.key || !trip.line) return null;
    return trip;
  } catch {
    return null;
  }
}

export function storeMyTrip(trip: MyTrip | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (trip) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Privat läge eller fullt: resan gäller då bara tills sidan laddas om.
  }
}

export function tripFrom(item: Departure, stopId: string, stopName: string): MyTrip {
  return { stopId, stopName, key: groupKey(item), line: item.line, destination: item.destination };
}

export function isMyTrip(trip: MyTrip | null, item: Departure, stopId: string): boolean {
  return Boolean(trip && trip.stopId === stopId && trip.key === groupKey(item));
}

/** De närmaste avgångarna för resan, i tidsordning, utan dem som redan gått. */
export function nextForTrip(trip: MyTrip, departures: Departure[], now: number, graceMs: number, count = 3): Departure[] {
  return departures
    .filter((d) => groupKey(d) === trip.key)
    .filter((d) => {
      const m = parseLocal(d.expectedAt);
      return m === null || m >= now - graceMs;
    })
    .slice(0, count);
}
