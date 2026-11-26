import type { StopOption } from './types';

export type StationGroup = { ids: string[]; name: string; shortName: string; parts: string[] };
export const STATION_GROUPS: StationGroup[];
export function groupFor(id: string): StationGroup | undefined;
export function groupStop(group: StationGroup): StopOption;
export function groupedStop<T extends StopOption>(stop: T): T;
export function sameStation(a: string, b: string): boolean;
export function mergeStops<T extends StopOption>(list: T[]): T[];
export function mergeSameName<T extends StopOption>(list: T[]): T[];
