/**
 * "Brukar vara sen" (Vägen till 10, idé 12): förseningshistoriken i D1 sammanfattad per linje och
 * mål för en hållplats och en tid på dygnet. Rena funktioner, testade i test/punctuality.test.mjs.
 */

/** Minst så många mätningar innan raden säger något. */
export const MIN_SAMPLES = 10;
/** Medianförseningen måste vara minst så här stor för att nämnas. */
export const MIN_LATE = 2;

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

/** Nyckeln som tavlan och historiken delar: linje och mål. */
export function punctualityKey(line, destination) {
  return `${String(line || '').trim().toLowerCase()}|${String(destination || '').trim().toLowerCase()}`;
}

/**
 * @param {{ line: string, destination: string, delay_min: number, weekday: number }[]} rows
 * @param {number} weekday 0 = söndag … 6 = lördag (som strftime('%w'))
 * @returns {Record<string, { late: number, n: number, weekday: boolean }>} bara de som brukar vara sena
 */
export function summarize(rows, weekday) {
  const groups = new Map();
  for (const r of rows || []) {
    const key = punctualityKey(r.line, r.destination);
    if (!groups.has(key)) groups.set(key, { all: [], day: [] });
    const g = groups.get(key);
    const d = Number(r.delay_min) || 0;
    g.all.push(d);
    if (Number(r.weekday) === weekday) g.day.push(d);
  }
  const out = {};
  for (const [key, g] of groups) {
    // Samma veckodag när det finns nog med mätningar, annars alla dagar runt samma klockslag.
    const useDay = g.day.length >= MIN_SAMPLES;
    const list = useDay ? g.day : g.all;
    if (list.length < MIN_SAMPLES) continue;
    const late = median(list);
    if (late !== null && late >= MIN_LATE) out[key] = { late, n: list.length, weekday: useDay };
  }
  return out;
}

/**
 * Perrongskiss för kort tåg (Vägen till 10, idé 13): "Kort tåg, dörr 2–13" blir ett intervall
 * längs perrongen. Pendeltågsperronger har plats för 24 dörrar (två hela tåg); längre tal används som de är.
 * @returns {{ from: number, to: number, total: number } | null}
 */
export function doorRange(text) {
  const m = /d[öo]rr(?:ar(?:na)?)?\s*(\d{1,2})\s*(?:-|–|—|till)\s*(\d{1,2})/i.exec(String(text || ''));
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (!(from >= 1 && to >= from)) return null;
  return { from, to, total: Math.max(24, to) };
}
