// Prognos över kötiderna i säkerhetskontrollen: "vad brukar det vara en måndag kl. 9".
//
// Underlaget är våra egna mätningar (tabellen queue_log, en rad per kö och hämtning),
// sammanställda per kö, datum och timme. För varje timme letar prognosen upp liknande
// dagar i tre steg och tar det första som har minst MIN_DAYS dagar med mätningar:
//   1. samma sorts dag och samma veckodag  (vanliga måndagar, måndagar under lov, …)
//   2. samma sorts dag och samma typ av veckodag (vardag eller helg)
//   3. samma veckodag oavsett sorts dag
// Det är ett snitt, inte en prognos för just den dagen; appen säger det.
//
// Avgångarna per timme är en andra signal som finns direkt: många avgångar (t.ex.
// charter en måndagsmorgon på lovet) betyder ofta kö, även innan vi har köhistorik.

import { dayClass, dayOfWeek, holidayName } from './dayType.mjs';

export const MIN_DAYS = 3;
/** Timmar som visas: säkerhetskontrollerna är i stort sett stängda på natten. */
export const FIRST_HOUR = 4;
export const LAST_HOUR = 22;

/** Kvantil (0–1) av en sorterad lista. */
function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const group = (dow) => (dow === 0 || dow === 6 ? 'helg' : 'vardag');

/**
 * Typiska kötider per kö och timme för ett datum.
 *
 * `rows`: [{ queue, fast_track, day: 'YYYY-MM-DD', hour, minutes }] där minutes är
 * snittet av mätningarna den timmen. Datumet självt och senare dagar räknas inte.
 */
export function typicalDay(rows, date, minDays = MIN_DAYS) {
  const cls = dayClass(date);
  const dow = dayOfWeek(date);
  const tiers = [
    { basis: 'same', match: (d) => dayClass(d) === cls && dayOfWeek(d) === dow },
    { basis: 'group', match: (d) => dayClass(d) === cls && group(dayOfWeek(d)) === group(dow) },
    { basis: 'dow', match: (d) => dayOfWeek(d) === dow },
  ];

  // kö → timme → lista med { day, minutes }
  const byQueue = new Map();
  for (const r of rows) {
    if (!r || !r.day || r.day >= date) continue;
    const hour = Number(r.hour);
    const minutes = Number(r.minutes);
    if (!Number.isFinite(hour) || !Number.isFinite(minutes)) continue;
    const key = `${r.queue}|${r.fast_track ? 1 : 0}`;
    if (!byQueue.has(key)) byQueue.set(key, { name: String(r.queue), fastTrack: Boolean(r.fast_track), hours: new Map() });
    const hours = byQueue.get(key).hours;
    if (!hours.has(hour)) hours.set(hour, []);
    hours.get(hour).push({ day: r.day, minutes });
  }

  const classOf = new Map();
  const cachedMatch = (tier, day) => {
    const k = `${tier.basis}|${day}`;
    if (!classOf.has(k)) classOf.set(k, tier.match(day));
    return classOf.get(k);
  };

  const queues = [];
  for (const q of byQueue.values()) {
    const hours = [];
    for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour += 1) {
      const samples = q.hours.get(hour) || [];
      let cell = { hour, typical: null, low: null, high: null, days: 0, basis: null };
      for (const tier of tiers) {
        const values = samples.filter((s) => cachedMatch(tier, s.day)).map((s) => s.minutes).sort((a, b) => a - b);
        if (values.length >= minDays) {
          cell = {
            hour,
            typical: Math.round(quantile(values, 0.5)),
            low: Math.round(quantile(values, 0.25)),
            high: Math.round(quantile(values, 0.75)),
            days: values.length,
            basis: tier.basis,
          };
          break;
        }
      }
      hours.push(cell);
    }
    queues.push({ name: q.name, fastTrack: q.fastTrack, hours });
  }
  queues.sort((a, b) => a.name.localeCompare(b.name, 'sv') || Number(a.fastTrack) - Number(b.fastTrack));
  return { date, dayClass: cls, dayOfWeek: dow, holiday: holidayName(date), queues };
}

/**
 * Avgångar per timme för datumet, och vad som är vanligt samma veckodag.
 *
 * `rows`: [{ day, hour, n }]. "Vanligt" är medianen för samma veckodag och timme
 * de senaste veckorna (minst två dagar), annars null.
 */
export function departuresByHour(rows, date) {
  const dow = dayOfWeek(date);
  const target = new Map();
  const past = new Map();
  for (const r of rows) {
    if (!r || !r.day) continue;
    const hour = Number(r.hour);
    const n = Number(r.n);
    if (!Number.isFinite(hour) || !Number.isFinite(n)) continue;
    if (r.day === date) target.set(hour, n);
    else if (r.day < date && dayOfWeek(r.day) === dow) {
      if (!past.has(hour)) past.set(hour, []);
      past.get(hour).push(n);
    }
  }
  if (target.size === 0) return [];
  const out = [];
  for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour += 1) {
    const list = (past.get(hour) || []).sort((a, b) => a - b);
    const n = target.get(hour) || 0;
    const usual = list.length >= 2 ? Math.round(quantile(list, 0.5)) : null;
    out.push({ hour, n, usual, busy: usual !== null && n >= usual * 1.25 && n - usual >= 3 });
  }
  return out;
}

/** Avgångar per timme (svensk tid) för ett datum, från normaliserade flyg. */
export function countDepartures(flights, date) {
  const counts = new Map();
  for (const f of flights) {
    const at = String((f && f.scheduledAt) || '');
    if (at.slice(0, 10) !== date) continue;
    const hour = Number(at.slice(11, 13));
    if (!Number.isFinite(hour)) continue;
    counts.set(hour, (counts.get(hour) || 0) + 1);
  }
  return [...counts.entries()].map(([hour, n]) => ({ hour, n })).sort((a, b) => a.hour - b.hour);
}
