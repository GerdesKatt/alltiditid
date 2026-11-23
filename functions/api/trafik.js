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

async function fetchTrafikverketTrainUpdates(trafikverketKey, trainNumbers, activityType) {
  const updatesByTrain = new Map();
  if (!trafikverketKey || !Array.isArray(trainNumbers) || trainNumbers.length === 0) {
    return updatesByTrain;
  }

  const uniqueTrains = Array.from(
    new Set(trainNumbers.map((n) => String(n || '').trim()).filter(Boolean))
  ).slice(0, 20);

  if (uniqueTrains.length === 0) return updatesByTrain;

  const tvActivity = activityType === 'arrivals' ? 'Ankomst' : 'Avgang';
  const trainCriteria = uniqueTrains
    .map((num) => `<EQ name="AdvertisedTrainIdent" value="${num.replace(/[^a-zA-Z0-9_-]/g, '')}" />`)
    .join('');

  const xmlBody = `<REQUEST>
  <LOGIN authenticationkey="${trafikverketKey}" />
  <QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="100">
    <FILTER>
      <AND>
        <EQ name="ActivityType" value="${tvActivity}" />
        <OR>${trainCriteria}</OR>
      </AND>
    </FILTER>
    <INCLUDE>AdvertisedTrainIdent</INCLUDE>
    <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
    <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
    <INCLUDE>TimeAtLocation</INCLUDE>
    <INCLUDE>Canceled</INCLUDE>
    <INCLUDE>TrackAtLocation</INCLUDE>
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

    if (!tvRes.ok) return updatesByTrain;

    const tvData = await tvRes.json();
    const announcements =
      tvData?.RESPONSE?.RESULT?.[0]?.TrainAnnouncement || [];

    for (const ann of announcements) {
      const ident = String(ann.AdvertisedTrainIdent || '').trim();
      if (!ident) continue;

      const advClock = extractClockTime(ann.AdvertisedTimeAtLocation);
      const estClock = extractClockTime(
        ann.EstimatedTimeAtLocation || ann.TimeAtLocation || ''
      );
      const isCanceled = Boolean(ann.Canceled);

      const current = updatesByTrain.get(ident) || {
        estimatedTime: '',
        delayMinutes: 0,
        cancelled: false,
        track: '',
        scheduledTime: advClock,
      };

      if (isCanceled) {
        current.cancelled = true;
      }

      if (ann.TrackAtLocation) {
        current.track = String(ann.TrackAtLocation).trim();
      }

      if (estClock) {
        const diff = getDelayMinutes(advClock || estClock, estClock);
        if (diff !== null && diff > current.delayMinutes) {
          current.estimatedTime = estClock;
          current.delayMinutes = diff;
        } else if (!current.estimatedTime) {
          current.estimatedTime = estClock;
        }
      }

      updatesByTrain.set(ident, current);
    }
  } catch {
    // Ignorera Trafikverket-fel så ResRobot-tavlan alltid fungerar
  }

  return updatesByTrain;
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
          JSON.stringify({ error: `Trafiklab sokfel (status ${res.status})` }),
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
          name: String(item.StopLocation.name),
        }));

      return new Response(JSON.stringify({ stops }), { status: 200, headers });
    }

    const stopId = url.searchParams.get('stopId') || '740000001';
    const mode = url.searchParams.get('mode') || 'all';
    const direction = url.searchParams.get('direction') || 'departures';

    if (mode === 'flight') {
      return new Response(JSON.stringify({ departures: [] }), { status: 200, headers });
    }

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
      ? await fetchTrafikverketTrainUpdates(trafikverketKey, trainNumbersToCheck, direction)
      : new Map();

    const mapped = rawList
      .map((item, idx) => {
        const prod = Array.isArray(item.Product) ? item.Product[0] : item.Product || {};
        const catCode = String(prod.catCode || '');
        const catOut = String(prod.catOut || prod.catOutL || '').toLowerCase();

        const isTrain =
          ['1', '2', '3', '4'].includes(catCode) ||
          catOut.includes('tag') ||
          catOut.includes('tåg') ||
          catOut.includes('train') ||
          catOut.includes('pendel');
        const isBus =
          ['5', '6', '7'].includes(catCode) ||
          catOut.includes('buss') ||
          catOut.includes('bus');

        if (mode === 'train' && !isTrain) return null;
        if (mode === 'bus' && !isBus) return null;

        const scheduledTime = String(item.time || '').slice(0, 5);
        const rtTimeRaw = String(item.rtTime || '').slice(0, 5);
        let estimatedTime = rtTimeRaw || scheduledTime;

        let delayMin = getDelayMinutes(
          scheduledTime,
          estimatedTime,
          item.date,
          item.rtDate
        );

        let isCancelled = Boolean(item.cancelled);
        let hasTimeChange =
          Boolean(rtTimeRaw) &&
          estimatedTime !== scheduledTime &&
          delayMin !== null &&
          Math.abs(delayMin) >= 1;

        let isDelayed = !isCancelled && hasTimeChange && delayMin > 0;

        const trainNumber = String(prod.num || prod.displayNumber || '').trim();
        const tvMatch = trainNumber ? tvUpdates.get(trainNumber) : null;

        if (tvMatch) {
          if (tvMatch.cancelled) {
            isCancelled = true;
            isDelayed = false;
          } else if (tvMatch.delayMinutes > 0 && tvMatch.estimatedTime) {
            const tvDiffSameTime = getDelayMinutes(scheduledTime, tvMatch.estimatedTime);
            if (!isDelayed || (tvDiffSameTime !== null && tvDiffSameTime > (delayMin || 0))) {
              estimatedTime = tvMatch.estimatedTime;
              delayMin = tvDiffSameTime !== null ? tvDiffSameTime : tvMatch.delayMinutes;
              isDelayed = delayMin > 0;
            }
          }
        }

        const lineName = String(prod.name || prod.line || trainNumber || 'Avgang').trim();
        const operator = String(
          prod.operator || prod.operatorInfo?.name || 'Trafikoperator'
        ).trim();

        const stopsRaw = item.Stops?.Stop;
        const viaStops = Array.isArray(stopsRaw)
          ? stopsRaw.map((s) => s && s.name).filter(Boolean)
          : [];

        const title =
          direction === 'arrivals'
            ? String(item.origin || 'Okand avgangsort')
            : String(item.direction || 'Okand destination');

        const trackValue =
          item.rtTrack || item.track || (tvMatch && tvMatch.track) || '';
        const trackLabel = trackValue
          ? `Spar/Lage ${trackValue}`
          : 'Spar ej angivet';

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
          estimatedTime,
          delayMinutes: isDelayed && delayMin !== null ? delayMin : 0,
          status: isCancelled ? 'cancelled' : isDelayed ? 'delayed' : 'on-time',
          track: trackLabel,
          viaStops,
          directionType: direction,
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ departures: mapped }), {
      status: 200,
      headers,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Ett fel uppstod vid hamtning av trafikdata.' }),
      { status: 500, headers }
    );
  }
}
