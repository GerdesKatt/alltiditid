// Svensk tid oberoende av telefonens tidszon.
//
// Trafikdatan anger tider som 'YYYY-MM-DDTHH:MM' i svensk tid utan tidszon. De får
// aldrig tolkas i telefonens tidszon: en telefon på finsk tid visade annars alla
// avgångar som redan gångna, och en på brittisk tid räknade fel med en timme.

const ZONE = 'Europe/Stockholm';
const pad = (n) => String(n).padStart(2, '0');

let formatter = null;
function parts(ms) {
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  const out = {};
  for (const p of formatter.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { y: out.year, mo: out.month, d: out.day, h: out.hour % 24, mi: out.minute, s: out.second };
}

/** Hur många millisekunder svensk tid ligger före UTC vid tidpunkten (1 eller 2 timmar). */
function offsetAt(ms) {
  const p = parts(ms);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** 'YYYY-MM-DDTHH:MM' i svensk tid → millisekunder, eller null. */
export function parseStockholm(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ms = wall - offsetAt(wall);
  // Nära byte till och från sommartid kan första gissningen hamna en timme fel.
  const again = wall - offsetAt(ms);
  if (again !== ms) ms = again;
  return ms;
}

/** Tidpunkten som 'YYYY-MM-DDTHH:MM' i svensk tid. */
export function stockholmMinute(ms) {
  const p = parts(ms);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** Datumet 'YYYY-MM-DD' i svensk tid. */
export function stockholmDay(ms) {
  return stockholmMinute(ms).slice(0, 10);
}

/** Timmen (0–23) i svensk tid. */
export function stockholmHour(ms) {
  return parts(ms).h;
}

/** Klockslag 'HH:MM' i svensk tid. */
export function stockholmClock(ms) {
  return stockholmMinute(ms).slice(11, 16);
}
