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
