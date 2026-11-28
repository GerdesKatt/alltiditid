// "Menade du …?": hållplatser som liknar det man skrev, när sökningen inte gav någon träff.
// Sökningen hos Trafiklab kräver rätt stavning ("uppsla" gav noll träffar, UX-revisionen, fynd 5),
// så appen jämför själv mot hållplatslistan (public/stops.json, de 500 största).

/** Jämförbar form: gemener, utan accenter utom åäö, bara bokstäver och siffror. */
export function foldName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-́̃-̇̉-̧]/g, '')
    .normalize('NFC')
    .replace(/[^a-zåäöæøü0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Redigeringsavstånd där två bokstäver i fel ordning räknas som ett fel ("uppsla" → "uppsal"). */
export function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Hur många fel som tolereras: inga under 4 tecken, ett upp till 6, sedan två. */
function allowed(len) {
  return len < 4 ? 0 : len <= 6 ? 1 : 2;
}

/**
 * Hållplatser vars namn (eller ett ord i namnet, eller början av namnet) ligger nära frågan.
 * Bäst träff först; störst hållplats (daily) vinner vid lika avstånd.
 */
export function fuzzyStops(query, stops, limit = 3) {
  const q = foldName(query);
  const max = allowed(q.length);
  if (!max) return [];
  const scored = [];
  for (const s of stops || []) {
    const name = foldName(s.name);
    if (!name) continue;
    const words = name.split(' ');
    const candidates = [name, name.slice(0, q.length), ...words, ...words.map((w) => w.slice(0, q.length))];
    let best = max + 1;
    for (const c of candidates) {
      if (!c) continue;
      const dist = editDistance(q, c, max);
      if (dist < best) best = dist;
      if (best === 0) break;
    }
    if (best <= max) scored.push({ stop: s, dist: best });
  }
  scored.sort((a, b) => a.dist - b.dist || (b.stop.daily || 0) - (a.stop.daily || 0) || a.stop.name.localeCompare(b.stop.name, 'sv'));
  return scored.slice(0, limit).map((x) => x.stop);
}
