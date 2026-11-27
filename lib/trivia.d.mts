export type Trivia = {
  kind: 'station' | 'place' | 'area' | 'nearby';
  title: string;
  text: string;
  url: string;
  meters: number | null;
  /** Språket texten är på (engelska saknas ibland, då kommer svenska). */
  lang?: 'sv' | 'en';
};
export const NEARBY_MAX_M: number;
export const AREA_MAX_M: number;
export const SEARCH_RADIUS_M: number;
export const MAX_CHARS: number;
export function normalize(s: string): string;
export function nameKey(stopName: string): string;
export function titleMatches(title: string, stopName: string): boolean;
export function shortText(extract: string, max?: number): string;
export function pickTrivia(pages: unknown, stopName: string, lang?: 'sv' | 'en'): Trivia | null;
export function wikiQueryUrl(params: { name?: string; lat?: number; lon?: number; lang?: 'sv' | 'en' }): string;
