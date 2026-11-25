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
const BOARD_CACHE_SECONDS = 45;
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

/** Minuter mellan två tidpunkter (ISO-strängar med eller utan tidszon). */
function minutesBetween(fromIso, toIso) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 60000);
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

function trackLabelFor(value) {
  const v = String(value || '').trim();
  return v ? `Spår/Läge ${v}` : '';
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
function findLocationSignature(stations, stopName) {
  const targetKey = normalizeStationKey(stopName);
  if (!targetKey) return '';

  const exact = stations.filter(
    (st) =>
      normalizeStationKey(st.name) === targetKey ||
      (st.shortName && normalizeStationKey(st.shortName) === targetKey)
  );
  if (exact.length >= 1) return exact[0].signature;

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
      const diff = estIso ? minutesBetween(advIso, estIso) : null;

      const deviationText = (Array.isArray(ann.Deviation) ? ann.Deviation : [ann.Deviation])
        .map((d) => (d && typeof d === 'object' ? d.Description : d))
        .map((d) => String(d || '').trim())
        .filter(Boolean)
        .join(', ');

      updatesMap.set(`${ident}|${advLocal}`, {
        hasRealtime: Boolean(estIso),
        newTime: diff !== null && diff > 0 ? swedishClock(estIso) : '',
        delayMinutes: diff !== null && diff > 0 ? diff : 0,
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
  if (match.track) result.track = trackLabelFor(match.track);
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

  const delaySeconds = Number(call.delay) || 0;
  // Hela minuter, så att den nya klocktiden alltid skiljer sig från den ordinarie.
  const delayMin = hasRealtime ? Math.floor(delaySeconds / 60) : 0;
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
    track: trackLabelFor(platform),
    deviation: alertsToText(call.alerts),
    viaStops: [],
    directionType: direction,
    transportMode: itemMode,
    _trainCandidates: [route.designation, call.trip?.technical_number],
    _scheduledLocal: scheduledIso.slice(0, 16),
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
  const stopName = data.stops?.find((s) => String(s.id) === String(stopId))?.name || '';
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
    .map((g) => ({ id: String(g.id), name: cleanPlaceName(String(g.name)) }));
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
    track: trackLabelFor(item.rtTrack || item.track),
    deviation: '',
    viaStops,
    directionType: direction,
    transportMode: itemMode,
    _trainCandidates: [trainNumber],
    _scheduledLocal: `${item.date || ''}T${scheduledTime}`,
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

async function handleBoard(url, keys, context) {
  const stopId = url.searchParams.get('stopId') || '740000001';
  const clientStopName = url.searchParams.get('stopName') || '';
  const mode = url.searchParams.get('mode') || 'all';
  const direction = url.searchParams.get('direction') === 'arrivals' ? 'arrivals' : 'departures';

  let board = null;
  let source = '';
  let lastError = null;

  if (keys.realtime) {
    try {
      board = await realtimeBoard(keys.realtime, stopId, direction);
      source = 'trafiklab-realtime';
    } catch (err) {
      lastError = err;
    }
  }
  if (!board && keys.resrobot) {
    try {
      board = await resrobotBoard(keys.resrobot, stopId, direction);
      source = 'resrobot';
    } catch (err) {
      lastError = err;
    }
  }
  if (!board) {
    return jsonResponse(
      { error: lastError ? lastError.message : 'Kunde inte hämta trafikinformation just nu.' },
      502
    );
  }

  const stopName = clientStopName || board.stopName;
  const trainNumbers = board.departures
    .filter((d) => d.transportMode === 'train' || d.transportMode === 'commuter')
    .flatMap((d) => d._trainCandidates || []);

  const tvUpdates = keys.trafikverket
    ? await fetchTrafikverketStationUpdates(keys.trafikverket, stopName, trainNumbers, direction, context)
    : new Map();

  const departures = board.departures
    .filter((d) => mode === 'all' || d.transportMode === mode)
    .map((d) => applyTrafikverket(d, tvUpdates, d._trainCandidates || []))
    .map(({ _trainCandidates, _scheduledLocal, ...rest }) => rest);

  return jsonResponse(
    { departures, source, updatedAt: new Date().toISOString() },
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
