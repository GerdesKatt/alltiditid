/**
 * "Vilken tur sitter jag på?": gissar turen utifrån en hållplats och tiden.
 *
 * Två lägen:
 *  - near: hållplatsen närmast din position just nu. Turen du sitter på passerar den
 *    ungefär nu, så avgångar några minuter bakåt och framåt är kandidater.
 *  - boarded: hållplatsen där du klev på. Kandidater är avgångar den senaste tiden.
 * Underjord är GPS dålig och T-banan saknar ofta fordonspositioner, så tiden gör jobbet.
 */

/** Fönstret i minuter kring nu, [från, till], per läge. */
export const FIND_WINDOWS = { near: [-8, 3], boarded: [-45, 1] };

/** Högst så många förslag visas. */
export const MAX_CANDIDATES = 8;

import { parseStockholm, stockholmMinute } from './sweTime.mjs';

/** Svensk tid som 'YYYY-MM-DDTHH:MM', oberoende av telefonens tidszon. */
export function localMinute(ms) {
  return stockholmMinute(ms);
}

const parseLocal = parseStockholm;

/**
 * Avgångarna som kan vara turen du sitter på, bästa gissningen först.
 * @param {object[]} departures Tavlans avgångar (hämtade från fönstrets början).
 * @param {number} now Nu i ms.
 * @param {'near' | 'boarded'} kind
 * @param {string} mode Valt trafikslag på tavlan, 'all' för alla.
 * @returns {object[]} Avgångarna med `minutesAgo` (positivt = har gått).
 */
export function tripCandidates(departures, now, kind, mode = 'all') {
  const [from, to] = FIND_WINDOWS[kind] || FIND_WINDOWS.boarded;
  const out = [];
  for (const d of departures || []) {
    if (!d || d.status === 'cancelled') continue;
    // Bara turer vars hela resa går att öppna.
    const openable = (d.tripId && d.tripDate) || d.trainNumber;
    if (!openable) continue;
    if (mode !== 'all' && d.transportMode !== mode) continue;
    const at = parseLocal(d.expectedAt);
    if (at === null) continue;
    const offset = Math.round((at - now) / 60000);
    if (offset < from || offset > to) continue;
    out.push({ ...d, minutesAgo: -offset });
  }
  // Nära: den som passerar närmast nu först. Påstigning: den som gick senast först.
  out.sort((a, b) =>
    kind === 'near' ? Math.abs(a.minutesAgo) - Math.abs(b.minutesAgo) : a.minutesAgo - b.minutesAgo
  );
  // En avgång per tur (sammanslagna tavlor kan visa samma tur två gånger).
  const seen = new Set();
  return out
    .filter((d) => {
      const key = d.tripId || d.trainNumber;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CANDIDATES);
}
