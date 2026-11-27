export type PlaceKind = 'stop' | 'poi' | 'address' | 'area';
export type FoundPlace = { kind: Exclude<PlaceKind, 'stop'>; name: string; detail: string; type: string; lat: number; lon: number };
export function placeScore(query: string, name: string, detail?: string): number;
export const SURE: number;
export function rankPlaces<T extends { kind: string; name: string; detail?: string; lat?: number; lon?: number }>(
  query: string,
  list: T[],
  opts?: { near?: { lat: number; lon: number } | null; town?: { lat: number; lon: number } | null }
): (T & { score: number })[];
export function splitAddress(query: string): { street: string; number: string; town: string } | null;
export function kmBetween(a: { lat?: number; lon?: number } | null, b: { lat?: number; lon?: number } | null): number;
export function photonPlaces(data: unknown): FoundPlace[];
export function geoapifyPlaces(data: unknown): FoundPlace[];
export function placeLabel(type: string | undefined, lang?: string): string;
