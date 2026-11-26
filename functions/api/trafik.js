import { historyRows, saveHistory } from '../../lib/history.mjs';

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

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
};

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
    const res = await fetch(TRAFIKVERKET_URL, {
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
    const tvRes = await fetch(TRAFIKVERKET_URL, {
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

function classifyRealtimeMode(route) {
  const mode = String(route?.transport_mode || '').toUpperCase();
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
        name.includes('krösatåg')
      ) {
        return 'commuter';
      }
      return 'train';
    default:
      return 'other';
  }
}

function buildLineName(route, itemMode) {
  const name = String(route?.name || '').trim();
  const designation = String(route?.designation || '').trim();
  if (name && designation) {
    return name.includes(designation) ? name : `${name} ${designation}`;
  }
  if (designation) return `${REALTIME_MODE_LABELS[itemMode] || 'Linje'} ${designation}`;
  return name || REALTIME_MODE_LABELS[itemMode] || 'Avgång';
}

function alertsToText(alerts) {
  if (!Array.isArray(alerts)) return '';
  const texts = alerts
    .map((a) => String(a?.title || a?.text || a?.header || '').trim())
    .filter(Boolean);
  return Array.from(new Set(texts)).slice(0, 2).join(' • ');
}

/** Gör om ett anrop från Realtime API till appens avgångsformat. */
function mapRealtimeCall(call, direction) {
  const route = call.route || {};
  const itemMode = classifyRealtimeMode(route);
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

async function realtimeBoard(key, stopId, direction) {
  const kind = direction === 'arrivals' ? 'arrivals' : 'departures';
  const res = await fetch(
    `${REALTIME_BASE}/${kind}/${encodeURIComponent(stopId)}?key=${encodeURIComponent(key)}`
  );
  if (!res.ok) throw new Error(`Trafiklab Realtime svarade med status ${res.status}`);
  const data = await res.json();
  const calls = Array.isArray(data[kind]) ? data[kind] : [];
  const stopName =
    data.stops?.find((s) => String(s.id) === String(stopId))?.name ||
    calls.find((c) => c && c.stop && c.stop.name)?.stop.name ||
    data.stops?.[0]?.name ||
    '';
  return {
    stopName,
    departures: calls.map((call) => mapRealtimeCall(call, direction)),
  };
}

async function realtimeSearch(key, q) {
  const res = await fetch(
    `${REALTIME_BASE}/stops/name/${encodeURIComponent(q)}?key=${encodeURIComponent(key)}`
  );
  if (!res.ok) throw new Error(`Trafiklab Realtime sökfel (status ${res.status})`);
  const data = await res.json();
  const groups = Array.isArray(data.stop_groups) ? data.stop_groups : [];
  return groups
    .filter((g) => g && g.id && (!Array.isArray(g.transport_modes) || g.transport_modes.length > 0))
    .sort((a, b) => (Number(b.average_daily_stop_times) || 0) - (Number(a.average_daily_stop_times) || 0))
    .slice(0, 8)
    .map((g) => {
      const out = { id: String(g.id), name: cleanPlaceName(String(g.name)) };
      const place = placeOfStopGroup(g);
      if (place) out.place = place;
      const modes = searchModes(g.transport_modes);
      if (modes.length) out.modes = modes;
      return out;
    });
}

const SEARCH_MODE_LABELS = {
  TRAIN: 'Tåg',
  METRO: 'T-bana',
  TRAM: 'Spårvagn',
  BUS: 'Buss',
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

  const res = await fetch(VASTTRAFIK_TOKEN_URL, {
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
      let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if ((res.status === 401 || res.status === 403) && !renewed) {
        renewed = true;
        diag.tokenRenewed = true;
        token = await getVasttrafikToken(keys.vasttrafikKey, keys.vasttrafikSecret, context, true);
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
    _scheduledLocal: `${item.date || ''}T${scheduledTime}`,
    _offsetMin: !isCancelled && rawDiff !== null ? rawDiff : 0,
  };
}

async function resrobotBoard(key, stopId, direction) {
  const endpoint = direction === 'arrivals' ? 'arrivalBoard' : 'departureBoard';
  const res = await fetch(
    `${RESROBOT_BASE}/${endpoint}?id=${encodeURIComponent(stopId)}&duration=120&passlist=1&format=json&accessId=${encodeURIComponent(key)}`
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
  const res = await fetch(
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

async function handleSearch(url, keys) {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return jsonResponse({ stops: [] });

  if (keys.realtime) {
    try {
      return jsonResponse({ stops: await realtimeSearch(keys.realtime, q) });
    } catch {
      // Prova ResRobot nedan
    }
  }
  if (keys.resrobot) {
    try {
      return jsonResponse({ stops: await resrobotSearch(keys.resrobot, q) });
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
  const lat = Number(body && body.lat);
  const lon = Number(body && body.lon);
  // Ungefär Sveriges utbredning; allt annat är fel eller utanför trafikdatan.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 55 || lat > 69.2 || lon < 10.5 || lon > 24.3) {
    return jsonResponse({ stops: [], error: 'Positionen ligger utanför Sverige.' }, 400);
  }
  if (!keys.resrobot) {
    return jsonResponse({ stops: [], error: 'Sök nära mig är inte konfigurerat.' }, 501);
  }

  const rLat = lat.toFixed(3);
  const rLon = lon.toFixed(3);
  const cacheKey = new Request(`https://cache.alltiditid.se/nearby-v1/${rLat},${rLon}`);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      const data = await cached.json();
      return jsonResponse(data, 200, { 'Cache-Control': 'no-store' });
    } catch {
      // Hämta på nytt nedan
    }
  }

  const res = await fetch(
    `${RESROBOT_BASE}/location.nearbystops?originCoordLat=${rLat}&originCoordLong=${rLon}` +
      `&r=1500&maxNo=10&format=json&accessId=${encodeURIComponent(keys.resrobot)}`
  );
  if (!res.ok) return jsonResponse({ stops: [], error: `Trafiklab svarade med status ${res.status}` }, 502);
  const data = await res.json();

  const raw = Array.isArray(data.stopLocationOrCoordLocation)
    ? data.stopLocationOrCoordLocation.map((item) => item && item.StopLocation).filter(Boolean)
    : Array.isArray(data.StopLocation)
    ? data.StopLocation
    : [];

  const seen = new Set();
  const stops = raw
    .filter((st) => st && st.extId)
    .map((st) => ({
      id: String(st.extId),
      name: tidyStopName(st.name),
      distance: Number.isFinite(Number(st.dist))
        ? Math.round(Number(st.dist))
        : Math.round(distanceMeters(lat, lon, Number(st.lat), Number(st.lon))),
    }))
    .filter((st) => st.name && !seen.has(st.id) && seen.add(st.id))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);

  // Cloudflare-cachen (nyckel = avrundad position) får spara svaret i 5 min, men
  // webbläsare och mellanled ska inte göra det.
  await cachePut(
    cacheKey,
    jsonResponse({ stops }, 200, { 'Cache-Control': 'max-age=300' }),
    context
  );
  return jsonResponse({ stops }, 200, { 'Cache-Control': 'no-store' });
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

/** Hämtar en hållplats tavla: Trafiklab Realtime först, ResRobot som reserv. */
async function fetchOneBoard(keys, stopId, direction) {
  let lastError = null;
  if (keys.realtime) {
    try {
      const board = await realtimeBoard(keys.realtime, stopId, direction);
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
  const res = await fetch(`${SL_BASE}/sites`);
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
  const res = await fetch(`${SL_BASE}/sites/${encodeURIComponent(site)}/departures?forecast=${SL_FORECAST_MIN}`);
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

  const results = await Promise.all(stopIds.map((id) => fetchOneBoard(keys, id, direction)));
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

  return jsonResponse(
    {
      departures: grouped.departures,
      ...(grouped.disruptions.length ? { disruptions: grouped.disruptions } : {}),
      source: boards[0].source,
      updatedAt: new Date().toISOString(),
      ...(results.length !== boards.length
        ? { partial: results.filter((r) => r.error).map((r) => r.stopId) }
        : {}),
    },
    200,
    { 'Cache-Control': `public, max-age=${BOARD_CACHE_SECONDS}` }
  );
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'departures';

  const keys = {
    realtime: env.TRAFIKLAB_REALTIME_API_KEY,
    resrobot: env.TRAFIKLAB_RESROBOT_KEY || env.TRAFIKLAB_API_KEY || env.TRAFIKLAB_REALTIME_KEY,
    trafikverket: env.TRAFIKVERKET_API_KEY,
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
      return await handleSearch(url, keys);
    }
    if (action === 'nearby') {
      return await handleNearby(request, keys, context);
    }

    // Avgångstavlor cachas kort i Cloudflare så att automatisk uppdatering
    // från många besökare inte äter upp API-kvoten.
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const response = await handleBoard(url, keys, context);
    if (response.status === 200) {
      await cachePut(cacheKey, response.clone(), context);
    }
    return response;
  } catch {
    return jsonResponse({ error: 'Ett fel uppstod vid hämtning av trafikdata.' }, 500);
  }
}
