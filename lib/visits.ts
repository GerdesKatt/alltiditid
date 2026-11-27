import type { StopOption } from './types';
import { stockholmDay, stockholmHour } from './sweTime.mjs';
import { activeDays } from './activeDays.mjs';

/**
 * Vilka hållplatser man tittar på och när på dygnet, för Hem: "dina hållplatser".
 * Bara id, namn, timme och tid, sparat i webbläsaren. Ingenting skickas.
 */
const KEY = 'alltiditid:besok';
const MAX = 300;
const LAST_BOARD_KEY = 'alltiditid:senast-tavla';

type Visit = { id: string; n: string; h: number; t: number };

function read(): Visit[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.n === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * En tavla visades. Samma hållplats inom tio minuter räknas en gång.
 * Returnerar antal aktiva dagar senaste veckan när det här var dagens första besök, annars 0.
 */
export function recordVisit(stop: StopOption, now = Date.now()): number {
  if (typeof window === 'undefined' || !stop.id) return 0;
  const list = read();
  if (list.some((v) => v.id === stop.id && now - v.t < 10 * 60_000)) return 0;
  const today = stockholmDay(now);
  const firstToday = !list.some((v) => stockholmDay(v.t) === today);
  list.push({ id: stop.id, n: stop.name.slice(0, 80), h: stockholmHour(now), t: now });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    // Ingen lagring: Hem lär sig inte.
    return 0;
  }
  return firstToday ? activeDays(list, now) : 0;
}

/**
 * Upp till `max` hållplatser för Hem. Besök nära den här tiden på dygnet (± 2 timmar) väger dubbelt,
 * så att hemmahållplatsen kommer först på morgonen och jobbet på eftermiddagen.
 * Stjärnmärkta finns alltid med.
 */
export function homeStops(favorites: StopOption[], now = Date.now(), max = 3): StopOption[] {
  const hour = stockholmHour(now);
  const near = (h: number) => Math.min(Math.abs(h - hour), 24 - Math.abs(h - hour)) <= 2;
  const score = new Map<string, { stop: StopOption; points: number }>();
  for (const v of typeof window === 'undefined' ? [] : read()) {
    const ageDays = (now - v.t) / 86_400_000;
    if (ageDays > 60) continue;
    const entry = score.get(v.id) || { stop: { id: v.id, name: v.n }, points: 0 };
    entry.points += near(v.h) ? 2 : 1;
    entry.stop = { id: v.id, name: v.n };
    score.set(v.id, entry);
  }
  favorites.forEach((f, i) => {
    const entry = score.get(f.id) || { stop: f, points: 0 };
    // Stjärnan räknas som flera besök, och ordningen bland favoriterna följer med.
    entry.points += 6 - i * 0.1;
    entry.stop = f;
    score.set(f.id, entry);
  });
  return Array.from(score.values())
    .sort((a, b) => b.points - a.points)
    .slice(0, max)
    .map((e) => e.stop);
}

/** När en tavla senast visades: under tio minuter sedan öppnas den igen, annars Hem. */
export function markBoardShown(now = Date.now()): void {
  try {
    window.localStorage.setItem(LAST_BOARD_KEY, String(now));
  } catch {
    // Ingen lagring.
  }
}

export function boardRecentlyShown(now = Date.now()): boolean {
  try {
    const t = Number(window.localStorage.getItem(LAST_BOARD_KEY) || 0);
    return now - t < 10 * 60_000;
  } catch {
    return false;
  }
}

const POSITION_OK = 'alltiditid:position-ok';
/** Har man sagt ja till positionen en gång används den sedan av sig själv på Hem. */
export function positionAllowed(): boolean {
  try {
    return window.localStorage.getItem(POSITION_OK) === '1';
  } catch {
    return false;
  }
}
export function rememberPositionAllowed(ok: boolean): void {
  try {
    if (ok) window.localStorage.setItem(POSITION_OK, '1');
    else window.localStorage.removeItem(POSITION_OK);
  } catch {
    // Ingen lagring.
  }
}

/** Glöm en hållplats: alla besök tas bort, så att den inte längre dyker upp på Hem. */
export function forgetStop(id: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(read().filter((v) => v.id !== id)));
  } catch {
    // Ingen lagring.
  }
}

/** Glöm alla besök (stjärnmärkta hållplatser ligger kvar). */
export function forgetAllVisits(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Ingen lagring.
  }
}
