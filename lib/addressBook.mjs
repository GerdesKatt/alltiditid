// Sveriges adresser från Lantmäteriet (belägenhetsadresser, öppna data), uppdelade i små
// filer per gatunamn under public/adresser/. Kartan (OpenStreetMap) saknar ofta husnummer,
// t.ex. Blåklintsvägen 4A i Älvsjö, men Lantmäteriet har alla. Filerna byggs av
// scripts/build-addresses.mjs och läses av servern (functions/api/trafik.js).
//
// En fil (adresser/<nyckel>.json) ser ut så här:
//   { "o": ["Älvsjö", "Skogås"],                      orterna (postort) i filen
//     "s": { "blaklintsvagen": ["Blåklintsvägen",      gatan utan prickar → namnet
//            [["4A", 0, 5927731, 1797951], ...]] } }  [nummer, ort, lat·1e5, lon·1e5]
//
// Rena funktioner, så att de går att testa utan filerna.

import { foldPlace } from './transferMatch.mjs';

/** Gatan utan prickar och mellanslag: "Blåklintsvägen" → "blaklintsvagen". */
export const streetKey = (street) => foldPlace(street).replace(/ /g, '');

/** Vilken fil en gata ligger i: de tre första tecknen ("bla"). */
export function shardKey(street) {
  const k = streetKey(street);
  return k.length >= 3 ? k.slice(0, 3) : '';
}

/** "4 A", "4a" → "4A". Tomt om det inte är ett husnummer. */
export function houseNumber(text) {
  const m = /^\s*(\d{1,4})\s*([a-zA-ZåäöÅÄÖ]?)\s*$/.exec(String(text ?? ''));
  return m ? `${Number(m[1])}${m[2].toUpperCase()}` : '';
}

/**
 * Bygger filerna av adresser. Varje adress: { street, number, town, lat, lon }.
 * @returns {Map<string, { o: string[], s: Record<string, [string, [string, number, number, number][]]> }>}
 */
export function buildShards(records) {
  const shards = new Map();
  for (const r of records) {
    const key = shardKey(r.street);
    const number = houseNumber(r.number);
    if (!key || !number || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    let shard = shards.get(key);
    if (!shard) {
      shard = { o: [], s: {} };
      shards.set(key, shard);
    }
    const town = String(r.town || '').trim();
    let ti = shard.o.indexOf(town);
    if (ti < 0) ti = shard.o.push(town) - 1;
    const sk = streetKey(r.street);
    if (!shard.s[sk]) shard.s[sk] = [String(r.street).trim(), []];
    shard.s[sk][1].push([number, ti, Math.round(r.lat * 1e5), Math.round(r.lon * 1e5)]);
  }
  return shards;
}

/**
 * Adresserna i en fil som passar gata och nummer, som kandidater till rankPlaces.
 * Exakt gata (utan prickar), eller en bokstav fel om gatan är lång (felstavning).
 * Samma nummer: "4A" och "4" är olika hus, så bara exakt nummer räknas.
 * @returns {{ kind: 'address', name: string, detail: string, lat: number, lon: number, source: 'lm' }[]}
 */
export function findInShard(shard, street, number) {
  if (!shard || !shard.s) return [];
  const want = streetKey(street);
  const num = houseNumber(number);
  if (!want || !num) return [];
  const keys = shard.s[want] ? [want] : Object.keys(shard.s).filter((k) => k.length >= 8 && near(k, want));
  const out = [];
  for (const k of keys) {
    const [name, list] = shard.s[k];
    for (const [n, ti, lat, lon] of list) {
      if (n !== num) continue;
      out.push({ kind: 'address', name: `${name} ${n}`, detail: shard.o[ti] || '', lat: lat / 1e5, lon: lon / 1e5, source: 'lm' });
    }
  }
  return out;
}

/** Högst en bokstav fel, saknad eller extra. */
function near(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * SWEREF 99 TM (EPSG:3006, Lantmäteriets standard) till WGS84 lat/lon.
 * Gauss–Krüger enligt Lantmäteriets formler; fel under en meter.
 */
export function sweref99tmToWgs84(northing, easting) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const lon0 = 15.0;
  const k0 = 0.9996;
  const fn = 0.0;
  const fe = 500000.0;
  const e2 = f * (2 - f);
  const n = f / (2 - f);
  const aRoof = (a / (1 + n)) * (1 + (n * n) / 4 + (n ** 4) / 64);
  const d1 = n / 2 - (2 * n * n) / 3 + (37 * n ** 3) / 96 - (n ** 4) / 360;
  const d2 = (n * n) / 48 + (n ** 3) / 15 - (437 * n ** 4) / 1440;
  const d3 = (17 * n ** 3) / 480 - (37 * n ** 4) / 840;
  const d4 = (4397 * n ** 4) / 161280;
  const as = e2 + e2 ** 2 + e2 ** 3 + e2 ** 4;
  const bs = -(7 * e2 ** 2 + 17 * e2 ** 3 + 30 * e2 ** 4) / 6;
  const cs = (224 * e2 ** 3 + 889 * e2 ** 4) / 120;
  const ds = -(4279 * e2 ** 4) / 1260;
  const xi = (northing - fn) / (k0 * aRoof);
  const eta = (easting - fe) / (k0 * aRoof);
  const xiP =
    xi - d1 * Math.sin(2 * xi) * Math.cosh(2 * eta) - d2 * Math.sin(4 * xi) * Math.cosh(4 * eta) - d3 * Math.sin(6 * xi) * Math.cosh(6 * eta) - d4 * Math.sin(8 * xi) * Math.cosh(8 * eta);
  const etaP =
    eta - d1 * Math.cos(2 * xi) * Math.sinh(2 * eta) - d2 * Math.cos(4 * xi) * Math.sinh(4 * eta) - d3 * Math.cos(6 * xi) * Math.sinh(6 * eta) - d4 * Math.cos(8 * xi) * Math.sinh(8 * eta);
  const phiStar = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
  const dLambda = Math.atan(Math.sinh(etaP) / Math.cos(xiP));
  const s = Math.sin(phiStar);
  const lat = phiStar + s * Math.cos(phiStar) * (as + bs * s * s + cs * s ** 4 + ds * s ** 6);
  return { lat: (lat * 180) / Math.PI, lon: lon0 + (dLambda * 180) / Math.PI };
}
