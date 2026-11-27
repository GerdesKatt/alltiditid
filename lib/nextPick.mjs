// Vilken avgång som står stort i "Nästa avgång" när man inte har någon vana på hållplatsen.

/** Spårtrafik först: på en tågstation är det tåget man oftast menar, inte bussen utanför. */
const MODE_ORDER = ['train', 'commuter', 'subway', 'tram', 'ferry', 'bus'];

/** Högst så här långt efter den allra första avgången får huvudtrafikslagets avgång ligga. */
export const MAIN_MODE_WINDOW_MS = 30 * 60_000;

/**
 * Första avgången med hållplatsens huvudtrafikslag (det mest spårbundna som finns i listan),
 * om den går inom 30 minuter efter den allra första. Annars den allra första.
 * upcoming är sorterad på tid; atOf ger avgångstiden i ms.
 */
export function pickNextDeparture(upcoming, atOf) {
  if (!upcoming.length) return undefined;
  const ranks = upcoming.map((d) => {
    const r = MODE_ORDER.indexOf(d.transportMode);
    return r < 0 ? MODE_ORDER.length : r;
  });
  const best = Math.min(...ranks);
  const first = upcoming[0];
  const i = ranks.indexOf(best);
  const main = upcoming[i];
  const firstAt = atOf(first);
  const mainAt = atOf(main);
  if (firstAt === null || mainAt === null) return first;
  return mainAt - firstAt <= MAIN_MODE_WINDOW_MS ? main : first;
}
