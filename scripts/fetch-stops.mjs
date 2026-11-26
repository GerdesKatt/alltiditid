// Hämtar Sveriges hållplatser från Trafiklab och skriver data/stops.json, som
// hållplatssidorna (/gullmarsplan) och sitemapen byggs från. Körs före `next build`.
//
// Nyckeln (TRAFIKLAB_REALTIME_API_KEY) finns bara i Cloudflare. Saknas den, eller
// svarar inte Trafiklab, används data/stops.fallback.json så att bygget alltid går.
//
// Användning: node scripts/fetch-stops.mjs [antal]   (standard 500)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildStopList } from '../lib/stopList.mjs';

const OUT = new URL('../data/stops.json', import.meta.url);
const FALLBACK = new URL('../data/stops.fallback.json', import.meta.url);
// Samma lista för appen i webbläsaren (stationsbladet och adresser som /slussen-t-bana).
const PUBLIC_OUT = new URL('../public/stops.json', import.meta.url);
const LIMIT = Number(process.argv[2]) || 500;
const key = process.env.TRAFIKLAB_REALTIME_API_KEY;

async function fromTrafiklab() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`https://realtime-api.trafiklab.se/v1/stops/list?key=${encodeURIComponent(key)}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    return buildStopList(Array.isArray(data.stop_groups) ? data.stop_groups : [], LIMIT);
  } finally {
    clearTimeout(timer);
  }
}

let stops = null;
if (key) {
  try {
    stops = await fromTrafiklab();
    console.log(`fetch-stops: ${stops.length} hållplatser från Trafiklab`);
  } catch (err) {
    console.warn(`fetch-stops: Trafiklab svarade inte (${err.message}), använder reservlistan`);
  }
} else {
  console.warn('fetch-stops: ingen TRAFIKLAB_REALTIME_API_KEY, använder reservlistan');
}

if (!stops || stops.length === 0) {
  stops = JSON.parse(await readFile(FALLBACK, 'utf8'));
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, `${JSON.stringify(stops)}\n`);
await writeFile(PUBLIC_OUT, `${JSON.stringify(stops)}\n`);
