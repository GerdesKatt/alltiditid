// Vilka sökträffar som visas, när Trafiklab ger fler än som får plats.

import { foldPlace } from './transferMatch.mjs';

/** Ändelser som gör en hållplats till ortens knutpunkt: "Hjo busstation", "Kiruna resecentrum". */
const HUB_SUFFIX = /^(station|stationen|busstation|busstationen|bussterminal|bussterminalen|resecentrum|centralstation|central|c|terminal|terminalen|torget|centrum)$/;

/**
 * Hur väl namnet träffar sökordet, lägre är bättre:
 * 0 ortens knutpunkt ("Hjo" ger "Hjo busstation") eller exakt samma namn,
 * 1 namnet börjar med sökordet som eget ord ("Kiruna sjukhus"),
 * 2 namnet börjar med sökordet mitt i ett ord ("Hjortstigen"),
 * 3 sökordet finns någon annanstans ("Bror Hjorths Hus").
 */
export function matchRank(name, q) {
  const n = foldPlace(name);
  const f = foldPlace(q);
  if (!f) return 3;
  if (n === f) return 0;
  if (n.startsWith(f + ' ')) {
    const rest = n.slice(f.length + 1);
    return HUB_SUFFIX.test(rest) ? 0 : 1;
  }
  if (n.startsWith(f)) return 2;
  return 3;
}

/**
 * Sorterar träffarna efter hur väl namnet träffar sökordet och sedan efter trafik.
 * Utan det hamnar ett tättrafikerat "Bror Hjorths Hus" före Hjo busstation.
 */
export function rankSearchHits(groups, q) {
  return groups
    .map((g, i) => ({ g, i, r: matchRank(g && g.name, q) }))
    .sort((a, b) => a.r - b.r || (Number(b.g.average_daily_stop_times) || 0) - (Number(a.g.average_daily_stop_times) || 0) || a.i - b.i)
    .map((x) => x.g);
}

const BOAT_MODES = ['BOAT', 'FERRY', 'SHIP'];
const isBoatStop = (g) =>
  (Array.isArray(g.transport_modes) && g.transport_modes.some((m) => BOAT_MODES.includes(m))) ||
  /\b(kaj|kajen|brygga|bryggan|färjeläge|färjeläget)$/i.test(String(g.name || ''));

/**
 * De mest trafikerade träffarna, men med plats för upp till två bryggor och kajer.
 * En skärgårdsbrygga har få avgångar och hamnar annars alltid efter bussarna:
 * "Sandhamn" ska hitta bryggan, inte bara Sandhamnsvägen i Halmstad.
 */
export function pickSearchHits(sorted, limit) {
  const top = sorted.slice(0, limit);
  const boats = sorted.slice(limit).filter(isBoatStop).slice(0, 2);
  if (boats.length === 0) return top;
  // Byt ut de minst trafikerade som inte själva är båthållplatser.
  const keep = [...top];
  for (const boat of boats) {
    let i = keep.length - 1;
    while (i >= 0 && isBoatStop(keep[i])) i -= 1;
    if (i < 0) break;
    keep.splice(i, 1);
    keep.push(boat);
  }
  return keep;
}
