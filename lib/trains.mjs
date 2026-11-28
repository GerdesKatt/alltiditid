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

/** "Tåg 171" säger inget om tåget, "SJ Regional 171" och "Mälartåg 928" gör det. */
function genericTrainLine(line) {
  return /^tåg\s+\S+$/i.test(String(line || '').trim());
}

/**
 * Samma tåg från två källor blir en rad. Stockholm C är fyra hållplatser hos Trafiklab,
 * och samma tåg kan komma från två av dem med olika bolagsnamn ("Mälartåg" och
 * "Mälardalstrafik AB", "SJ AB" och "SJ") och olika mål ("Uppsala central", "Uppsala C").
 * Utan det här stod 928 två gånger, om 5 och om 6 min (juryn, runda 3).
 *
 * Bara fjärr- och regionaltåg ('train'): de har ett unikt tågnummer per dag. Pendeltåg,
 * T-bana och bussar har linjenummer, och två turer kan gå samma minut.
 * Nyckel: tågnummer och ordinarie avgångstid (`_scheduledLocal`, 'YYYY-MM-DDTHH:MM').
 * Kvar blir raden med realtid, och om båda har det den senaste väntade tiden (säkrast
 * för den som ska hinna). Spår och avvikelse som bara den andra raden har tas med, och
 * ett tydligare linjenamn ("SJ Regional 171" i stället för "Tåg 171") med sitt bolag.
 */
export function mergeSameTrains(departures) {
  const list = Array.isArray(departures) ? departures : [];
  const keyOf = (d) => {
    if (!d || d.transportMode !== 'train') return '';
    const num = String(d.trainNumber || '').trim();
    const at = String(d._scheduledLocal || '').slice(0, 16);
    return /^\d{1,6}$/.test(num) && at ? `${num}|${at}` : '';
  };
  const better = (a, b) => {
    if (Boolean(a.hasRealtime) !== Boolean(b.hasRealtime)) return a.hasRealtime ? a : b;
    if ((a.status === 'cancelled') !== (b.status === 'cancelled')) return a.status === 'cancelled' ? a : b;
    const ea = String(a.expectedAt || '');
    const eb = String(b.expectedAt || '');
    if (ea !== eb) return ea > eb ? a : b;
    return a;
  };
  const groups = new Map();
  for (const d of list) {
    const key = keyOf(d);
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(d);
    else groups.set(key, [d]);
  }
  const merged = new Map();
  for (const [key, g] of groups) {
    if (g.length < 2) continue;
    let win = g.reduce((a, b) => better(a, b));
    const others = g.filter((d) => d !== win);
    const named = genericTrainLine(win.line) ? others.find((d) => !genericTrainLine(d.line)) : null;
    win = {
      ...win,
      ...(named ? { line: named.line, operator: named.operator || win.operator } : {}),
      track: win.track || others.find((d) => d.track)?.track || '',
      deviation: win.deviation || others.find((d) => d.deviation)?.deviation || '',
      _trainCandidates: Array.from(new Set(g.flatMap((d) => d._trainCandidates || []).filter(Boolean))),
    };
    merged.set(key, win);
  }
  if (merged.size === 0) return list;
  const out = [];
  const used = new Set();
  for (const d of list) {
    const key = keyOf(d);
    if (!merged.has(key)) {
      out.push(d);
      continue;
    }
    if (used.has(key)) continue;
    used.add(key);
    out.push(merged.get(key));
  }
  return out;
}
