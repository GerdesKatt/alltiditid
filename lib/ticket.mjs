/**
 * "Jag har en biljett": resan planeras baklänges från en fast avgång (ett bokat tåg eller
 * flyg). Appen räknar ut när man senast ska vara på stationen eller flygplatsen, väljer en
 * förbindelse dit med god marginal och visar en reserv om den första missas.
 * Rena funktioner, så att de går att testa utan nät (test/ticket.test.mjs).
 */
import { gateRules, walkMinutes } from './gateTime.mjs';

/**
 * Tågnummer ("7063", "tåg 7063") eller flightnummer ("SK1415", "sk 1415", "DY4321").
 * @returns {{ kind: 'train', number: string } | { kind: 'flight', number: string } | null}
 */
export function parseTicket(text) {
  const s = String(text || '').trim().toUpperCase().replace(/^(TÅG|TAG|TRAIN|FLYG|FLIGHT)\s*/, '');
  if (/^\d{1,6}$/.test(s)) return { kind: 'train', number: s };
  const m = /^([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?-?(\d{1,4}[A-Z]?)$/.exec(s);
  if (m) return { kind: 'flight', number: `${m[1]}${m[2]}` };
  return null;
}

/**
 * Stora stationer: långt mellan spåren, trängsel och köer. Här räknas mer marginal.
 * Namnen jämförs utan skiftläge, så att "Stockholm Central" och "Stockholm C" båda träffar.
 */
const BIG_STATIONS = [/^stockholm\s*(c|central)/i, /^göteborg\s*(c|central)/i, /^malmö\s*(c|central)/i];

/** Minuter man bör vara på stationen före ett bokat tåg. */
export const TRAIN_MARGIN = { big: 20, small: 10 };

export function isBigStation(name) {
  const n = String(name || '').trim();
  return BIG_STATIONS.some((re) => re.test(n));
}

export function trainMargin(stationName) {
  return isBigStation(stationName) ? TRAIN_MARGIN.big : TRAIN_MARGIN.small;
}

/** Från tåget eller bussen in till säkerhetskontrollen på flygplatsen. */
export const AIRPORT_ARRIVAL_WALK = 10;
/** Bagageinlämning, när man checkar in väska. */
export const BAG_DROP = 20;
/** Kötid när den inte är känd: ungefär en vanlig morgon på Arlanda. */
export const DEFAULT_QUEUE = 15;

/**
 * Minuter man bör vara på flygplatsen före avgång, och vad de består av:
 * boarding, gång till gaten, säkerhetskö, in från stationen och bagage.
 * @param {{ airlineIata?: string, domestic?: boolean, terminal?: string, scheduledAt: string, expectedAt?: string }} flight
 * @param {string} airport IATA-kod
 * @param {{ queue?: number | null, bags?: boolean }} [opts]
 */
export function flightMargin(flight, airport, opts = {}) {
  if (!flight) return null;
  const known = Number.isFinite(opts.queue) && opts.queue >= 0;
  const queue = known ? Math.round(opts.queue) : DEFAULT_QUEUE;
  const { boardingBefore } = gateRules(flight.airlineIata, flight.domestic);
  const [, walk] = walkMinutes(airport, flight.terminal);
  const bags = opts.bags ? BAG_DROP : 0;
  return {
    minutes: boardingBefore + walk + queue + AIRPORT_ARRIVAL_WALK + bags,
    boarding: boardingBefore,
    walk,
    queue,
    queueKnown: known,
    toSecurity: AIRPORT_ARRIVAL_WALK,
    bags,
  };
}

/** Ungefär var man kommer fram till flygplatsen: terminalen där tåg och bussar stannar. */
export const AIRPORT_PLACES = {
  ARN: { name: 'Arlanda flygplats', lat: 59.6498, lon: 17.9238 },
  GOT: { name: 'Landvetter flygplats', lat: 57.6628, lon: 12.2798 },
  BMA: { name: 'Bromma flygplats', lat: 59.3544, lon: 17.9415 },
  MMX: { name: 'Malmö Airport', lat: 55.5363, lon: 13.3762 },
  LLA: { name: 'Luleå Airport', lat: 65.5438, lon: 22.122 },
  UME: { name: 'Umeå Airport', lat: 63.7918, lon: 20.2828 },
  OSD: { name: 'Åre Östersund Airport', lat: 63.1944, lon: 14.5003 },
  VBY: { name: 'Visby Airport', lat: 57.6628, lon: 18.3462 },
  KRN: { name: 'Kiruna Airport', lat: 67.822, lon: 20.3368 },
  RNB: { name: 'Ronneby Airport', lat: 56.2667, lon: 15.265 },
};

/** "2026-11-28" + "08:40" → millisekunder i telefonens klocka (som plannedTrip.at). */
export function at(date, time) {
  const [y, m, d] = String(date || '').split('-').map(Number);
  const [h, min] = String(time || '').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0).getTime();
}

const pad = (n) => String(n).padStart(2, '0');
/** Klocktid och datum för millisekunder, i telefonens klocka. */
export function clockOf(ms) {
  const d = new Date(ms);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** Senast på plats: avgången minus marginalen. */
export function deadline(anchor) {
  return at(anchor.date, anchor.dep) - anchor.margin * 60_000;
}

function arrivalMs(trip) {
  return at(trip.arrDate || trip.depDate, trip.arr);
}

/**
 * Hur mycket tidigare den rekommenderade förbindelsen får vara än den sista som hinner.
 * Går det glest (en buss i timmen) blir det annars en timmes väntan på stationen.
 */
export const EARLIER_MAX_MIN = 30;

/**
 * Välj förbindelse till stationen. Den sista som hinner med marginalen blir reserven,
 * och den före den blir rekommendationen, om den inte är orimligt mycket tidigare.
 * Med en bokad biljett är det viktigare att komma med än att vänta kort.
 * @param {import('./plannedTrip').PlanTrip[]} trips
 * @param {number} latestMs senast på plats
 * @returns {{ main: any, backup: any, tight: boolean } | null}
 */
export function pickFeeder(trips, latestMs) {
  const list = (trips || []).filter((t) => t && t.legs && Number.isFinite(arrivalMs(t)));
  if (list.length === 0) return null;
  const ok = list.filter((t) => arrivalMs(t) <= latestMs).sort((a, b) => arrivalMs(b) - arrivalMs(a));
  // Inget hinner med hela marginalen: ta den som kommer fram först och säg att det är snålt.
  if (ok.length === 0) {
    const first = [...list].sort((a, b) => arrivalMs(a) - arrivalMs(b))[0];
    return { main: first, backup: null, tight: true };
  }
  const [last, before] = ok;
  if (before && arrivalMs(last) - arrivalMs(before) <= EARLIER_MAX_MIN * 60_000) {
    return { main: before, backup: last, tight: false };
  }
  return { main: last, backup: null, tight: false };
}

/**
 * Hela resan som en planerad resa: förbindelsen till stationen, bytet med marginal och
 * själva biljetten sist. Då fungerar resekortet som vanligt, med biljetten som sista del.
 * @param {import('./plannedTrip').PlanTrip} feeder
 * @param {any} anchor
 */
export function ticketTrip(feeder, anchor) {
  const flight = anchor.kind === 'flight';
  const arrive = feeder.legs.length ? feeder.legs[feeder.legs.length - 1].to : { name: anchor.from, time: feeder.arr };
  const gap = Math.max(0, Math.round((at(anchor.date, anchor.dep) - arrivalMs(feeder)) / 60_000));
  const point = (name, time, track = '', date = anchor.date) => ({ name, time, rtTime: '', track, date });
  const ride = {
    kind: 'ride',
    mode: flight ? 'flight' : 'train',
    line: anchor.label,
    direction: anchor.to,
    ...(anchor.operator ? { operator: anchor.operator } : {}),
    from: point(anchor.from, anchor.dep, anchor.track || ''),
    to: point(anchor.to, anchor.arr || '', '', anchor.arrDate || anchor.date),
    minutes: anchor.arr ? Math.max(0, Math.round((at(anchor.arrDate || anchor.date, anchor.arr) - at(anchor.date, anchor.dep)) / 60_000)) : 0,
    cancelled: false,
    anchor: true,
  };
  const transfer = {
    kind: 'walk',
    transfer: true,
    from: { ...arrive, rtTime: '' },
    to: point(anchor.from, anchor.dep),
    minutes: Math.min(gap, anchor.margin) || anchor.margin,
    meters: 0,
  };
  const legs = [...feeder.legs, transfer, ride];
  const rides = legs.filter((l) => l.kind === 'ride').length;
  const arr = anchor.arr || anchor.dep;
  const arrDate = anchor.arr ? anchor.arrDate || anchor.date : anchor.date;
  return {
    dep: feeder.dep,
    arr,
    depDate: feeder.depDate,
    arrDate,
    minutes: Math.max(0, Math.round((at(arrDate, arr) - at(feeder.depDate, feeder.dep)) / 60_000)),
    changes: Math.max(0, rides - 1),
    legs,
  };
}

/**
 * Den fasta avgången med färsk data: ny tid, spår eller gate, inställd.
 * Används av resekortet för att följa biljetten. Returnerar en ny resa.
 * @param {import('./plannedTrip').PlanTrip} trip
 * @param {{ rtTime?: string, track?: string, cancelled?: boolean, arrRt?: string }} live
 */
export function withAnchorLive(trip, live) {
  if (!live) return trip;
  const legs = trip.legs.map((l) => {
    if (l.kind !== 'ride' || !l.anchor) return l;
    return {
      ...l,
      cancelled: Boolean(live.cancelled),
      from: { ...l.from, rtTime: live.rtTime && live.rtTime !== l.from.time ? live.rtTime : '', track: live.track || l.from.track },
      to: { ...l.to, rtTime: live.arrRt && live.arrRt !== l.to.time ? live.arrRt : '' },
    };
  });
  return { ...trip, legs };
}

/** Minuter sen (positivt) för den fasta avgången, ur "08:40" och "08:52". Över midnatt räknas rätt. */
export function lateMinutes(time, rtTime) {
  if (!time || !rtTime || time === rtTime) return 0;
  const [h1, m1] = time.split(':').map(Number);
  const [h2, m2] = rtTime.split(':').map(Number);
  let d = h2 * 60 + m2 - (h1 * 60 + m1);
  if (d < -720) d += 1440;
  if (d > 720) d -= 1440;
  return d;
}

/**
 * Stationen på tåget som stämmer med målet man skrev ("karlstad" → "Karlstad C").
 * Bara stationer efter påstigningen räknas. Annars slutstationen.
 * @param {{ name: string }[]} stops
 */
export function alightFor(stops, goal, boardIndex = 0) {
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+(c|central|centralstation)$/, '').trim();
  const g = fold(goal);
  const after = stops.map((s, i) => ({ s, i })).filter(({ i }) => i > boardIndex);
  if (after.length === 0) return -1;
  if (g.length >= 2) {
    const exact = after.find(({ s }) => fold(s.name) === g);
    if (exact) return exact.i;
    const start = after.find(({ s }) => fold(s.name).startsWith(g) || g.startsWith(fold(s.name)));
    if (start) return start.i;
  }
  return after[after.length - 1].i;
}
