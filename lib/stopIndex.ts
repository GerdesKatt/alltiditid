import type { StopPage } from './stops';

/**
 * Hållplatslistan i webbläsaren (public/stops.json, byggd av scripts/fetch-stops.mjs).
 * Hämtas en gång, när den behövs, så att den inte gör första laddningen tyngre.
 */
export type StopIndex = {
  byId: Map<string, StopPage>;
};

let loading: Promise<StopIndex | null> | null = null;

export function loadStopIndex(): Promise<StopIndex | null> {
  if (!loading) {
    loading = fetch('/stops.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((list: StopPage[]) => ({ byId: new Map(list.map((s) => [s.id, s])) }))
      .catch(() => {
        loading = null; // försök igen nästa gång
        return null;
      });
  }
  return loading;
}

/** Stationens sida för en hållplats på tavlan. Ihopslagna id:n (Göteborg C) går på det första. */
export function stopPageFor(index: StopIndex | null, stopId: string): StopPage | undefined {
  if (!index) return undefined;
  return index.byId.get(stopId.split(',')[0]);
}
