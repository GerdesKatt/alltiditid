/**
 * Reseplaneraren: ResRobot v2.1 (location.name och trip) till ett enkelt format.
 * Rena funktioner, så att de går att testa utan nätet.
 */

/** "PT1H25M" → 85 */
export function isoMinutes(text) {
  const m = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(String(text || ''));
  if (!m) return 0;
  return Number(m[1] || 0) * 60 + Number(m[2] || 0);
}

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

/**
 * Första träffen för det man skrev: en hållplats (id) eller en adress/plats (koordinater).
 * ResRobot svarar med både StopLocation och CoordLocation i samma lista.
 */
export function pickDestination(data) {
  for (const item of asArray(data && data.stopLocationOrCoordLocation)) {
    const s = item.StopLocation;
    if (s && s.extId) return { kind: 'stop', id: String(s.extId), name: String(s.name || '') };
    const c = item.CoordLocation;
    if (c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon))) {
      return { kind: 'coord', lat: Number(c.lat), lon: Number(c.lon), name: String(c.name || '') };
    }
  }
  return null;
}

/**
 * Alla träffar i ett location.name-svar, som kandidater att jämföra med det man skrev.
 * Hållplatser får kind 'stop', adresser och platser 'address' (ResRobot skiljer dem inte åt).
 */
export function destinationCandidates(data) {
  const out = [];
  for (const item of asArray(data && data.stopLocationOrCoordLocation)) {
    const s = item.StopLocation;
    if (s && s.extId) {
      out.push({ kind: 'stop', id: String(s.extId), name: String(s.name || ''), detail: '', lat: Number(s.lat), lon: Number(s.lon) });
      continue;
    }
    const c = item.CoordLocation;
    if (c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon))) {
      out.push({ kind: 'address', name: String(c.name || ''), detail: '', lat: Number(c.lat), lon: Number(c.lon) });
    }
  }
  return out;
}

// ResRobots kategorikoder (catCode) till appens trafikslag.
const CAT_MODE = { 1: 'train', 2: 'train', 3: 'bus', 4: 'commuter', 5: 'subway', 6: 'tram', 7: 'bus', 8: 'ferry' };

function mode(product) {
  const code = Number(product && product.catCode);
  if (CAT_MODE[code]) return CAT_MODE[code];
  const out = String((product && product.catOutL) || '').toLowerCase();
  if (out.includes('flyg') && !out.includes('buss')) return 'flight';
  if (out.includes('tunnelbana')) return 'subway';
  if (out.includes('pendel')) return 'commuter';
  if (out.includes('spårv')) return 'tram';
  if (out.includes('båt') || out.includes('färja')) return 'ferry';
  if (out.includes('tåg')) return 'train';
  return 'bus';
}

/** Kortnamn på bolaget: "Storstockholms Lokaltrafik" → "SL". Okänt bolag skrivs som det är. */
const AGENCIES = [
  [/storstockholms lokaltrafik|^sl$/i, 'SL'],
  [/västtrafik/i, 'Västtrafik'],
  [/skånetrafiken/i, 'Skånetrafiken'],
  [/upplands lokaltrafik|^ul$/i, 'UL'],
  [/östgötatrafiken/i, 'Östgötatrafiken'],
  [/värmlandstrafik/i, 'Värmlandstrafik'],
  [/mälartåg|mälardalstrafik/i, 'Mälartåg'],
];
/** Bolaget: ResRobot v2.1 har det oftast i operatorInfo, ibland i operator (som tavlan läser). */
function operatorOf(p) {
  return String((p && (p.operator || (p.operatorInfo && (p.operatorInfo.name || p.operatorInfo.nameS)))) || '');
}

export function agencyName(operator) {
  const raw = String(operator || '').replace(/^(lt|blt)\s+/i, '').trim();
  for (const [re, name] of AGENCIES) if (re.test(raw)) return name;
  return raw;
}

/**
 * Trafikslag och nummer: "Buss 144", "Pendeltåg 43", "Regionaltåg 167", "Expressbuss 814".
 * ResRobots "Länstrafik - Buss" blir bara "Buss"; bolaget visas för sig (agency).
 */
function lineName(product, legMode) {
  const p = product || {};
  let kind = String(p.catOutL || p.catOutS || '')
    .replace(/^länstrafik\s*-?\s*/i, '')
    .replace(/^regional\s+tåg/i, 'Regionaltåg')
    // "Expressbuss Buss" → "Expressbuss", "Snabbtåg Tåg" → "Snabbtåg"
    .replace(/^(\S*?(tåg|buss|båt))\s+\2$/i, '$1')
    .trim();
  if (legMode === 'commuter' && /^tåg$/i.test(kind) && agencyName(operatorOf(p)) === 'SL') kind = 'Pendeltåg';
  // "Buss 814" i numret när slaget redan är Expressbuss: bara numret.
  const num = String(p.displayNumber || p.line || p.num || '')
    .replace(/^(buss|tåg|spårvagn|tunnelbana)\s+/i, '')
    .trim();
  if (kind && num) return `${kind[0].toUpperCase()}${kind.slice(1).toLowerCase()} ${num}`;
  return String(p.name || kind || num).replace(/^länstrafik\s*-\s*/i, '').trim();
}

function point(p, clean) {
  return {
    name: clean(String((p && p.name) || '')),
    time: hhmm(p && p.time),
    rtTime: hhmm(p && p.rtTime),
    date: String((p && p.date) || ''),
    track: String((p && (p.rtTrack || p.track)) || ''),
  };
}

/** ResRobots Trip-lista → [{ dep, arr, minutes, changes, legs }], högst `max`. */
export function mapTrips(data, { max = 4, clean = (n) => n } = {}) {
  const out = [];
  for (const trip of asArray(data && data.Trip)) {
    const legs = [];
    for (const leg of asArray(trip.LegList && trip.LegList.Leg)) {
      const from = point(leg.Origin, clean);
      const to = point(leg.Destination, clean);
      const walk = leg.type === 'WALK' || leg.type === 'TRSF';
      if (walk) {
        const minutes = isoMinutes(leg.duration);
        // Byten på samma ställe utan gång tar ingen plats i listan.
        if (minutes === 0 && from.name === to.name) continue;
        const meters = Number(leg.dist) || 0;
        // TRSF är ett byte: tiden är bytestiden med marginal (rulltrappor, spärrar), inte gångtid.
        if (leg.type === 'TRSF') {
          legs.push({ kind: 'walk', transfer: true, from, to, minutes, meters });
        } else {
          // ResRobot räknar ibland väntan in i gångsträckan ("Gå 15 min (112 m)"). Gångtiden
          // räknas då från sträckan (80 m i minuten) och resten blir väntan till nästa avgång.
          const walkMin = meters > 0 ? Math.max(1, Math.ceil(meters / 80)) : minutes;
          if (meters > 0 && minutes - walkMin >= 3) {
            legs.push({ kind: 'walk', from, to, minutes: walkMin, meters, wait: minutes - walkMin });
          } else {
            legs.push({ kind: 'walk', from, to, minutes, meters });
          }
        }
        continue;
      }
      const product = asArray(leg.Product)[0] || {};
      const legMode = mode(product);
      legs.push({
        kind: 'ride',
        mode: legMode,
        line: lineName(product, legMode),
        agency: agencyName(operatorOf(product)),
        direction: clean(String(leg.direction || '')),
        operator: String(product.operator || ''),
        from,
        to,
        minutes: isoMinutes(leg.duration),
        cancelled: leg.cancelled === true,
      });
    }
    if (legs.length === 0) continue;
    // Väntan efter sista gångsträckan är ingen väntan till en avgång.
    const lastLeg = legs[legs.length - 1];
    if (lastLeg.kind === 'walk' && lastLeg.wait) delete lastLeg.wait;
    const rides = legs.filter((l) => l.kind === 'ride');
    const first = legs[0];
    const last = legs[legs.length - 1];
    out.push({
      dep: first.from.rtTime || first.from.time,
      arr: last.to.rtTime || last.to.time,
      depDate: first.from.date,
      arrDate: last.to.date,
      minutes: isoMinutes(trip.duration),
      changes: Math.max(0, rides.length - 1),
      legs,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Längre promenad än så här till första hållplatsen: titta också på bussen från närmaste. */
export const LONG_WALK_MINUTES = 10;

/** Första promenaden i en resa, om den är lång. */
export function longFirstWalk(trip, min = LONG_WALK_MINUTES) {
  const first = trip && trip.legs && trip.legs[0];
  return first && first.kind === 'walk' && !first.transfer && first.minutes >= min ? first : null;
}

/** "07:52" − 4 min → "07:48" (över midnatt räknas inte; resor från en position börjar sällan då). */
export function minusMinutes(time, minutes) {
  const [h, m] = String(time).split(':').map(Number);
  const total = (((h * 60 + m - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Resor från närmaste hållplats, med promenaden dit först: så att de går att jämföra med resor
 * där man går hela vägen till en större hållplats.
 */
export function withStartWalk(trips, { from, stopName, meters, minutes }) {
  return trips
    .filter((tr) => tr.legs[0] && tr.legs[0].kind === 'ride')
    .map((tr) => {
      const ride = tr.legs[0];
      const leave = minusMinutes(ride.from.rtTime || ride.from.time, minutes);
      const walk = {
        kind: 'walk',
        from: { ...from, time: leave, rtTime: '', date: ride.from.date || tr.depDate },
        to: { name: stopName, time: ride.from.time, rtTime: ride.from.rtTime, track: '', date: ride.from.date || tr.depDate },
        minutes,
        meters,
      };
      return { ...tr, dep: leave, minutes: tr.minutes + minutes, legs: [walk, ...tr.legs] };
    });
}

const arrivalKey = (tr) => `${tr.arrDate || tr.depDate} ${tr.arr}`;
const departKey = (tr) => `${tr.depDate} ${tr.dep}`;
const walkMinutesOf = (tr) => (tr.legs[0] && tr.legs[0].kind === 'walk' ? tr.legs[0].minutes : 0);
const signature = (tr) =>
  tr.legs
    .filter((l) => l.kind === 'ride')
    .map((l) => `${l.line}@${l.from.time}`)
    .join('|');

/**
 * Gå hela vägen eller ta bussen en bit: båda sorterade så att den som kommer fram först står
 * först, och vid samma ankomst den där man går hemifrån senast, sedan den med kortast promenad.
 */
export function mergeStarts(walkTrips, busTrips, max = 5) {
  const seen = new Set();
  const all = [];
  for (const tr of [...walkTrips, ...busTrips]) {
    const key = signature(tr);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(tr);
  }
  all.sort(
    (a, b) =>
      arrivalKey(a).localeCompare(arrivalKey(b)) ||
      departKey(b).localeCompare(departKey(a)) ||
      walkMinutesOf(a) - walkMinutesOf(b)
  );
  return all.slice(0, max);
}

/**
 * Ett annat sätt att börja samma resa: bussen från närmaste hållplats i stället för en lång
 * promenad (eller tvärtom), om den kommer fram lika tidigt. "Eller Buss 144 07:52".
 */
export function startAlternative(trip, trips) {
  if (!trip || !Array.isArray(trips)) return null;
  const mine = walkMinutesOf(trip);
  for (const other of trips) {
    if (other === trip || signature(other) === signature(trip)) continue;
    if (arrivalKey(other) > arrivalKey(trip)) continue;
    const ride = other.legs.find((l) => l.kind === 'ride');
    if (!ride) continue;
    const walk = walkMinutesOf(other);
    // Bara ett verkligt alternativ: minst fem minuter kortare promenad.
    if (mine - walk < 5) continue;
    return { line: ride.line, direction: ride.direction, from: ride.from.name, dep: ride.from.rtTime || ride.from.time, walk, mode: ride.mode };
  }
  return null;
}
