import data from '../data/stops.json';
import { REGIONS } from './regions';
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
 * Hållplatsen som tavlan ska visa. Några stationer slås ihop med sina grannhållplatser
 * i snabbvalen (Göteborg C med Nils Ericsson och Drottningtorget); samma tavla här.
 */
export function boardStopFor(stop: StopPage): StopOption {
  for (const region of REGIONS) {
    for (const st of region.stations) {
      if (st.id.split(',')[0] === stop.id) return st;
    }
  }
  return { id: stop.id, name: stop.name };
}

export { modesText } from './stopText';
