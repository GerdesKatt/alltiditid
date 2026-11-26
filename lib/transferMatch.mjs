// Bytet mot ett mål: "Fruängen" visar bara anslutningarna som går dit, antingen som
// slutstation eller som en hållplats längre fram på linjen.
//
// Delas av servern (functions/api/trafik.js tar fram hållplatserna efter bytet) och
// arket (components/TrainSheet.tsx filtrerar medan man skriver).

/** "Fruängen" och "fruangen" blir samma sak: gemener, utan prickar och ringar, bara bokstäver och siffror. */
export function foldPlace(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/[öø]/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Hållplatserna efter bytesstationen på en tur (samma form som lib/trips.mjs ger).
 * Stationen känns igen på avgångstiden, eftersom namnen skiljer sig mellan tavla och tur
 * (Stockholm C på tavlan, T-Centralen på tunnelbanans tur). null om den inte hittas.
 * @param {{ stops?: { name: string, departure?: { scheduled?: string } }[] }} journey
 * @param {string} scheduledTime 'HH:MM'
 * @returns {string[] | null}
 */
export function stopsAfter(journey, scheduledTime) {
  const stops = Array.isArray(journey?.stops) ? journey.stops : [];
  const i = stops.findIndex((s) => s?.departure?.scheduled === scheduledTime);
  if (i < 0) return null;
  const names = [];
  for (const s of stops.slice(i + 1)) {
    const name = String(s?.name || '').trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Går anslutningen till målet? `via` är satt när målet är en hållplats på vägen
 * och inte slutstationen, så att arket kan visa "stannar i Liljeholmen".
 * Utan hållplatser från turen används tavlans via-hållplatser (ResRobot skickar dem).
 * @param {{ destination?: string, stopsAfter?: string[], viaStops?: string[] }} connection
 * @param {string} query
 * @returns {{ hit: boolean, via?: string }}
 */
export function matchConnection(connection, query) {
  const q = foldPlace(query);
  if (!q) return { hit: true };
  if (foldPlace(connection?.destination).includes(q)) return { hit: true };
  const via = (connection?.stopsAfter || connection?.viaStops || []).find((name) => foldPlace(name).includes(q));
  return via ? { hit: true, via } : { hit: false };
}
