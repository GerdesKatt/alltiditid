// Tåg från Trafikverket (TrainAnnouncement): tåg som saknas på tavlan och ett
// tågs hela resa. Rena funktioner som går att testa utan nät (test/trains.test.mjs).
// Hämtningen finns i functions/api/trafik.js.
//
// Varför: Trafiklab skickar bara den närmaste timmen, och ett tåg vars prognos har
// passerat (t.ex. ett tåg som står still) räknas där som avgånget och kommer inte med.
// Trafikverket vet om tåget faktiskt har gått (TimeAtLocation).

const pad = (n) => String(n).padStart(2, '0');

/** Tid med tidszon från Trafikverket → svensk tid 'YYYY-MM-DDTHH:MM'. */
export function tvLocal(iso) {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
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
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

function localMs(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}

function minutesBetween(a, b) {
  const x = localMs(a);
  const y = localMs(b);
  return Number.isNaN(x) || Number.isNaN(y) ? null : Math.round((y - x) / 60000);
}

function descriptions(list) {
  return (Array.isArray(list) ? list : [list])
    .map((d) => (d && typeof d === 'object' ? d.Description : d))
    .map((d) => String(d || '').trim())
    .filter(Boolean);
}

/** Produktnamnet, t.ex. "SJ Snabbtåg" eller "Öresundståg". */
export function productName(ann) {
  return descriptions(ann.ProductInformation)[0] || 'Tåg';
}

function locationNames(list, nameOf) {
  return (Array.isArray(list) ? list : [])
    .slice()
    .sort((a, b) => (Number(a.Order) || 0) - (Number(b.Order) || 0))
    .map((l) => nameOf(String(l.LocationName || '').trim()))
    .filter(Boolean);
}

/** Pendeltåg täcks av Trafiklab och SL, och har egna nummerserier. De läggs inte till. */
function isCommuter(ann) {
  return /pendeltåg/i.test(productName(ann));
}

/**
 * Tåg från Trafikverket som saknas på tavlan. `known` är tågnumren som redan finns
 * (från Trafiklab). Tåg som har gått tas inte med; tåg som borde ha gått men inte
 * har det märks `pending`, så att appen inte gömmer dem som avgångna.
 */
export function missingTrains({ announcements, known, direction, nowLocal, nameOf, tvStation }) {
  const knownSet = new Set((known || []).map((k) => String(k || '').trim()).filter(Boolean));
  const now = localMs(nowLocal);
  const out = [];
  for (const ann of announcements || []) {
    const ident = String(ann.AdvertisedTrainIdent || '').trim();
    const scheduledLocal = tvLocal(ann.AdvertisedTimeAtLocation);
    if (!ident || !scheduledLocal || knownSet.has(ident) || isCommuter(ann)) continue;
    if (ann.Advertised === false) continue;
    // Har gått eller kommit för mer än två minuter sedan: inte med.
    const actual = tvLocal(ann.TimeAtLocation);
    if (actual && localMs(actual) < now - 2 * 60000) continue;
    const cancelled = Boolean(ann.Canceled);
    const estimated = tvLocal(ann.EstimatedTimeAtLocation);
    const expected = actual || estimated || scheduledLocal;
    if (cancelled && localMs(scheduledLocal) < now - 2 * 60000) continue;
    const offset = minutesBetween(scheduledLocal, expected) || 0;
    // Borde ha gått enligt prognosen men har inte gått: står kvar.
    const pending = !cancelled && !actual && localMs(expected) < now;

    const product = productName(ann);
    const ends = locationNames(direction === 'arrivals' ? ann.FromLocation : ann.ToLocation, nameOf);
    const deviation = descriptions(ann.Deviation);
    if (pending && !estimated) deviation.unshift('Ny tid saknas');
    else if (pending) deviation.unshift('Inväntar avgång');

    out.push({
      id: `tv-${ident}-${scheduledLocal}`,
      line: `${product} ${ident}`,
      trainNumber: ident,
      operator: String(ann.InformationOwner || ann.Operator || '').trim() || 'Trafikverket',
      destination: ends[ends.length - 1] || '',
      scheduledTime: scheduledLocal.slice(11, 16),
      newTime: '',
      estimatedTime: scheduledLocal.slice(11, 16),
      delayMinutes: 0,
      status: cancelled ? 'cancelled' : 'on-time',
      hasRealtime: true,
      track: ann.TrackAtLocation ? String(ann.TrackAtLocation).trim() : '',
      deviation: deviation.join(' • '),
      viaStops: [],
      directionType: direction,
      transportMode: 'train',
      ...(pending ? { pending: true } : {}),
      _trainCandidates: [ident],
      _scheduledLocal: scheduledLocal,
      _offsetMin: cancelled ? 0 : offset,
      _tvStation: tvStation,
    });
  }
  return out;
}

/**
 * Ett tågs hela resa: en rad per station med ankomst och avgång. `announcements`
 * är tågets alla annonseringar (båda riktningarna) för en dag.
 */
export function trainJourney(announcements, nameOf, nowLocal) {
  const now = localMs(nowLocal);
  const byStation = new Map();
  let product = '';
  let owner = '';
  let from = '';
  let to = '';
  for (const ann of announcements || []) {
    if (ann.Advertised === false) continue;
    const sig = String(ann.LocationSignature || '').trim();
    if (!sig) continue;
    product = product || productName(ann);
    owner = owner || String(ann.InformationOwner || '').trim();
    if (!from) from = locationNames(ann.FromLocation, nameOf)[0] || '';
    if (!to) to = locationNames(ann.ToLocation, nameOf).slice(-1)[0] || '';
    const row = byStation.get(sig) || { signature: sig, name: nameOf(sig) || sig };
    const scheduled = tvLocal(ann.AdvertisedTimeAtLocation);
    const estimated = tvLocal(ann.EstimatedTimeAtLocation);
    const actual = tvLocal(ann.TimeAtLocation);
    const part = {
      scheduled: scheduled.slice(11, 16),
      ...(estimated && estimated !== scheduled ? { estimated: estimated.slice(11, 16) } : {}),
      ...(actual ? { actual: actual.slice(11, 16) } : {}),
      delay: minutesBetween(scheduled, actual || estimated || scheduled) || 0,
      _at: scheduled,
    };
    if (ann.ActivityType === 'Ankomst') row.arrival = part;
    else row.departure = part;
    if (ann.TrackAtLocation) row.track = String(ann.TrackAtLocation).trim();
    if (ann.Canceled) row.cancelled = true;
    const dev = descriptions(ann.Deviation);
    if (dev.length) row.deviation = Array.from(new Set([...(row.deviation || []), ...dev]));
    byStation.set(sig, row);
  }
  const stops = [...byStation.values()].sort((a, b) =>
    String((a.departure || a.arrival)._at).localeCompare(String((b.departure || b.arrival)._at))
  );
  // Var tåget är nu: sista stationen med faktisk tid.
  let lastDone = -1;
  stops.forEach((s, i) => {
    if (s.departure?.actual || s.arrival?.actual) lastDone = i;
  });
  const last = stops[lastDone];
  let position = '';
  if (last) {
    const leftIt = Boolean(last.departure?.actual);
    const delay = (leftIt ? last.departure : last.arrival).delay;
    const late = delay > 0 ? ` · ${delay} min sen` : delay < 0 ? ` · ${-delay} min tidig` : ' · i tid';
    position = leftIt
      ? lastDone === stops.length - 1
        ? `Framme i ${last.name}${late}`
        : `Har lämnat ${last.name}${late}`
      : lastDone === stops.length - 1
      ? `Framme i ${last.name}${late}`
      : `Står i ${last.name}${late}`;
  } else if (stops.length && !Number.isNaN(now)) {
    position = `Har inte avgått från ${stops[0].name} än`;
  }
  for (const s of stops) {
    if (s.arrival) delete s.arrival._at;
    if (s.departure) delete s.departure._at;
    s.passed = stops.indexOf(s) <= lastDone;
  }
  return { product, operator: owner, from, to, position, stops };
}
