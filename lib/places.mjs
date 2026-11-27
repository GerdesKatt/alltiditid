// Platser för "Vart ska du?": hållplatser, adresser och namngivna platser (hotell, arenor,
// sjukhus) i en och samma lista, och en tolerant jämförelse så att man inte behöver skriva
// helt rätt ("clarion sign", "sodersjukhuset", "fruangen", "gulmarsplan").
//
// Rena funktioner, så att de går att testa utan nätet. Delas av servern
// (functions/api/trafik.js) och förslagen under fältet (components/PlaceSuggest.tsx).

import { foldPlace } from './transferMatch.mjs';

/** Damerau-Levenshtein (med byte av två intilliggande bokstäver), avbruten över max. */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = [];
  for (let i = 0; i <= a.length; i += 1) d.push([i]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Hur många fel ett ord får ha: inga i korta ord, ett från fyra bokstäver, två från åtta. */
const allowed = (word) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

/** Hur väl ett skrivet ord passar ett ord i namnet, 0–1. */
function wordScore(q, n) {
  if (q === n) return 1;
  // Husnummer måste stämma: "4" är inte "40". "4" passar "4a" lite sämre.
  // "4a" passar "4" (samma hus, kartan har ofta inte uppgången) och tvärtom, lite sämre.
  if (/^\d/.test(q) || /^\d/.test(n)) {
    const [qn, ql] = [q.replace(/[a-z]$/, ''), /[a-z]$/.test(q)];
    const [nn, nl] = [n.replace(/[a-z]$/, ''), /[a-z]$/.test(n)];
    return /^\d+$/.test(qn) && qn === nn && ql !== nl ? 0.85 : 0;
  }
  if (n.startsWith(q)) return q.length >= 2 ? 0.9 : 0.5;
  const max = allowed(q);
  if (max === 0) return 0;
  // Felstavat helt ord ("gulmarsplan") eller början av ett ord ("sodersjukh").
  if (distance(q, n, max) <= max) return 0.75;
  if (n.length > q.length && distance(q, n.slice(0, q.length), max) <= max) return 0.65;
  return 0;
}

/**
 * Hur väl det man skrev passar ett namn, 0–1. Alla ord man skrev måste passa något ord
 * i namnet (eller i detaljen, t.ex. orten), annars 0. Ordningen spelar ingen roll.
 * "Clarion sign" passar "Clarion Hotel Sign" men inte "Sigtuna busstation".
 * @param {string} query
 * @param {string} name
 * @param {string} [detail] orten eller adressen, som räknas lite lägre
 */
/** Ord att jämföra: "Blåklintsvägen 4 A" → ["blaklintsvagen", "4a"]. */
const words = (text) =>
  foldPlace(text)
    .replace(/\b(\d+) ([a-z])\b/g, '$1$2')
    .split(' ')
    .filter(Boolean);

export function placeScore(query, name, detail = '') {
  const q = words(query);
  if (q.length === 0) return 0;
  const n = words(name);
  const extra = words(detail);
  // Ihopskrivet eller isärskrivet: "tcentralen" mot "T-Centralen", "s:t eriks" mot "sankt eriks".
  const joinedQ = q.join('');
  const joinedN = n.join('');
  if (joinedQ.length >= 3 && !/\d/.test(joinedQ) && joinedN.startsWith(joinedQ)) return joinedQ === joinedN ? 1 : 0.92;
  let sum = 0;
  for (const w of q) {
    let best = 0;
    for (const m of n) best = Math.max(best, wordScore(w, m));
    for (const m of extra) best = Math.max(best, wordScore(w, m) * 0.8);
    if (best === 0) return 0;
    sum += best;
  }
  let score = sum / q.length;
  // Namnet börjar som man skrev: lite högre ("Odenplan" före "Stockholm Odenplan").
  if (n[0] && wordScore(q[0], n[0]) >= 0.9) score += 0.05;
  // Ord i namnet som man inte skrev drar ner lite, så att det kortaste passande namnet vinner.
  score -= Math.min(0.1, Math.max(0, n.length - q.length) * 0.02);
  return Math.max(0, Math.min(1, score));
}

/** Svagaste träff som räknas som säker nog att åka till utan att fråga. */
export const SURE = 0.7;

const KIND_ORDER = { stop: 0, poi: 1, address: 2, area: 3 };

/**
 * "Blåklintsvägen 4 älvsjö", "Storgatan 12, Lund", "Drottninggatan 12b" → gata, nummer och ort.
 * null om det inte ser ut som en gatuadress.
 * @param {string} query
 * @returns {{ street: string, number: string, town: string } | null}
 */
export function splitAddress(query) {
  const m = /^\s*([^\d,]*[^\d\s,])\s+(\d{1,4}\s?[a-zA-Z]?)\b\s*(?:,\s*)?(?:\d{3}\s?\d{2}\s+)?([^\d,].*?)?\s*$/.exec(String(query || ''));
  if (!m || m[1].trim().length < 3) return null;
  return { street: m[1].trim(), number: m[2].replace(/\s/g, ''), town: (m[3] || '').trim() };
}

/** Avstånd i km (ungefär, räcker för att sortera). */
export function kmBetween(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return Infinity;
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y) * 111.2;
}

/** Inom så här många km från ortens punkt räknas en adress som "i orten". Skogås ligger 10 km från Älvsjö. */
const TOWN_KM = 5;

/**
 * Sorterar kandidater efter hur väl de passar. Lika bra: hållplats före plats före adress.
 * Tar bort dubbletter (samma namn inom cirka 300 m).
 * @template {{ kind: string, name: string, detail?: string, lat?: number, lon?: number }} T
 * Med near (där man står) eller town (ortens hållplats, när man skrev "gata nr ort")
 * vinner den närmaste av lika bra träffar.
 * @param {string} query
 * @param {T[]} list
 * @param {{ near?: { lat: number, lon: number } | null, town?: { lat: number, lon: number } | null }} [opts]
 * @returns {(T & { score: number })[]}
 */
export function rankPlaces(query, list, opts = {}) {
  const { near = null, town = null } = opts;
  const addr = town ? splitAddress(query) : null;
  const streetQuery = addr && addr.town ? `${addr.street} ${addr.number}` : '';
  const scoreOf = (p) => {
    const s = placeScore(query, p.name, p.detail);
    if (s > 0 || !streetQuery) return s;
    // Orten står inte i namnet ("Blåklintsvägen 4, Stockholm" för Älvsjö): räkna den som rätt
    // om adressen ligger nära ortens hållplats, annars som en osäker gissning.
    const inTown = kmBetween(p, town) <= TOWN_KM;
    const street = placeScore(streetQuery, p.name, p.detail);
    if (street > 0) return inTown ? street : Math.min(street * 0.6, SURE - 0.05);
    // Gatan utan nummer i orten (kartan saknar huset): räcker att åka till, men ett hus vinner.
    if (inTown && !/\d/.test(p.name) && placeScore(addr.street, p.name) >= 0.9) return SURE;
    return 0;
  };
  // Lika bra träffar: den närmaste vinner (Blåklintsvägen 4 finns i många orter).
  // Långt bort drar ner lite, men aldrig mer än skillnaden mellan två nästan lika namn.
  const point = town || near;
  // Adresser finns i många orter med samma namn, så för dem väger avståndet tyngre.
  const penalty = (p) => {
    if (!point) return 0;
    const km = kmBetween(p, point);
    return p.kind === 'address' ? Math.min(0.12, km / 50) : Math.min(0.05, km / 4000);
  };
  const scored = list
    .map((p, i) => ({ ...p, score: scoreOf(p), i }))
    .filter((p) => p.score > 0)
    .map((p) => ({ ...p, sortScore: p.score - penalty(p) }))
    .sort((a, b) => b.sortScore - a.sortScore || (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.i - b.i);
  const out = [];
  for (const p of scored) {
    const dup = out.some(
      (o) =>
        foldPlace(o.name) === foldPlace(p.name) &&
        (o.lat == null || p.lat == null || (Math.abs(o.lat - p.lat) < 0.003 && Math.abs(o.lon - p.lon) < 0.006))
    );
    if (dup) continue;
    const { i, sortScore, ...rest } = p;
    out.push(rest);
  }
  return out;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// OpenStreetMaps nycklar till en kort beskrivning på svenska och engelska.
const OSM_LABEL = {
  hotel: ['Hotell', 'Hotel'],
  hostel: ['Vandrarhem', 'Hostel'],
  hospital: ['Sjukhus', 'Hospital'],
  clinic: ['Vårdcentral', 'Clinic'],
  university: ['Universitet', 'University'],
  college: ['Högskola', 'College'],
  school: ['Skola', 'School'],
  stadium: ['Arena', 'Stadium'],
  museum: ['Museum', 'Museum'],
  theatre: ['Teater', 'Theatre'],
  cinema: ['Bio', 'Cinema'],
  restaurant: ['Restaurang', 'Restaurant'],
  cafe: ['Kafé', 'Café'],
  mall: ['Köpcentrum', 'Shopping centre'],
  supermarket: ['Livsmedel', 'Supermarket'],
  park: ['Park', 'Park'],
  attraction: ['Sevärdhet', 'Attraction'],
  aerodrome: ['Flygplats', 'Airport'],
  station: ['Station', 'Station'],
  church: ['Kyrka', 'Church'],
  library: ['Bibliotek', 'Library'],
  office: ['Kontor', 'Office'],
};

/** Är det en ort eller ett område snarare än en plats? */
const AREA = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter', 'county', 'state', 'district', 'locality', 'municipality', 'island']);

/**
 * Photon (OpenStreetMap, photon.komoot.io eller egen server) till appens platser.
 * Bara Sverige. Hållplatser hoppas över, de kommer från Trafiklab.
 * @returns {{ kind: 'poi'|'address'|'area', name: string, detail: string, type: string, lat: number, lon: number }[]}
 */
export function photonPlaces(data) {
  const out = [];
  for (const f of Array.isArray(data && data.features) ? data.features : []) {
    const p = (f && f.properties) || {};
    const [lon, lat] = (f && f.geometry && f.geometry.coordinates) || [];
    if (num(lat) == null || num(lon) == null) continue;
    if (p.countrycode && String(p.countrycode).toUpperCase() !== 'SE') continue;
    const key = String(p.osm_key || '');
    const value = String(p.osm_value || '');
    if (['public_transport', 'railway', 'highway'].includes(key) && /stop|platform|station|halt/.test(value)) continue;
    if (key === 'amenity' && /^(bus_station|ferry_terminal)$/.test(value)) continue;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const city = String(p.city || p.town || p.village || p.district || p.county || '');
    // Stadsdel och område också, så att "älvsjö" passar en adress i Stockholm (district "Hägersten-Älvsjö").
    const area = [p.locality, p.district].map((x) => String(x || '')).filter((x) => x && x !== city && x !== p.name);
    // Ett namn betyder en plats (hotell, arena), även om Photon säger type=house.
    // Utan namn är det en adress; en gata (highway) med namn är också en adress.
    const isAddress = !p.name || key === 'highway' || (key === 'place' && value === 'house');
    const name = String(p.name || street || '');
    if (!name) continue;
    const kind = isAddress ? 'address' : AREA.has(String(p.type || value)) || key === 'place' || key === 'boundary' ? 'area' : 'poi';
    const detail = [kind === 'poi' && street ? street : '', ...area, city && city !== name ? city : ''].filter(Boolean).join(', ');
    out.push({ kind, name, detail, type: kind === 'poi' ? value : '', lat: Number(lat), lon: Number(lon) });
  }
  return out;
}

/**
 * Geoapify Autocomplete (format=json) till appens platser. Används om GEOAPIFY_KEY finns.
 * @returns {{ kind: 'poi'|'address'|'area', name: string, detail: string, type: string, lat: number, lon: number }[]}
 */
export function geoapifyPlaces(data) {
  const out = [];
  for (const r of Array.isArray(data && data.results) ? data.results : []) {
    if (num(r.lat) == null || num(r.lon) == null) continue;
    if (r.country_code && String(r.country_code).toLowerCase() !== 'se') continue;
    const type = String(r.result_type || '');
    const street = [r.street, r.housenumber].filter(Boolean).join(' ');
    const city = String(r.city || r.county || '');
    const area = [r.suburb, r.district].map((x) => String(x || '')).filter((x) => x && x !== city && x !== r.name);
    const kind = type === 'amenity' || type === 'building' ? (r.name ? 'poi' : 'address') : type === 'street' || type === 'postcode' ? 'address' : 'area';
    const name = String(r.name || r.address_line1 || street || r.formatted || '');
    if (!name) continue;
    const category = String((r.category || '').split('.').pop() || '');
    const detail = [kind === 'poi' && street ? street : '', ...area, city && city !== name ? city : ''].filter(Boolean).join(', ');
    out.push({ kind, name, detail, type: kind === 'poi' ? category : '', lat: Number(r.lat), lon: Number(r.lon) });
  }
  return out;
}

/** Kort beskrivning av en plats: "Hotell · Stockholm". */
export function placeLabel(type, lang = 'sv') {
  const l = OSM_LABEL[String(type || '')];
  return l ? l[lang === 'en' ? 1 : 0] : '';
}
