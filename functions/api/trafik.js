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

    // 2. Hämta avgångar för vald station
    const stopId = url.searchParams.get('stopId') || '740000001';
    const boardUrl = `https://api.resrobot.se/v2.1/departureBoard?id=${encodeURIComponent(
      stopId
    )}&format=json&accessId=${apiKey}&maxJourneys=20`;

    const res = await fetch(boardUrl);
    const data = await res.json();
    const rawList = data.Departure || [];

    const departures = rawList.map((item, idx) => {
      const sched = (item.time || '').slice(0, 5);
      const rt = (item.rtTime || item.time || '').slice(0, 5);
      const isDelayed = Boolean(rt && sched && rt !== sched);
      const isCancelled = Boolean(item.cancelled);

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
