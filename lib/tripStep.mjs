/**
 * Nästa steg i en sparad resa: vad man ska göra härnäst och när.
 * Före resan: när man ska gå hemifrån och vilken linje man kliver på. Under resan: när man
 * kliver av och vad man byter till. Allt räknas i webbläsaren från den sparade resan.
 */
import { platformMinutes } from './walk.mjs';

/** Gångtakt i meter per minut: lugn takt, och långsammare med bagage. */
export const TRIP_PACE = { normal: 65, luggage: 50 };
/** Extra minuter innan man går: hiss, trappor, ett rödljus. Mer med bagage. */
export const TRIP_MARGIN = { normal: 2, luggage: 4 };

/** "2026-11-27" + "07:12" → millisekunder, i telefonens klocka (samma som plannedTrip.at). */
function at(date, time) {
  const [y, m, d] = String(date || '').split('-').map(Number);
  const [h, min] = String(time || '').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0).getTime();
}

/** Tiden för en punkt: realtid om den finns, annars tidtabell. Datum ärvs om punkten saknar det. */
function pointMs(p, fallbackDate) {
  return at(p.date || fallbackDate, p.rtTime || p.time);
}

/**
 * Gångtid med marginal för första promenaden. ResRobot räknar rask takt (ungefär 80 m/min);
 * här räknas lugn takt, eller ännu lugnare med bagage.
 */
export function walkWithMargin(leg, luggage = false) {
  if (!leg || leg.kind !== 'walk') return 0;
  const pace = luggage ? TRIP_PACE.luggage : TRIP_PACE.normal;
  const meters = Number(leg.meters) || 0;
  const walk = meters > 0 ? Math.ceil(meters / pace) : Math.ceil(((Number(leg.minutes) || 0) * 80) / pace);
  return Math.max(Number(leg.minutes) || 0, walk);
}

const minutesUntil = (ms, now) => Math.ceil((ms - now) / 60_000 - 0.001);

/**
 * @param {import('./plannedTrip').PlanTrip} trip
 * @param {number} now
 * @param {{ luggage?: boolean }} [opts]
 */
export function nextStep(trip, now, opts = {}) {
  const luggage = Boolean(opts.luggage);
  const legs = (trip && trip.legs) || [];
  const rides = legs.filter((l) => l.kind === 'ride');
  const date = trip.depDate;
  if (rides.length === 0) return { kind: 'done' };
  const first = rides[0];
  const firstIdx = legs.indexOf(first);
  const firstDep = pointMs(first.from, date);

  // Före första avgången: när man ska gå.
  if (now < firstDep) {
    const walkLeg = firstIdx > 0 && legs[0].kind === 'walk' ? legs[0] : null;
    const walk = walkWithMargin(walkLeg, luggage);
    const margin = walkLeg ? (luggage ? TRIP_MARGIN.luggage : TRIP_MARGIN.normal) : 0;
    const platform = walkLeg ? platformMinutes(first.mode) : 0;
    const leaveAt = firstDep - (walk + margin + platform) * 60_000;
    return {
      kind: 'before',
      walk: Boolean(walkLeg),
      walkMinutes: walk,
      /** Marginal inklusive tid ner till perrongen. */
      margin: margin + platform,
      leaveAt,
      leaveIn: minutesUntil(leaveAt, now),
      departsIn: minutesUntil(firstDep, now),
      ride: first,
      later: rides.slice(1),
    };
  }

  for (let i = 0; i < rides.length; i++) {
    const ride = rides[i];
    const dep = pointMs(ride.from, date);
    let arr = pointMs(ride.to, ride.from.date || date);
    // Över midnatt utan datum på ankomsten.
    if (arr < dep) arr += 86_400_000;
    if (now < dep) {
      // Mellan två turer: byte, nästa går snart.
      return { kind: 'change', departsIn: minutesUntil(dep, now), ride, later: rides.slice(i + 1) };
    }
    if (now < arr) {
      return { kind: 'riding', offIn: minutesUntil(arr, now), ride, next: rides[i + 1] || null, later: rides.slice(i + 1) };
    }
  }
  return { kind: 'done' };
}
