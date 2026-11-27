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
 * Sveriges största orter med mittpunkt och radie i km. Hållplatslistan har sällan ort,
 * så hållplatser knyts till en ort efter läge i stället.
 */
const CITIES: { name: string; lat: number; lon: number; km: number }[] = [
  { name: 'Stockholm', lat: 59.3293, lon: 18.0686, km: 15 },
  { name: 'Göteborg', lat: 57.7089, lon: 11.9746, km: 10 },
  { name: 'Malmö', lat: 55.605, lon: 13.0038, km: 7 },
  { name: 'Uppsala', lat: 59.8586, lon: 17.6389, km: 6 },
  { name: 'Västerås', lat: 59.6099, lon: 16.5448, km: 5 },
  { name: 'Örebro', lat: 59.2753, lon: 15.2134, km: 5 },
  { name: 'Linköping', lat: 58.4108, lon: 15.6214, km: 5 },
  { name: 'Helsingborg', lat: 56.0465, lon: 12.6945, km: 5 },
  { name: 'Jönköping', lat: 57.7826, lon: 14.1618, km: 5 },
  { name: 'Norrköping', lat: 58.5877, lon: 16.1924, km: 5 },
  { name: 'Lund', lat: 55.7047, lon: 13.191, km: 4 },
  { name: 'Umeå', lat: 63.8258, lon: 20.263, km: 5 },
  { name: 'Gävle', lat: 60.6749, lon: 17.1413, km: 5 },
  { name: 'Borås', lat: 57.721, lon: 12.9401, km: 4 },
  { name: 'Södertälje', lat: 59.1955, lon: 17.6253, km: 4 },
  { name: 'Eskilstuna', lat: 59.3666, lon: 16.5077, km: 4 },
  { name: 'Halmstad', lat: 56.6745, lon: 12.8578, km: 4 },
  { name: 'Växjö', lat: 56.8777, lon: 14.8091, km: 4 },
  { name: 'Karlstad', lat: 59.4022, lon: 13.5115, km: 4 },
  { name: 'Sundsvall', lat: 62.3908, lon: 17.3069, km: 4 },
  { name: 'Luleå', lat: 65.5848, lon: 22.1547, km: 4 },
  { name: 'Trollhättan', lat: 58.2837, lon: 12.2886, km: 4 },
  { name: 'Östersund', lat: 63.1792, lon: 14.6357, km: 4 },
  { name: 'Kalmar', lat: 56.6634, lon: 16.3568, km: 4 },
  { name: 'Kiruna', lat: 67.8558, lon: 20.2253, km: 3 },
  { name: 'Visby', lat: 57.6348, lon: 18.2948, km: 3 },
];

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** Orten en hållplats ligger i: närmaste stora ort inom dess radie, annars ingen. */
export function cityOf(stop: { lat: number; lon: number }): string {
  let best = '';
  let bestKm = Infinity;
  for (const c of CITIES) {
    const d = km(stop.lat, stop.lon, c.lat, c.lon);
    if (d <= c.km && d < bestKm) {
      best = c.name;
      bestKm = d;
    }
  }
  return best;
}

/**
 * Stadssidor (/avgangar/goteborg) för de 20 orter som har flest hållplatssidor (minst två),
 * med ortens hållplatser i trafikordning.
 */
export const CITY_PAGES: CityPage[] = (() => {
  const byPlace = new Map<string, StopPage[]>();
  for (const s of STOP_PAGES) {
    const place = Number.isFinite(s.lat) && Number.isFinite(s.lon) ? cityOf(s) : '';
    if (!place) continue;
    if (!byPlace.has(place)) byPlace.set(place, []);
    byPlace.get(place)!.push(s);
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
