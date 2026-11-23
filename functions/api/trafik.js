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
    // 1. Sök stationer/hållplatser i hela Sverige
    if (action === 'search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (q.length < 2) {
        return new Response(JSON.stringify({ stops: [] }), { status: 200, headers });
      }

      const stopUrl = `https://api.resrobot.se/v2.1/location.name?input=${encodeURIComponent(
        q
      )}&format=json&accessId=${encodeURIComponent(apiKey)}`;

      const res = await fetch(stopUrl);
      const data = await res.json();

      const rawStops = data.stopLocationOrCoordLocation || [];
      const stops = rawStops
        .filter((item) => item.StopLocation)
        .slice(0, 8)
        .map((item) => ({
          id: item.StopLocation.extId,
          name: item.StopLocation.name,
        }));

      return new Response(JSON.stringify({ stops }), { status: 200, headers });
    }

    // 2. Hämta avgångar ELLER ankomster (inkl. tågnummer och mellanliggande stopp)
    const stopId = url.searchParams.get('stopId') || '740000001';
    const mode = url.searchParams.get('mode') || 'all';
    const direction = url.searchParams.get('direction') || 'departures';

    // Om användaren väljer Flyg och vi saknar separat flyg-API just nu
    if (mode === 'flight') {
      return new Response(JSON.stringify({ departures: [] }), { status: 200, headers });
    }

    const endpoint =
      direction === 'arrivals' ? 'arrivalBoard' : 'departureBoard';

    // duration=180 ger 3 timmars fönster framåt och passlist=1 ger mellanliggande stopp
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
      direction === 'arrivals' ? data.Arrival || [] : data.Departure || [];

    const mapped = rawList
      .map((item, idx) => {
        const prod = Array.isArray(item.Product) ? item.Product[0] : item.Product || {};
        const catCode = String(prod.catCode || '');
        const catOut = String(prod.catOut || prod.catOutL || '').toLowerCase();

        // ResRobot catCode 1–4 är tåg (X2000, IC, Regional, Pendeltåg), 5–8 är buss/tunnelbana/spårvagn
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

        const scheduledTime = (item.time || '').slice(0, 5);
        const estimatedTime = (item.rtTime || item.time || '').slice(0, 5);
        const isCancelled = Boolean(item.cancelled);
        const isDelayed =
          !isCancelled &&
          Boolean(item.rtTime) &&
          estimatedTime !== scheduledTime;

        const trainNumber = String(prod.num || prod.displayNumber || '').trim();
        const lineName = String(prod.name || prod.line || trainNumber || 'Avgång').trim();
        const operator = String(
          prod.operator || prod.operatorInfo?.name || 'Trafikoperatör'
        ).trim();

        // Samla mellanliggande hållplatser så man kan söka på t.ex. "Lund"
        const stopsRaw = item.Stops?.Stop || [];
        const viaStops = Array.isArray(stopsRaw)
          ? stopsRaw.map((s) => s.name).filter(Boolean)
          : [];

        const title =
          direction === 'arrivals'
            ? item.origin || 'Okänd avgångsort'
            : item.direction || 'Okänd destination';

        const trackLabel =
          item.rtTrack || item.track
            ? `Spår/Läge ${item.rtTrack || item.track}`
            : 'Spår ej angivet';

        return {
          id: `${item.JourneyDetailRef?.ref || idx}-${scheduledTime}-${trainNumber}`,
          line: trainNumber && !lineName.includes(trainNumber) ? `${lineName} (${trainNumber})` : lineName,
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
      JSON.stringify({ error: 'Ett fel uppstod vid hämtning av trafikdata.' }),
      { status: 500, headers }
    );
  }
}
