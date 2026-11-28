export const TRACK_CHANGE_KEEP_MS: number;
export const LATER_KEEP_MS: number;
export function markTrackChanges<T extends { id?: string; track?: string; expectedAt?: string }>(
  memory: Map<string, { track: string; from?: string; at?: number; exp?: string; laterAt?: number }>,
  list: T[],
  now: number
): (T & { previousTrack?: string; justLater?: boolean })[];
