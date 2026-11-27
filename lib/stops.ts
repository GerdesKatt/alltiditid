import data from '../data/stops.json';
import { REGIONS } from './regions';
import { groupFor, groupStop } from './stationGroups.mjs';
import type { StopOption } from './types';

/** En hållplats med egen sida (/gullmarsplan), från scripts/fetch-stops.mjs. */
export type StopPage = {
  id: string;
  name: string;
  slug: string;
  place?: string;
  modes: string[];
  /** Genomsnittligt antal avgångar per dag enligt Trafiklab (0 = okänt). */
  daily: number;
  lat: number;
  lon: number;
  near: string[];
};

export const STOP_PAGES: StopPage[] = data as StopPage[];

const byId = new Map(STOP_PAGES.map((s) => [s.id, s]));
const bySlug = new Map(STOP_PAGES.map((s) => [s.slug, s]));

export function stopBySlug(slug: string): StopPage | undefined {
  return bySlug.get(slug);
}

export function stopById(id: string): StopPage | undefined {
  return byId.get(id);
}

/**
 * Hållplatsen som tavlan ska visa. Hållplatser som hör ihop (lib/stationGroups.mjs) visar
 * hela stationen, så att /t-centralen-t-bana och /stockholm-centralstation får samma tavla.
 */
export function boardStopFor(stop: StopPage): StopOption {
  const group = groupFor(stop.id);
  if (group) return groupStop(group);
  for (const region of REGIONS) {
    for (const st of region.stations) {
      if (st.id.split(',')[0] === stop.id) return st;
    }
  }
  return { id: stop.id, name: stop.name };
}

export { modesText } from './stopText';

/** "Göteborg" → "goteborg", "Upplands Väsby" → "upplands-vasby". */
export function placeSlug(place: string): string {
  return place
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type CityPage = { place: string; slug: string; stops: StopPage[] };

/**
 * Stadssidor (/avgangar/goteborg) för de 20 orter som har flest hållplatssidor (minst två),
 * med ortens hållplatser i trafikordning.
 */
export const CITY_PAGES: CityPage[] = (() => {
  const byPlace = new Map<string, StopPage[]>();
  for (const s of STOP_PAGES) {
    if (!s.place) continue;
    if (!byPlace.has(s.place)) byPlace.set(s.place, []);
    byPlace.get(s.place)!.push(s);
  }
  return [...byPlace.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'sv'))
    .slice(0, 20)
    .map(([place, list]) => ({
      place,
      slug: placeSlug(place),
      stops: list.slice().sort((a, b) => (b.daily || 0) - (a.daily || 0) || a.name.localeCompare(b.name, 'sv')),
    }));
})();

export function cityBySlug(slug: string): CityPage | undefined {
  return CITY_PAGES.find((c) => c.slug === slug);
}
