// Gör om Trafiklabs hållplatslista (stops/list) till listan som hållplatssidorna byggs
// från: de mest trafikerade hållplatserna, med adress (slug), ort, trafikslag och
// grannar. Ren funktion utan nätverk, så att den går att testa (test/stoplist.test.mjs).

import { groupFor, sameStation } from './stationGroups.mjs';

const MODE_LABELS = [
  ['TRAIN', 'Tåg'],
  ['METRO', 'T-bana'],
  ['TRAM', 'Spårvagn'],
  ['BUS', 'Buss'],
  ['FERRY', 'Båt'],
  ['SHIP', 'Båt'],
];

/** Adresser som redan används av sajten och inte får bli en hållplats. */
const RESERVED = new Set(['api', 'hallplatser', 'sitemap', 'robots', 'og', 'icon', 'sw', 'manifest']);

export function cleanName(raw) {
  return String(raw || '')
    .replace(/\s*\([^)]*\bkn\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** "Göteborg Centralstation" → "goteborg-centralstation". */
export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/[öø]/g, 'o')
    .replace(/é/g, 'e')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' och ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function placeOf(group) {
  const child = Array.isArray(group.stops) ? group.stops.find((st) => st && st.name) : null;
  const name = child ? String(child.name) : '';
  const comma = name.indexOf(',');
  if (comma < 2 || comma > 40) return '';
  return cleanName(name.slice(0, comma));
}

function centerOf(group) {
  const pts = (Array.isArray(group.stops) ? group.stops : []).filter(
    (st) => Number.isFinite(Number(st?.lat)) && Number.isFinite(Number(st?.lon))
  );
  if (pts.length === 0) return null;
  const lat = pts.reduce((a, st) => a + Number(st.lat), 0) / pts.length;
  const lon = pts.reduce((a, st) => a + Number(st.lon), 0) / pts.length;
  return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
}

/** Avstånd i km (haversine). */
export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const NEAR_COUNT = 5;
const NEAR_MAX_KM = 25;

export function buildStopList(groups, limit = 500) {
  const seenIds = new Set();
  const candidates = [];
  for (const g of groups) {
    const id = String(g?.id || '');
    const name = cleanName(g?.name);
    const daily = Number(g?.average_daily_stop_times) || 0;
    const modesRaw = Array.isArray(g?.transport_modes) ? g.transport_modes : [];
    if (!/^\d{6,12}$/.test(id) || !name || daily <= 0 || modesRaw.length === 0 || seenIds.has(id)) continue;
    // Hela orter ("Stockholm", "Göteborg") är metahållplatser som summerar alla
    // hållplatser i orten. De är inga riktiga hållplatser och ska inte få egna sidor.
    if (g.area_type && g.area_type !== 'RIKSHALLPLATS') continue;
    const center = centerOf(g);
    if (!center) continue;
    seenIds.add(id);
    const modes = [];
    for (const [k, label] of MODE_LABELS) if (modesRaw.includes(k) && !modes.includes(label)) modes.push(label);
    if (modes.length === 0) continue;
    candidates.push({ id, name, place: placeOf(g), modes, daily: Math.round(daily), ...center });
  }

  candidates.sort((a, b) => b.daily - a.daily || a.name.localeCompare(b.name, 'sv'));

  // Samma namn på nästan samma plats (en metahållplats och en rikshållplats): behåll den största.
  const picked = [];
  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (picked.some((p) => p.name === c.name && distanceKm(p, c) < 1.5)) continue;
    picked.push(c);
  }

  // Unika adresser: namnet, annars namn och ort, annars namn och id.
  const used = new Set(RESERVED);
  for (const s of picked) {
    let slug = slugify(s.name);
    if (!slug || used.has(slug)) slug = slugify(`${s.name} ${s.place}`);
    if (!slug || used.has(slug)) slug = `${slugify(s.name) || 'hallplats'}-${s.id}`;
    used.add(slug);
    s.slug = slug;
  }

  // Grannar för länkar mellan sidorna ("Hållplatser i närheten"). Delar av samma station
  // (T-Centralen för Stockholm C) är inga grannar, och en annan station räknas en gång.
  for (const s of picked) {
    const near = [];
    const ranked = picked
      .filter((o) => o !== s && !sameStation(o.id, s.id))
      .map((o) => ({ o, d: distanceKm(s, o) }))
      .filter((x) => x.d <= NEAR_MAX_KM)
      .sort((a, b) => a.d - b.d);
    for (const { o } of ranked) {
      if (near.length >= NEAR_COUNT) break;
      if (groupFor(o.id) && near.some((id) => sameStation(id, o.id))) continue;
      near.push(o.id);
    }
    s.near = near;
    if (!s.place) delete s.place;
  }

  return picked;
}
