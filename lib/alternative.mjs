// "Inställt? Ta istället …": nästa avgång från samma hållplats som tar en dit
// den inställda skulle. Allt finns redan på tavlan.

const fold = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(central|centralstation|station|c)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * @param {object} cancelled Den inställda avgången.
 * @param {object[]} departures Tavlans avgångar i tidsordning.
 * @returns {object | null} Första avgång efter den inställda, inte inställd, som har samma
 *   slutmål eller passerar det, och helst samma trafikslag.
 */
export function alternativeFor(cancelled, departures) {
  if (!cancelled || cancelled.status !== 'cancelled') return null;
  const goal = fold(cancelled.destination);
  if (!goal) return null;
  const after = String(cancelled.expectedAt || '');
  const reaches = (d) =>
    fold(d.destination) === goal || (Array.isArray(d.viaStops) && d.viaStops.some((v) => fold(v) === goal));
  const candidates = (Array.isArray(departures) ? departures : []).filter(
    (d) =>
      d &&
      d.id !== cancelled.id &&
      d.status !== 'cancelled' &&
      (!after || !d.expectedAt || String(d.expectedAt) >= after) &&
      reaches(d)
  );
  return (
    candidates.find((d) => d.transportMode === cancelled.transportMode) ||
    candidates[0] ||
    null
  );
}
