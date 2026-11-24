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

async function resolveLocationSignature(trafikverketKey, stopName) {
  const targetKey = normalizeStationKey(stopName);
  if (!trafikverketKey || !targetKey) return '';

  const xmlBody = `<REQUEST>
  <LOGIN authenticationkey="${trafikverketKey}" />
  <QUERY objecttype="TrainStation" schemaversion="1.0" limit="50">
    <FILTER>
      <EQ name="Advertised" value="true" />
    </FILTER>
    <INCLUDE>LocationSignature</INCLUDE>
    <INCLUDE>AdvertisedLocationName</INCLUDE>
  </QUERY>
</REQUEST>`;

  try {
    const res = await fetch('https://api.trafikinfo.trafikverket.se/v2/data.json', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xmlBody,
    });
    if (!res.ok) return '';

    const data = await res.json();
    const stations = data?.RESPONSE?.RESULT?.[0]?.TrainStation || [];

    for (const st of stations) {
      const advName = String(st.AdvertisedLocationName || '');
      if (normalizeStationKey(advName) === targetKey && st.LocationSignature) {
        return String(st.LocationSignature).trim();
      }
    }

    for (const st of stations) {
      const advName = String(st.AdvertisedLocationName || '');
      const stKey = normalizeStationKey(advName);
      if (
        stKey &&
        (stKey.includes(targetKey) || targetKey.includes(stKey)) &&
        st.LocationSignature
      ) {
        return String(st.LocationSignature).trim();
      }
    }
  } catch {
    // Ignorera uppslagsfel
  }

  return '';
}

async function fetchTrafikverketStationUpdates(
  trafikverketKey,
  stopName,
  trainNumbers,
  activityType
) {
  const updatesMap = new Map();
  if (!trafikverketKey || !Array.isArray(trainNumbers) || trainNumbers.length === 0) {
    return updatesMap;
  }

  const uniqueTrains = Array.from(
    new Set(trainNumbers.map((n) => String(n || '').trim()).filter(Boolean))
  ).slice(0, 25);

  if (uniqueTrains.length === 0) return updatesMap;

  const locationSignature = await resolveLocationSignature(trafikverketKey, stopName);

  const now = Date.now();
  const fromIso = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const toIso = new Date(now + 6 * 60 * 60 * 1000).toISOString();

  const tvActivity = activityType === 'arrivals' ? 'Ankomst' : 'Avgang';
  const trainCriteria = uniqueTrains
    .map(
      (num) =>
        `<EQ name="AdvertisedTrainIdent" value="${num.replace(/[^a-zA-Z0-9_-]/g, '')}" />`
    )
    .join('');

  const locationFilter = locationSignature
    ? `<EQ name="LocationSignature" value="${locationSignature}" />`
    : '';

  const xmlBody = `<REQUEST>
  <LOGIN authenticationkey="${trafikverketKey}" />
  <QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="200">
    <FILTER>
      <AND>
        <EQ name="ActivityType" value="${tvActivity}" />
        ${locationFilter}
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
    const tvRes = await fetch('https://api.trafikinfo.trafikverket.se/v2/data.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: xmlBody,
    });

    if (!tvRes.ok) return updatesMap;

    const tvData = await tvRes.json();
    const announcements = tvData?.RESPONSE?.RESULT?.[0]?.TrainAnnouncement || [];

    for (const ann of announcements) {
      const ident = String(ann.AdvertisedTrainIdent || '').trim();
      if (!ident) continue;

      const advClock = extractClockTime(ann.AdvertisedTimeAtLocation);
      const estClock = extractClockTime(
        ann.EstimatedTimeAtLocation || ann.TimeAtLocation || ''
      );
      const isCanceled = Boolean(ann.Canceled);
      const deviationText = Array.isArray(ann.Deviation)
        ? ann.Deviation.map((d) => String(d || '').trim())
            .filter(Boolean)
            .join(', ')
        : String(ann.Deviation || '').trim();

      const key = `${ident}|${advClock}`;
      const existing = updatesMap.get(key) || updatesMap.get(ident) || {
        newTime: '',
        delayMinutes: 0,
        cancelled: false,
        track: '',
        deviation: '',
      };

      if (isCanceled) {
        existing.cancelled = true;
      }

      if (ann.TrackAtLocation) {
        existing.track = String(ann.TrackAtLocation).trim();
      }

      if (deviationText) {
        existing.deviation = deviationText;
      }

      if (estClock && advClock) {
        const diff = getDelayMinutes(advClock, estClock);
        if (diff !== null && diff > 0) {
          existing.newTime = estClock;
          existing.delayMinutes = diff;
        }
      }

      if (advClock) {
        updatesMap.set(key, existing);
      }
      updatesMap.set(ident, existing);
    }
  } catch {
    // Fortsätt med ResRobot-data om Trafikverket inte svarar
  }

  return updatesMap;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'departures';
  const apiKey =
    env.TRAFIKLAB_RESROBOT_KEY ||
    env.TRAFIKLAB_API_KEY ||
    env.TRAFIKLAB_REALTIME_KEY;
  const trafikverketKey = env.TRAFIKVERKET_API_KEY;

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  };

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          'Ingen Trafiklab-nyckel hittades i Cloudflare (TRAFIKLAB_RESROBOT_KEY eller TRAFIKLAB_API_KEY).',
      }),
      { status: 500, headers }
    );
  }

  try {
    if (action === 'search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (q.length < 2) {
        return new Response(JSON.stringify({ stops: [] }), { status: 200, headers });
      }

      const stopUrl = `https://api.resrobot.se/v2.1/location.name?input=${encodeURIComponent(
        q
      )}&format=json&accessId=${encodeURIComponent(apiKey)}`;

      const res = await fetch(stopUrl);
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `Trafiklab sökfel (status ${res.status})` }),
          { status: 502, headers }
        );
      }

      const data = await res.json();
      const rawStops = Array.isArray(data.stopLocationOrCoordLocation)
        ? data.stopLocationOrCoordLocation
        : [];

      const stops = rawStops
        .filter((item) => item && item.StopLocation)
        .slice(0, 8)
        .map((item) => ({
          id: String(item.StopLocation.extId),
          name: cleanPlaceName(String(item.StopLocation.name)),
        }));

      return new Response(JSON.stringify({ stops }), { status: 200, headers });
    }

    const stopId = url.searchParams.get('stopId') || '740000001';
    const stopName = url.searchParams.get('stopName') || '';
    const mode = url.searchParams.get('mode') || 'all';
    const direction = url.searchParams.get('direction') || 'departures';

    const endpoint = direction === 'arrivals' ? 'arrivalBoard' : 'departureBoard';
    const boardUrl = `https://api.resrobot.se/v2.1/${endpoint}?id=${encodeURIComponent(
      stopId
    )}&duration=180&passlist=1&format=json&accessId=${encodeURIComponent(apiKey)}`;

    const res = await fetch(boardUrl);
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Trafiklab svarade med status ${res.status}` }),
        { status: 502, headers }
      );
    }

    const data = await res.json();
    const rawList =
      direction === 'arrivals'
        ? Array.isArray(data.Arrival)
          ? data.Arrival
          : []
        : Array.isArray(data.Departure)
        ? data.Departure
        : [];

    const trainNumbersToCheck = rawList.map((item) => {
      const prod = Array.isArray(item.Product) ? item.Product[0] : item.Product || {};
      return String(prod.num || prod.displayNumber || '').trim();
    });

    const tvUpdates = trafikverketKey
      ? await fetchTrafikverketStationUpdates(
          trafikverketKey,
          stopName,
          trainNumbersToCheck,
          direction
        )
      : new Map();

    const mapped = rawList
      .map((item, idx) => {
        const prod = Array.isArray(item.Product) ? item.Product[0] : item.Product || {};
        const catCode = String(prod.catCode || '');
        const catOut = String(prod.catOutL || prod.catOut || '');
        const itemMode = classifyTransportMode(catCode, catOut);

        if (mode !== 'all' && itemMode !== mode) return null;

        const scheduledTime = String(item.time || '').slice(0, 5);
        const rtTimeRaw = String(item.rtTime || '').slice(0, 5);

        const rawDiff = rtTimeRaw
          ? getDelayMinutes(scheduledTime, rtTimeRaw, item.date, item.rtDate)
          : null;

        let newTime =
          rtTimeRaw && rawDiff !== null && rawDiff > 0 ? rtTimeRaw : '';
        let delayMin = newTime && rawDiff !== null ? rawDiff : 0;
        let isCancelled = Boolean(item.cancelled);

        const trainNumber = String(prod.num || prod.displayNumber || '').trim();
        const tvMatch =
          (itemMode === 'train' || itemMode === 'commuter') && trainNumber
            ? tvUpdates.get(`${trainNumber}|${scheduledTime}`) || tvUpdates.get(trainNumber)
            : null;

        if (tvMatch) {
          if (tvMatch.cancelled) {
            isCancelled = true;
          }
          if (tvMatch.newTime && tvMatch.newTime !== scheduledTime) {
            const tvDiff = getDelayMinutes(scheduledTime, tvMatch.newTime);
            if (tvDiff !== null && tvDiff > 0) {
              newTime = tvMatch.newTime;
              delayMin = tvDiff;
            }
          }
        }

        const isDelayed = !isCancelled && Boolean(newTime) && delayMin > 0;
        if (!isDelayed) {
          newTime = '';
          delayMin = 0;
        }

        const estimatedTime = newTime || scheduledTime;

        const lineName = String(prod.name || prod.line || trainNumber || 'Avgång').trim();
        const operator = String(
          prod.operator || prod.operatorInfo?.name || 'Trafikoperatör'
        ).trim();

        const stopsRaw = item.Stops?.Stop;
        const viaStops = Array.isArray(stopsRaw)
          ? stopsRaw
              .map((s) => (s && s.name ? cleanPlaceName(String(s.name)) : ''))
              .filter(Boolean)
          : [];

        const rawTitle =
          direction === 'arrivals'
            ? String(item.origin || 'Okänd avgångsort')
            : String(item.direction || 'Okänd destination');
        const title = cleanPlaceName(rawTitle) || rawTitle;

        const trackValue = String(
          item.rtTrack || item.track || (tvMatch && tvMatch.track) || ''
        ).trim();
        const trackLabel = trackValue ? `Spår/Läge ${trackValue}` : '';

        const deviationLabel =
          tvMatch && tvMatch.deviation ? tvMatch.deviation : '';

        return {
          id: `${idx}-${scheduledTime}-${trainNumber}`,
          line:
            trainNumber && !lineName.includes(trainNumber)
              ? `${lineName} (${trainNumber})`
              : lineName,
          trainNumber,
          operator,
          destination: title,
          scheduledTime,
          newTime,
          estimatedTime,
          delayMinutes: isDelayed && delayMin > 0 ? delayMin : 0,
          status: isCancelled ? 'cancelled' : isDelayed ? 'delayed' : 'on-time',
          track: trackLabel,
          deviation: deviationLabel,
          viaStops,
          directionType: direction,
          transportMode: itemMode,
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ departures: mapped }), {
      status: 200,
      headers,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Ett fel uppstod vid hämtning av trafikdata.' }),
      { status: 500, headers }
    );
  }
}
