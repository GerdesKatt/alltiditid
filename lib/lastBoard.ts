// Senast hämtade tavla per adress, i telefonen. Visas nedtonad när tavlan inte går att hämta,
// så att ett fel i tunneln inte lämnar en tom ruta (UX-revisionen, fynd 3).
import type { Departure, Disruption } from './types';

const STORAGE_KEY = 'alltiditid-senaste-tavlor';
const MAX_BOARDS = 5;
const MAX_ROWS = 60;
/** Äldre än så här är en tavla inte till hjälp längre. */
export const LAST_BOARD_MAX_AGE_MS = 3 * 3600_000;

export type LastBoard = { url: string; at: number; departures: Departure[]; disruptions: Disruption[] };

function readAll(): LastBoard[] {
  try {
    const data = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveLastBoard(url: string, departures: Departure[], disruptions: Disruption[]): void {
  try {
    const entry: LastBoard = { url, at: Date.now(), departures: departures.slice(0, MAX_ROWS), disruptions };
    const next = [entry, ...readAll().filter((b) => b.url !== url)].slice(0, MAX_BOARDS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Fullt minne eller privat läge: tavlan fungerar ändå, bara utan reserv.
  }
}

export function loadLastBoard(url: string, now = Date.now()): LastBoard | null {
  const found = readAll().find((b) => b.url === url);
  if (!found || !Array.isArray(found.departures) || now - found.at > LAST_BOARD_MAX_AGE_MS) return null;
  return found;
}
