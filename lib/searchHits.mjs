// Vilka sökträffar som visas, när Trafiklab ger fler än som får plats.

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
