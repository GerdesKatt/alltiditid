/**
 * "Annat sätt härifrån": taxi och lånecykel när avgångarna är glesa.
 * Allt här är rena funktioner, så att både webbläsaren och Pages-funktionen kan använda dem.
 */
import { metersBetween } from './gtfsrt.mjs';

/** Tavlan räknas som gles när nästa avgång går om mer än så här många minuter. */
export const SPARSE_AFTER_MIN = 20;

/** Längre än så här till en cykel är inte "härifrån". */
export const MAX_BIKE_METERS = 500;

/**
 * Lånecyklar med öppna GBFS-flöden (MobilityData:s register) vars licens tillåter
 * att vi visar dem. Licensen läses också från flödet vid varje hämtning (allowedLicense),
 * så att ett system som byter villkor försvinner av sig självt.
 *
 * Inte med: Zeus (sparkcykel, ingen licens angiven i flödet), Lime Uppsala (partnerflöde,
 * villkoren gick inte att läsa), Voi, Bolt och Tier (inga öppna svenska flöden).
 */
export const BIKE_SYSTEMS = [
  {
    id: 'styrochstall',
    name: 'Styr & Ställ',
    base: 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_zg/en/',
    center: [57.7089, 11.9746],
    radiusKm: 25,
    app: 'https://app.nextbike.net/',
  },
  {
    id: 'lundahoj',
    name: 'Lundahoj',
    base: 'https://api.cyclocity.fr/contracts/lund/gbfs/v3/',
    center: [55.7047, 13.191],
    radiusKm: 12,
    app: 'https://www.lundahoj.se/',
  },
  ...[
    ['malmoe', 'Malmö', 55.605, 13.0038, 15],
    ['ystad', 'Ystad', 55.4295, 13.82, 8],
    ['baastad', 'Båstad', 56.4266, 12.8509, 8],
    ['aengelholm', 'Ängelholm', 56.2428, 12.8622, 8],
  ].map(([slug, city, lat, lon, radiusKm]) => ({
    id: `donkey_${slug}`,
    name: 'Donkey Republic',
    city,
    base: `https://stables.donkey.bike/api/public/gbfs/3.0/donkey_${slug}/`,
    center: [lat, lon],
    radiusKm,
    app: 'https://dnky.bike',
  })),
];

/** Systemen vars område täcker punkten. */
export function systemsNear(lat, lon, systems = BIKE_SYSTEMS) {
  return systems.filter((s) => metersBetween(lat, lon, s.center[0], s.center[1]) <= s.radiusKm * 1000);
}

/** Öppen licens enligt flödets system_information (CC0, eller JCDecaux öppna licens för Lundahoj). */
export function allowedLicense(info) {
  const d = (info && info.data) || {};
  if (d.license_id === 'CC0-1.0' || d.license_id === 'CC-BY-4.0') return true;
  const url = String(d.license_url || '');
  return /developer\.jcdecaux\.com\/files\/Open-Licence/i.test(url);
}

/** GBFS 2 har namnet som text, GBFS 3 som en lista med språk. */
function textOf(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return String((v.find((x) => x && x.language === 'sv') || v[0] || {}).text || '');
  return '';
}

/**
 * Närmaste station med minst en lånebar cykel, inom MAX_BIKE_METERS.
 * @returns {{ station: string, meters: number, bikes: number } | null}
 */
export function nearestStation(lat, lon, stationInfo, stationStatus, maxMeters = MAX_BIKE_METERS) {
  const stations = (stationInfo && stationInfo.data && stationInfo.data.stations) || [];
  const status = new Map(
    ((stationStatus && stationStatus.data && stationStatus.data.stations) || []).map((s) => [String(s.station_id), s])
  );
  let best = null;
  for (const s of stations) {
    const st = status.get(String(s.station_id));
    if (!st) continue;
    if (st.is_renting === false || st.is_renting === 0 || st.is_installed === false || st.is_installed === 0) continue;
    const bikes = Number(st.num_vehicles_available ?? st.num_bikes_available ?? 0);
    if (!(bikes > 0)) continue;
    const meters = metersBetween(lat, lon, Number(s.lat), Number(s.lon));
    if (!Number.isFinite(meters) || meters > maxMeters) continue;
    if (!best || meters < best.meters) best = { station: textOf(s.name), meters: Math.round(meters), bikes };
  }
  return best;
}

/** Uber med hållplatsen som upphämtning (dokumenterad universell länk, inget avtal krävs). */
export function uberLink(lat, lon, name) {
  const q = new URLSearchParams({
    action: 'setPickup',
    'pickup[latitude]': String(lat),
    'pickup[longitude]': String(lon),
    'pickup[nickname]': name,
  });
  return `https://m.uber.com/ul/?${q.toString()}`;
}

/** Stockholms län, ungefär: där är Taxi Stockholm det givna numret att ringa. */
export function inStockholm(lat, lon) {
  return lat > 58.75 && lat < 60.2 && lon > 17.2 && lon < 19.6;
}

/**
 * Är tavlan gles just nu? Räknar på de avgångar som visas (efter trafikslag och filter).
 * @param {{ status?: string, gone?: boolean, pending?: boolean, expectedAt?: string }[]} departures
 * @param {number} now ms
 * @param {(s?: string) => number | null} parse lokal tid → ms
 * @returns {{ kind: 'none' } | { kind: 'wait', minutes: number } | null} null när tavlan inte är gles
 */
export function sparseBoard(departures, now, parse, threshold = SPARSE_AFTER_MIN) {
  let next = null;
  for (const d of departures) {
    if (d.status === 'cancelled' || d.gone) continue;
    const at = parse(d.expectedAt);
    if (at === null || at === undefined) continue;
    const min = Math.floor((at - now) / 60000);
    if (d.pending) return null; // tåget står kvar och kan gå när som helst
    if (min < 0) continue; // har redan gått
    if (next === null || min < next) next = min;
  }
  if (next === null) return { kind: 'none' };
  return next > threshold ? { kind: 'wait', minutes: next } : null;
}
