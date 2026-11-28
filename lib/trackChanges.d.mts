export const TRACK_CHANGE_KEEP_MS: number;
export function markTrackChanges<T extends { id?: string; track?: string }>(
  memory: Map<string, { track: string; from?: string; at?: number }>,
  list: T[],
  now: number
): (T & { previousTrack?: string })[];
