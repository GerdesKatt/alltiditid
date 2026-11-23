export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'departures';
  const apiKey =
    env.TRAFIKLAB_RESROBOT_KEY ||
    env.TRAFIKLAB_API_KEY ||
    env.TRAFIKLAB_REALTIME_KEY;

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
        const estimatedTime = String(item.rtTime || item.time || '').slice(0, 5);
        const isCancelled = Boolean(item.cancelled);
        const isDelayed =
          !isCancelled && Boolean(item.rtTime) && estimatedTime !== scheduledTime;

        const trainNumber = String(prod.num || prod.displayNumber || '').trim();
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

        const trackLabel =
          item.rtTrack || item.track
            ? `Spar/Lage ${item.rtTrack || item.track}`
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
