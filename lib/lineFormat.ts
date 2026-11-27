import type { Departure } from './types';
import { parseStockholm } from './sweTime.mjs';

/** Längre fram än så här visas klockslag i stället för "N min". */
export const COUNTDOWN_MAX_MIN = 60;

/** 'YYYY-MM-DDTHH:MM' i svensk tid → millisekunder, eller null. Oberoende av telefonens tidszon. */
export function parseLocal(value?: string): number | null {
  return parseStockholm(value);
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

/**
 * Vissa trafikbolag lägger produktnamnet först i destinationen ("SkåneExpressen Sjöbo").
 * Delar upp det, så att målet står som mål och produkten bredvid linjen.
 */
const PRODUCT_PREFIXES = ['SkåneExpressen'];
export function splitProduct(destination: string): { product: string; place: string } {
  const d = String(destination || '').trim();
  for (const p of PRODUCT_PREFIXES) {
    if (d.startsWith(`${p} `) && d.length > p.length + 1) return { product: p, place: d.slice(p.length + 1).trim() };
  }
  return { product: '', place: d };
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
 * Det enda undantaget från svart och benvitt: en kant på brickan som hjälper igenkänningen
 * men inte bär information ensam.
 */
export function lineColor(item: Pick<Departure, 'line' | 'transportMode'>): string | null {
  const line = item.line.toLowerCase();
  if (line.startsWith('gröna linjen')) return '#179d4d';
  if (line.startsWith('röda linjen')) return '#d71d24';
  if (line.startsWith('blå linjen')) return '#0089ca';
  if (line.startsWith('pendeltåg')) return '#ec619f';
  // Tunnelbanan utan linjenamn, bara nummer: 10–11 blå, 13–14 röd, 17–19 grön.
  if (item.transportMode === 'subway') {
    const n = Number(line.match(/\d+/)?.[0]);
    if (n === 10 || n === 11) return '#0089ca';
    if (n === 13 || n === 14) return '#d71d24';
    if (n >= 17 && n <= 19) return '#179d4d';
  }
  return null;
}
