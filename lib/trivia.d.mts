export type TriviaPlace = { title: string; description: string; meters: number; url: string };
export type Trivia = {
  kind: 'station' | 'place' | 'namesake' | 'area' | 'nearby';
  /** Andra platser runt hörnet, med Wikidatas korta beskrivning. */
  around?: TriviaPlace[];
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
export const AROUND_MAX_M: number;
export function sharesStem(title: string, stopName: string): boolean;
export function funScore(sentence: string, lang?: 'sv' | 'en'): number;
export function funFact(fullText: string, intro: string, lang?: 'sv' | 'en', max?: number): string;
export function wikiArticleUrl(title: string, lang?: 'sv' | 'en'): string;
