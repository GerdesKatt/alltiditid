/**
 * Gångtid till hållplatsen och beskedet per avgång: "Gå nu", "Gå om 4 min" eller "Hinner inte".
 * Allt räknas i webbläsaren. Positionen lämnar aldrig telefonen.
 */
import { metersBetween } from './gtfsrt.mjs';

/** Meter per minut i rak linje på gatan: lugn, normal och rask takt. */
export const WALK_PACES = { calm: 65, normal: 80, brisk: 95 };

/** Gator och kvarter gör vägen längre än fågelvägen, ungefär en fjärdedel i stadsmiljö. */
export const DETOUR = 1.25;

/** Längre bort än så här (fågelvägen) är gångtiden inte meningsfull att visa. */
export const MAX_WALK_METERS = 2500;

/** Beskedet "Gå nu" gäller när marginalen är högst så här många minuter. */
export const GO_NOW_MARGIN = 2;

/**
 * Extra minuter från stationens mitt till perrongen, per trafikslag. T-bana och
 * pendeltåg ligger ofta under jord eller långt in på stationen; en busshållplats är vid gatan.
 */
export const PLATFORM_MINUTES = { subway: 2, commuter: 2, train: 3, ferry: 1, tram: 0, bus: 0 };

/** Fågelvägen i meter från positionen till hållplatsen. */
export function distanceTo(position, stop) {
  if (!position || !stop) return null;
  const { lat, lon } = position;
  if (![lat, lon, stop.lat, stop.lon].every((v) => Number.isFinite(Number(v)))) return null;
  return metersBetween(Number(lat), Number(lon), Number(stop.lat), Number(stop.lon));
}

/** Gångtid i hela minuter (avrundat uppåt), minst 1. */
export function walkMinutes(meters, pace = 'normal') {
  const speed = WALK_PACES[pace] || WALK_PACES.normal;
  return Math.max(1, Math.ceil((meters * DETOUR) / speed));
}

export function platformMinutes(mode) {
  return PLATFORM_MINUTES[mode] ?? 0;
}

/**
 * Beskedet för en avgång.
 * @param {number} minutesLeft Minuter kvar till väntad avgång (kan vara negativt).
 * @param {number} walk Gångtid till hållplatsen i minuter.
 * @param {number} platform Extra minuter till perrongen.
 * @returns {{ kind: 'go' | 'relax' | 'missed', leaveIn: number }} leaveIn: minuter tills man måste gå.
 */
export function walkVerdict(minutesLeft, walk, platform = 0) {
  const leaveIn = minutesLeft - walk - platform;
  if (leaveIn < 0) return { kind: 'missed', leaveIn };
  if (leaveIn <= GO_NOW_MARGIN) return { kind: 'go', leaveIn };
  return { kind: 'relax', leaveIn };
}
