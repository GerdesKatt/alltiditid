// Tidslinjen över hela resan i Min resa (Vägen till 10 del 2, idé 5). Strecket blir resans
// linje: en markering där varje åk börjar, en vid målet, och fyllning fram till nu.

/** 'YYYY-MM-DD' + 'HH:MM' → ms i telefonens tid. */
function atLocal(date, time) {
  const [y, m, d] = String(date || '').split('-').map(Number);
  const [h, min] = String(time || '').split(':').map(Number);
  if (!y || !Number.isFinite(h)) return NaN;
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0).getTime();
}

/**
 * @param {{depDate: string, legs: Array<{kind: string, from: {time: string, rtTime?: string}, to: {time: string, rtTime?: string}, mode?: string}>}} trip
 * @param {number} now
 * @returns {{ fill: number, marks: Array<{ at: number, kind: 'ride' | 'end', mode?: string }>, start: number, end: number } | null}
 */
export function journeyLine(trip, now) {
  const legs = Array.isArray(trip?.legs) ? trip.legs : [];
  if (!legs.length) return null;
  let day = trip.depDate;
  let last = -Infinity;
  // Tiderna i ordning; passerar resan midnatt läggs ett dygn på.
  const stamp = (p) => {
    const t = (p && (p.rtTime || p.time)) || '';
    let ms = atLocal(day, t);
    if (!Number.isFinite(ms)) return NaN;
    while (ms < last - 6 * 3600_000) ms += 24 * 3600_000;
    last = Math.max(last, ms);
    return ms;
  };
  const points = legs.map((l) => ({ kind: l.kind, mode: l.mode, from: stamp(l.from), to: stamp(l.to) }));
  const start = points[0].from;
  const end = points[points.length - 1].to;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const span = end - start;
  const pos = (ms) => Math.min(1, Math.max(0, (ms - start) / span));
  const marks = points
    .filter((p) => p.kind === 'ride' && Number.isFinite(p.from))
    .map((p) => ({ at: pos(p.from), kind: 'ride', mode: p.mode }));
  marks.push({ at: 1, kind: 'end' });
  return { fill: pos(now), marks, start, end };
}
