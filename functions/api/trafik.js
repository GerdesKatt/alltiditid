export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'departures';
  const apiKey = env.TRAFIKLAB_API_KEY;

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  };

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'TRAFIKLAB_API_KEY saknas i Cloudflare.' }),
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
          name: String(item.StopLocation.name),
        }));

      return new Response(JSON.stringify({ stops }), { status: 200, headers });
    }

    const stopId = url.searchParams.get('stopId') || '740000001';
    const mode = url.searchParams.get('mode') || 'all';

    if (mode === 'flight') {
      return new Response(JSON.stringify({ departures: [] }), { status: 200, headers });
    }

    const boardUrl = `https://api.resrobot.se/v2.1/departureBoard?id=${encodeURIComponent(
      stopId
    )}&format=json&accessId=${encodeURIComponent(apiKey)}`;

    const res = await fetch(boardUrl);
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Trafiklab avgångsfel (status ${res.status})` }),
        { status: 502, headers }
      );
    }

    const data = await res.json();
    const rawList = Array.isArray(data.Departure) ? data.Departure : [];

    const mapped = rawList
      .map((item, idx) => {
        const prod = Array.isArray(item.Product) ? item.Product[0] : item.Product || {};
        const catCode = String(prod.catCode || '');
        const catOut = String(prod.catOut || prod.catOutL || '').toLowerCase();

        const isTrain =
          ['1', '2', '3', '4'].includes(catCode) ||
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

        const lineName = String(prod.name || prod.line || prod.num || 'Avgång').trim();
        const operator = String(
          prod.operator || prod.operatorInfo?.name || 'Trafikoperatör'
        ).trim();

        const trackLabel =
          item.rtTrack || item.track
            ? `Spår/Läge ${item.rtTrack || item.track}`
            : 'Spår ej angivet';

        return {
          id: `${idx}-${scheduledTime}-${lineName}`,
          line: lineName,
          operator,
          destination: String(item.direction || 'Okänd destination'),
          scheduledTime,
          estimatedTime,
          status: isCancelled ? 'cancelled' : isDelayed ? 'delayed' : 'on-time',
          track: trackLabel,
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
