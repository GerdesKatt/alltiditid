export const MAIN_MODE_WINDOW_MS: number;
export const REALTIME_PREFERENCE_MS: number;
export function stationKey(name: string | undefined): string;
export function goesToStop(destination: string | undefined, stopNames: (string | undefined)[]): boolean;
export function pickNextDeparture<T extends { transportMode?: string; hasRealtime?: boolean }>(upcoming: T[], atOf: (d: T) => number | null): T | undefined;
export function sameAsBoard(label: string | undefined, boardName: string | undefined): boolean;
