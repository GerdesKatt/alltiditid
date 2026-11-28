import { weekTally } from './week.mjs';

/**
 * Kvittot (Vägen till 10, idé 7): resor man följt hela vägen fram, räknade bara i webbläsaren.
 * Inget konto, inget skickas. Samma tur räknas en gång.
 */
const KEY = 'alltiditid:framme';
const MAX = 500;

function load(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Räknar turen som framme (en gång) och svarar med hur många resor som räknats totalt. */
export function recordArrival(tripKey: string): number {
  const list = load();
  if (!list.includes(tripKey)) {
    list.push(tripKey);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    } catch {
      // Räknaren gäller tills sidan laddas om.
    }
  }
  return list.length;
}

/*
 * Veckans kvitto (Vägen till 10 del 2, idé 7): varje ankomst sparas också med datum och om den
 * var i tid (högst 2 min sen), så att kortet kan säga "Den här veckan: 4 av 5 resor i tid."
 */
const WEEK_KEY = 'alltiditid:framme-vecka';
export type ArrivalNote = { k: string; d: string; late: number };

function loadNotes(): ArrivalNote[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(WEEK_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.k === 'string' && typeof x.d === 'string') : [];
  } catch {
    return [];
  }
}

/** Sparar ankomsten med datum och försening (en gång per tur) och svarar med veckans siffror. */
export function recordArrivalWeek(tripKey: string, date: string, late: number): { total: number; onTime: number } {
  const notes = loadNotes();
  if (!notes.some((n) => n.k === tripKey)) {
    notes.push({ k: tripKey, d: date, late: Math.max(0, Math.round(late || 0)) });
    try {
      window.localStorage.setItem(WEEK_KEY, JSON.stringify(notes.slice(-MAX)));
    } catch {
      // Gäller tills sidan laddas om.
    }
  }
  return weekTally(notes, date);
}
