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

/** Linjens färg som fylld bricka: bakgrund och textfärg som klarar 4,5:1 mot varandra. */
export type LineSwatch = { bg: string; fg: string };

const WHITE = '#ffffff';
const NIGHT = '#111111';

/*
 * SL:s tunnelbana och pendeltåg. Nyanserna är något mörkare än SL:s skyltfärger,
 * så att vit text på brickan klarar 4,5:1 (röd 5,9:1, grön 4,8:1, blå 5,1:1).
 * Pendeltågets rosa har svart text (7,5:1).
 */
const SL_RED: LineSwatch = { bg: '#c8102e', fg: WHITE };
const SL_GREEN: LineSwatch = { bg: '#00843d', fg: WHITE };
const SL_BLUE: LineSwatch = { bg: '#0072bc', fg: WHITE };
const SL_COMMUTER: LineSwatch = { bg: '#ec619f', fg: NIGHT };

/*
 * Göteborgs spårvagnar har en färg per linje på skyltar och kartor. Ungefärliga nyanser,
 * med svart eller vit text efter vad som ger bäst kontrast.
 */
const GBG_TRAM: Record<string, LineSwatch> = {
  '1': { bg: '#ffffff', fg: NIGHT },
  '2': { bg: '#ffe14d', fg: NIGHT },
  '3': { bg: '#0057a0', fg: WHITE },
  '4': { bg: '#00813f', fg: WHITE },
  '5': { bg: '#d0103a', fg: WHITE },
  '6': { bg: '#f58220', fg: NIGHT },
  '7': { bg: '#8a5a2b', fg: WHITE },
  '8': { bg: '#6f2c91', fg: WHITE },
  '9': { bg: '#7cc6ea', fg: NIGHT },
  '10': { bg: '#c4d82e', fg: NIGHT },
  '11': { bg: '#111111', fg: WHITE },
};

/**
 * Linjens egen färg, där färgen är en del av hur resenärer känner igen linjen:
 * SL:s tunnelbana (röd, grön, blå) och pendeltåg, och Göteborgs spårvagnar.
 * Färgen fyller brickan men bär aldrig information ensam; numret står alltid i den.
 */
export function lineSwatch(item: Pick<Departure, 'line' | 'transportMode'> & { operator?: string }): LineSwatch | null {
  const line = item.line.toLowerCase();
  if (line.startsWith('gröna linjen')) return SL_GREEN;
  if (line.startsWith('röda linjen')) return SL_RED;
  if (line.startsWith('blå linjen')) return SL_BLUE;
  if (line.startsWith('pendeltåg')) return SL_COMMUTER;
  const n = line.match(/\d+/)?.[0] || '';
  // Tunnelbanan utan linjenamn, bara nummer: 10–11 blå, 13–14 röd, 17–19 grön.
  if (item.transportMode === 'subway') {
    const num = Number(n);
    if (num === 10 || num === 11) return SL_BLUE;
    if (num === 13 || num === 14) return SL_RED;
    if (num >= 17 && num <= 19) return SL_GREEN;
  }
  // Blåbussarna i Stockholms innerstad (1–4 och 6). Bara när SL står som trafikbolag, eftersom andra städer har samma nummer.
  if (item.transportMode === 'bus' && /\bSL\b|storstockholms lokaltrafik/i.test(item.operator || '') && ['1', '2', '3', '4', '6'].includes(n) && /^(buss\s*)?\d+$/i.test(item.line.trim())) {
    return SL_BLUE;
  }
  // Spårvagn i Göteborg: bara när trafikbolaget är känt, eftersom Stockholm och Norrköping har samma nummer.
  if (item.transportMode === 'tram' && /västtrafik|göteborgs spårväg/i.test(item.operator || '')) {
    return GBG_TRAM[n] || null;
  }
  return null;
}

/** Linjens färg som en enda färg (för kanter och prickar), eller null. */
export function lineColor(item: Pick<Departure, 'line' | 'transportMode'> & { operator?: string }): string | null {
  return lineSwatch(item)?.bg || null;
}

/** Spårtrafik får fylld bricka, buss och båt kontur. */
export function isRailMode(mode?: string): boolean {
  return mode === 'train' || mode === 'commuter' || mode === 'subway' || mode === 'tram';
}
