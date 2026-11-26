// En bussturs, tunnelbanetågs, spårvagns eller båts hela resa, från Trafiklabs
// Trips-API (samma nyckel som tavlan). Samma form som tågets resa (lib/trains.mjs),
// så att samma ark kan visa båda.
//
// Läget ("Har lämnat Slussen, nästa Gamla stan") räknas fram ur tiderna vid
// hållplatserna. Det är inte GPS: där realtid saknas följer det tidtabellen.

/** 'YYYY-MM-DDTHH:MM' ur en lokal tidsstämpel, eller ''. */
function local(iso) {
  const s = String(iso || '');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : '';
}

function minutesBetween(a, b) {
  if (!a || !b) return 0;
  const ms = Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`);
  return Number.isNaN(ms) ? 0 : Math.round(ms / 60000);
}

/** Tidtabell, realtid och inställt för ankomst eller avgång. API:t har haft två stavningar. */
function side(call, kind) {
  const K = kind === 'arrival' ? 'Arrival' : 'Departure';
  const scheduled = local(call[`scheduled${K}`] ?? call[`scheduled_${kind}`] ?? call.scheduled);
  const realtime = local(call[`realtime${K}`] ?? call[`realtime_${kind}`] ?? call.realtime);
  const canceled = Boolean(call[`${kind}Canceled`] ?? call[`${kind}_canceled`] ?? call.canceled);
  return { scheduled, realtime, canceled };
}

/** Jämförelsenyckel: samma störning skrivs ofta på två sätt ("Stn.medd. Avstängd hiss X", "Avstängd hiss vid X"). */
function alertKey(text) {
  return String(text)
    .toLowerCase()
    .replace(/^stn\.?\s*medd\.?\s*/, '')
    .replace(/\b(vid|i|på|at)\b/g, ' ')
    .replace(/[^a-zåäö0-9]+/g, ' ')
    .trim();
}

/** Störningstexterna för en hållplats, en gång var. Av två likadana behålls den utan förkortningar. */
export function uniqueAlerts(alerts) {
  const byKey = new Map();
  for (const a of Array.isArray(alerts) ? alerts : []) {
    const text = String(a?.title || a?.text || '').trim();
    if (!text) continue;
    const key = alertKey(text);
    const prev = byKey.get(key);
    const abbreviated = /^stn\.?\s*medd/i.test(text);
    if (!prev || (/^stn\.?\s*medd/i.test(prev) && !abbreviated)) byKey.set(key, text);
  }
  return [...byKey.values()];
}

/**
 * @param {object} data Svaret från /v1/trips/{trip_id}/{start_date}.
 * @param {string} nowLocal Nu i svensk tid, 'YYYY-MM-DDTHH:MM'.
 * @param {{ lineName?: string, trackLabel?: (designation: string) => string, cleanName?: (name: string) => string }} [opts]
 */
export function tripJourney(data, nowLocal, opts = {}) {
  const cleanName = opts.cleanName || ((n) => n);
  const trackLabel = opts.trackLabel || ((d) => d);
  const calls = Array.isArray(data?.calls) ? data.calls : [];
  const now = local(nowLocal);

  const stops = calls.map((call, i) => {
    const arr = side(call, 'arrival');
    const dep = side(call, 'departure');
    const live = Boolean(call.is_realtime);
    const isFirst = i === 0;
    const isLast = i === calls.length - 1;
    // När lämnar (eller, på sista hållplatsen, når) fordonet hållplatsen?
    const leaveAt = isLast ? arr.realtime || arr.scheduled || dep.realtime || dep.scheduled : dep.realtime || dep.scheduled || arr.realtime || arr.scheduled;
    const arriveAt = arr.realtime || arr.scheduled || leaveAt;
    const passed = Boolean(now && leaveAt && leaveAt <= now);

    const part = (s) => {
      if (!s.scheduled) return undefined;
      const moved = live && s.realtime && s.realtime !== s.scheduled;
      return {
        scheduled: s.scheduled.slice(11),
        ...(moved && !passed ? { estimated: s.realtime.slice(11) } : {}),
        ...(moved && passed ? { actual: s.realtime.slice(11) } : {}),
        delay: live && s.realtime ? minutesBetween(s.scheduled, s.realtime) : 0,
      };
    };
    const platform = String(call.realtime_platform?.designation || call.scheduled_platform?.designation || '').trim();
    const alerts = uniqueAlerts(call.alerts).slice(0, 2);
    const stop = {
      signature: `${call.stop?.id || 'h'}-${i}`,
      name: cleanName(String(call.stop?.name || '')) || String(call.stop?.name || ''),
      passed,
      _arriveAt: arriveAt,
      _live: live,
    };
    const areaId = call.stop?.area_id || call.stop?.id;
    if (areaId) stop.areaId = String(areaId);
    const lat = Number(call.stop?.lat);
    const lon = Number(call.stop?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
      stop.lat = lat;
      stop.lon = lon;
    }
    if (!isFirst && part(arr)) stop.arrival = part(arr);
    if (!isLast && part(dep)) stop.departure = part(dep);
    // En buss som bara stannar till: samma tid två gånger säger inget, visa den en gång.
    if (stop.arrival && stop.departure && JSON.stringify(stop.arrival) === JSON.stringify(stop.departure)) {
      delete stop.arrival;
    }
    if (platform) stop.trackText = trackLabel(platform);
    if ((isLast ? arr.canceled : dep.canceled) || (arr.canceled && dep.canceled)) stop.cancelled = true;
    if (alerts.length) stop.deviation = alerts;
    return stop;
  });

  // Var är den nu?
  let position = '';
  if (stops.length && now) {
    const lastPassed = stops.reduce((acc, s, i) => (s.passed ? i : acc), -1);
    const next = stops[lastPassed + 1];
    const ref = next || stops[stops.length - 1];
    const refPart = ref.arrival || ref.departure;
    const delay = refPart ? refPart.delay : 0;
    const anyLive = stops.some((s) => s._live);
    const suffix = !anyLive
      ? ' · enligt tidtabell'
      : delay > 0
      ? ` · ${delay} min sen`
      : delay < 0
      ? ` · ${-delay} min tidig`
      : ' · i tid';
    if (lastPassed === stops.length - 1) position = `Framme i ${ref.name}${suffix}`;
    else if (lastPassed < 0) position = `Har inte avgått från ${stops[0].name} än`;
    else if (next._arriveAt && next._arriveAt <= now) position = `Står i ${next.name}${suffix}`;
    else position = `Har lämnat ${stops[lastPassed].name}, nästa ${next.name}${suffix}`;
  }
  for (const s of stops) {
    delete s._arriveAt;
    delete s._live;
  }

  const route = data?.route || {};
  return {
    number: '',
    date: String(data?.trip?.start_date || '').slice(0, 10),
    product: opts.lineName || String(route.name || route.designation || '').trim(),
    operator: String(data?.agency?.operator || data?.agency?.name || '').trim(),
    from: cleanName(String(route.origin?.name || stops[0]?.name || '')),
    to: cleanName(String(route.destination?.name || route.direction || stops[stops.length - 1]?.name || '')),
    position,
    stops,
  };
}

/** "300 m" eller "1,2 km". */
export function distanceText(meters) {
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  return `${(Math.round(meters / 100) / 10).toFixed(1).replace('.', ',')} km`;
}

/**
 * Lägger fordonets GPS-läge på resan: texten överst, vilka hållplatser som är passerade
 * och var markören ska stå. Rör inget om läget inte går att lita på.
 *
 * @param {ReturnType<typeof tripJourney>} journey
 * @param {{ index: number, fraction: number, metersToNext: number, offRoute: number } | null} loc Från locateOnRoute.
 * @param {{ lat: number, lon: number, at: number }} fix GPS-punkten och dess tid (sekunder).
 * @param {number} nowSeconds
 */
export function applyGps(journey, loc, fix, nowSeconds) {
  const stops = journey.stops;
  if (!loc || stops.length < 2) return journey;
  // Gammal punkt, eller långt från linjen: lita på tiderna i stället.
  if (fix.at && nowSeconds - fix.at > 300) return journey;
  if (loc.offRoute > 600) return journey;
  // En linje som korsar sig själv kan ge fel sträcka: GPS-läget får inte skilja sig
  // mycket från det tiderna säger.
  const byTime = stops.reduce((acc, s, i) => (s.passed ? i : acc), -1);
  if (byTime < 0 && loc.index === 0 && loc.fraction < 0.05) return journey; // står kvar vid start
  if (byTime === stops.length - 1) return journey; // framme
  if (Math.abs(loc.index - Math.max(byTime, 0)) > 3) return journey;

  const atNext = loc.metersToNext < 60;
  const from = stops[loc.index];
  const next = stops[loc.index + 1];
  const suffix = (/( · (?:\d+ min (?:sen|tidig)|i tid))$/.exec(journey.position) || ['', ''])[1];
  const position = atNext
    ? `Vid ${next.name}${suffix}`
    : loc.fraction < 0.03
    ? `Vid ${from.name}${suffix}`
    : `Mellan ${from.name} och ${next.name} · ${distanceText(loc.metersToNext)} kvar${suffix}`;
  return {
    ...journey,
    position,
    stops: stops.map((s, i) => ({ ...s, passed: i <= loc.index })),
    gps: {
      lat: fix.lat,
      lon: fix.lon,
      at: fix.at || 0,
      after: loc.index,
      fraction: Math.round(loc.fraction * 100) / 100,
      metersToNext: loc.metersToNext,
    },
  };
}
