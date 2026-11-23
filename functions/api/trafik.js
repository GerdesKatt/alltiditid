export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'departures';

  const apiKey =
    env.TRAFIKLAB_RESROBOT_KEY ||
    env.TRAFIKLAB_API_KEY ||
    env.RESROBOT_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Saknar Trafiklab API-nyckel i Cloudflare' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Sök stationer/hållplatser i hela Sverige
    if (action === 'search') {
      const query = url.searchParams.get('q') || '';
      if (query.trim().length < 2) {
        return new Response(JSON.stringify({ stops: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const lookupUrl = `https://api.resrobot.se/v2.1/location.name?input=${encodeURIComponent(
        query
      )}&format=json&accessId=${apiKey}`;

      const res = await fetch(lookupUrl);
      const data = await res.json();

      const rawStops = data.stopLocationOrCoordLocation || [];
      const stops = rawStops
        .map((item) => item.StopLocation)
        .filter(Boolean)
        .slice(0, 8)
        .map((s) => ({
          id: s.extId,
          name: s.name,
        }));

      return new Response(JSON.stringify({ stops }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Hämta avgångar med valfritt trafikslag (all, train, bus, flight)
    const stopId = url.searchParams.get('stopId') || '740000001';
    const mode = url.searchParams.get('mode') || 'all';

    // ResRobot bitmask för trafikslag:
    // 1=Flyg, 2=Snabbtåg/SJ, 4=Regionaltåg, 8=Expressbuss, 16=Pendeltåg, 32=Tunnelbana, 64=Spårvagn, 128=Buss, 256=Färja
    let productsParam = '';
    if (mode === 'train') {
      productsParam = `&products=${2 + 4 + 16}`; // Snabbtåg, regionaltåg och pendeltåg
    } else if (mode === 'bus') {
      productsParam = `&products=${8 + 128}`; // Expressbuss och lokalbuss
    } else if (mode === 'flight') {
      productsParam = `&products=${1}`; // Flyg
    }

    const boardUrl = `https://api.resrobot.se/v2.1/departureBoard?id=${encodeURIComponent(
      stopId
    )}&format=json&accessId=${apiKey}&maxJourneys=30${productsParam}`;

    const res = await fetch(boardUrl);
    const data = await res.json();
    const rawList = data.Departure || [];

    const departures = rawList.map((item, idx) => {
      const sched = (item.time || '').slice(0, 5);
      const rt = (item.rtTime || item.time || '').slice(0, 5);
      const isDelayed = Boolean(rt && sched && rt !== sched);
      const isCancelled = Boolean(item.cancelled);
      const cat = String(item.ProductAtStop?.catOut || '').toUpperCase();

      let vehicleType = 'other';
      if (['ULT', 'JAX', 'JLT', 'JBL', 'JRE', 'JIC', 'JST'].includes(cat)) {
        vehicleType = 'train';
      } else if (['BLT', 'BXB', 'BAX'].includes(cat)) {
        vehicleType = 'bus';
      } else if (['FLT'].includes(cat)) {
        vehicleType = 'flight';
      }

      return {
        id: item.journeyDetailRef?.ref || `${stopId}-${idx}`,
        line: item.ProductAtStop?.displayNumber || item.name || 'Avgång',
        operator: item.ProductAtStop?.operator || 'Kollektivtrafik',
        destination: item.direction || 'Okänd destination',
        scheduledTime: sched,
        estimatedTime: rt || sched,
        status: isCancelled ? 'cancelled' : isDelayed ? 'delayed' : 'on-time',
        track:
          item.rtTrack || item.track
            ? `Spår/Läge ${item.rtTrack || item.track}`
            : '—',
        vehicleType,
      };
    });

    return new Response(JSON.stringify({ departures }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Kunde inte hämta trafikdata', details: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
