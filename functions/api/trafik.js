import { historyRows, saveHistory } from '../../lib/history.mjs';
import { airportByIata, datesToFetch, flightBoard, waitTimes } from '../../lib/flights.mjs';
import { missingTrains, trainJourney } from '../../lib/trains.mjs';
import { applyGps, tripJourney, uniqueAlerts } from '../../lib/trips.mjs';
import { locateOnRoute, vehiclePositions } from '../../lib/gtfsrt.mjs';
import { FERRY_PREFIX, ferryBoard, ferryHarbors, searchFerryHarbors } from '../../lib/ferries.mjs';
import { stopsAfter } from '../../lib/transferMatch.mjs';
import { pickSearchHits } from '../../lib/searchHits.mjs';
import { destinationCandidates, mapTrips, pickDestination } from '../../lib/plan.mjs';
import { SURE, geoapifyPlaces, photonPlaces, rankPlaces } from '../../lib/places.mjs';
import { trafficForCounty } from '../../lib/countyTraffic.mjs';
import { foldPlace } from '../../lib/transferMatch.mjs';
import { allowedLicense, nearestStation, systemsNear } from '../../lib/mobility.mjs';
import { funFact, pickTrivia, wikiArticleUrl, wikiQueryUrl } from '../../lib/trivia.mjs';
import { evaluateHealth, isFailure, sourceOf } from '../../lib/health.mjs';

function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function getDelayMinutes(scheduledTime, estimatedTime, scheduledDate, rtDate) {
  const schedMin = parseTimeToMinutes(scheduledTime);
  const estMin = parseTimeToMinutes(estimatedTime);
  if (schedMin === null || estMin === null) return null;

  let diff = estMin - schedMin;
  if (scheduledDate && rtDate && scheduledDate !== rtDate) {
    if (rtDate > scheduledDate) {
      diff += 24 * 60;
    } else if (rtDate < scheduledDate) {
      diff -= 24 * 60;
    }
  } else if (diff < -12 * 60) {
    diff += 24 * 60;
  } else if (diff > 12 * 60) {
    diff -= 24 * 60;
  }

  return diff;
}

function extractClockTime(isoOrDateTimeStr) {
  if (!isoOrDateTimeStr || typeof isoOrDateTimeStr !== 'string') return '';
  const match = isoOrDateTimeStr.match(/T(\d{2}:\d{2})/);
  if (match && match[1]) return match[1];
  const hhmm = isoOrDateTimeStr.match(/(\d{2}:\d{2})/);
  return hhmm ? hhmm[1] : '';
}

function cleanPlaceName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  return rawName
    .replace(/\s*\([^)]*\bkn\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeStationKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(centralstation|central|station|c)\b/gi, '')
    .replace(/[^a-zåäö0-9]/gi, '')
    .trim();
}

function classifyTransportMode(catCode, catOut) {
  const code = String(catCode || '').trim();
  const label = String(catOut || '').toLowerCase();

  if (code === '5' || label.includes('tunnelbana') || label.includes('metro')) {
    return 'subway';
  }

  if (
    code === '6' ||
    label.includes('spårvagn') ||
    label.includes('sparvag') ||
    label.includes('tram') ||
    label.includes('lokalbana')
  ) {
    return 'tram';
  }

  if (
    code === '4' ||
    label.includes('pendel') ||
    label.includes('pågatåg') ||
    label.includes('länstrafik - tåg')
  ) {
    return 'commuter';
  }

  if (
    ['1', '2'].includes(code) ||
    label.includes('tåg') ||
    label.includes('tag') ||
    label.includes('train') ||
    label.includes('snabbtåg') ||
    label.includes('regional')
  ) {
    return 'train';
  }

  if (['3', '7'].includes(code) || label.includes('buss') || label.includes('bus')) {
    return 'bus';
  }

  if (code === '8' || label.includes('färja') || label.includes('båt') || label.includes('ferry')) {
    return 'ferry';
  }

  return 'other';
}

// ---------------------------------------------------------------------------
// Gemensamt
// ---------------------------------------------------------------------------

const TRAFIKVERKET_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';
const REALTIME_BASE = 'https://realtime-api.trafiklab.se/v1';
const RESROBOT_BASE = 'https://api.resrobot.se/v2.1';

/** Hur länge en avgångstavla cachas i Cloudflare (sekunder). Trafiklab cachar själva i 60 s. */
const BOARD_CACHE_SECONDS = 20;
/** Hur länge Trafikverkets stationslista cachas (sekunder). */
const STATION_LIST_CACHE_SECONDS = 24 * 60 * 60;

// Inget Access-Control-Allow-Origin: API:t är bara till för alltiditid.se själv. Andra
// webbplatser ska inte kunna bygga på det och förbruka kvoterna hos Trafiklab och Swedavia.
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
};

/** Hur länge ett svar på hållplatssök sparas i Cloudflare (sekunder). Hållplatser byter sällan namn. */
const SEARCH_CACHE_SECONDS = 60 * 60;

const BOARD_MODES = new Set(['all', 'subway', 'commuter', 'tram', 'bus', 'train', 'ferry']);

/**
 * Tavlans adress med bara de parametrar som påverkar svaret, i fast ordning. Används både
 * som cachenyckel och för hämtningen, så att extra eller omkastade parametrar inte ger
 * nya anrop till Trafiklab.
 */
export function boardRequestUrl(url) {
  const p = url.searchParams;
  const out = new URL('https://alltiditid.se/api/trafik');
  out.searchParams.set('action', 'departures');
  out.searchParams.set('stopId', (p.get('stopId') || '740000001').trim());
  out.searchParams.set('stopName', (p.get('stopName') || '').trim().slice(0, 80));
  const mode = p.get('mode') || 'all';
  out.searchParams.set('mode', BOARD_MODES.has(mode) ? mode : 'all');
  out.searchParams.set('direction', p.get('direction') === 'arrivals' ? 'arrivals' : 'departures');
  const time = p.get('time') || '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)) out.searchParams.set('time', time);
  return out;
}

/** Cachenyckel för hållplatssök: samma sökord oavsett stora och små bokstäver eller mellanslag. */
export function searchCacheKey(url) {
  const q = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 80);
  return new Request(`https://cache.alltiditid.se/search-v1/${encodeURIComponent(q)}`);
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function getCache() {
  // caches.default finns i Cloudflare men inte i alla testmiljöer.
  return typeof caches !== 'undefined' && caches.default ? caches.default : null;
}

async function cacheGet(key) {
  const cache = getCache();
  if (!cache) return null;
  try {
    return await cache.match(key);
  } catch {
    return null;
  }
}

async function cachePut(key, response, context) {
  const cache = getCache();
  if (!cache) return;
  const put = cache.put(key, response).catch(() => {});
  if (context && typeof context.waitUntil === 'function') {
    context.waitUntil(put);
  } else {
    await put;
  }
}


/** Klocktid (HH:MM) i svensk tid för en tidpunkt med tidszon, t.ex. från Trafikverket. */
function swedishClock(isoWithZone) {
  if (!isoWithZone) return '';
  const ms = Date.parse(isoWithZone);
  if (Number.isNaN(ms)) return extractClockTime(isoWithZone);
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return extractClockTime(isoWithZone);
  }
}

/** Datum och klocktid (YYYY-MM-DDTHH:MM) i svensk tid för en tidpunkt med tidszon. */
function swedishDateTime(isoWithZone) {
  const ms = Date.parse(isoWithZone);
  if (Number.isNaN(ms)) return String(isoWithZone || '').slice(0, 16);
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Stockholm',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .formatToParts(new Date(ms))
        .map((p) => [p.type, p.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch {
    return String(isoWithZone || '').slice(0, 16);
  }
}

/** Lägger till minuter på en lokal tid 'YYYY-MM-DDTHH:MM' (utan tidszon) och returnerar samma format. */
function addMinutesLocal(local, minutes) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + (minutes || 0) * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Minuter mellan två lokala tider 'YYYY-MM-DDTHH:MM', räknat på hela minuter (sekunder
 * kapas på båda sidor). Då stämmer "+6" alltid med klockslagen 18:32 → 18:38.
 */
function minutesBetweenLocal(fromLocal, toLocal) {
  const a = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(fromLocal || ''));
  const b = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(toLocal || ''));
  if (!a || !b) return null;
  const ms = (m) => Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Math.round((ms(b) - ms(a)) / 60000);
}

/** "Spår 4" för spårtrafik, "Läge J" för buss, spårvagn och båt – som på skyltarna. */
function trackLabelFor(value, mode) {
  const v = String(value || '').trim();
  if (!v) return '';
  const rail = mode === 'train' || mode === 'commuter' || mode === 'subway';
  return `${rail ? 'Spår' : 'Läge'} ${v}`;
}

// ---------------------------------------------------------------------------
// Trafikverket (tåg): spår, förseningar, inställda och avvikelser
// ---------------------------------------------------------------------------

/** Hämtar alla annonserade stationer (namn + signatur), cachat ett dygn. */
async function fetchTrafikverketStations(trafikverketKey, context) {
  const cacheKey = new Request('https://cache.alltiditid.se/trafikverket/stations-v2');
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return await cached.json();
    } catch {
      // Läs om nedan
    }
  }

  const xmlBody = `<REQUEST>
  <LOGIN authenticationkey="${trafikverketKey}" />
  <QUERY objecttype="TrainStation" schemaversion="1.0">
    <FILTER>
      <EQ name="Advertised" value="true" />
    </FILTER>
    <INCLUDE>LocationSignature</INCLUDE>
    <INCLUDE>AdvertisedLocationName</INCLUDE>
    <INCLUDE>AdvertisedShortLocationName</INCLUDE>
  </QUERY>
</REQUEST>`;

  try {
    const res = await upstreamFetch(TRAFIKVERKET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xmlBody,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const stations = (data?.RESPONSE?.RESULT?.[0]?.TrainStation || [])
      .filter((st) => st && st.LocationSignature)
      .map((st) => ({
        signature: String(st.LocationSignature).trim(),
        name: String(st.AdvertisedLocationName || ''),
        shortName: String(st.AdvertisedShortLocationName || ''),
      }));

    if (stations.length > 0) {
      await cachePut(
        cacheKey,
        new Response(JSON.stringify(stations), {
          headers: { 'Cache-Control': `max-age=${STATION_LIST_CACHE_SECONDS}` },
        }),
        context
      );
    }
    return stations;
  } catch {
    return [];
  }
}

/**
 * Hittar Trafikverkets stationssignatur för ett stationsnamn.
 * Exakt namnmatchning först; delmatchning bara om den är entydig.
 * Hittas ingen signatur returneras '' och Trafikverket-data används inte alls
 * (tidigare blandades då tider från andra stationer längs sträckan in).
 */
/**
 * Nycklar att jämföra ett hållplatsnamn med Trafikverkets stationsnamn.
 * Trafiklab skriver t.ex. "Arlanda Södra/ Arlanda Express" medan Trafikverket
 * förkortar väderstrecket ("Arlanda S"), så båda formerna provas.
 */
function stationKeyVariants(name) {
  const key = normalizeStationKey(String(name || '').split('/')[0]);
  if (!key) return [];
  const variants = [key];
  const m = /^(.+?)(södra|norra|östra|västra)$/.exec(key);
  if (m) variants.push(m[1] + { södra: 's', norra: 'n', östra: 'ö', västra: 'v' }[m[2]]);
  return variants;
}

function findLocationSignature(stations, stopName) {
  const variants = stationKeyVariants(stopName);
  if (variants.length === 0) return '';
  const targetKey = variants[0];

  for (const key of variants) {
    const exact = stations.filter(
      (st) =>
        normalizeStationKey(st.name) === key ||
        (st.shortName && normalizeStationKey(st.shortName) === key)
    );
    if (exact.length >= 1) return exact[0].signature;
  }

  const partial = stations.filter((st) => {
    const key = normalizeStationKey(st.name);
    return key && (key.startsWith(targetKey) || targetKey.startsWith(key));
  });
  return partial.length === 1 ? partial[0].signature : '';
}

/**
 * Hämtar Trafikverkets annonseringar för givna tågnummer vid en station.
 * Nyckel i kartan: `${tågnummer}|${annonserad tid som YYYY-MM-DDTHH:MM}` så att
 * samma tågnummer vid olika tider eller dagar aldrig blandas ihop.
 */
async function fetchTrafikverketStationUpdates(
  trafikverketKey,
  stopName,
  trainNumbers,
  activityType,
  context
) {
  const updatesMap = new Map();
  if (!trafikverketKey || !Array.isArray(trainNumbers) || trainNumbers.length === 0) {
    return updatesMap;
  }

  const uniqueTrains = Array.from(
    new Set(
      trainNumbers
        .map((n) => String(n || '').trim().replace(/[^a-zA-Z0-9_-]/g, ''))
        .filter(Boolean)
    )
  ).slice(0, 50);
  if (uniqueTrains.length === 0) return updatesMap;

  const stations = await fetchTrafikverketStations(trafikverketKey, context);
  const locationSignature = findLocationSignature(stations, stopName);
  if (!locationSignature) return updatesMap;

  const now = Date.now();
  const fromIso = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const toIso = new Date(now + 6 * 60 * 60 * 1000).toISOString();
  const tvActivity = activityType === 'arrivals' ? 'Ankomst' : 'Avgang';
  const trainCriteria = uniqueTrains
    .map((num) => `<EQ name="AdvertisedTrainIdent" value="${num}" />`)
    .join('');

  const xmlBody = `<REQUEST>
  <LOGIN authenticationkey="${trafikverketKey}" />
  <QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="400">
    <FILTER>
      <AND>
        <EQ name="ActivityType" value="${tvActivity}" />
        <EQ name="LocationSignature" value="${locationSignature}" />
        <GTE name="AdvertisedTimeAtLocation" value="${fromIso}" />
        <LTE name="AdvertisedTimeAtLocation" value="${toIso}" />
        <OR>${trainCriteria}</OR>
      </AND>
    </FILTER>
    <INCLUDE>AdvertisedTrainIdent</INCLUDE>
    <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
    <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
    <INCLUDE>TimeAtLocation</INCLUDE>
    <INCLUDE>Canceled</INCLUDE>
    <INCLUDE>TrackAtLocation</INCLUDE>
    <INCLUDE>Deviation</INCLUDE>
  </QUERY>
</REQUEST>`;

  try {
    const tvRes = await upstreamFetch(TRAFIKVERKET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xmlBody,
    });
    if (!tvRes.ok) return updatesMap;

    const tvData = await tvRes.json();
    const announcements = tvData?.RESPONSE?.RESULT?.[0]?.TrainAnnouncement || [];

    for (const ann of announcements) {
      const ident = String(ann.AdvertisedTrainIdent || '').trim();
      const advIso = ann.AdvertisedTimeAtLocation;
      const advLocal = swedishDateTime(advIso);
      if (!ident || !advLocal) continue;

      const estIso = ann.EstimatedTimeAtLocation || ann.TimeAtLocation || '';
      const diff = estIso ? minutesBetweenLocal(advLocal, swedishDateTime(estIso)) : null;

      const deviationText = (Array.isArray(ann.Deviation) ? ann.Deviation : [ann.Deviation])
        .map((d) => (d && typeof d === 'object' ? d.Description : d))
        .map((d) => String(d || '').trim())
        .filter(Boolean)
        .join(', ');

      updatesMap.set(`${ident}|${advLocal}`, {
        // Trafikverket följer alla tåg i realtid. EstimatedTimeAtLocation finns bara
        // när tåget avviker, så en matchad annonsering utan prognos betyder "i tid".
        hasRealtime: true,
        newTime: diff !== null && diff > 0 ? swedishClock(estIso) : '',
        delayMinutes: diff !== null && diff > 0 ? diff : 0,
        // Signerad avvikelse i minuter: negativ när tåget går eller kommer tidigt.
        offsetMinutes: diff !== null ? diff : 0,
        cancelled: Boolean(ann.Canceled),
        track: ann.TrackAtLocation ? String(ann.TrackAtLocation).trim() : '',
        deviation: deviationText,
      });
    }
  } catch {
    // Fortsätt utan Trafikverket-data om de inte svarar
  }

  return updatesMap;
}

/** Namnet på en station från dess signatur (Cst → Stockholm Central). */
function stationNamer(stations) {
  const map = new Map((stations || []).map((st) => [st.signature, st.name]));
  return (sig) => map.get(sig) || '';
}

const TV_INCLUDE = [
  'AdvertisedTrainIdent',
  'AdvertisedTimeAtLocation',
  'EstimatedTimeAtLocation',
  'TimeAtLocation',
  'Canceled',
  'TrackAtLocation',
  'Deviation',
  'ToLocation',
  'FromLocation',
  'ProductInformation',
  'InformationOwner',
  'Advertised',
  'ActivityType',
  'LocationSignature',
]
  .map((f) => `<INCLUDE>${f}</INCLUDE>`)
  .join('');

async function trafikverketQuery(key, filter, limit = 400) {
  const xmlBody = `<REQUEST>
  <LOGIN authenticationkey="${key}" />
  <QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="${limit}" orderby="AdvertisedTimeAtLocation">
    <FILTER>${filter}</FILTER>
    ${TV_INCLUDE}
  </QUERY>
</REQUEST>`;
  const res = await upstreamFetch(TRAFIKVERKET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: xmlBody,
  });
  if (!res.ok) throw new Error(`Trafikverket ${res.status}`);
  const data = await res.json();
  return data?.RESPONSE?.RESULT?.[0]?.TrainAnnouncement || [];
}

/**
 * Tåg vid en station som Trafiklab saknar: de som står kvar efter sin tid och de som
 * går mer än en timme fram. Ett anrop till Trafikverket per station.
 */
async function trafikverketMissing(key, stopName, direction, known, context) {
  if (!key || !stopName) return [];
  try {
    const stations = await fetchTrafikverketStations(key, context);
    const sig = findLocationSignature(stations, stopName);
    if (!sig) return [];
    const now = Date.now();
    const filter = `<AND>
        <EQ name="ActivityType" value="${direction === 'arrivals' ? 'Ankomst' : 'Avgang'}" />
        <EQ name="LocationSignature" value="${sig}" />
        <EQ name="Advertised" value="true" />
        <GTE name="AdvertisedTimeAtLocation" value="${new Date(now - 90 * 60000).toISOString()}" />
        <LTE name="AdvertisedTimeAtLocation" value="${new Date(now + 180 * 60000).toISOString()}" />
      </AND>`;
    const announcements = await trafikverketQuery(key, filter, 300);
    return missingTrains({
      announcements,
      known,
      direction,
      nowLocal: swedishDateTime(new Date(now).toISOString()),
      nameOf: stationNamer(stations),
      tvStation: stopName,
    });
  } catch {
    return [];
  }
}

/** action=train&number=532: tågets hela resa i dag (eller i går, om det går över midnatt). */
async function handleTrain(url, keys, context) {
  const number = String(url.searchParams.get('number') || '').trim();
  if (!/^\d{1,6}$/.test(number)) return jsonResponse({ error: 'Ange ett tågnummer.' }, 400);
  if (!keys.trafikverket) return jsonResponse({ error: 'Tåginformation saknas just nu.' }, 503);
  const stations = await fetchTrafikverketStations(keys.trafikverket, context);
  const nameOf = stationNamer(stations);
  const nowIso = new Date().toISOString();
  const today = swedishDateTime(nowIso).slice(0, 10);
  const dates = [today];
  const y = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  dates.push(swedishDateTime(y).slice(0, 10));
  for (const date of dates) {
    const filter = `<AND>
        <EQ name="AdvertisedTrainIdent" value="${number}" />
        <EQ name="ScheduledDepartureDateTime" value="${date}" />
      </AND>`;
    let anns = [];
    try {
      anns = await trafikverketQuery(keys.trafikverket, filter, 500);
    } catch {
      return jsonResponse({ error: 'Kunde inte hämta tåget från Trafikverket just nu.' }, 502);
    }
    const journey = trainJourney(anns, nameOf, swedishDateTime(nowIso));
    if (journey.stops.length === 0) continue;
    // Gårdagens tåg bara om det fortfarande är på väg.
    if (date !== today && journey.stops.every((st) => st.passed)) continue;
    return jsonResponse(
      { number, date, ...journey, updatedAt: nowIso },
      200,
      { 'Cache-Control': 'public, max-age=30' }
    );
  }
  return jsonResponse({ error: `Hittade inget tåg ${number} i dag.` }, 404);
}

/**
 * Operatörens kortnamn i GTFS Sweden 3 Realtime, ur namnet i tavlans data.
 * Okända operatörer får inget GPS-läge (läget räknas då ur tiderna som förut).
 */
const GTFS_OPERATORS = [
  // Namnet i datan är "AB SL Kundtjänst", inte bara "SL".
  [/(^|[^a-zåäö])sl([^a-zåäö]|$)|storstockholms/i, 'sl'],
  [/(^|[^a-zåäö])ul([^a-zåäö]|$)|upplands lokaltrafik/i, 'ul'],
  [/västtrafik/i, 'vt'],
  [/skånetrafiken/i, 'skane'],
  [/östgötatrafiken/i, 'otraf'],
  [/^jlt$|jönköpings länstrafik/i, 'jlt'],
  [/kronoberg/i, 'krono'],
  [/^klt$|kalmar länstrafik/i, 'klt'],
  [/blekingetrafiken/i, 'blekinge'],
  [/värmlandstrafik/i, 'varm'],
  [/örebro/i, 'orebro'],
  [/västmanland|^vl$/i, 'vastmanland'],
  [/dalatrafik/i, 'dt'],
  [/x-trafik/i, 'xt'],
  [/din tur/i, 'dintur'],
  [/gotland/i, 'gotland'],
];
function gtfsOperator(agency) {
  const name = String(agency?.name || '').trim();
  const hit = GTFS_OPERATORS.find(([re]) => re.test(name));
  return hit ? hit[1] : '';
}

/** Nyckeln för GTFS Sweden 3 Realtime: det förväntade namnet, annars en hemlighet med GTFS i namnet. */
function gtfsKeyFrom(env) {
  const name =
    ['TRAFIKLAB_GTFS_RT_KEY', 'TRAFIKLAB_GTFS_REALTIME_KEY', 'GTFS_RT_KEY'].find((k) => env && env[k]) ||
    Object.keys(env || {}).find((k) => /GTFS/i.test(k) && typeof env[k] === 'string' && env[k]);
  return { name: name || '', value: name ? env[name] : '' };
}

/**
 * Driftstatus för de källor som inte går att prova utan nycklarna: svarar de, och med vad?
 * Inga hemligheter lämnas ut, bara om nyckeln finns, statuskoder och antal. Sparas två minuter.
 */
async function handleStatus(keys, context) {
  const cacheKey = new Request('https://cache.alltiditid.se/status-v2');
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;
  const out = { gtfs: { key: Boolean(keys.gtfsRt), keyName: gtfsKeyFrom(context.env).name }, ferries: {} };
  if (keys.gtfsRt) {
    try {
      const res = await upstreamFetch(
        `https://opendata.samtrafiken.se/gtfs-rt-sweden/sl/VehiclePositionsSweden.pb?key=${encodeURIComponent(keys.gtfsRt)}`
      );
      out.gtfs.status = res.status;
      const bytes = new Uint8Array(await res.arrayBuffer());
      out.gtfs.bytes = bytes.length;
      if (res.ok) {
        const ids = Object.keys(vehiclePositions(bytes));
        out.gtfs.vehicles = ids.length;
        out.gtfs.sampleTripIds = ids.slice(0, 3);
      } else {
        out.gtfs.message = new TextDecoder().decode(bytes.subarray(0, 200));
      }
    } catch (err) {
      out.gtfs.error = String(err && err.message ? err.message : err).slice(0, 200);
    }
  }
  if (keys.trafikverket) {
    try {
      const res = await upstreamFetch(TRAFIKVERKET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body: `<REQUEST><LOGIN authenticationkey="${keys.trafikverket}" /><QUERY objecttype="FerryRoute" schemaversion="1.2" limit="200" /></REQUEST>`,
      });
      out.ferries.status = res.status;
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        // Inte JSON: visa början av svaret nedan.
      }
      const routes = data?.RESPONSE?.RESULT?.[0]?.FerryRoute;
      if (Array.isArray(routes)) {
        out.ferries.routes = routes.length;
        out.ferries.harbors = ferryHarbors(routes).length;
        out.ferries.firstRouteKeys = routes[0] ? Object.keys(routes[0]) : [];
        out.ferries.firstHarbor = routes[0]?.Harbor?.[0] || routes[0]?.Harbors?.[0] || null;
      } else {
        out.ferries.message = text.slice(0, 300);
      }
    } catch (err) {
      out.ferries.error = String(err && err.message ? err.message : err).slice(0, 200);
    }
  }
  const response = jsonResponse(out, 200, { 'Cache-Control': 'public, max-age=120' });
  await cachePut(cacheKey, response.clone(), context);
  return response;
}

/** Bronskvoten är 30 000 anrop i månaden: högst så här många per dygn, sedan räknas läget ur tiderna. */
const GTFS_RT_DAILY_LIMIT = 900;
/** Så länge gäller en hämtad lista med positioner. Ett anrop per operatör och period, bara när någon tittar. */
const GTFS_RT_CACHE_SECONDS = 90;

/** Alla fordons positioner hos en operatör: { tur-id: [lat, lon, tid] }. Tomt om något går fel. */
async function operatorPositions(key, operator, context) {
  const cacheKey = new Request(`https://cache.alltiditid.se/gtfs-rt/${operator}/positioner-v1`);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return await cached.json();
    } catch {
      // Hämta om nedan
    }
  }
  if (!(await allowCall(context && context.env, 'gtfsrt', GTFS_RT_DAILY_LIMIT))) return {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let positions = {};
  try {
    const res = await upstreamFetch(
      `https://opendata.samtrafiken.se/gtfs-rt-sweden/${operator}/VehiclePositionsSweden.pb?key=${encodeURIComponent(key)}`,
      { signal: controller.signal }
    );
    if (res.ok) positions = vehiclePositions(new Uint8Array(await res.arrayBuffer()));
  } catch {
    positions = {};
  } finally {
    clearTimeout(timer);
  }
  // Även ett tomt svar sparas, så att ett fel inte ger ett anrop per besökare.
  await cachePut(
    cacheKey,
    new Response(JSON.stringify(positions), { headers: { 'Cache-Control': `max-age=${GTFS_RT_CACHE_SECONDS}` } }),
    context
  );
  return positions;
}

/**
 * En bussturs, tunnelbanetågs, spårvagns eller båts hela resa (Trafiklab Trips).
 * Svaret sparas en minut i Cloudflare: Trafiklab uppdaterar inte oftare än så,
 * och många som följer samma buss ska inte kosta ett anrop var.
 */
async function handleTrip(url, keys, context) {
  const id = String(url.searchParams.get('id') || '').trim();
  const date = String(url.searchParams.get('date') || '').trim();
  if (!/^[\w.:-]{1,64}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ error: 'Ange en tur och ett datum.' }, 400);
  }
  if (!keys.realtime) return jsonResponse({ error: 'Turens resa saknas just nu.' }, 503);

  const cacheKey = new Request(`https://alltiditid.se/api/trafik?action=trip&id=${encodeURIComponent(id)}&date=${date}`, { method: 'GET' });
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  let data;
  try {
    const res = await upstreamFetch(
      `${REALTIME_BASE}/trips/${encodeURIComponent(id)}/${date}?key=${encodeURIComponent(keys.realtime)}`
    );
    if (res.status === 404) return jsonResponse({ error: 'Hittade inte turen.' }, 404);
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    return jsonResponse({ error: 'Kunde inte hämta turen från Trafiklab just nu.' }, 502);
  }
  const mode = classifyRealtimeMode(data.route || {}, data.agency);
  const nowIso = new Date().toISOString();
  const journey = tripJourney(data, swedishDateTime(nowIso), {
    lineName: buildLineName(data.route || {}, mode),
    trackLabel: (designation) => trackLabelFor(designation, mode),
    cleanName: (name) => cleanPlaceName(name) || name,
  });
  if (journey.stops.length === 0) return jsonResponse({ error: 'Hittade inte turen.' }, 404);

  // Fordonets GPS-läge, om operatören har det och turen är på väg. Får aldrig stoppa svaret.
  let located = journey;
  try {
    const operator = gtfsOperator(data.agency);
    const underway = journey.stops.some((st) => st.passed) && !journey.stops.every((st) => st.passed);
    if (keys.gtfsRt && operator && underway) {
      const positions = await operatorPositions(keys.gtfsRt, operator, context);
      const fix = positions[id];
      if (fix) {
        located = applyGps(
          journey,
          locateOnRoute(journey.stops, fix[0], fix[1]),
          { lat: fix[0], lon: fix[1], at: fix[2] },
          Math.floor(Date.now() / 1000)
        );
      }
    }
  } catch {
    located = journey;
  }
  const response = jsonResponse(
    { ...located, mode, agency: String(data.agency?.name || ''), updatedAt: nowIso },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
  await cachePut(cacheKey, response.clone(), context);
  return response;
}

/** Minsta bytestid i minuter. Stora stationer har långa gångar mellan spåren. */
const BIG_STATIONS = /^(stockholm c|göteborg c|malmö c|uppsala c|norrköping c|linköping c|lund c|hässleholm c|nässjö c|hallsberg|katrineholm c|alvesta|örebro c|gävle c|arlanda c|södertälje syd|sundsvall c|karlstad c|jönköping c|helsingborg c)$/i;
function minTransfer(station) {
  return BIG_STATIONS.test(String(station || '').trim()) ? 7 : 4;
}

/**
 * Knutpunkter där ett byte ofta sker mellan hållplatser med olika namn hos Trafiklab:
 * fjärrtåg på Stockholm C, pendeltåg vid Stockholm City, T-bana vid T-Centralen och
 * Flygbussarna vid Cityterminalen. Bytet visar dem tillsammans (högst fyra id:n).
 */
const HUBS = {
  'stockholm c': { name: 'Stockholm C', ids: '740000001,740001617,740020749,740000622' },
  'stockholm city': { name: 'Stockholm C', ids: '740001617,740000001,740020749,740000622' },
  'stockholm odenplan': { name: 'Odenplan', ids: '740001618,740021013,740098559' },
  'göteborg c': { name: 'Göteborg C', ids: '740000002,740030117,740015585,740020483' },
  'arlanda c': { name: 'Arlanda C', ids: '740000556,740000492,740000708' },
};

/** "Linköping C" (Trafikverket) → "Linköping Centralstation" (Trafiklab). */
function trafiklabName(tvName) {
  return String(tvName || '').trim().replace(/\s+C$/i, ' Centralstation');
}

/**
 * action=connections&station=Linköping C&arrival=YYYY-MM-DDTHH:MM&train=532
 * Avgångar från bytesstationen efter tågets väntade ankomst, med marginal i minuter.
 */
async function handleConnections(url, keys, context) {
  const station = String(url.searchParams.get('station') || '').trim().slice(0, 80);
  const arrival = String(url.searchParams.get('arrival') || '');
  const train = String(url.searchParams.get('train') || '').replace(/\D/g, '');
  if (!station || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(arrival)) {
    return jsonResponse({ error: 'Station och ankomsttid behövs.' }, 400);
  }
  let stop = HUBS[station.toLowerCase()] ? { id: HUBS[station.toLowerCase()].ids, name: HUBS[station.toLowerCase()].name } : null;
  for (const q of stop ? [] : [trafiklabName(station), station]) {
    try {
      const hits = keys.realtime ? await realtimeSearch(keys.realtime, q) : await resrobotSearch(keys.resrobot, q);
      stop = hits.find((h) => !h.modes || h.modes.includes('Tåg')) || hits[0] || null;
    } catch {
      stop = null;
    }
    if (stop) break;
  }
  if (!stop) return jsonResponse({ error: `Hittade inte ${station}.` }, 404);

  const boardUrl = new URL(url.toString());
  boardUrl.search = '';
  boardUrl.searchParams.set('stopId', stop.id);
  boardUrl.searchParams.set('stopName', stop.name);
  boardUrl.searchParams.set('mode', 'all');
  boardUrl.searchParams.set('direction', 'departures');
  boardUrl.searchParams.set('time', arrival);
  const res = await handleBoard(boardUrl, keys, context);
  if (res.status !== 200) return res;
  const body = await res.json();
  const transfer = minTransfer(station);
  const arrMs = Date.parse(`${arrival}:00Z`);
  const departures = (body.departures || [])
    .filter((d) => !train || !String(d.line || '').endsWith(` ${train}`))
    .map((d) => {
      const depMs = Date.parse(`${d.expectedAt || ''}:00Z`);
      const margin = Number.isNaN(depMs) ? null : Math.round((depMs - arrMs) / 60000);
      return { ...d, margin };
    })
    .filter((d) => d.margin === null || d.margin >= -2)
    .slice(0, 40);
  // stops=1: hållplatserna efter bytet, så att man kan söka på ett mål längs linjen.
  const withStops = url.searchParams.get('stops') === '1' && Boolean(keys.realtime);
  if (withStops) await addStopsAfter(departures, station, keys, context);
  return jsonResponse(
    { station, stop, arrival, transfer, departures, ...(withStops ? { stops: true } : {}), updatedAt: new Date().toISOString() },
    200,
    { 'Cache-Control': 'public, max-age=30' }
  );
}

/** Så många linjer (linje + riktning) slås upp per byte. Resten matchas bara på slutstationen. */
const MAX_ROUTE_LOOKUPS = 24;
/** En linjes hållplatser ändras sällan under dagen: sparas sex timmar per station, linje och riktning. */
const ROUTE_STOPS_TTL_S = 6 * 3600;

/**
 * Sätter `stopsAfter` (hållplatserna efter bytesstationen) på avgångarna.
 * En tur slås upp per linje och riktning, och svaret delas av alla avgångar på den.
 */
async function addStopsAfter(departures, station, keys, context) {
  const groups = new Map();
  for (const d of departures) {
    if (!d.tripId || !d.tripDate) continue;
    const key = `${d.line}|${d.destination}`;
    if (!groups.has(key)) groups.set(key, d);
  }
  const lookups = [...groups.entries()].slice(0, MAX_ROUTE_LOOKUPS);
  const found = new Map(
    await Promise.all(lookups.map(async ([key, d]) => [key, await routeStopsAfter(d, station, keys, context)]))
  );
  for (const d of departures) {
    const names = found.get(`${d.line}|${d.destination}`);
    if (names && names.length) d.stopsAfter = names;
  }
}

async function routeStopsAfter(d, station, keys, context) {
  const cacheKey = new Request(
    `https://alltiditid.se/api/trafik?action=route-stops&station=${encodeURIComponent(station.toLowerCase())}&line=${encodeURIComponent(
      d.line
    )}&to=${encodeURIComponent(d.destination)}`,
    { method: 'GET' }
  );
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return (await cached.json()).stops || null;
    } catch {
      // Trasig post: slå upp turen igen.
    }
  }
  let names = null;
  try {
    const res = await upstreamFetch(
      `${REALTIME_BASE}/trips/${encodeURIComponent(d.tripId)}/${encodeURIComponent(d.tripDate)}?key=${encodeURIComponent(keys.realtime)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const journey = tripJourney(data, '', { cleanName: (name) => cleanPlaceName(name) || name });
    names = stopsAfter(journey, d.scheduledTime);
  } catch {
    return null;
  }
  if (names) {
    await cachePut(
      cacheKey,
      jsonResponse({ stops: names }, 200, { 'Cache-Control': `public, max-age=${ROUTE_STOPS_TTL_S}` }),
      context
    );
  }
  return names;
}

/** Lägger Trafikverkets uppgifter ovanpå en avgång (bara tåg, bara exakt matchning). */
function applyTrafikverket(departure, tvUpdates, trainNumberCandidates) {
  if (departure.transportMode !== 'train' && departure.transportMode !== 'commuter') {
    return departure;
  }
  let match = null;
  for (const num of trainNumberCandidates) {
    const key = `${String(num || '').trim()}|${departure._scheduledLocal}`;
    if (num && tvUpdates.has(key)) {
      match = tvUpdates.get(key);
      break;
    }
  }
  if (!match) return departure;

  const result = { ...departure };
  if (match.cancelled) {
    result.status = 'cancelled';
    result.newTime = '';
    result.delayMinutes = 0;
    result.estimatedTime = result.scheduledTime;
  } else if (match.hasRealtime) {
    // Trafikverket är källan för tåg, så deras prognos vinner.
    result.hasRealtime = true;
    result._offsetMin = match.offsetMinutes || 0;
    if (match.delayMinutes > 0) {
      result.status = 'delayed';
      result.newTime = match.newTime;
      result.delayMinutes = match.delayMinutes;
      result.estimatedTime = match.newTime;
    } else if (result.status !== 'cancelled') {
      result.status = 'on-time';
      result.newTime = '';
      result.delayMinutes = 0;
      result.estimatedTime = result.scheduledTime;
    }
  }
  if (match.track) result.track = trackLabelFor(match.track, departure.transportMode);
  if (match.deviation) result.deviation = match.deviation;
  return result;
}

// ---------------------------------------------------------------------------
// Trafiklab Realtime APIs (förstahandskälla)
// ---------------------------------------------------------------------------

const REALTIME_MODE_LABELS = {
  subway: 'T-bana',
  tram: 'Spårvagn',
  bus: 'Buss',
  ferry: 'Båt',
  commuter: 'Pendeltåg',
  train: 'Tåg',
  other: 'Linje',
};

function classifyRealtimeMode(route, agency) {
  const mode = String(route?.transport_mode || '').toUpperCase();
  const agencyName = String(agency?.name || '').trim().toLowerCase();
  const code = Number(route?.transport_mode_code);
  const name = String(route?.name || '').toLowerCase();

  switch (mode) {
    case 'METRO':
      return 'subway';
    case 'TRAM':
      return name.includes('tunnelbana') ? 'subway' : 'tram';
    case 'BUS':
    case 'TAXI':
      return 'bus';
    case 'BOAT':
      return 'ferry';
    case 'TRAIN':
      if (
        code === 109 ||
        name.includes('pendel') ||
        name.includes('pågatåg') ||
        name.includes('öresundståg') ||
        name.includes('upptåget') ||
        name.includes('krösatåg') ||
        // SL:s pendeltåg heter ibland bara "SL" (t.ex. vid Stockholm City).
        name === 'sl' ||
        agencyName === 'sl'
      ) {
        return 'commuter';
      }
      return 'train';
    default:
      return 'other';
  }
}

function buildLineName(route, itemMode) {
  // "SL 43" säger inget; "Pendeltåg 43" gör det.
  const rawName = String(route?.name || '').trim();
  const name = /^sl$/i.test(rawName) && REALTIME_MODE_LABELS[itemMode] ? REALTIME_MODE_LABELS[itemMode] : rawName;
  const designation = String(route?.designation || '').trim();
  if (name && designation) {
    return name.includes(designation) ? name : `${name} ${designation}`;
  }
  if (designation) return `${REALTIME_MODE_LABELS[itemMode] || 'Linje'} ${designation}`;
  return name || REALTIME_MODE_LABELS[itemMode] || 'Avgång';
}

function alertsToText(alerts) {
  if (!Array.isArray(alerts)) return '';
  // Samma störning skriven på två sätt visas en gång.
  return uniqueAlerts(alerts.map((a) => ({ title: a?.title || a?.text || a?.header }))).slice(0, 2).join(' • ');
}

/** Gör om ett anrop från Realtime API till appens avgångsformat. */
function mapRealtimeCall(call, direction) {
  const route = call.route || {};
  const itemMode = classifyRealtimeMode(route, call.agency);
  const scheduledIso = String(call.scheduled || '');
  const realtimeIso = String(call.realtime || scheduledIso);
  const scheduledTime = extractClockTime(scheduledIso);
  const isCancelled = Boolean(call.canceled);
  const hasRealtime = Boolean(call.is_realtime);

  // Avvikelsen räknas på klockslagen (hela minuter), inte på `delay` i sekunder.
  // 18:32:40 → 18:38:10 är 330 s, men på tavlan står 18:32 → 18:38, alltså +6.
  const clockDiff = hasRealtime ? minutesBetweenLocal(scheduledIso, realtimeIso) : 0;
  const offsetMin = !isCancelled && clockDiff !== null ? clockDiff : 0;
  const delayMin = Math.max(0, offsetMin);
  const isDelayed = !isCancelled && delayMin > 0;
  const newTime = isDelayed ? extractClockTime(realtimeIso) : '';

  const trainNumber =
    itemMode === 'train' || itemMode === 'commuter'
      ? String(route.designation || '').trim()
      : '';

  const title =
    direction === 'arrivals'
      ? route.origin?.name || 'Okänd avgångsort'
      : route.direction || route.destination?.name || 'Okänd destination';

  const platform =
    call.realtime_platform?.designation || call.scheduled_platform?.designation || '';

  return {
    id: `${call.trip?.trip_id || scheduledIso}-${call.trip?.start_date || ''}-${scheduledTime}`,
    line: buildLineName(route, itemMode),
    trainNumber,
    // Turen, så att hela resan kan visas för buss, T-bana, spårvagn och båt.
    ...(call.trip?.trip_id && call.trip?.start_date
      ? { tripId: String(call.trip.trip_id), tripDate: String(call.trip.start_date).slice(0, 10) }
      : {}),
    operator: String(call.agency?.operator || call.agency?.name || 'Trafikoperatör').trim(),
    destination: cleanPlaceName(String(title)) || String(title),
    scheduledTime,
    newTime,
    estimatedTime: newTime || scheduledTime,
    delayMinutes: isDelayed ? delayMin : 0,
    status: isCancelled ? 'cancelled' : isDelayed ? 'delayed' : 'on-time',
    hasRealtime,
    track: trackLabelFor(platform, itemMode),
    deviation: alertsToText(call.alerts),
    viaStops: [],
    directionType: direction,
    transportMode: itemMode,
    _trainCandidates: [route.designation, call.trip?.technical_number],
    _agency: String(call.agency?.name || ''),
    _designation: String(route.designation || ''),
    _coords:
      call.stop && call.stop.lat != null && call.stop.lon != null
        ? { lat: Number(call.stop.lat), lon: Number(call.stop.lon) }
        : null,
    _scheduledLocal: scheduledIso.slice(0, 16),
    _offsetMin: offsetMin,
  };
}

async function realtimeBoard(key, stopId, direction, at) {
  const kind = direction === 'arrivals' ? 'arrivals' : 'departures';
  // `at` ('YYYY-MM-DDTHH:MM', svensk tid): tavlan från den tiden i stället för nu.
  const when = at ? `/${encodeURIComponent(at)}` : '';
  const res = await upstreamFetch(
    `${REALTIME_BASE}/${kind}/${encodeURIComponent(stopId)}${when}?key=${encodeURIComponent(key)}`
  );
  if (!res.ok) throw new Error(`Trafiklab Realtime svarade med status ${res.status}`);
  const data = await res.json();
  const calls = Array.isArray(data[kind]) ? data[kind] : [];
  const stopName =
    data.stops?.find((s) => String(s.id) === String(stopId))?.name ||
    calls.find((c) => c && c.stop && c.stop.name)?.stop.name ||
    data.stops?.[0]?.name ||
    '';
  // Hållplatsens läge, så att taxi- och cykelraden kan visas även när tavlan är tom.
  const stop = data.stops?.find((s) => String(s.id) === String(stopId)) || data.stops?.[0];
  const coords =
    stop && Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lon)) && stop.lat != null && stop.lon != null
      ? { lat: Number(stop.lat), lon: Number(stop.lon) }
      : null;
  return {
    stopName,
    coords,
    departures: calls.map((call) => mapRealtimeCall(call, direction)),
  };
}

async function realtimeSearch(key, q) {
  const res = await upstreamFetch(
    `${REALTIME_BASE}/stops/name/${encodeURIComponent(q)}?key=${encodeURIComponent(key)}`
  );
  if (!res.ok) throw new Error(`Trafiklab Realtime sökfel (status ${res.status})`);
  const data = await res.json();
  const groups = Array.isArray(data.stop_groups) ? data.stop_groups : [];
  const sorted = groups
    .filter((g) => g && g.id && (!Array.isArray(g.transport_modes) || g.transport_modes.length > 0))
    .sort((a, b) => (Number(b.average_daily_stop_times) || 0) - (Number(a.average_daily_stop_times) || 0));
  return pickSearchHits(sorted, 8)
    .map((g) => {
      const out = { id: String(g.id), name: cleanPlaceName(String(g.name)) };
      const place = placeOfStopGroup(g);
      if (place) out.place = place;
      const modes = searchModes(g.transport_modes);
      if (modes.length) out.modes = modes;
      // Kajer och bryggor saknar ofta trafikslag i källan: säg att det är en båthållplats.
      else if (/\b(kaj|kajen|brygga|bryggan|färjeläge|färjeläget)$/i.test(out.name)) out.modes = ['Båt'];
      return out;
    });
}

const SEARCH_MODE_LABELS = {
  TRAIN: 'Tåg',
  METRO: 'T-bana',
  TRAM: 'Spårvagn',
  BUS: 'Buss',
  BOAT: 'Båt',
  FERRY: 'Båt',
  SHIP: 'Båt',
  TAXI: 'Anropsstyrd',
};

/** Trafikslagen på hållplatsen som korta ord i fast ordning: ["Tåg", "Buss"]. */
function searchModes(modes) {
  if (!Array.isArray(modes)) return [];
  const labels = [];
  for (const key of Object.keys(SEARCH_MODE_LABELS)) {
    const label = SEARCH_MODE_LABELS[key];
    if (modes.includes(key) && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

/**
 * Orten, ur delhållplatsens namn: "Karlstad, Residenstorget" ger "Karlstad".
 * Trafiklab har inget eget fält för kommun eller ort.
 */
function placeOfStopGroup(group) {
  const child = Array.isArray(group.stops) ? group.stops.find((st) => st && st.name) : null;
  const name = child ? String(child.name) : '';
  const comma = name.indexOf(',');
  if (comma < 2 || comma > 40) return '';
  return cleanPlaceName(name.slice(0, comma));
}

// ---------------------------------------------------------------------------
// Västtrafik Planera Resa v4 (realtid i Västra Götaland, som Trafiklab saknar)
// ---------------------------------------------------------------------------

const VASTTRAFIK_TOKEN_URL = 'https://ext-api.vasttrafik.se/token';
const VASTTRAFIK_BASE = 'https://ext-api.vasttrafik.se/pr/v4';
/** Västtrafiks tavla: tidsfönster i minuter, avgångar per sida och högst antal sidor. */
const VASTTRAFIK_SPAN_MIN = 120;
const PART_CANCELLED_TEXT = 'Går inte hela vägen';
const VASTTRAFIK_PAGE = 100;
const VASTTRAFIK_MAX_PAGES = 3;

function isVasttrafikDeparture(d) {
  return /västtrafik|vasttrafik/i.test(String(d._agency || ''));
}

/** OAuth2-token (client credentials), cachad tills strax innan den går ut. */
async function getVasttrafikToken(key, secret, context, forceNew = false) {
  const cacheKey = new Request('https://cache.alltiditid.se/vasttrafik/token-v2');
  const cached = forceNew ? null : await cacheGet(cacheKey);
  if (cached) {
    try {
      const data = await cached.json();
      if (data.token) return data.token;
    } catch {
      // Hämta ny nedan
    }
  }

  const res = await upstreamFetch(VASTTRAFIK_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${key}:${secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Västtrafik token ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('Västtrafik gav ingen token');

  const ttl = Math.max(60, (Number(data.expires_in) || 3600) - 300);
  await cachePut(
    cacheKey,
    new Response(JSON.stringify({ token: data.access_token }), {
      headers: { 'Cache-Control': `max-age=${ttl}` },
    }),
    context
  );
  return data.access_token;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Tar bort "Göteborg " och liknande prefix som Trafiklab har men inte Västtrafik. */
function vasttrafikSearchName(name) {
  return String(name || '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/^(göteborg|gbg)\s+/i, '')
    .replace(/\s+(t-bana|spårv|buss|station)$/i, '')
    .trim();
}

/**
 * Hittar Västtrafiks hållplatsområde (gid) för en hållplats.
 * Väljer den träff som ligger närmast Trafiklabs koordinater, om de finns.
 * Cachas ett dygn per Trafiklab-id.
 */
async function findVasttrafikStopArea(auth, stopId, names, coords, context, diag = {}) {
  const cacheKey = new Request(
    `https://cache.alltiditid.se/vasttrafik/stoparea-v3/${encodeURIComponent(stopId)}`
  );
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      const data = await cached.json();
      if (data.gid !== undefined) return data.gid;
    } catch {
      // Slå upp nedan
    }
  }

  let best = null;
  for (const rawName of names) {
    const q = vasttrafikSearchName(rawName);
    if (q.length < 2) continue;
    const res = await auth.fetch(
      `${VASTTRAFIK_BASE}/locations/by-text?q=${encodeURIComponent(q)}&types=stoparea&limit=10`
    );
    diag.search = diag.search || [];
    const searchInfo = { q, status: res.status };
    diag.search.push(searchInfo);
    if (!res.ok) continue;
    const data = await res.json();
    const all = Array.isArray(data.results) ? data.results : [];
    const areas = all.filter(
      (r) => r && r.gid && (!r.locationType || String(r.locationType).toLowerCase() === 'stoparea')
    );
    searchInfo.results = all.length;
    searchInfo.stopAreas = areas.length;
    if (all[0]) {
      searchInfo.first = { name: all[0].name, type: all[0].locationType, keys: Object.keys(all[0]).slice(0, 12) };
    }
    if (areas.length === 0) continue;

    let anyCoords = false;
    if (coords) {
      for (const area of areas) {
        const lat = Number(area.latitude ?? area.lat);
        const lon = Number(area.longitude ?? area.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        anyCoords = true;
        const dist = distanceMeters(coords.lat, coords.lon, lat, lon);
        if (dist <= 1500 && (!best || dist < best.dist)) best = { gid: String(area.gid), dist };
      }
    }
    // Saknar svaret koordinater, eller ligger ingen träff nära: ta första träffen
    // (Västtrafik sorterar på relevans).
    if (best) searchInfo.distance = Math.round(best.dist);
    if (!best) {
      searchInfo.fallback = anyCoords ? 'ingen nära, tog första' : 'inga koordinater, tog första';
      best = { gid: String(areas[0].gid), dist: 0 };
    }
    if (best) break;
  }

  const gid = best ? best.gid : '';
  await cachePut(
    cacheKey,
    new Response(JSON.stringify({ gid }), {
      headers: { 'Cache-Control': `max-age=${gid ? 24 * 60 * 60 : 5 * 60}` },
    }),
    context
  );
  return gid;
}

/**
 * Hämtar Västtrafiks tavla och returnerar en karta
 * `${linjebeteckning}|${ordinarie tid YYYY-MM-DDTHH:MM}` -> realtidsuppgifter.
 */
async function fetchVasttrafikUpdates(keys, stopId, names, coords, direction, context, diag = {}) {
  const updates = new Map();
  diag.step = 'token';
  // Token från Västtrafik bär med sig applikationens prenumerationer. Svarar
  // API:et 401/403 hämtas en ny token en gång (t.ex. efter ny prenumeration).
  let token = await getVasttrafikToken(keys.vasttrafikKey, keys.vasttrafikSecret, context);
  let renewed = false;
  const auth = {
    async fetch(url) {
      let res = await upstreamFetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if ((res.status === 401 || res.status === 403) && !renewed) {
        renewed = true;
        diag.tokenRenewed = true;
        token = await getVasttrafikToken(keys.vasttrafikKey, keys.vasttrafikSecret, context, true);
        res = await upstreamFetch(url, { headers: { Authorization: `Bearer ${token}` } });
      }
      return res;
    },
  };
  diag.step = 'hållplats';
  const gid = await findVasttrafikStopArea(auth, stopId, names, coords, context, diag);
  diag.stopArea = gid || null;
  if (!gid) {
    diag.status = 'ingen hållplats hittad';
    return updates;
  }
  diag.step = 'tavla';

  const kind = direction === 'arrivals' ? 'arrivals' : 'departures';
  const baseUrl = `${VASTTRAFIK_BASE}/stop-areas/${encodeURIComponent(gid)}/${kind}?timeSpanInMinutes=${VASTTRAFIK_SPAN_MIN}`;
  let res = await auth.fetch(`${baseUrl}&limit=${VASTTRAFIK_PAGE}`);
  let paged = true;
  if (res.status === 400) {
    res = await auth.fetch(baseUrl);
    paged = false;
  }
  diag.boardStatus = res.status;
  if (!res.ok) throw new Error(`Västtrafik ${kind} ${res.status}`);
  const data = await res.json();
  const results = Array.isArray(data.results) ? [...data.results] : [];
  // Stora hållplatser har fler avgångar än en sida: hämta nästa sidor (högst VASTTRAFIK_MAX_PAGES).
  for (let page = 1; paged && page < VASTTRAFIK_MAX_PAGES && results.length === page * VASTTRAFIK_PAGE; page++) {
    const next = await auth.fetch(`${baseUrl}&limit=${VASTTRAFIK_PAGE}&offset=${page * VASTTRAFIK_PAGE}`);
    if (!next.ok) break;
    const more = await next.json().catch(() => null);
    const list = more && Array.isArray(more.results) ? more.results : [];
    if (list.length === 0) break;
    results.push(...list);
  }
  diag.results = results.length;
  diag.withEstimate = results.filter((r) => r && r.estimatedTime).length;
  diag.status = 'ok';

  for (const item of results) {
    const line = item.serviceJourney?.line || {};
    const planned = item.plannedTime;
    if (!planned) continue;
    const plannedLocal = swedishDateTime(planned);
    const estimated = item.estimatedTime || '';
    const platformRaw = item.stopPoint?.platform;
    const platform =
      platformRaw && typeof platformRaw === 'object' ? platformRaw.name : platformRaw;

    const update = {
      hasRealtime: Boolean(estimated),
      estimated,
      planned,
      cancelled: Boolean(item.isCancelled),
      partCancelled: !item.isCancelled && Boolean(item.isPartCancelled),
      platform: String(platform || '').trim(),
    };
    const designations = new Set(
      [line.shortName, line.designation, line.name]
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean)
    );
    for (const des of designations) {
      updates.set(`${des}|${plannedLocal}`, update);
    }
  }
  return updates;
}

/** Lägger Västtrafiks realtid ovanpå en avgång från Trafiklab. */
function applyVasttrafik(departure, vtUpdates) {
  if (!vtUpdates || vtUpdates.size === 0 || !isVasttrafikDeparture(departure)) return departure;
  const des = String(departure._designation || '').trim().toLowerCase();
  const match = des ? vtUpdates.get(`${des}|${departure._scheduledLocal}`) : null;
  if (!match) return departure;
  // Har Trafiklab redan realtid behålls deras tider, men "går inte hela vägen" läggs till.
  if (departure.hasRealtime) {
    if (!match.partCancelled || departure.status === 'cancelled') return departure;
    return {
      ...departure,
      deviation: [PART_CANCELLED_TEXT, departure.deviation].filter(Boolean).join(' • '),
    };
  }

  const result = { ...departure };
  if (match.platform && !result.track) result.track = trackLabelFor(match.platform, departure.transportMode);
  if (match.partCancelled) {
    // Turen går, men inte hela vägen. Skrivs först i avvikelsen så att den syns på raden.
    result.deviation = [PART_CANCELLED_TEXT, result.deviation].filter(Boolean).join(' • ');
  }

  if (match.cancelled) {
    result.status = 'cancelled';
    result.hasRealtime = true;
    result.newTime = '';
    result.delayMinutes = 0;
    result.estimatedTime = result.scheduledTime;
    return result;
  }
  if (!match.hasRealtime) return result;

  result.hasRealtime = true;
  const delayMin =
    minutesBetweenLocal(swedishDateTime(match.planned), swedishDateTime(match.estimated)) || 0;
  result._offsetMin = delayMin;
  if (delayMin > 0) {
    result.status = 'delayed';
    result.newTime = swedishClock(match.estimated);
    result.delayMinutes = delayMin;
    result.estimatedTime = result.newTime;
  } else {
    result.status = 'on-time';
    result.newTime = '';
    result.delayMinutes = 0;
    result.estimatedTime = result.scheduledTime;
  }
  return result;
}

// ---------------------------------------------------------------------------
// ResRobot (reserv om Realtime-nyckeln saknas eller API:et inte svarar)
// ---------------------------------------------------------------------------

function mapResrobotItem(item, direction) {
  const prod = Array.isArray(item.Product) ? item.Product[0] : item.Product || {};
  const itemMode = classifyTransportMode(String(prod.catCode || ''), String(prod.catOutL || prod.catOut || ''));

  const scheduledTime = String(item.time || '').slice(0, 5);
  const rtTimeRaw = String(item.rtTime || '').slice(0, 5);
  const hasRealtime = Boolean(rtTimeRaw);
  const rawDiff = hasRealtime
    ? getDelayMinutes(scheduledTime, rtTimeRaw, item.date, item.rtDate)
    : null;

  const isCancelled = Boolean(item.cancelled);
  const isDelayed = !isCancelled && rawDiff !== null && rawDiff > 0;
  const newTime = isDelayed ? rtTimeRaw : '';

  const trainNumber = String(prod.num || prod.displayNumber || '').trim();
  const lineName = String(prod.name || prod.line || trainNumber || 'Avgång').trim();

  const stopsRaw = item.Stops?.Stop;
  const viaStops = Array.isArray(stopsRaw)
    ? stopsRaw.map((s) => (s && s.name ? cleanPlaceName(String(s.name)) : '')).filter(Boolean)
    : [];

  const rawTitle =
    direction === 'arrivals'
      ? String(item.origin || 'Okänd avgångsort')
      : String(item.direction || 'Okänd destination');

  return {
    id: `${item.date || ''}-${scheduledTime}-${trainNumber || lineName}`,
    line: trainNumber && !lineName.includes(trainNumber) ? `${lineName} (${trainNumber})` : lineName,
    trainNumber,
    operator: String(prod.operator || prod.operatorInfo?.name || 'Trafikoperatör').trim(),
    destination: cleanPlaceName(rawTitle) || rawTitle,
    scheduledTime,
    newTime,
    estimatedTime: newTime || scheduledTime,
    delayMinutes: isDelayed ? rawDiff : 0,
    status: isCancelled ? 'cancelled' : isDelayed ? 'delayed' : 'on-time',
    hasRealtime,
    track: trackLabelFor(item.rtTrack || item.track, itemMode),
    deviation: '',
    viaStops,
    directionType: direction,
    transportMode: itemMode,
    _trainCandidates: [trainNumber],
    _coords:
      item.lat != null && item.lon != null && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))
        ? { lat: Number(item.lat), lon: Number(item.lon) }
        : null,
    _scheduledLocal: `${item.date || ''}T${scheduledTime}`,
    _offsetMin: !isCancelled && rawDiff !== null ? rawDiff : 0,
  };
}

async function resrobotBoard(key, stopId, direction, duration = 120) {
  const endpoint = direction === 'arrivals' ? 'arrivalBoard' : 'departureBoard';
  const res = await upstreamFetch(
    `${RESROBOT_BASE}/${endpoint}?id=${encodeURIComponent(stopId)}&duration=${duration}&passlist=1&format=json&accessId=${encodeURIComponent(key)}`
  );
  if (!res.ok) throw new Error(`Trafiklab svarade med status ${res.status}`);
  const data = await res.json();
  const rawList = direction === 'arrivals' ? data.Arrival : data.Departure;
  return {
    stopName: '',
    departures: (Array.isArray(rawList) ? rawList : []).map((item) =>
      mapResrobotItem(item, direction)
    ),
  };
}

async function resrobotSearch(key, q) {
  const res = await upstreamFetch(
    `${RESROBOT_BASE}/location.name?input=${encodeURIComponent(q)}&format=json&accessId=${encodeURIComponent(key)}`
  );
  if (!res.ok) throw new Error(`Trafiklab sökfel (status ${res.status})`);
  const data = await res.json();
  const rawStops = Array.isArray(data.stopLocationOrCoordLocation)
    ? data.stopLocationOrCoordLocation
    : [];
  return rawStops
    .filter((item) => item && item.StopLocation)
    .slice(0, 8)
    .map((item) => ({
      id: String(item.StopLocation.extId),
      name: cleanPlaceName(String(item.StopLocation.name)),
    }));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** Trafikverkets färjelägen (vägfärjor), cachade ett dygn. Tom lista om något går fel. */
async function fetchFerryHarbors(trafikverketKey, context) {
  if (!trafikverketKey) return [];
  const cacheKey = new Request('https://cache.alltiditid.se/trafikverket/farjelagen-v1');
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return await cached.json();
    } catch {
      // Läs om nedan
    }
  }
  const xmlBody = `<REQUEST>
  <LOGIN authenticationkey="${trafikverketKey}" />
  <QUERY objecttype="FerryRoute" schemaversion="1.2" limit="200" />
</REQUEST>`;
  try {
    const res = await upstreamFetch(TRAFIKVERKET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xmlBody,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const harbors = ferryHarbors(data?.RESPONSE?.RESULT?.[0]?.FerryRoute || []);
    if (harbors.length > 0) {
      await cachePut(
        cacheKey,
        new Response(JSON.stringify(harbors), { headers: { 'Cache-Control': `max-age=${STATION_LIST_CACHE_SECONDS}` } }),
        context
      );
    }
    return harbors;
  } catch {
    return [];
  }
}

/** Sökträffarna plus vägfärjornas färjelägen. Färjorna får aldrig stoppa sökningen. */
async function withFerryHits(stops, q, keys, context) {
  try {
    const hits = searchFerryHarbors(await fetchFerryHarbors(keys.trafikverket, context), q, 2);
    return hits.length ? [...stops, ...hits] : stops;
  } catch {
    return stops;
  }
}

/** Tavlan för ett färjeläge (id "fv:<hamn>"): avgångarna de närmaste timmarna. */
async function handleFerryBoard(url, keys) {
  const harborId = String(url.searchParams.get('stopId') || '').slice(FERRY_PREFIX.length);
  const direction = url.searchParams.get('direction') === 'arrivals' ? 'arrivals' : 'departures';
  const mode = url.searchParams.get('mode') || 'all';
  if (!/^\d{1,9}$/.test(harborId)) return jsonResponse({ error: 'Okänt färjeläge.' }, 400);
  if (!keys.trafikverket) return jsonResponse({ error: 'Färjetiderna saknas just nu.' }, 503);
  // Trafikverket anger avgångar per hamn, inte ankomster.
  if (direction === 'arrivals' || (mode !== 'all' && mode !== 'ferry')) {
    return jsonResponse({ departures: [], source: 'trafikverket-farja' }, 200, { 'Cache-Control': 'public, max-age=60' });
  }
  const now = Date.now();
  const fromIso = new Date(now - 2 * 60 * 1000).toISOString();
  const toIso = new Date(now + 6 * 60 * 60 * 1000).toISOString();
  const xmlBody = `<REQUEST>
  <LOGIN authenticationkey="${keys.trafikverket}" />
  <QUERY objecttype="FerryAnnouncement" schemaversion="1.2" limit="40" orderby="DepartureTime">
    <FILTER>
      <AND>
        <EQ name="FromHarbor.Id" value="${harborId}" />
        <GT name="DepartureTime" value="${fromIso}" />
        <LT name="DepartureTime" value="${toIso}" />
      </AND>
    </FILTER>
  </QUERY>
</REQUEST>`;
  let anns;
  try {
    const res = await upstreamFetch(TRAFIKVERKET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xmlBody,
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    anns = data?.RESPONSE?.RESULT?.[0]?.FerryAnnouncement || [];
  } catch {
    return jsonResponse({ error: 'Kunde inte hämta färjetiderna från Trafikverket just nu.' }, 502);
  }
  const ferry = ferryBoard(anns, swedishDateTime);
  return jsonResponse(
    {
      departures: ferry.departures,
      ...(ferry.disruptions.length ? { disruptions: ferry.disruptions } : {}),
      source: 'trafikverket-farja',
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}

async function handleSearch(url, keys, context) {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return jsonResponse({ stops: [] });

  if (keys.realtime) {
    try {
      return jsonResponse({ stops: await withFerryHits(await realtimeSearch(keys.realtime, q), q, keys, context) });
    } catch {
      // Prova ResRobot nedan
    }
  }
  if (keys.resrobot) {
    try {
      return jsonResponse({ stops: await withFerryHits(await resrobotSearch(keys.resrobot, q), q, keys, context) });
    } catch (err) {
      return jsonResponse({ error: err.message }, 502);
    }
  }
  return jsonResponse({ error: 'Kunde inte söka hållplatser just nu.' }, 502);
}

/** "GÖTEBORG" -> "Göteborg" (ResRobot skriver vissa samlingshållplatser med versaler). */
function tidyStopName(name) {
  const clean = cleanPlaceName(String(name || ''));
  if (clean && clean === clean.toUpperCase()) {
    return clean.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, pre, ch) => pre + ch.toUpperCase());
  }
  return clean;
}

/**
 * Hållplatser nära en position (ResRobot Nearby stops).
 * Koordinaterna avrundas till tre decimaler (cirka 100 m) innan de skickas
 * vidare eller används som cachenyckel, och sparas inte.
 */
/** Reseplaneraren får högst så här många ResRobot-anrop per dygn (sökning + resa räknas var för sig). */
// Brons-nyckeln ger 30 000 anrop i månaden och delas med Nära mig; 700 om dagen lämnar plats åt den.
const PLAN_CALLS_PER_DAY = 700;

const inSweden = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && lat >= 55 && lat <= 69.2 && lon >= 10.5 && lon <= 24.3;

// ---------------------------------------------------------------------------
// Platser: hotell, arenor, sjukhus och adresser (inte bara hållplatser)
// ---------------------------------------------------------------------------

/** Högst så många platsuppslag om dygnet (Geoapify Free ger 3 000; Photon ber om måttlig användning). */
const PLACES_CALLS_PER_DAY = 2500;
const PHOTON_DEFAULT = 'https://photon.komoot.io';
const SWEDEN_BBOX = '10.5,55,24.3,69.2';

/**
 * Namngivna platser och adresser för det man skrev, från OpenStreetMap.
 * Geoapify om GEOAPIFY_KEY finns (Free-planen tillåter kommersiell användning med
 * attribution), annars Photon (PHOTON_URL, standard photon.komoot.io).
 * Svaret cachas en vecka per sökning, så att samma ord inte kostar fler anrop.
 * bias: en ungefärlig punkt (en decimal, cirka 10 km) som träffar nära vinner på.
 */
/**
 * Län och ort för en position: för tips när man är strandad (länets trafikbolag och närtrafik,
 * taxi på orten). POST så att positionen inte hamnar i loggar; avrundad till cirka 1 km.
 */
async function handleArea(request, context) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Använd POST med { lat, lon }.' }, 405, { Allow: 'POST' });
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const lat = Number(body && body.lat);
  const lon = Number(body && body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 55 || lat > 69.2 || lon < 10.5 || lon > 24.3) {
    return jsonResponse({ error: 'Positionen ligger utanför Sverige.' }, 400);
  }
  const env = context && context.env;
  const rLat = lat.toFixed(2);
  const rLon = lon.toFixed(2);
  const cacheKey = new Request(`https://cache.alltiditid.se/area-v1/${rLat},${rLon}`);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return jsonResponse(await cached.json(), 200, { 'Cache-Control': 'no-store' });
    } catch {
      // Hämta på nytt nedan
    }
  }
  if (!(await allowCall(env, 'places', PLACES_CALLS_PER_DAY))) return jsonResponse({ county: '', town: '', traffic: null }, 200);
  let county = '';
  let town = '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const geoKey = env && env.GEOAPIFY_KEY;
    if (geoKey) {
      const res = await upstreamFetch(
        `https://api.geoapify.com/v1/geocode/reverse?lat=${rLat}&lon=${rLon}&lang=sv&format=json&apiKey=${encodeURIComponent(geoKey)}`,
        { signal: controller.signal }
      );
      if (res.ok) {
        const p = ((await res.json()).results || [])[0] || {};
        county = p.state || p.county || '';
        town = p.city || p.town || p.village || p.suburb || '';
      }
    } else {
      const base = String((env && env.PHOTON_URL) || PHOTON_DEFAULT).replace(/\/$/, '');
      const res = await upstreamFetch(`${base}/reverse?lat=${rLat}&lon=${rLon}&lang=default`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'alltiditid.se (reseplanerare)' },
      });
      if (res.ok) {
        const p = (((await res.json()).features || [])[0] || {}).properties || {};
        county = p.state || p.county || '';
        town = p.city || p.town || p.village || p.locality || p.district || '';
      }
    }
  } catch {
    // Utan län blir tipsen allmänna
  } finally {
    clearTimeout(timer);
  }
  const traffic = trafficForCounty(county);
  const data = { county, town, traffic: traffic ? { name: traffic.name, url: traffic.url } : null };
  if (county) {
    await cachePut(cacheKey, jsonResponse(data, 200, { 'Cache-Control': 'max-age=2592000' }), context);
  }
  return jsonResponse(data, 200, { 'Cache-Control': 'no-store' });
}

async function lookupPlaces(q, env, context, bias) {
  const folded = foldPlace(q);
  if (folded.length < 3) return { places: [], source: '' };
  const geoKey = env && env.GEOAPIFY_KEY;
  const source = geoKey ? 'geoapify' : 'osm';
  const b = bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lon) ? `${bias.lat.toFixed(1)},${bias.lon.toFixed(1)}` : 'se';
  const cacheKey = new Request(`https://cache.alltiditid.se/places-v1/${source}/${b}/${encodeURIComponent(folded)}`);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return await cached.json();
    } catch {
      // Hämta på nytt nedan
    }
  }
  if (!(await allowCall(env, 'places', PLACES_CALLS_PER_DAY))) return { places: [], source };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  let places = [];
  try {
    if (geoKey) {
      const near = b === 'se' ? '' : `&bias=proximity:${b.split(',')[1]},${b.split(',')[0]}`;
      const res = await upstreamFetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&filter=countrycode:se${near}&lang=sv&limit=8&format=json&apiKey=${encodeURIComponent(geoKey)}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(String(res.status));
      places = geoapifyPlaces(await res.json());
    } else {
      const base = String((env && env.PHOTON_URL) || PHOTON_DEFAULT).replace(/\/$/, '');
      const near = b === 'se' ? '' : `&lat=${b.split(',')[0]}&lon=${b.split(',')[1]}`;
      const res = await upstreamFetch(`${base}/api/?q=${encodeURIComponent(q)}&limit=10&bbox=${SWEDEN_BBOX}${near}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'alltiditid.se (reseplanerare)' },
      });
      if (!res.ok) throw new Error(String(res.status));
      places = photonPlaces(await res.json());
    }
  } catch {
    return { places: [], source };
  } finally {
    clearTimeout(timer);
  }
  const data = { places: places.slice(0, 8), source };
  await cachePut(cacheKey, jsonResponse(data, 200, { 'Cache-Control': 'public, max-age=604800' }), context);
  return data;
}

/** GET action=places&q=…[&lat=&lon=]: platser och adresser till förslagen under "Vart ska du?". */
async function handlePlaces(url, env, context) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const bias = inSweden(lat, lon) ? { lat, lon } : null;
  const data = await lookupPlaces(q, env, context, bias);
  return jsonResponse({ places: rankPlaces(q, data.places).slice(0, 5), source: data.source }, 200, {
    'Cache-Control': 'public, max-age=3600',
  });
}

/**
 * POST action=plan med { to, fromId?, fromName?, lat?, lon? }.
 * Hela resan från där man står (eller från en hållplats) till vad som helst man skrev:
 * en hållplats, en adress eller en plats. Gång till första hållplatsen räknas in.
 * Positionen skickas i innehållet, inte i adressen, och sparas inte.
 */
/** Ett valt förslag från klienten: { kind: 'stop', id, name } eller { kind: 'poi'|'address'|'area', lat, lon, name }. */
function parseChosenPlace(p) {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.name || '').trim().slice(0, 100);
  if (!name) return null;
  const detail = String(p.detail || '').trim().slice(0, 100);
  if (p.kind === 'stop' && /^\d{6,12}$/.test(String(p.id || '').split(',')[0])) {
    return { kind: 'stop', id: String(p.id).split(',')[0], name, detail };
  }
  const pLat = Number(p.lat);
  const pLon = Number(p.lon);
  if (!inSweden(pLat, pLon)) return null;
  const placeKind = ['poi', 'address', 'area'].includes(p.kind) ? p.kind : 'address';
  const type = /^[a-z_]{1,30}$/.test(String(p.type || '')) ? String(p.type) : '';
  return { kind: 'coord', lat: pLat, lon: pLon, name, detail, placeKind, type };
}

async function handlePlan(request, keys, context) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Använd POST.' }, 405, { Allow: 'POST' });
  }
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const to = String((body && body.to) || '').trim().slice(0, 100);
  const lat = Number(body && body.lat);
  const lon = Number(body && body.lon);
  const fromId = String((body && body.fromId) || '').split(',')[0].trim();
  const fromName = String((body && body.fromName) || '').trim().slice(0, 80);
  const fromCoord = inSweden(lat, lon);
  // Valfri tid: ett datum och en tid, och om tiden gäller avgång eller senaste ankomst.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body && body.date)) ? String(body.date) : '';
  const time = /^\d{2}:\d{2}$/.test(String(body && body.time)) ? String(body.time) : '';
  const arrive = Boolean(body && body.arrive) && Boolean(time);
  const when = `${date ? `&date=${date}` : ''}${time ? `&time=${time}` : ''}${arrive ? '&searchForArrival=1' : ''}`;
  if (to.length < 2) return jsonResponse({ error: 'Skriv vart du ska.' }, 400);
  if (!fromCoord && !/^\d{6,12}$/.test(fromId)) return jsonResponse({ error: 'Välj var du startar.' }, 400);
  if (!keys.resrobot) return jsonResponse({ error: 'Reseplaneraren är inte konfigurerad.' }, 501);

  const env = context && context.env;
  // Ett valt förslag: hållplatsens id eller platsens koordinater. Då behövs ingen sökning.
  const chosen = parseChosenPlace(body && body.place);
  const origin = fromCoord ? `c${lat.toFixed(3)},${lon.toFixed(3)}` : `s${fromId}`;
  const target = chosen ? (chosen.kind === 'stop' ? `id${chosen.id}` : `c${chosen.lat.toFixed(4)},${chosen.lon.toFixed(4)}`) : to.toLowerCase();
  const cacheKey = new Request(
    `https://cache.alltiditid.se/plan-v3/${origin}/${encodeURIComponent(target)}/${date || 'idag'}/${time || 'nu'}/${arrive ? 'framme' : 'avgang'}`
  );
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return jsonResponse(await cached.json(), 200, { 'Cache-Control': 'no-store' });
    } catch {
      // Hämta på nytt nedan
    }
  }
  if (!(await allowCall(env, 'resrobot-plan', PLAN_CALLS_PER_DAY))) {
    return jsonResponse({ error: 'Reseplaneraren har nått dagens gräns. Försök igen i morgon.' }, 429);
  }

  const rr = (path) =>
    upstreamFetch(`${RESROBOT_BASE}/${path}&format=json&lang=sv&accessId=${encodeURIComponent(keys.resrobot)}`).then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    });

  let dest = chosen;
  let sure = Boolean(chosen);
  let alternatives = [];
  if (!dest) {
    // Hållplatser och adresser från ResRobot, och namngivna platser (hotell, arenor) från
    // OpenStreetMap, jämförda med det man skrev. Den som passar bäst vinner, inte bara
    // ResRobots första träff: "Clarion sign" ska bli Clarion Hotel Sign, inte Sigtuna busstation.
    // Gatuadress (har en siffra): leta bland adresser först. type=A är HAFAS sätt att be om adresser.
    const lookups = /\d/.test(to) ? ['&type=A', ''] : ['', '&type=A'];
    // Positionen skickas inte vidare till platssökningen.
    const placesP = lookupPlaces(to, env, context, null).catch(() => ({ places: [] }));
    const fromRr = [];
    let failed = false;
    for (const type of lookups) {
      try {
        fromRr.push(...destinationCandidates(await rr(`location.name?input=${encodeURIComponent(to)}&maxNo=5${type}`)));
      } catch {
        failed = true;
      }
      if (rankPlaces(to, fromRr)[0]?.score >= SURE) break;
    }
    const ranked = rankPlaces(to, [...fromRr, ...(await placesP).places]);
    if (ranked[0] && ranked[0].score >= SURE) {
      dest = ranked[0];
      sure = true;
    } else if (ranked[0]) {
      dest = ranked[0];
    } else if (fromRr[0]) {
      // Inget passar orden: ta ResRobots egen gissning, men säg det.
      dest = fromRr[0];
    }
    if (!dest && failed) return jsonResponse({ error: 'Kunde inte söka just nu.' }, 502);
    if (!dest) return jsonResponse({ error: `Hittade ingen plats som heter ${to}.` }, 404);
    alternatives = ranked
      .filter((p) => p !== dest)
      .slice(0, 3)
      .map(({ kind, id, name, detail, type, lat: pLat, lon: pLon }) => ({ kind, id, name, detail, type, lat: pLat, lon: pLon }));
    if (dest.kind !== 'stop') dest = { ...dest, kind: 'coord', placeKind: dest.kind };
  }

  const destPart = dest.kind === 'stop' ? `destId=${dest.id}` : `destCoordLat=${dest.lat}&destCoordLong=${dest.lon}`;
  const originPart = (id) =>
    fromCoord ? `originCoordLat=${lat.toFixed(5)}&originCoordLong=${lon.toFixed(5)}` : `originId=${id}`;
  const tripFrom = async (id) => mapTrips(await rr(`trip?${originPart(id)}&${destPart}${when}&numF=4&passlist=0`), { clean: (n) => cleanPlaceName(n) || n });

  let trips = [];
  try {
    trips = await tripFrom(fromId);
  } catch {
    trips = [];
  }
  // Samlade stationer (740098…) känner ResRobot inte alltid till: leta upp hållplatsen på namnet.
  if (trips.length === 0 && !fromCoord && fromName) {
    try {
      const alt = pickDestination(await rr(`location.name?input=${encodeURIComponent(fromName)}&maxNo=3`));
      if (alt && alt.kind === 'stop' && alt.id !== fromId) trips = await tripFrom(alt.id);
    } catch {
      trips = [];
    }
  }
  // På landet: ingen hållplats inom gångavstånd från positionen. Planera från närmaste hållplats
  // inom 10 km och säg hur långt bort den ligger, i stället för "ingen resa".
  let farStart = null;
  if (trips.length === 0 && fromCoord) {
    try {
      const near = await rr(`location.nearbystops?originCoordLat=${lat.toFixed(4)}&originCoordLong=${lon.toFixed(4)}&r=10000&maxNo=3`);
      const list = Array.isArray(near.stopLocationOrCoordLocation)
        ? near.stopLocationOrCoordLocation.map((i) => i && i.StopLocation).filter((x) => x && x.extId)
        : [];
      for (const st of list) {
        const t = mapTrips(await rr(`trip?originId=${st.extId}&${destPart}${when}&numF=4&passlist=0`), { clean: (n) => cleanPlaceName(n) || n });
        if (t.length) {
          trips = t;
          farStart = {
            name: tidyStopName(st.name),
            meters: Number.isFinite(Number(st.dist)) ? Math.round(Number(st.dist)) : Math.round(distanceMeters(lat, lon, Number(st.lat), Number(st.lon))),
          };
          break;
        }
      }
    } catch {
      // Då blir det "ingen resa" nedan
    }
  }
  if (trips.length === 0) return jsonResponse({ error: `Hittade ingen resa till ${dest.name}.`, to: dest.name }, 404);

  const data = {
    ...(farStart ? { farStart } : {}),
    to: cleanPlaceName(dest.name) || dest.name,
    // Vad texten tolkades som, så att man ser det innan man åker: hållplats, plats eller adress.
    toKind: dest.kind === 'stop' ? 'stop' : dest.placeKind || 'address',
    toDetail: dest.detail || '',
    toType: dest.type || '',
    sure,
    ...(alternatives.length ? { alternatives } : {}),
    fromHere: fromCoord,
    date,
    time,
    arrive,
    trips,
  };
  await cachePut(cacheKey, jsonResponse(data, 200, { 'Cache-Control': 'public, max-age=60' }), context);
  return jsonResponse(data, 200, { 'Cache-Control': 'no-store' });
}

async function handleNearby(request, keys, context) {
  // Positionen skickas i anropets innehåll (POST), inte i adressen, så att den
  // inte hamnar i loggar, webbläsarhistorik eller mellanlagringar som sparar adresser.
  if (request.method !== 'POST') {
    return jsonResponse({ stops: [], error: 'Använd POST med { lat, lon }.' }, 405, { Allow: 'POST' });
  }
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  let lat = Number(body && body.lat);
  let lon = Number(body && body.lon);
  // Utan position: man skriver var man är (hållplats eller adress), och den platsen används i stället.
  let place = null;
  const q = typeof body?.q === 'string' ? body.q.trim().slice(0, 80) : '';
  if (q.length >= 2) {
    if (!keys.resrobot) return jsonResponse({ stops: [], error: 'Sök nära mig är inte konfigurerat.' }, 501);
    const found = [];
    for (const type of /\d/.test(q) ? ['&type=A', ''] : ['', '&type=A']) {
      try {
        const r = await upstreamFetch(
          `${RESROBOT_BASE}/location.name?input=${encodeURIComponent(q)}&maxNo=5${type}&format=json&accessId=${encodeURIComponent(keys.resrobot)}`
        );
        if (r.ok) found.push(...destinationCandidates(await r.json()).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon)));
      } catch {
        // Prova nästa sorts träff
      }
      if (rankPlaces(q, found)[0]?.score >= SURE) break;
    }
    const best = rankPlaces(q, found)[0] || found[0];
    if (!best) return jsonResponse({ stops: [], error: `Hittade ingen plats som heter ”${q}”.` }, 404);
    lat = best.lat;
    lon = best.lon;
    place = { name: best.name, lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) };
  }
  // Ungefär Sveriges utbredning; allt annat är fel eller utanför trafikdatan.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 55 || lat > 69.2 || lon < 10.5 || lon > 24.3) {
    return jsonResponse({ stops: [], error: 'Positionen ligger utanför Sverige.' }, 400);
  }
  if (!keys.resrobot) {
    return jsonResponse({ stops: [], error: 'Sök nära mig är inte konfigurerat.' }, 501);
  }

  // wide: Hem vill se vilka linjer som finns runt en, inte bara de närmaste busshållplatserna.
  // Då hämtas fler hållplatser inom 2 km, och den närmaste per trafikslag väljs ut.
  const wide = Boolean(body && body.wide);
  const rLat = lat.toFixed(3);
  const rLon = lon.toFixed(3);
  const cacheKey = new Request(`https://cache.alltiditid.se/nearby-v1${wide ? '-wide' : ''}/${rLat},${rLon}`);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      const data = await cached.json();
      return jsonResponse(place ? { ...data, place } : data, 200, { 'Cache-Control': 'no-store' });
    } catch {
      // Hämta på nytt nedan
    }
  }

  const fetchStops = async (r, maxNo) => {
    const res = await upstreamFetch(
      `${RESROBOT_BASE}/location.nearbystops?originCoordLat=${rLat}&originCoordLong=${rLon}` +
        `&r=${r}&maxNo=${maxNo}&format=json&accessId=${encodeURIComponent(keys.resrobot)}`
    );
    if (!res.ok) throw new Error(`Trafiklab svarade med status ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.stopLocationOrCoordLocation)
      ? data.stopLocationOrCoordLocation.map((item) => item && item.StopLocation).filter(Boolean)
      : Array.isArray(data.StopLocation)
      ? data.StopLocation
      : [];
  };
  let raw;
  try {
    raw = await fetchStops(wide ? 2000 : 1500, wide ? 80 : 10);
    // På landet: ingen hållplats inom 2 km betyder inte att det saknas en väg. Leta upp till 10 km
    // (ResRobots max), så att man alltid får den närmaste hållplatsen att gå eller åka till.
    if (wide && raw.length === 0) raw = await fetchStops(10000, 12);
  } catch (err) {
    return jsonResponse({ stops: [], error: err.message }, 502);
  }

  const seen = new Set();
  const all = raw
    .filter((st) => st && st.extId)
    .map((st) => ({
      id: String(st.extId),
      name: tidyStopName(st.name),
      distance: Number.isFinite(Number(st.dist))
        ? Math.round(Number(st.dist))
        : Math.round(distanceMeters(lat, lon, Number(st.lat), Number(st.lon))),
      modes: stopModes(st),
    }))
    .filter((st) => st.name && !seen.has(st.id) && seen.add(st.id))
    .sort((a, b) => a.distance - b.distance);
  const stops = wide ? pickByMode(all) : all.slice(0, 6).map(({ modes, ...rest }) => rest);

  // Cloudflare-cachen (nyckel = avrundad position) får spara svaret i 5 min, men
  // webbläsare och mellanled ska inte göra det.
  await cachePut(
    cacheKey,
    jsonResponse({ stops }, 200, { 'Cache-Control': 'max-age=300' }),
    context
  );
  return jsonResponse(place ? { stops, place } : { stops }, 200, { 'Cache-Control': 'no-store' });
}

/** ResRobots produktmask (products, eller cls i productAtStop) → trafikslag vid hållplatsen. */
function stopModes(st) {
  let mask = Number(st && st.products) || 0;
  for (const p of Array.isArray(st && st.productAtStop) ? st.productAtStop : []) mask |= Number(p && p.cls) || 0;
  const out = [];
  if (mask & (2 | 4)) out.push('train');
  if (mask & 16) out.push('commuter');
  if (mask & 32) out.push('subway');
  if (mask & 64) out.push('tram');
  if (mask & (8 | 128)) out.push('bus');
  if (mask & 256) out.push('ferry');
  // Ingen produktmask i svaret: gissa på namnet ("Fruängen T-bana", "Älvsjö station").
  if (out.length === 0) {
    const n = String((st && st.name) || '').toLowerCase();
    if (/t-bana|tunnelbana/.test(n)) out.push('subway');
    else if (/station|centralstation|\bc\b/.test(n)) out.push('train');
    else if (/brygga|färjeläge|kaj/.test(n)) out.push('ferry');
    else out.push('bus');
  }
  return out;
}

/**
 * Hem: de tre närmaste hållplatserna, plus den närmaste för varje annat trafikslag
 * (T-bana, pendeltåg, tåg, spårvagn, båt) inom 2 km. Högst sex, närmast först.
 */
export function pickByMode(all) {
  const picked = all.slice(0, 3);
  for (const mode of ['subway', 'commuter', 'train', 'tram', 'ferry']) {
    if (picked.some((p) => (p.modes || []).includes(mode))) continue;
    const hit = all.find((st) => (st.modes || []).includes(mode));
    if (hit && !picked.includes(hit)) picked.push(hit);
  }
  return picked.slice(0, 6).sort((a, b) => a.distance - b.distance);
}

/** Max antal hållplatser som kan slås ihop till en tavla (t.ex. Göteborg C). */
const MAX_COMBINED_STOPS = 4;

/** Kort hållplatsnamn utan ortsprefix, för att visa vilken del av en sammanslagen tavla. */
function shortStopLabel(name) {
  return String(name || '')
    .split('/')[0]
    .replace(/^(göteborg|stockholm|malmö)\s+/i, '')
    .trim();
}

/**
 * Tidtabell när realtiden är tom: Trafiklab Realtime visar bara en kort stund framåt, så
 * på landsbygden (Vilhelmina, Arjeplog) blev tavlan tom fast bussen går om två timmar.
 * Då frågas ResRobot med ett längre fönster. Högst så här många gånger per dygn, eftersom
 * ResRobot-nyckeln har en mindre kvot.
 */
const TIMETABLE_FALLBACK_MINUTES = 360;
const TIMETABLE_FALLBACK_PER_DAY = 300;
/** En tom eller tidtabellsbaserad tavla ändras sällan: cacha den längre (sekunder). */
const TIMETABLE_CACHE_SECONDS = 120;

/** Hämtar en hållplats tavla: Trafiklab Realtime först, ResRobot som reserv. */
async function fetchOneBoard(keys, stopId, direction, at, context) {
  let lastError = null;
  if (keys.realtime) {
    try {
      const board = await realtimeBoard(keys.realtime, stopId, direction, at);
      if (board.departures.length === 0 && keys.resrobot && !at) {
        const env = context && context.env;
        if (await allowCall(env, 'resrobot-tidtabell', TIMETABLE_FALLBACK_PER_DAY)) {
          try {
            const timetable = await resrobotBoard(keys.resrobot, stopId, direction, TIMETABLE_FALLBACK_MINUTES);
            if (timetable.departures.length > 0) {
              return {
                ...timetable,
                stopName: board.stopName,
                coords: board.coords,
                stopId,
                source: 'resrobot',
                timetable: true,
              };
            }
          } catch {
            // Tidtabellen gick inte att hämta: visa den tomma realtidstavlan.
          }
        }
        return { ...board, stopId, source: 'trafiklab-realtime', timetable: true };
      }
      return { ...board, stopId, source: 'trafiklab-realtime' };
    } catch (err) {
      lastError = err;
    }
  }
  if (keys.resrobot) {
    try {
      const board = await resrobotBoard(keys.resrobot, stopId, direction);
      return { ...board, stopId, source: 'resrobot' };
    } catch (err) {
      lastError = err;
    }
  }
  return { stopId, error: lastError || new Error('Kunde inte hämta trafikinformation just nu.') };
}

/** Lägger Västtrafiks realtid på en hållplats avgångar (om det behövs). */
// ---------------------------------------------------------------------------
// SL Transport API (realtid för SL, ingen nyckel)
// ---------------------------------------------------------------------------
//
// Trafiklab saknar ofta realtid för SL:s bussar och tunnelbana. SL:s eget API har
// prognoser för nästan alla avgångar men egna "site"-id:n, så Trafiklab-hållplatsen
// översätts till närmaste SL-site (via koordinater och namn) och cachas en vecka.

const SL_BASE = 'https://transport.integration.sl.se/v1';
const SL_SITE_MAX_METERS = 400;
const SL_FORECAST_MIN = 60;

function isSlDeparture(d) {
  if (/^sl$|storstockholms lokaltrafik/i.test(String(d._agency || '').trim())) return true;
  // Okänd operatör men inom Stockholms län: prova också. Matchningen kräver ändå samma
  // linje och samma ordinarie minut hos SL, så andra bolags turer påverkas inte.
  const c = d._coords;
  return Boolean(
    c && !isVasttrafikDeparture(d) && c.lat > 58.7 && c.lat < 60.3 && c.lon > 17.2 && c.lon < 19.4
  );
}

function slNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(t-bana|tunnelbana|station|stockholm)\b/g, '')
    .replace(/[^a-zåäö0-9]/g, '');
}

/** Alla SL-sites som [id, namn, lat, lon], cachat ett dygn (originalet är 1,3 MB). */
async function fetchSlSites(context) {
  const cacheKey = new Request('https://cache.alltiditid.se/sl/sites-v1');
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return await cached.json();
    } catch {
      // Hämta om nedan
    }
  }
  const res = await upstreamFetch(`${SL_BASE}/sites`);
  if (!res.ok) throw new Error(`SL sites ${res.status}`);
  const data = await res.json();
  const compact = (Array.isArray(data) ? data : [])
    .filter((x) => x && x.id && typeof x.lat === 'number' && typeof x.lon === 'number')
    .map((x) => [x.id, String(x.name || ''), x.lat, x.lon]);
  await cachePut(
    cacheKey,
    new Response(JSON.stringify(compact), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
    }),
    context
  );
  return compact;
}

/** Trafiklab-hållplats → SL-site-id (eller null). Samma namn vinner, annars närmast. */
async function findSlSite(stopId, name, coords, context) {
  const cacheKey = new Request(`https://cache.alltiditid.se/sl/site-v1/${encodeURIComponent(stopId)}`);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return (await cached.json()).site;
    } catch {
      // Slå upp igen
    }
  }
  if (!coords) return null;
  const sites = await fetchSlSites(context);
  const wanted = slNameKey(name);
  let best = null;
  for (const [id, siteName, lat, lon] of sites) {
    const dist = distanceMeters(coords.lat, coords.lon, lat, lon);
    if (dist > SL_SITE_MAX_METERS) continue;
    // Samma namn räknas som 300 m närmare, så att "Gullmarsplan" slår en busshållplats intill.
    const score = dist - (wanted && slNameKey(siteName) === wanted ? 300 : 0);
    if (!best || score < best.score) best = { id, score };
  }
  const site = best ? best.id : null;
  await cachePut(
    cacheKey,
    new Response(JSON.stringify({ site }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${site ? 7 * 86400 : 86400}`,
      },
    }),
    context
  );
  return site;
}

/** SL:s avgångar som karta "linje|YYYY-MM-DDTHH:MM" → prognos. */
async function fetchSlUpdates(site) {
  const res = await upstreamFetch(`${SL_BASE}/sites/${encodeURIComponent(site)}/departures?forecast=${SL_FORECAST_MIN}`);
  if (!res.ok) throw new Error(`SL departures ${res.status}`);
  const data = await res.json();
  const updates = new Map();
  for (const dep of Array.isArray(data.departures) ? data.departures : []) {
    const designation = String(dep?.line?.designation || '').trim().toLowerCase();
    const scheduled = String(dep?.scheduled || '').slice(0, 16);
    if (!designation || !scheduled) continue;
    const display = String(dep.display || '').trim();
    updates.set(`${designation}|${scheduled}`, {
      // SL visar nedräkning ("Nu", "4 min") när de har en prognos och klockslag annars.
      hasRealtime: display !== '' && !/^\d{1,2}:\d{2}$/.test(display),
      expected: String(dep.expected || '').slice(0, 16),
      cancelled: String(dep.state || '').toUpperCase() === 'CANCELLED',
      platform: String(dep?.stop_point?.designation || '').trim(),
      deviation: slDeviationText(dep.deviations),
    });
  }
  // Störningar för hela hållplatsen, med vilka linjer de gäller ("Gröna linjen: …").
  updates.disruptions = (Array.isArray(data.stop_deviations) ? data.stop_deviations : [])
    .map((dev) => ({
      text: String(dev?.message || '').trim(),
      importance: Number(dev?.importance_level) || 9,
      designations: (dev?.scope?.lines || [])
        .map((l) => String(l?.designation || '').trim().toLowerCase())
        .filter(Boolean),
    }))
    .filter((dev) => dev.text);
  return updates;
}

/** SL:s avvikelser på en avgång, den viktigaste först (lägre importance_level = viktigare). */
function slDeviationText(deviations) {
  if (!Array.isArray(deviations)) return '';
  return deviations
    .filter((d) => d && d.message)
    .sort((a, b) => (Number(a.importance_level) || 9) - (Number(b.importance_level) || 9))
    .map((d) => String(d.message).trim())
    .slice(0, 1)
    .join('');
}

/** Lägger SL:s prognos på en SL-avgång som saknar realtid hos Trafiklab. */
function applySl(departure, updates) {
  if (!updates || updates.size === 0 || !isSlDeparture(departure)) return departure;
  const des = String(departure._designation || '').trim().toLowerCase();
  const match = des ? updates.get(`${des}|${departure._scheduledLocal}`) : null;
  if (!match) return departure;
  // Har Trafiklab redan realtid behålls deras tider; SL bidrar bara med avvikelsetext.
  if (departure.hasRealtime) {
    return match.deviation && !departure.deviation ? { ...departure, deviation: match.deviation } : departure;
  }

  const result = { ...departure };
  if (match.deviation && !result.deviation) result.deviation = match.deviation;
  if (match.platform && !result.track) result.track = trackLabelFor(match.platform, departure.transportMode);
  if (match.cancelled) {
    result.status = 'cancelled';
    result.hasRealtime = true;
    result.newTime = '';
    result.delayMinutes = 0;
    result.estimatedTime = result.scheduledTime;
    return result;
  }
  if (!match.hasRealtime) return result;
  const offset = minutesBetweenLocal(departure._scheduledLocal, match.expected);
  if (offset === null) return result;
  result.hasRealtime = true;
  result._offsetMin = offset;
  if (offset > 0) {
    result.status = 'delayed';
    result.delayMinutes = offset;
    result.newTime = match.expected.slice(11, 16);
    result.estimatedTime = result.newTime;
  } else {
    result.status = 'on-time';
    result.newTime = '';
    result.delayMinutes = 0;
  }
  return result;
}

async function overlaySl(board, fallbackName, direction, context) {
  const none = { departures: board.departures, disruptions: [] };
  // SL:s API har bara avgångar, inte ankomster.
  if (direction === 'arrivals') return none;
  if (!board.departures.some((d) => isSlDeparture(d))) return none;
  try {
    const coords = board.departures.find((d) => isSlDeparture(d) && d._coords)?._coords || null;
    const site = await findSlSite(board.stopId, board.stopName || fallbackName, coords, context);
    if (!site) return none;
    const updates = await fetchSlUpdates(site);
    const departures = board.departures.map((d) => applySl(d, updates));
    // Hållplatsens störningar, bara för linjer som faktiskt går här.
    const disruptions = (updates.disruptions || [])
      .map((dev) => ({
        text: dev.text,
        importance: dev.importance,
        lines: Array.from(
          new Set(
            departures
              .filter((d) => dev.designations.includes(String(d._designation || '').trim().toLowerCase()))
              .map((d) => d.line)
          )
        ),
      }))
      .filter((dev) => dev.lines.length > 0);
    return { departures, disruptions };
  } catch {
    // Utan SL-data visas Trafiklabs uppgifter som förut.
    return none;
  }
}

async function overlayVasttrafik(keys, board, fallbackName, direction, context) {
  const diag = { stopId: board.stopId, status: 'ej använd' };
  const needs = board.departures.some((d) => isVasttrafikDeparture(d) && !d.hasRealtime);
  if (!needs) return { departures: board.departures, diag };
  if (!keys.vasttrafikKey || !keys.vasttrafikSecret) {
    diag.status = 'nycklar saknas';
    return { departures: board.departures, diag };
  }
  try {
    const coords =
      board.departures.find((d) => isVasttrafikDeparture(d) && d._coords)?._coords || null;
    const updates = await fetchVasttrafikUpdates(
      keys,
      board.stopId,
      [board.stopName, fallbackName].filter(Boolean),
      coords,
      direction,
      context,
      diag
    );
    const departures = board.departures.map((d) => applyVasttrafik(d, updates));
    diag.matched = departures.filter((d) => isVasttrafikDeparture(d) && d.hasRealtime).length;
    return { departures, diag };
  } catch (err) {
    diag.status = 'fel';
    diag.message = String((err && err.message) || err);
    return { departures: board.departures, diag };
  }
}

/**
 * Försening räknas från så här många minuter. Tåg visas från första minuten, som på
 * stationsskyltarna. Buss, spårvagn, tunnelbana och båt först från 3 minuter, annars
 * blir nästan varje SL-buss "försenad" av en minut. Nedräkningen visar ändå den
 * verkliga tiden.
 */
const DELAY_THRESHOLD_RAIL_MIN = 1;
const DELAY_THRESHOLD_OTHER_MIN = 3;
/** Så många minuter före tidtabell märks avgången "tidig" (tåg respektive övrigt). */
const EARLY_THRESHOLD_RAIL_MIN = 1;
const EARLY_THRESHOLD_OTHER_MIN = 2;

/** Tar bort tomma fält (viaStops: [], deviation: "" …) som annars skickas på varje rad. */
function compactDeparture(d) {
  const out = {};
  for (const [key, value] of Object.entries(d)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if ((key === 'delayMinutes' || key === 'earlyMinutes') && !value) continue;
    out[key] = value;
  }
  return out;
}

/** Sätter expectedAt, tar bort småförseningar och märker tidiga avgångar. */
function finalizeTiming(d) {
  const rail = d.transportMode === 'train' || d.transportMode === 'commuter';
  const cancelled = d.status === 'cancelled';
  const offset = cancelled
    ? 0
    : typeof d._offsetMin === 'number'
    ? d._offsetMin
    : d.status === 'delayed'
    ? d.delayMinutes || 0
    : 0;
  // Förväntad tid i svensk lokal tid, så att klienten räknar ner rätt och döljer det som gått.
  const expectedAt = addMinutesLocal(d._scheduledLocal, offset) || undefined;
  const expectedClock = expectedAt ? expectedAt.slice(11, 16) : '';
  const result = { ...d, expectedAt };

  // En försening visar alltid samma minut som nedräkningen räknar mot.
  if (result.status === 'delayed' && expectedClock && offset > 0) {
    result.newTime = expectedClock;
    result.estimatedTime = expectedClock;
    result.delayMinutes = offset;
  }

  const threshold = rail ? DELAY_THRESHOLD_RAIL_MIN : DELAY_THRESHOLD_OTHER_MIN;
  if (result.status === 'delayed' && offset < threshold) {
    result.status = 'on-time';
    result.newTime = '';
    result.delayMinutes = 0;
    result.estimatedTime = expectedClock || result.scheduledTime;
  }
  // Klocktiden följer prognosen, så att den stämmer med nedräkningen.
  if (!cancelled && result.status === 'on-time' && expectedClock) result.estimatedTime = expectedClock;
  if (!cancelled && result.status === 'on-time' && offset <= -(rail ? EARLY_THRESHOLD_RAIL_MIN : EARLY_THRESHOLD_OTHER_MIN) && expectedClock) {
    result.earlyMinutes = -offset;
    result.estimatedTime = expectedClock;
  }
  return result;
}

/** Avvikelser som hör till en enda tur och stannar på raden. */
const ROW_ONLY_DEVIATION = /^(går inte hela vägen|inställd)/i;
const MAX_DISRUPTIONS = 4;

/**
 * A4: en störning som står på flera rader ("Förseningar och inställda avgångar" på
 * varje 17, 18 och 19) flyttas till en ruta överst med de linjer den gäller. Det som
 * bara gäller en tur ("Går inte hela vägen", "Kort tåg" på ett tåg) står kvar på raden.
 */
function groupDisruptions(departures, stopDisruptions = []) {
  const byText = new Map();
  for (const d of departures) {
    for (const part of String(d.deviation || '').split(' • ').map((x) => x.trim()).filter(Boolean)) {
      if (ROW_ONLY_DEVIATION.test(part)) continue;
      const entry = byText.get(part) || { text: part, lines: new Set(), rows: 0, importance: 5, onRows: true };
      entry.lines.add(d.line);
      entry.rows += 1;
      byText.set(part, entry);
    }
  }
  for (const dev of stopDisruptions) {
    const entry = byText.get(dev.text) || { text: dev.text, lines: new Set(), rows: 2, importance: dev.importance, onRows: false };
    for (const line of dev.lines) entry.lines.add(line);
    entry.rows = Math.max(entry.rows, 2);
    entry.importance = Math.min(entry.importance, dev.importance);
    byText.set(dev.text, entry);
  }
  const shared = new Set(Array.from(byText.values()).filter((e) => e.rows >= 2).map((e) => e.text));
  const disruptions = Array.from(byText.values())
    .filter((e) => shared.has(e.text))
    // Det som syns på avgångarna just nu först, sedan hållplatsens allmänna information.
    .sort((a, b) => Number(b.onRows) - Number(a.onRows) || a.importance - b.importance || b.rows - a.rows)
    .slice(0, MAX_DISRUPTIONS)
    .map((e) => ({ text: e.text, lines: Array.from(e.lines).sort(compareLines) }));
  const outDepartures = departures.map((d) => {
    if (!d.deviation) return d;
    const rest = String(d.deviation)
      .split(' • ')
      .map((x) => x.trim())
      .filter((x) => x && !shared.has(x));
    return { ...d, deviation: rest.join(' • ') || undefined };
  });
  return { departures: outDepartures, disruptions };
}

/** "Gröna linjen 17" < "Gröna linjen 18" < "Buss 4" < "Buss 160", numeriskt inom samma namn. */
function compareLines(a, b) {
  const ma = /^(.*?)(\d+)\D*$/.exec(a);
  const mb = /^(.*?)(\d+)\D*$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
  return a.localeCompare(b, 'sv');
}

async function handleBoard(url, keys, context) {
  const stopParam = url.searchParams.get('stopId') || '740000001';
  // Vägfärjornas färjelägen har egen källa (Trafikverket).
  if (stopParam.startsWith(FERRY_PREFIX)) return await handleFerryBoard(url, keys);
  const clientStopName = url.searchParams.get('stopName') || '';
  const mode = url.searchParams.get('mode') || 'all';
  const direction = url.searchParams.get('direction') === 'arrivals' ? 'arrivals' : 'departures';

  // stopId kan vara flera id:n separerade med komma, t.ex. Göteborg C =
  // järnvägsstationen + spårvagnshållplatserna + bussterminalen.
  const stopIds = Array.from(
    new Set(
      stopParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_COMBINED_STOPS);
  const combined = stopIds.length > 1;

  const atParam = url.searchParams.get('time') || '';
  const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(atParam) ? atParam : '';
  const results = await Promise.all(stopIds.map((id) => fetchOneBoard(keys, id, direction, at, context)));
  const boards = results.filter((b) => !b.error);
  if (boards.length === 0) {
    const err = results[0] && results[0].error;
    return jsonResponse(
      { error: err ? err.message : 'Kunde inte hämta trafikinformation just nu.' },
      502
    );
  }

  // Västtrafik per hållplats (varje del har sitt eget hållplatsområde hos Västtrafik).
  let all = [];
  const stopDisruptions = [];
  for (const board of boards) {
    const { departures: vtDepartures } = await overlayVasttrafik(
      keys,
      board,
      combined ? '' : clientStopName,
      direction,
      context
    );
    const { departures, disruptions: slDisruptions } = await overlaySl(
      { ...board, departures: vtDepartures },
      combined ? '' : clientStopName,
      direction,
      context
    );
    stopDisruptions.push(...slDisruptions);
    const label = combined ? shortStopLabel(board.stopName) : '';
    // Stationen att slå upp hos Trafikverket: varje del för sig i en sammanslagen tavla
    // (t.ex. Arlanda C, Arlanda Södra och Arlanda Norra), annars namnet från klienten.
    const tvStation = combined ? board.stopName : clientStopName || board.stopName;
    all = all.concat(
      departures.map((d) =>
        combined
          ? { ...d, id: `${board.stopId}-${d.id}`, stopLabel: label, _tvStation: tvStation }
          : { ...d, _tvStation: tvStation }
      )
    );
  }

  if (combined) {
    all.sort((a, b) =>
      String(a._scheduledLocal || '').localeCompare(String(b._scheduledLocal || ''))
    );
  }

  // Trafikverket för tågen, en uppslagning per station.
  const trainsByStation = new Map();
  for (const d of all) {
    if (d.transportMode !== 'train' && d.transportMode !== 'commuter') continue;
    const list = trainsByStation.get(d._tvStation) || [];
    list.push(...(d._trainCandidates || []));
    trainsByStation.set(d._tvStation, list);
  }
  const tvByStation = new Map();
  if (keys.trafikverket) {
    await Promise.all(
      Array.from(trainsByStation, async ([station, numbers]) => {
        tvByStation.set(
          station,
          await fetchTrafikverketStationUpdates(keys.trafikverket, station, numbers, direction, context)
        );
      })
    );
  }

  // Tåg som Trafiklab saknar (stående tåg, tåg mer än en timme fram), från Trafikverket.
  if (keys.trafikverket && (mode === 'all' || mode === 'train')) {
    const known = all.flatMap((d) => (d._trainCandidates || []).map((n) => String(n || '').trim()));
    const tvStations = Array.from(new Set(all.map((d) => d._tvStation).filter(Boolean)));
    if (tvStations.length === 0) tvStations.push(url.searchParams.get('stopName') || '');
    const extra = (
      await Promise.all(
        tvStations.slice(0, 4).map((st) => trafikverketMissing(keys.trafikverket, st, direction, known, context))
      )
    ).flat();
    const seen = new Set();
    for (const d of extra) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      all.push(d);
    }
  }

  const timed = all
    .filter((d) => mode === 'all' || d.transportMode === mode)
    .map((d) => applyTrafikverket(d, tvByStation.get(d._tvStation) || new Map(), d._trainCandidates || []))
    .map(finalizeTiming)
    // Det som går först står först: sortera på förväntad tid, sedan ordinarie.
    .sort(
      (a, b) =>
        String(a.expectedAt || a._scheduledLocal || '').localeCompare(String(b.expectedAt || b._scheduledLocal || '')) ||
        String(a._scheduledLocal || '').localeCompare(String(b._scheduledLocal || ''))
    );

  // Förseningshistorik (lib/history.mjs): turer som går nu sparas i D1, efter svaret.
  const db = context && context.env ? context.env.HISTORY : null;
  if (db && direction === 'departures' && mode === 'all') {
    const nowIso = new Date().toISOString();
    const rows = historyRows({
      stopId: stopParam,
      stopName: url.searchParams.get('stopName') || '',
      source: boards[0].source,
      departures: timed,
      nowLocal: swedishDateTime(nowIso),
      seenAt: nowIso,
    });
    if (rows.length && context.waitUntil) context.waitUntil(saveHistory(db, rows));
  }

  const departures = timed
    .map(
      ({ _trainCandidates, _scheduledLocal, _agency, _designation, _coords, _tvStation, _offsetMin, ...rest }) =>
        compactDeparture(rest)
    );

  const grouped = groupDisruptions(departures, stopDisruptions);
  // Hållplatsens läge, för "Annat sätt härifrån" (Uber-upphämtning och lånecyklar).
  const coords = timed.find((d) => d._coords)?._coords || boards.find((b) => b.coords)?.coords || null;
  // Tom realtid eller bara tidtabell överallt: ändras sällan, cacha längre.
  const timetableOnly = boards.every((b) => b.timetable);

  return jsonResponse(
    {
      departures: grouped.departures,
      ...(coords ? { stop: { lat: Math.round(coords.lat * 1e5) / 1e5, lon: Math.round(coords.lon * 1e5) / 1e5 } } : {}),
      ...(grouped.disruptions.length ? { disruptions: grouped.disruptions } : {}),
      source: boards[0].source,
      updatedAt: new Date().toISOString(),
      ...(results.length !== boards.length
        ? { partial: results.filter((r) => r.error).map((r) => r.stopId) }
        : {}),
    },
    200,
    { 'Cache-Control': `public, max-age=${timetableOnly ? TIMETABLE_CACHE_SECONDS : BOARD_CACHE_SECONDS}` }
  );
}

// ---------------------------------------------------------------------------
// Flyg från Swedavia (FlightInfo v2) och kötider i säkerhetskontrollen (WaitTime).
//
// Gratisprenumerationen hos Swedavia ger 10 000 anrop per månad, och när de är slut
// fungerar API:t inte resten av månaden (apideveloper.swedavia.se/faq). Det är oklart
// om gränsen gäller per API eller för FlightInfo och WaitTime tillsammans, så de två
// dygnsgränserna nedan räknas så att även summan håller sig under:
// (150 + 150) × 31 = 9 300 anrop per månad.
//
// Ett anrop ger hela dagen för en flygplats och riktning, svaret cachas i 10 minuter
// (kötiderna i 5) och delas av alla besökare, och anropen räknas per dygn i D1.
// Nås gränsen visas den senast hämtade tavlan.
// ---------------------------------------------------------------------------

const FLIGHT_CACHE_SECONDS = 600;
const FLIGHT_STALE_SECONDS = 86400;
const FLIGHT_CALLS_PER_DAY = 150;
const WAIT_CACHE_SECONDS = 300;
const WAIT_CALLS_PER_DAY = 150;
const SWEDAVIA = 'https://api.swedavia.se';

/** Räknar ett anrop och svarar om det ryms i dygnets gräns. Utan D1 tillåts det. */
async function allowCall(env, api, limit) {
  const db = env && env.HISTORY;
  if (!db) return true;
  try {
    const day = new Date().toISOString().slice(0, 10);
    await db
      .prepare('CREATE TABLE IF NOT EXISTS api_calls (day TEXT NOT NULL, api TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, api))')
      .run();
    const row = await db
      .prepare('INSERT INTO api_calls (day, api, n) VALUES (?1, ?2, 1) ON CONFLICT (day, api) DO UPDATE SET n = n + 1 RETURNING n')
      .bind(day, api)
      .first();
    return !row || Number(row.n) <= limit;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Övervakning (lib/health.mjs): varje anrop till en extern källa räknas i minnet
// och skrivs till D1 efter svaret, så att besökaren inte väntar på skrivningen.
// ---------------------------------------------------------------------------

/** Ej skrivna räknare: källa -> { calls, failures }. */
const pendingCounts = new Map();

function countUpstream(url, failed) {
  const source = sourceOf(url);
  const c = pendingCounts.get(source) || { calls: 0, failures: 0 };
  c.calls += 1;
  if (failed) c.failures += 1;
  pendingCounts.set(source, c);
}

/** fetch som räknar anrop och fel per källa. */
async function upstreamFetch(input, init) {
  const url = typeof input === 'string' ? input : input && input.url;
  try {
    const res = await fetch(input, init);
    countUpstream(url, isFailure(res.status));
    return res;
  } catch (err) {
    countUpstream(url, true);
    throw err;
  }
}

/** Skriver räknarna till D1. Misslyckas det tappas de, sajten påverkas inte. */
async function flushUpstreamCounts(env) {
  const db = env && env.HISTORY;
  if (!db || pendingCounts.size === 0) return;
  const rows = [...pendingCounts.entries()];
  pendingCounts.clear();
  try {
    const day = new Date().toISOString().slice(0, 10);
    await db
      .prepare('CREATE TABLE IF NOT EXISTS upstream_calls (day TEXT NOT NULL, source TEXT NOT NULL, calls INTEGER NOT NULL, failures INTEGER NOT NULL, PRIMARY KEY (day, source))')
      .run();
    const stmt = db.prepare(
      'INSERT INTO upstream_calls (day, source, calls, failures) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (day, source) DO UPDATE SET calls = calls + ?3, failures = failures + ?4'
    );
    await db.batch(rows.map(([source, c]) => stmt.bind(day, source, c.calls, c.failures)));
  } catch {
    // Räknarna är bara till för övervakningen.
  }
}

/** Dygnsgränserna i api_calls, så att hälsokontrollen kan se när en är nådd. */
const DAILY_LIMITS = {
  'swedavia-flightinfo': FLIGHT_CALLS_PER_DAY,
  'swedavia-waittime': WAIT_CALLS_PER_DAY,
  'resrobot-plan': PLAN_CALLS_PER_DAY,
  'resrobot-tidtabell': TIMETABLE_FALLBACK_PER_DAY,
  places: PLACES_CALLS_PER_DAY,
  gtfsrt: GTFS_RT_DAILY_LIMIT,
};

/**
 * Hälsokontroll: fel och kvotförbrukning per källa. Gör inga externa anrop och
 * kostar alltså ingen kvot. Svarar 503 när något behöver åtgärdas.
 */
async function handleHealth(env) {
  const db = env && env.HISTORY;
  if (!db) return jsonResponse({ ok: false, problems: ['D1-databasen HISTORY saknas, inget räknas.'] }, 503);
  try {
    await flushUpstreamCounts(env);
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    let rows = [];
    let capped = [];
    try {
      rows = (await db.prepare('SELECT day, source, calls, failures FROM upstream_calls WHERE day >= ?1').bind(from).all()).results || [];
    } catch {
      // Tabellen skapas vid första räknade anropet.
    }
    try {
      capped = (await db.prepare('SELECT day, api, n FROM api_calls WHERE day = ?1').bind(today).all()).results || [];
    } catch {
      // Likaså.
    }
    const health = evaluateHealth(rows, today, capped, DAILY_LIMITS);
    return jsonResponse({ ...health, checkedAt: new Date().toISOString() }, health.ok ? 200 : 503, {
      'Cache-Control': 'no-store',
    });
  } catch (err) {
    return jsonResponse({ ok: false, problems: [`Hälsokontrollen kunde inte läsa D1: ${String(err && err.message ? err.message : err).slice(0, 200)}`] }, 503);
  }
}

async function swedaviaGet(path, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await upstreamFetch(`${SWEDAVIA}${path}`, {
      headers: { 'Ocp-Apim-Subscription-Key': key, Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Swedavia ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function cacheKeyFor(kind, ...parts) {
  return new Request(`https://alltiditid.se/__cache/${kind}/${parts.join('/')}`, { method: 'GET' });
}

async function staleOr(staleKey, fallbackBody, status) {
  const stale = await cacheGet(staleKey);
  if (stale) {
    const body = await stale.json();
    return jsonResponse({ ...body, stale: true }, 200, { 'Cache-Control': 'public, max-age=60' });
  }
  return jsonResponse(fallbackBody, status);
}

async function handleFlights(url, env, context) {
  const airport = airportByIata(url.searchParams.get('airport'));
  if (!airport) return jsonResponse({ error: 'Okänd flygplats.' }, 400);
  const direction = url.searchParams.get('direction') === 'arrivals' ? 'arrivals' : 'departures';
  const key = env && env.SWEDAVIA_FLIGHTINFO_KEY;
  if (!key) return jsonResponse({ error: 'Flyg är inte påslaget (nyckel saknas i Cloudflare).' }, 503);

  const freshKey = cacheKeyFor('flyg', airport.iata, direction);
  const staleKey = cacheKeyFor('flyg-sparad', airport.iata, direction);
  const fresh = await cacheGet(freshKey);
  if (fresh) return fresh;

  const dates = datesToFetch(Date.now());
  for (const _ of dates) {
    if (!(await allowCall(env, 'swedavia-flightinfo', FLIGHT_CALLS_PER_DAY))) {
      return staleOr(staleKey, { error: 'Flygtiderna uppdateras igen senare.' }, 503);
    }
  }

  let bodies;
  try {
    bodies = await Promise.all(
      dates.map((date) => swedaviaGet(`/flightinfo/v2/${airport.iata}/${direction}/${date}`, key))
    );
  } catch {
    return staleOr(staleKey, { error: 'Kunde inte hämta flygen från Swedavia just nu.' }, 502);
  }

  const body = {
    airport: airport.iata,
    airportName: airport.name,
    direction,
    flights: flightBoard(bodies, direction, swedishDateTime(new Date().toISOString())),
    source: 'swedavia',
    updatedAt: new Date().toISOString(),
  };
  const response = jsonResponse(body, 200, { 'Cache-Control': `public, max-age=${FLIGHT_CACHE_SECONDS}` });
  await cachePut(freshKey, response.clone(), context);
  await cachePut(
    staleKey,
    jsonResponse(body, 200, { 'Cache-Control': `public, max-age=${FLIGHT_STALE_SECONDS}` }),
    context
  );
  return response;
}

async function handleWaitTimes(url, env, context) {
  const airport = airportByIata(url.searchParams.get('airport'));
  if (!airport || !airport.waitTimes) return jsonResponse({ queues: [] }, 200, { 'Cache-Control': 'public, max-age=3600' });
  const key = env && env.SWEDAVIA_WAITTIME_KEY;
  if (!key) return jsonResponse({ queues: [], note: 'nyckel saknas' }, 200, { 'Cache-Control': 'public, max-age=300' });

  const freshKey = cacheKeyFor('koer', airport.iata);
  const fresh = await cacheGet(freshKey);
  if (fresh) return fresh;
  if (!(await allowCall(env, 'swedavia-waittime', WAIT_CALLS_PER_DAY))) {
    return jsonResponse({ queues: [] }, 200, { 'Cache-Control': 'public, max-age=300' });
  }
  let queues = [];
  let raw;
  try {
    raw = await swedaviaGet(`/waittimepublic/v2/airports/${airport.iata}`, key);
    queues = waitTimes(raw);
  } catch (err) {
    // Felet syns i svaret (utan nyckel), så att det går att felsöka.
    return jsonResponse({ queues: [], note: String(err && err.message || 'fel') }, 200, { 'Cache-Control': 'public, max-age=60' });
  }
  if (queues.length === 0) {
    // Okänt format: visa nycklarna i svaret, inte värdena.
    const shape = Array.isArray(raw) ? `lista med ${raw.length}` : Object.keys(raw || {}).slice(0, 8).join(',');
    return jsonResponse({ queues: [], note: `tomt (${shape})` }, 200, { 'Cache-Control': 'public, max-age=60' });
  }
  const response = jsonResponse(
    { airport: airport.iata, queues, updatedAt: new Date().toISOString() },
    200,
    { 'Cache-Control': `public, max-age=${WAIT_CACHE_SECONDS}` }
  );
  await cachePut(freshKey, response.clone(), context);
  return response;
}

/** Händelserna som tas emot, och etiketterna som får följa med "funktion". */
const EVENT_NAMES = ['forsta_avgang', 'aterkommande', 'tittade_och_gick', 'byte_snabbt', 'sokavhopp', 'funktion', 'bevakning', 'flygflik'];
const EVENT_LABELS = /^[a-z0-9_-]{0,32}$/;
/** Ett tak per dygn, så att ett fel i appen eller en robot inte fyller databasen. */
const EVENT_DAILY_LIMIT = 50000;

/**
 * Räknar en händelse: antal, summa och (för tider) hinkar per dygn. Ingen IP-adress,
 * inget id, ingen tidpunkt utöver dygnet sparas.
 */
/** Högst så här många anmälningar per dygn, så att en robot inte fyller tabellen. */
const WAITLIST_DAILY_LIMIT = 500;
const WAITLIST_PLANS = ['month', 'year', 'free'];

/** Rimlig e-postadress: något@något.tld, utan mellanslag, högst 254 tecken. */
export function validWaitlistEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(email) ? email : null;
}

/**
 * Väntelistan för Bevakning (components/WatchOffer.tsx). Sparar e-post, valt pris och
 * språk i D1, tabellen waitlist. En adress sparas en gång; nytt val skriver över det
 * gamla. Svarar likadant oavsett om adressen redan fanns, så att listan inte kan läsas av.
 * Läs listan i Cloudflare: D1 → HISTORY → Console: SELECT * FROM waitlist ORDER BY created;
 */
async function handleWaitlist(request, env) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Använd POST.' }, 405);
  const db = env && env.HISTORY;
  if (!db) return jsonResponse({ error: 'Väntelistan är inte påslagen.' }, 503);
  let body;
  try {
    const text = await request.text();
    if (text.length > 600) return jsonResponse({ error: 'För stort.' }, 400);
    body = JSON.parse(text);
  } catch {
    return jsonResponse({ error: 'Ogiltig förfrågan.' }, 400);
  }
  const email = validWaitlistEmail(body && body.email);
  const plan = WAITLIST_PLANS.includes(body && body.plan) ? body.plan : null;
  const lang = body && body.lang === 'en' ? 'en' : 'sv';
  if (!email || !plan) return jsonResponse({ error: 'Ange en giltig e-postadress.' }, 400);
  try {
    if (!(await allowCall(env, 'waitlist', WAITLIST_DAILY_LIMIT))) {
      return jsonResponse({ error: 'Försök igen i morgon.' }, 429);
    }
    await db
      .prepare('CREATE TABLE IF NOT EXISTS waitlist (email TEXT PRIMARY KEY, plan TEXT NOT NULL, lang TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL)')
      .run();
    const now = new Date().toISOString();
    await db
      .prepare('INSERT INTO waitlist (email, plan, lang, created, updated) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT (email) DO UPDATE SET plan = ?2, lang = ?3, updated = ?4')
      .bind(email, plan, lang, now)
      .run();
  } catch {
    return jsonResponse({ error: 'Kunde inte spara just nu.' }, 503);
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

async function handleEvent(request, env) {
  const ok = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return jsonResponse({ error: 'Använd POST.' }, 405);
  const db = env && env.HISTORY;
  if (!db) return ok();
  let body;
  try {
    const text = await request.text();
    if (text.length > 300) return ok();
    body = JSON.parse(text);
  } catch {
    return ok();
  }
  const name = String(body?.n || '');
  const label = String(body?.l || '');
  const value = Math.max(0, Math.min(600000, Math.round(Number(body?.v) || 0)));
  if (!EVENT_NAMES.includes(name) || !EVENT_LABELS.test(label)) return ok();
  try {
    if (!(await allowCall({ HISTORY: db }, 'events', EVENT_DAILY_LIMIT))) return ok();
    const day = new Date().toISOString().slice(0, 10);
    await db
      .prepare(
        'CREATE TABLE IF NOT EXISTS events (day TEXT NOT NULL, name TEXT NOT NULL, label TEXT NOT NULL, n INTEGER NOT NULL, total INTEGER NOT NULL, under1s INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name, label))'
      )
      .run();
    await db
      .prepare(
        'INSERT INTO events (day, name, label, n, total, under1s) VALUES (?1, ?2, ?3, 1, ?4, ?5) ' +
          'ON CONFLICT (day, name, label) DO UPDATE SET n = n + 1, total = total + ?4, under1s = under1s + ?5'
      )
      .bind(day, name, label, value, name === 'forsta_avgang' && value < 1000 ? 1 : 0)
      .run();
  } catch {
    // Mätningen får aldrig ge fel i appen.
  }
  return ok();
}

// ---- Lånecyklar nära en hållplats (action=mobility) ----

/** Stationslistan ändras sällan; antalet cyklar ofta. */
const GBFS_INFO_TTL_S = 6 * 60 * 60;
const GBFS_STATUS_TTL_S = 60;

async function gbfsJson(url, ttl, context) {
  const key = new Request(url, { method: 'GET' });
  const hit = await cacheGet(key);
  if (hit) return await hit.json();
  const res = await upstreamFetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GBFS ${res.status}`);
  const body = await res.json();
  await cachePut(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${ttl}` } }), context);
  return body;
}

/**
 * GET ?action=mobility&lat=..&lon=.. → { bikes: [{ system, name, station, meters, bikes, app }] }
 * Koordinaterna är hållplatsens, inte resenärens. Ett system som inte svarar hoppas över.
 */
async function handleMobility(url, context) {
  const lat = Number(url.searchParams.get('lat') || NaN);
  const lon = Number(url.searchParams.get('lon') || NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return jsonResponse({ error: 'lat och lon krävs' }, 400);
  }
  const systems = systemsNear(lat, lon);
  const results = await Promise.all(
    systems.map(async (s) => {
      try {
        const [info, stations, status] = await Promise.all([
          gbfsJson(`${s.base}system_information.json`, GBFS_INFO_TTL_S, context),
          gbfsJson(`${s.base}station_information.json`, GBFS_INFO_TTL_S, context),
          gbfsJson(`${s.base}station_status.json`, GBFS_STATUS_TTL_S, context),
        ]);
        if (!allowedLicense(info)) return null;
        const near = nearestStation(lat, lon, stations, status);
        return near ? { system: s.id, name: s.name, app: s.app, ...near } : null;
      } catch {
        return null;
      }
    })
  );
  const bikes = results.filter(Boolean).sort((a, b) => a.meters - b.meters);
  return jsonResponse({ bikes }, 200, { 'Cache-Control': `public, max-age=${GBFS_STATUS_TTL_S}` });
}

// ---- Kuriosa om en hållplats (action=trivia) ----

/** Wikipedia ändras sällan: en vecka i Cloudflares cache, ett dygn i webbläsaren. */
const TRIVIA_CACHE_S = 7 * 24 * 60 * 60;
const TRIVIA_BROWSER_S = 24 * 60 * 60;

async function wikiPages(params) {
  return await wikiGet(wikiQueryUrl(params));
}

async function wikiGet(apiUrl) {
  const res = await upstreamFetch(apiUrl, {
    headers: { Accept: 'application/json', 'User-Agent': 'alltiditid.se (reseplanerare; https://alltiditid.se)' },
  });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const body = await res.json();
  return (body && body.query && body.query.pages) || [];
}

/**
 * GET ?action=trivia&name=..&lat=..&lon=..&lang=sv|en → { trivia: { kind, title, text, url, meters, lang } | null }
 * Hämtas först när någon öppnar rutan, och cachas per hållplats, så att det fungerar för
 * alla hållplatser i landet utan att bygget eller sidorna växer. Bara hållplatsens namn och
 * läge skickas till Wikipedia, inget om besökaren.
 */
export async function handleTrivia(url, context) {
  const name = (url.searchParams.get('name') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'sv';
  let lat = Number(url.searchParams.get('lat') || NaN);
  let lon = Number(url.searchParams.get('lon') || NaN);
  if (!(lat >= 55 && lat <= 69.2 && lon >= 10.5 && lon <= 24.3)) {
    lat = NaN;
    lon = NaN;
  } else {
    lat = Math.round(lat * 1000) / 1000;
    lon = Math.round(lon * 1000) / 1000;
  }
  if (name.length < 2 && !Number.isFinite(lat)) return jsonResponse({ error: 'name eller lat och lon krävs' }, 400);

  const where = Number.isFinite(lat) ? `${lat},${lon}` : '-';
  const key = new Request(`https://cache.alltiditid.se/trivia-v3/${lang}/${encodeURIComponent(name.toLowerCase())}/${where}`);
  const hit = await cacheGet(key);
  if (hit) return hit;

  let trivia = null;
  try {
    trivia = pickTrivia(await wikiPages({ name, lat, lon, lang }), name, lang);
    if (trivia) trivia.lang = lang;
    // Engelska Wikipedia saknar ofta små svenska platser: ta den svenska texten då.
    if (!trivia && lang === 'en') {
      trivia = pickTrivia(await wikiPages({ name, lat, lon, lang: 'sv' }), name, 'sv');
      if (trivia) trivia.lang = 'sv';
    }
    if (trivia) {
      // Det roliga står sällan i ingressen: läs hela artikeln och ta den bästa meningen.
      try {
        const pages = await wikiGet(wikiArticleUrl(trivia.title, trivia.lang));
        const full = Array.isArray(pages) && pages[0] ? pages[0].extract : '';
        if (full) trivia.text = funFact(full, trivia.intro, trivia.lang);
      } catch {
        // Ingressen duger.
      }
      delete trivia.intro;
    }
  } catch {
    // Inget svar från Wikipedia: ingen ruta, och inget som cachas.
    return jsonResponse({ trivia: null }, 200, { 'Cache-Control': 'no-store' });
  }

  const fresh = jsonResponse({ trivia }, 200, { 'Cache-Control': `public, max-age=${TRIVIA_BROWSER_S}` });
  await cachePut(
    key,
    new Response(JSON.stringify({ trivia }), {
      headers: { ...JSON_HEADERS, 'Cache-Control': `public, max-age=${TRIVIA_CACHE_S}` },
    }),
    context
  );
  return fresh;
}

export async function onRequest(context) {
  const { env } = context;
  if (new URL(context.request.url).searchParams.get('action') === 'health') return await handleHealth(env);
  try {
    return await route(context);
  } finally {
    if (pendingCounts.size > 0) {
      const flush = flushUpstreamCounts(env);
      if (context.waitUntil) context.waitUntil(flush);
      else await flush;
    }
  }
}

async function route(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'departures';

  // Egna mätpunkter (lib/track.ts): inga kakor, inget id, bara namn och tal per dygn.
  if (action === 'event') return await handleEvent(request, env);
  if (action === 'waitlist') return await handleWaitlist(request, env);

  // Flyg, kötider och lånecyklar kräver inga Trafiklab-nycklar.
  try {
    if (action === 'flights') return await handleFlights(url, env, context);
    if (action === 'waittimes') return await handleWaitTimes(url, env, context);
    // Platser (OpenStreetMap) kräver ingen Trafiklab-nyckel, så förslagen fungerar även i förhandsversioner.
    if (action === 'places') return await handlePlaces(url, env, context);
    if (action === 'mobility') return await handleMobility(url, context);
    if (action === 'trivia') return await handleTrivia(url, context);
  } catch {
    return jsonResponse({ error: 'Ett fel uppstod vid hämtning av flygdata.' }, 500);
  }

  const keys = {
    realtime: env.TRAFIKLAB_REALTIME_API_KEY,
    resrobot: env.TRAFIKLAB_RESROBOT_KEY || env.TRAFIKLAB_API_KEY || env.TRAFIKLAB_REALTIME_KEY,
    trafikverket: env.TRAFIKVERKET_API_KEY,
    // GTFS Sweden 3 Realtime: fordonens GPS-läge i Hela resan.
    gtfsRt: gtfsKeyFrom(env).value,
    vasttrafikKey: env.VASTTRAFIK_KEY,
    vasttrafikSecret: env.VASTTRAFIK_SECRET,
  };

  if (!keys.realtime && !keys.resrobot) {
    return jsonResponse(
      {
        error:
          'Ingen Trafiklab-nyckel hittades i Cloudflare (TRAFIKLAB_REALTIME_API_KEY eller TRAFIKLAB_RESROBOT_KEY).',
      },
      500
    );
  }

  try {
    if (action === 'search') {
      const searchKey = searchCacheKey(url);
      const cachedSearch = await cacheGet(searchKey);
      if (cachedSearch) return cachedSearch;
      const found = await handleSearch(url, keys, context);
      if (found.status === 200) {
        const body = await found.text();
        const fresh = new Response(body, {
          status: 200,
          headers: { ...JSON_HEADERS, 'Cache-Control': `public, max-age=${SEARCH_CACHE_SECONDS}` },
        });
        await cachePut(searchKey, fresh.clone(), context);
        return fresh;
      }
      return found;
    }
    if (action === 'train') {
      return await handleTrain(url, keys, context);
    }
    if (action === 'trip') {
      return await handleTrip(url, keys, context);
    }
    if (action === 'status') {
      return await handleStatus(keys, context);
    }
    if (action === 'connections') {
      return await handleConnections(url, keys, context);
    }
    if (action === 'nearby') {
      return await handleNearby(request, keys, context);
    }
    if (action === 'plan') {
      return await handlePlan(request, keys, context);
    }
    if (action === 'area') {
      return await handleArea(request, context);
    }

    // Avgångstavlor cachas kort i Cloudflare så att automatisk uppdatering
    // från många besökare inte äter upp API-kvoten.
    const boardUrl = boardRequestUrl(url);
    const cacheKey = new Request(boardUrl.toString(), { method: 'GET' });
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const response = await handleBoard(boardUrl, keys, context);
    if (response.status === 200) {
      await cachePut(cacheKey, response.clone(), context);
    }
    return response;
  } catch {
    return jsonResponse({ error: 'Ett fel uppstod vid hämtning av trafikdata.' }, 500);
  }
}
