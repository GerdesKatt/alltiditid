// Vägfärjor: Trafikverkets färjeleder (Färjerederiet), ur Trafikverkets öppna API
// (FerryRoute och FerryAnnouncement, samma nyckel som tågen). Lederna är gratis,
// går efter tidtabell och saknar realtid; avvikelser kommer som text på avgången.
//
// Färjelägen får id "fv:<hamnens id>" så att de inte blandas ihop med Trafiklabs hållplatser.

export const FERRY_PREFIX = 'fv:';

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Alla färjelägen ur ledernas lista: [{ id, name, route }], ett per hamn. */
export function ferryHarbors(routes) {
  const byId = new Map();
  for (const route of Array.isArray(routes) ? routes : []) {
    if (!route || route.Deleted) continue;
    const routeName = String(route.Name || route.Shortname || '').trim();
    // Fältet heter Harbor i Trafikverkets svar (en lista, trots namnet i ental).
    const list = Array.isArray(route.Harbor) ? route.Harbor : Array.isArray(route.Harbors) ? route.Harbors : [];
    for (const h of list) {
      const id = h && h.Id != null ? String(h.Id) : '';
      const name = String(h?.Name || '').trim();
      if (!id || !name || byId.has(id)) continue;
      byId.set(id, { id, name, route: routeName });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

/**
 * Färjelägen som matchar sökningen, på hamnens eller ledens namn ("Hönö", "Gullmarsleden").
 * Hamnar vars namn börjar med sökordet kommer först.
 */
export function searchFerryHarbors(harbors, query, limit = 3) {
  const q = fold(query);
  if (q.length < 2) return [];
  const scored = [];
  for (const h of harbors) {
    const name = fold(h.name);
    const route = fold(h.route);
    const score = name.startsWith(q) ? 0 : name.split(' ').some((w) => w.startsWith(q)) ? 1 : route.startsWith(q) || route.split(' ').some((w) => w.startsWith(q)) ? 2 : -1;
    if (score >= 0) scored.push({ score, h });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.h.name.localeCompare(b.h.name, 'sv'))
    .slice(0, limit)
    .map(({ h }) => ({
      id: `${FERRY_PREFIX}${h.id}`,
      name: `${h.name} färjeläge`,
      ...(h.route ? { place: h.route } : {}),
      modes: ['Vägfärja'],
    }));
}

/** Ordningsregler ombord ("På färjan: Kör så nära …") är ingen avvikelse och visas inte. */
const ONBOARD_RULE = /^på färjan\b/i;

/**
 * Tavlan för ett färjeläge: avgångarna, och text som gäller alla avgångar en gång överst
 * i stället för på varje rad.
 * @returns {{ departures: object[], disruptions: { text: string, lines: string[] }[] }}
 */
export function ferryBoard(announcements, toLocal) {
  const all = ferryDepartures(announcements, toLocal).map((d) => ({
    ...d,
    _info: d.deviation ? d.deviation.split(' • ').filter((t) => !ONBOARD_RULE.test(t)) : [],
  }));
  // Text som står på varje avgång (minst tre) gäller hela leden just nu.
  const counts = new Map();
  for (const d of all) for (const t of d._info) counts.set(t, (counts.get(t) || 0) + 1);
  const shared = all.length >= 3 ? [...counts].filter(([, n]) => n === all.length).map(([t]) => t) : [];
  const lines = Array.from(new Set(all.map((d) => d.line.replace(/ BÅT$/, ''))));
  return {
    departures: all.map(({ _info, ...d }) => ({ ...d, deviation: _info.filter((t) => !shared.includes(t)).join(' • ') })),
    disruptions: shared.map((text) => ({ text, lines })),
  };
}

/**
 * Avgångar från ett färjeläge i appens format.
 * @param {object[]} announcements FerryAnnouncement från Trafikverket.
 * @param {(iso: string) => string} toLocal Tidpunkt med tidszon till 'YYYY-MM-DDTHH:MM' svensk tid.
 */
export function ferryDepartures(announcements, toLocal) {
  const out = [];
  for (const a of Array.isArray(announcements) ? announcements : []) {
    if (!a || a.Deleted || !a.DepartureTime) continue;
    const local = toLocal(String(a.DepartureTime));
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) continue;
    const time = local.slice(11);
    const routeName = String(a.Route?.Name || a.Route?.Shortname || 'Vägfärja').trim();
    const info = Array.from(new Set((Array.isArray(a.Info) ? a.Info : []).map((t) => String(t || '').trim()).filter(Boolean)));
    out.push({
      id: `fv-${a.Id ?? `${a.Route?.Id || ''}-${local}`}`,
      // "BÅT" blir brickan på raden, ledens namn står under (som Trafiklabs "Hönöfärjan BÅT").
      line: `${routeName} BÅT`,
      operator: 'Trafikverket Färjerederiet',
      destination: String(a.ToHarbor?.Name || '').trim() || routeName,
      scheduledTime: time,
      newTime: '',
      estimatedTime: time,
      expectedAt: local,
      delayMinutes: 0,
      status: 'on-time',
      // Tidtabell med avvikelser i text, ingen positionsbaserad realtid.
      hasRealtime: false,
      track: '',
      deviation: info.slice(0, 2).join(' • '),
      viaStops: [],
      directionType: 'departures',
      transportMode: 'ferry',
    });
  }
  return out.sort((x, y) => x.expectedAt.localeCompare(y.expectedAt));
}
