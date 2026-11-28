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
export function walkMinutes(meters, pace = 'normal', factor = 1) {
  const speed = (WALK_PACES[pace] || WALK_PACES.normal) * clampFactor(factor);
  return Math.max(1, Math.ceil((meters * DETOUR) / speed));
}

/*
 * Din egen gångtakt (Vägen till 10 del 2, idé 12). Medan gångtiden är på jämförs hur fort du
 * faktiskt närmar dig hållplatsen med den valda takten. Faktorn sparas i webbläsaren och flyttas
 * lite i taget, inom 0,7–1,4, så att en enstaka promenad aldrig gör beskedet fel.
 */
export const PACE_FACTOR_MIN = 0.7;
export const PACE_FACTOR_MAX = 1.4;

export function clampFactor(f) {
  const n = Number(f);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(PACE_FACTOR_MAX, Math.max(PACE_FACTOR_MIN, n));
}

/**
 * En mätning mellan två positioner: hur fort man gått mot hållplatsen jämfört med takten.
 * Kräver minst 60 s och 120 m närmare, och en gånghastighet (0,6–2,5 m/s), annars null
 * (man står still, åker buss eller positionen hoppar).
 * @param {{meters: number, t: number}} a Tidigare: avstånd till hållplatsen (fågelvägen) och tid i ms.
 * @param {{meters: number, t: number}} b Senare mätning.
 */
export function paceSample(a, b, pace = 'normal') {
  if (!a || !b) return null;
  const seconds = (b.t - a.t) / 1000;
  const closer = a.meters - b.meters;
  if (seconds < 60 || closer < 120) return null;
  const metersPerSecond = (closer * DETOUR) / seconds;
  if (metersPerSecond < 0.6 || metersPerSecond > 2.5) return null;
  const expected = (WALK_PACES[pace] || WALK_PACES.normal) / 60;
  return metersPerSecond / expected;
}

/** Ny faktor: en fjärdedel av vägen mot mätningen, inom gränserna. */
export function blendFactor(old, sample) {
  if (sample === null || !Number.isFinite(sample)) return clampFactor(old);
  return clampFactor(clampFactor(old) * 0.75 + clampFactor(sample) * 0.25);
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
