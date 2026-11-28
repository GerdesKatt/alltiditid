export const SECONDS_BELOW_MS: number;
export const SECONDS_STEP: number;
export const TIMELINE_WINDOW_MS: number;
export function secondsLabel(msLeft: number): string | null;
export function timelineFill(msToDeadline: number, windowMs?: number): number;
