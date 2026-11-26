import type { Departure } from './types';

/** Längre fram än så här visas klockslag i stället för "N min". */
export const COUNTDOWN_MAX_MIN = 60;

/** 'YYYY-MM-DDTHH:MM' i lokal tid → millisekunder, eller null. */
export function parseLocal(value?: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

/** Kort linjebeteckning för märket: "17", "160", "41"; annars första ordet ("Tåg"). */
export function lineBadge(line: string): string {
  const trimmed = line.trim();
  const parts = trimmed.split(/\s+/);
  const last = parts[parts.length - 1] || '';
  if (/^[0-9A-ZÅÄÖ]{1,4}$/i.test(last) && parts.length > 1) return last;
  if (/^[0-9A-ZÅÄÖ]{1,4}$/i.test(trimmed)) return trimmed;
  return parts[0] || trimmed;
}

/** Linjens namn utan beteckningen, t.ex. "Gröna linjen", "Buss", "Arlanda Express". */
export function lineName(line: string, badge: string): string {
  const trimmed = line.trim();
  const name = trimmed.endsWith(` ${badge}`) ? trimmed.slice(0, -badge.length - 1) : trimmed;
  return name === badge ? '' : name;
}

/** Klockslaget avgången väntas gå: ny tid om försenad, annars ordinarie. */
export function clockFor(item: Departure): string {
  if (item.status === 'cancelled') return item.scheduledTime;
  return item.newTime || item.estimatedTime || item.scheduledTime;
}

/** "Nu", "7 min" eller klockslag om det är långt dit (eller tiden saknas). */
export function countdownFor(item: Departure, now: number): string {
  const clock = clockFor(item);
  if (item.status === 'cancelled') return item.scheduledTime;
  const expected = parseLocal(item.expectedAt);
  if (expected === null) return clock;
  const minutes = Math.floor((expected - now) / 60000);
  if (minutes >= COUNTDOWN_MAX_MIN) return clock;
  return minutes <= 0 ? 'Nu' : `${minutes} min`;
}

/**
 * Nyckel för "per linje": samma linje mot samma mål. Tåg har ett nummer per tur,
 * så de grupperas på tågslag i stället ("SJ Snabbtåg", "Pendeltåg 41" behåller sin linje).
 */
export function groupKey(item: Departure): string {
  const badge = lineBadge(item.line);
  const trainNumber = item.transportMode === 'train' && /^\d{3,5}$/.test(badge);
  const line = trainNumber ? lineName(item.line, badge) || 'Tåg' : item.line;
  return `${line}|${item.destination}`;
}

/**
 * Linjens egen färg, där färgen är en del av namnet (SL:s tunnelbana och pendeltåg).
 * Bara en tunn kant på brickan: färgen hjälper igenkänningen men bär ingen information ensam.
 */
export function lineColor(item: Pick<Departure, 'line' | 'transportMode'>): string | null {
  const line = item.line.toLowerCase();
  if (line.startsWith('gröna linjen')) return '#179d4d';
  if (line.startsWith('röda linjen')) return '#d71d24';
  if (line.startsWith('blå linjen')) return '#0089ca';
  if (line.startsWith('pendeltåg')) return '#ec619f';
  return null;
}
