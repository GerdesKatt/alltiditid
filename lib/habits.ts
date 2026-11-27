import type { Departure } from './types';
import { groupKey } from './lineFormat';
import { stockholmHour } from './sweTime.mjs';

/**
 * "Brukar du ta …?": vilka avgångar man öppnar, per hållplats och timme på dygnet.
 * Efter tre gånger samma linje från samma hållplats ungefär samma tid föreslås den som
 * Min resa. Sparas bara i webbläsaren och skickas aldrig någonstans.
 */
const KEY = 'alltiditid:vanor';
const DISMISS_KEY = 'alltiditid:vanor-nej';
const MAX_ENTRIES = 200;
export const HABIT_THRESHOLD = 3;

type Entry = { s: string; k: string; l: string; d: string; h: number; t: number };

function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Lagringen är full eller avstängd: inga förslag, inget annat händer.
  }
}

export function recordOpen(stopId: string, item: Departure, now = Date.now()): void {
  if (typeof window === 'undefined' || !stopId) return;
  const list = read<Entry[]>(KEY, []);
  const hour = stockholmHour(now);
  const key = groupKey(item);
  // Samma rad öppnad flera gånger inom en kvart räknas en gång.
  if (list.some((e) => e.s === stopId && e.k === key && now - e.t < 15 * 60_000)) return;
  list.push({ s: stopId, k: key, l: item.line, d: item.destination, h: hour, t: now });
  write(KEY, list.slice(-MAX_ENTRIES));
}

export type Habit = { key: string; line: string; destination: string; count: number };

/** Linjen man brukar ta härifrån den här tiden (± en timme), om den öppnats minst tre gånger. */
export function habitFor(stopId: string, now = Date.now()): Habit | null {
  if (typeof window === 'undefined' || !stopId) return null;
  const hour = stockholmHour(now);
  const near = (h: number) => Math.min(Math.abs(h - hour), 24 - Math.abs(h - hour)) <= 1;
  const declined = read<string[]>(DISMISS_KEY, []);
  const counts = new Map<string, Habit>();
  for (const e of read<Entry[]>(KEY, [])) {
    if (e.s !== stopId || !near(e.h) || declined.includes(`${stopId}|${e.k}`)) continue;
    const c = counts.get(e.k) || { key: e.k, line: e.l, destination: e.d, count: 0 };
    c.count += 1;
    counts.set(e.k, c);
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return best && best.count >= HABIT_THRESHOLD ? best : null;
}

/** "Nej tack": föreslå inte den här linjen från den här hållplatsen igen. */
export function declineHabit(stopId: string, key: string): void {
  if (typeof window === 'undefined') return;
  const list = read<string[]>(DISMISS_KEY, []);
  write(DISMISS_KEY, [...list.filter((x) => x !== `${stopId}|${key}`), `${stopId}|${key}`].slice(-50));
}
