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

// ResRobots kategorikoder (catCode) till appens trafikslag.
const CAT_MODE = { 1: 'train', 2: 'train', 3: 'bus', 4: 'commuter', 5: 'subway', 6: 'tram', 7: 'bus', 8: 'ferry' };

function mode(product) {
  const code = Number(product && product.catCode);
  if (CAT_MODE[code]) return CAT_MODE[code];
  const out = String((product && product.catOutL) || '').toLowerCase();
  if (out.includes('tunnelbana')) return 'subway';
  if (out.includes('pendel')) return 'commuter';
  if (out.includes('spårv')) return 'tram';
  if (out.includes('båt') || out.includes('färja')) return 'ferry';
  if (out.includes('tåg')) return 'train';
  return 'bus';
}

/** Kort namn att visa: "Buss 144", "Tunnelbana 14", "Regionaltåg 65". */
function lineName(product) {
  const p = product || {};
  const kind = String(p.catOutL || p.catOutS || '').trim();
  const num = String(p.displayNumber || p.line || p.num || '').trim();
  if (kind && num) return `${kind[0].toUpperCase()}${kind.slice(1)} ${num}`;
  return String(p.name || kind || num).replace(/^Länstrafik\s*-\s*/i, '').trim();
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
        legs.push({ kind: 'walk', from, to, minutes, meters: Number(leg.dist) || 0 });
        continue;
      }
      const product = asArray(leg.Product)[0] || {};
      legs.push({
        kind: 'ride',
        mode: mode(product),
        line: lineName(product),
        direction: clean(String(leg.direction || '')),
        operator: String(product.operator || ''),
        from,
        to,
        minutes: isoMinutes(leg.duration),
        cancelled: leg.cancelled === true,
      });
    }
    if (legs.length === 0) continue;
    const rides = legs.filter((l) => l.kind === 'ride');
    const first = legs[0];
    const last = legs[legs.length - 1];
    out.push({
      dep: first.from.rtTime || first.from.time,
      arr: last.to.rtTime || last.to.time,
      depDate: first.from.date,
      minutes: isoMinutes(trip.duration),
      changes: Math.max(0, rides.length - 1),
      legs,
    });
    if (out.length >= max) break;
  }
  return out;
}
