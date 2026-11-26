import type { Departure, TransportMode } from './types';

export type FindKind = 'near' | 'boarded';
export type TripCandidate = Departure & { minutesAgo: number };

export const FIND_WINDOWS: Record<FindKind, [number, number]>;
export const MAX_CANDIDATES: number;
export function localMinute(ms: number): string;
export function tripCandidates(
  departures: Departure[],
  now: number,
  kind: FindKind,
  mode?: TransportMode
): TripCandidate[];
