// Flyg från Avinor (norska flygplatser, t.ex. Oslo Gardermoen). Öppen XML-tjänst utan
// nyckel, licens NLOD 2.0. Villkor: märk datan "Flydata fra Avinor" med länk till
// www.avinor.no, och hämta högst var 3:e minut och cacha hos oss
// (partner.avinor.no/en/services/flight-data/).
//
// XML-flödet läses med reguljära uttryck, eftersom Cloudflare Workers saknar DOMParser.
// Rena funktioner, testade i test/avinor.test.mjs.

import { utcToLocal } from './flights.mjs';

export const AVINOR_FLIGHTS = 'https://asrv.avinor.no/XmlFeed/v1.0';
export const AVINOR_AIRPORT_NAMES = 'https://asrv.avinor.no/airportNames/v1.0';
export const AVINOR_AIRLINE_NAMES = 'https://asrv.avinor.no/airlineNames/v1.0';

const DELAY_THRESHOLD_MIN = 5;

function decode(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** Texten i ett barnelement, t.ex. <gate>F4</gate>. Tar båda stavningarna av flight_id. */
function child(block, ...names) {
  for (const name of names) {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(block);
    if (m) return decode(m[1]);
  }
  return '';
}

function attr(tag, name) {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]) : '';
}

/** Namnlistor från airportNames och airlineNames: kod → namn. */
export function parseNames(xml, tag) {
  const out = {};
  const re = new RegExp(`<${tag}\\b[^>]*>`, 'g');
  for (const m of String(xml || '').matchAll(re)) {
    const code = attr(m[0], 'code');
    const name = attr(m[0], 'name');
    if (code && name) out[code.toUpperCase()] = name;
  }
  return out;
}

const localMs = (local) => Date.parse(`${local}:00Z`);

/**
 * Flygen i Avinors XML som alltiditids Flight-objekt (samma form som Swedavias),
 * sorterade på väntad tid och utan dem som gått för mer än `graceMin` minuter sedan.
 */
export function avinorBoard(xml, direction, nowLocal, names = {}, graceMin = 15) {
  const airports = names.airports || {};
  const airlines = names.airlines || {};
  const want = direction === 'arrivals' ? 'A' : 'D';
  const now = localMs(nowLocal);
  const list = [];
  const seen = new Set();
  for (const m of String(xml || '').matchAll(/<flight\b([^>]*)>([\s\S]*?)<\/flight>/g)) {
    const block = m[2];
    if (child(block, 'arr_dep').toUpperCase() !== want) continue;
    const flightId = child(block, 'flight_id', 'flightId').replace(/\s+/g, '');
    const scheduledAt = utcToLocal(child(block, 'schedule_time'));
    if (!flightId || !scheduledAt) continue;
    const id = `${flightId}|${scheduledAt}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const statusTag = (/<status\b[^>]*\/?>/.exec(block) || [''])[0];
    const code = attr(statusTag, 'code').toUpperCase();
    const statusAt = utcToLocal(attr(statusTag, 'time'));
    const cancelled = code === 'C';
    const done = code === 'D' || code === 'A';
    const expectedAt = (code === 'E' || done) && statusAt ? statusAt : scheduledAt;
    const delta = Math.round((localMs(expectedAt) - localMs(scheduledAt)) / 60000);
    const delayed = !cancelled && !done && delta >= DELAY_THRESHOLD_MIN;
    if (!Number.isNaN(now) && localMs(expectedAt) < now - graceMin * 60000) continue;

    const airlineIata = child(block, 'airline').toUpperCase();
    const placeIata = child(block, 'airport').toUpperCase();
    const viaIata = child(block, 'via_airport')
      .split(/[,\s]+/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const domInt = child(block, 'dom_int').toUpperCase();

    const f = {
      id,
      flightId,
      airline: airlines[airlineIata] || airlineIata,
      airlineIata,
      place: airports[placeIata] || placeIata,
      placeIata,
      via: viaIata.map((c) => airports[c] || c),
      viaIata,
      scheduledAt,
      scheduledTime: scheduledAt.slice(11, 16),
      expectedAt: cancelled ? scheduledAt : expectedAt,
      status: cancelled ? 'cancelled' : delayed ? 'delayed' : 'on-time',
      delayMinutes: delayed ? delta : 0,
      newTime: delayed ? expectedAt.slice(11, 16) : '',
      done,
      gate: direction === 'arrivals' ? '' : child(block, 'gate'),
      checkIn: direction === 'arrivals' ? '' : child(block, 'check_in'),
      domestic: domInt === 'D',
    };
    for (const k of Object.keys(f)) {
      const v = f[k];
      if (v === '' || v === false || (Array.isArray(v) && v.length === 0)) delete f[k];
    }
    if (f.delayMinutes === 0) delete f.delayMinutes;
    list.push(f);
  }
  list.sort((a, b) => a.expectedAt.localeCompare(b.expectedAt) || a.flightId.localeCompare(b.flightId));
  return list;
}
