export const MAIN_MODE_WINDOW_MS: number;
export function pickNextDeparture<T extends { transportMode?: string }>(upcoming: T[], atOf: (d: T) => number | null): T | undefined;
