export type BikeSystem = {
  id: string;
  name: string;
  city?: string;
  base: string;
  center: [number, number];
  radiusKm: number;
  app: string;
};
/** Ett svar från action=mobility: närmaste lånebara cykel per system. */
export type NearbyBike = {
  system: string;
  name: string;
  station: string;
  meters: number;
  bikes: number;
  app: string;
};
export type Sparse = { kind: 'none' } | { kind: 'wait'; minutes: number } | null;

export const SPARSE_AFTER_MIN: number;
export const MAX_BIKE_METERS: number;
export const BIKE_SYSTEMS: BikeSystem[];
export function systemsNear(lat: number, lon: number, systems?: BikeSystem[]): BikeSystem[];
export function allowedLicense(info: unknown): boolean;
export function nearestStation(
  lat: number,
  lon: number,
  stationInfo: unknown,
  stationStatus: unknown,
  maxMeters?: number
): { station: string; meters: number; bikes: number } | null;
export function uberLink(lat: number, lon: number, name: string): string;
export function inStockholm(lat: number, lon: number): boolean;
export function sparseBoard(
  departures: { status?: string; gone?: boolean; pending?: boolean; expectedAt?: string }[],
  now: number,
  parse: (s?: string) => number | null,
  threshold?: number
): Sparse;
