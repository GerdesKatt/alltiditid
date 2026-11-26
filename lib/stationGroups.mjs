// Hållplatser som hör ihop. Trafiklab har ofta en hållplats per trafikslag på samma
// station (Stockholm Centralstation för tåg, Stockholm City för pendeltåg, T-Centralen
// för tunnelbanan). För den som reser är det en och samma plats, så de visas som en:
// en tavla, ett sökförslag och en rad bland grannhållplatserna.
//
// Tavlan tar upp till fyra id:n (MAX_COMBINED_STOPS i functions/api/trafik.js).
// Det första id:t är stationens "huvudhållplats" och bestämmer vilken sida som visas.

export const STATION_GROUPS = [
  {
    // Fjärr- och regionaltåg + pendeltåg (Stockholm City) + tunnelbanan (T-Centralen)
    // + Flygbussarna och fjärrbussarna (Cityterminalen). Samma som bytena i trafik.js (HUBS).
    ids: ['740000001', '740001617', '740020749', '740000622'],
    name: 'Stockholm C / T-Centralen',
    shortName: 'Stockholm C',
    parts: ['Stockholm C', 'Stockholm City', 'T-Centralen', 'Cityterminalen'],
  },
  {
    // Järnvägsstationen + Drottningtorget och Nils Ericsonsplatsen (spårvagn) + Nils Ericsonterminalen (buss)
    ids: ['740000002', '740030117', '740015585', '740020483'],
    name: 'Göteborg Centralstation',
    shortName: 'Göteborg C',
    parts: ['Göteborg C', 'Drottningtorget', 'Nils Ericsonsplatsen', 'Nils Ericsonterminalen'],
  },
  {
    // Arlanda C (SJ, Mälartåg, SL) + Arlanda Södra och Norra (Arlanda Express)
    ids: ['740000556', '740000492', '740000708'],
    name: 'Stockholm Arlanda Airport',
    shortName: 'Arlanda',
    parts: ['Arlanda C', 'Arlanda Södra', 'Arlanda Norra'],
  },
  {
    // Tunnelbanan och bussarna på Slussen + den nya bussterminalen
    ids: ['740020101', '740077425'],
    name: 'Slussen',
    shortName: 'Slussen',
    parts: ['Slussen T-bana', 'Slussen bussterminal'],
  },
];

const byMember = new Map();
for (const g of STATION_GROUPS) for (const id of g.ids) byMember.set(id, g);

/** Gruppen som ett id hör till. Ett sammanslaget id ("a,b,c") går på det första. */
export function groupFor(id) {
  return byMember.get(String(id || '').split(',')[0].trim());
}

/** Gruppens tavla som hållplatsval: { id: 'a,b,c', name, shortName }. */
export function groupStop(group) {
  return { id: group.ids.join(','), name: group.name, shortName: group.shortName };
}

/** Hållplatsen, eller hela stationen om hållplatsen hör till en grupp. */
export function groupedStop(stop) {
  const g = stop && groupFor(stop.id);
  if (!g) return stop;
  const out = { ...stop, ...groupStop(g) };
  return out;
}

/** Hör två hållplatser (eller sammanslagna id:n) till samma station? */
export function sameStation(a, b) {
  const first = (id) => String(id || '').split(',')[0].trim();
  if (first(a) && first(a) === first(b)) return true;
  const ga = groupFor(a);
  return Boolean(ga && ga === groupFor(b));
}

/**
 * Slår ihop hållplatser i en lista (sökförslag, grannar) som hör till samma station.
 * Den första i listan behåller sin plats och får stationens id och namn; trafikslagen
 * läggs ihop. Övriga fält (avstånd, ort) kommer från den första.
 */
export function mergeStops(list) {
  const out = [];
  const seen = new Map();
  for (const stop of Array.isArray(list) ? list : []) {
    if (!stop || !stop.id) continue;
    const g = groupFor(stop.id);
    if (!g) {
      out.push(stop);
      continue;
    }
    const existing = seen.get(g);
    if (existing) {
      if (Array.isArray(stop.modes)) {
        const modes = Array.isArray(existing.modes) ? existing.modes : [];
        for (const m of stop.modes) if (!modes.includes(m)) modes.push(m);
        existing.modes = modes;
      }
      continue;
    }
    const merged = groupedStop(stop);
    if (Array.isArray(stop.modes)) merged.modes = [...stop.modes];
    seen.set(g, merged);
    out.push(merged);
  }
  return mergeSameName(out);
}

/** Namnet utan "Stockholm " först och utan " T-bana", " station" och liknande sist. */
function baseName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^stockholm\s+/, '')
    .replace(/\s+(t-bana|tunnelbana|station|spårv|spårvagn|pendeltåg)$/, '')
    .trim();
}

/** Trafiklabs samlade hållplatser (rikshållplatser) har id som börjar på 740098. */
const isParent = (id) => /^740098\d{3}$/.test(String(id || ''));

/**
 * Slår ihop sökträffar som är samma plats: "Odenplan", "Odenplan T-bana" och
 * "Stockholm Odenplan station" blir en träff, Odenplan. Bara när en samlad hållplats
 * finns och de andra skiljer sig från den enbart med "Stockholm" eller "T-bana",
 * "station" och liknande, så att en Brunnsparken i en annan stad aldrig slås ihop.
 * Trafikslag som den samlade hållplatsen saknar tas med genom att id:t läggs till.
 */
export function mergeSameName(list) {
  const items = Array.isArray(list) ? list : [];
  const parents = items.filter((s) => s && isParent(s.id) && !String(s.id).includes(','));
  if (parents.length === 0) return items;
  const out = [];
  const absorbed = new Set();
  const merged = new Map();
  for (const p of parents) merged.set(p, { ...p, modes: Array.isArray(p.modes) ? [...p.modes] : p.modes });
  for (const stop of items) {
    if (!stop || parents.includes(stop)) continue;
    const parent = parents.find((p) => stop.name !== p.name && baseName(stop.name) === baseName(p.name));
    if (!parent) continue;
    const target = merged.get(parent);
    const missing = (stop.modes || []).filter((m) => !(target.modes || []).includes(m));
    if (missing.length && String(target.id).split(',').length < 4 && !String(stop.id).includes(',')) {
      target.id = `${target.id},${stop.id}`;
    }
    if (missing.length) target.modes = [...(target.modes || []), ...missing];
    absorbed.add(stop);
  }
  for (const stop of items) {
    if (absorbed.has(stop)) continue;
    out.push(merged.get(stop) || stop);
  }
  return out;
}
